// Supabase Edge Function: storefront
// Coach storefront on Stripe Connect (direct charges on the coach's connected account,
// CoachHub takes a 10% application fee). verify_jwt = false (see config.toml) — the caller's
// token is verified here with auth.getUser().
//
// POST { action, ... }
//   connect_onboard  { returnUrl, refreshUrl, country? } → { url }      coach: create/continue Stripe onboarding
//   connect_status   {}                                   → { account }  coach: refresh payout status from Stripe
//   checkout         { productId, successUrl, cancelUrl } → { url }      buyer: Stripe Checkout on the coach's account
//   cancel           { orderId }                          → { ok }       buyer: cancel a subscription at period end
//
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { json, corsPreflightResponse } from '../_shared/cors.ts'
import { applicationFeeCents, PLATFORM_FEE_PERCENT } from '../_shared/storeFulfilment.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')

// Countries a coach can onboard from (Stripe Connect, card payments). AU first for the beta.
const COUNTRIES = new Set(['AU', 'NZ', 'US', 'GB', 'CA', 'IE'])

function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.toString() : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    if (!STRIPE_SECRET_KEY) return json({ error: 'Stripe not configured' }, 500)
    const stripe = new Stripe(STRIPE_SECRET_KEY)
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const body = await req.json().catch(() => ({}))
    const action = body?.action

    // ── Coach: payouts onboarding ───────────────────────────────────
    if (action === 'connect_onboard' || action === 'connect_status') {
      const { data: profile } = await admin.from('profiles').select('user_type').eq('id', user.id).single()
      if (profile?.user_type !== 'coach') return json({ error: 'Only coaches can set up payouts' }, 403)

      let { data: payout } = await admin.from('coach_payout_accounts').select('*').eq('coach_id', user.id).maybeSingle()

      if (action === 'connect_status') {
        if (!payout) return json({ account: null })
        const acct = await stripe.accounts.retrieve(payout.stripe_account_id)
        const update = {
          charges_enabled: acct.charges_enabled,
          payouts_enabled: acct.payouts_enabled,
          details_submitted: acct.details_submitted,
          country: acct.country,
          default_currency: acct.default_currency,
          updated_at: new Date().toISOString(),
        }
        await admin.from('coach_payout_accounts').update(update).eq('coach_id', user.id)
        return json({ account: { ...payout, ...update } })
      }

      const returnUrl = safeUrl(body.returnUrl)
      const refreshUrl = safeUrl(body.refreshUrl)
      if (!returnUrl || !refreshUrl) return json({ error: 'Invalid return URL' }, 400)

      if (!payout) {
        const country = COUNTRIES.has(String(body.country ?? 'AU').toUpperCase()) ? String(body.country ?? 'AU').toUpperCase() : 'AU'
        // Standard-equivalent account: Stripe handles risk + verification, the coach pays
        // Stripe's processing fees and gets the full Stripe Dashboard (best fit for direct charges).
        const acct = await stripe.accounts.create({
          country,
          email: user.email,
          controller: {
            losses: { payments: 'stripe' },
            fees: { payer: 'account' },
            requirement_collection: 'stripe',
            stripe_dashboard: { type: 'full' },
          },
          business_profile: { product_description: 'Coaching and training programs sold through CoachHub' },
          metadata: { supabase_user_id: user.id },
        })
        const { data: inserted, error: insErr } = await admin
          .from('coach_payout_accounts')
          .insert({ coach_id: user.id, stripe_account_id: acct.id, country: acct.country, default_currency: acct.default_currency })
          .select('*')
          .single()
        if (insErr) {
          // Lost a race with a second click: use whichever row won
          const { data: existing } = await admin.from('coach_payout_accounts').select('*').eq('coach_id', user.id).maybeSingle()
          if (!existing) throw insErr
          payout = existing
        } else {
          payout = inserted
        }
      }

      const link = await stripe.accountLinks.create({
        account: payout!.stripe_account_id,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      })
      return json({ url: link.url })
    }

    // ── Buyer: checkout ─────────────────────────────────────────────
    if (action === 'checkout') {
      const successUrl = safeUrl(body.successUrl)
      const cancelUrl = safeUrl(body.cancelUrl)
      if (!successUrl || !cancelUrl) return json({ error: 'Invalid return URL' }, 400)

      const { data: product } = await admin
        .from('store_products')
        .select('*')
        .eq('id', body.productId)
        .eq('is_published', true)
        .maybeSingle()
      if (!product) return json({ error: 'This product is no longer available' }, 404)
      if (product.coach_id === user.id) return json({ error: "You can't buy your own product" }, 400)
      const { data: buyer } = await admin.from('profiles').select('user_type').eq('id', user.id).single()
      if (buyer?.user_type !== 'athlete') return json({ error: 'Purchases need an athlete account' }, 403)

      const { data: payout } = await admin.from('coach_payout_accounts').select('*').eq('coach_id', product.coach_id).maybeSingle()
      if (!payout?.charges_enabled) return json({ error: "This coach isn't taking payments yet" }, 409)

      // Already on this coach's roster? Then no new seat is needed.
      const { data: link } = await admin
        .from('coach_athletes')
        .select('status')
        .eq('coach_id', product.coach_id)
        .eq('athlete_id', user.id)
        .maybeSingle()
      if (link?.status !== 'active') {
        const { data: canAdd } = await admin.rpc('can_add_athlete', { p_coach_id: product.coach_id })
        if (canAdd === false) {
          await admin.from('notifications').insert({
            user_id: product.coach_id,
            type: 'store_seats_full',
            title: 'A buyer was turned away',
            message: `Someone tried to buy ${product.title}, but your roster is full. Upgrade to add more athletes.`,
            action_url: '/coach/billing',
          })
          return json({ error: "This coach's roster is full right now. They've been told." }, 409)
        }
      }

      // One live recurring purchase per product per buyer
      if (product.kind !== 'program') {
        const { count } = await admin
          .from('store_orders')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', product.id)
          .eq('buyer_id', user.id)
          .in('status', ['active', 'past_due'])
        if (count) return json({ error: 'You already have this subscription' }, 409)
      }

      const fee = applicationFeeCents(product.price_cents)
      const { data: order, error: orderErr } = await admin
        .from('store_orders')
        .insert({
          product_id: product.id,
          coach_id: product.coach_id,
          buyer_id: user.id,
          kind: product.kind,
          title: product.title,
          amount_cents: product.price_cents,
          currency: product.currency,
          billing_interval: product.billing_interval,
          application_fee_cents: fee,
          stripe_account_id: payout.stripe_account_id,
        })
        .select('id')
        .single()
      if (orderErr || !order) throw orderErr ?? new Error('Could not create order')

      const metadata = { order_id: order.id, product_id: product.id, buyer_id: user.id, coach_id: product.coach_id }
      const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
        currency: product.currency,
        unit_amount: product.price_cents,
        product_data: { name: product.title, ...(product.description ? { description: product.description.slice(0, 500) } : {}) },
        ...(product.kind === 'program' ? {} : { recurring: { interval: product.billing_interval as 'week' | 'month' } }),
      }

      const params: Stripe.Checkout.SessionCreateParams = {
        mode: product.kind === 'program' ? 'payment' : 'subscription',
        line_items: [{ price_data: priceData, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: user.email,
        client_reference_id: user.id,
        metadata,
        ...(product.kind === 'program'
          ? { payment_intent_data: { application_fee_amount: fee, metadata } }
          : { subscription_data: { application_fee_percent: PLATFORM_FEE_PERCENT, metadata } }),
      }

      // Direct charge: the session lives on the coach's connected account
      const session = await stripe.checkout.sessions.create(params, { stripeAccount: payout.stripe_account_id })
      await admin.from('store_orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id)
      return json({ url: session.url })
    }

    // ── Buyer: cancel a subscription (at the end of the paid period) ─
    if (action === 'cancel') {
      const { data: order } = await admin.from('store_orders').select('*').eq('id', body.orderId).maybeSingle()
      if (!order || order.buyer_id !== user.id) return json({ error: 'Order not found' }, 404)
      if (!order.stripe_subscription_id) return json({ error: 'This purchase is not a subscription' }, 400)
      await stripe.subscriptions.update(order.stripe_subscription_id, { cancel_at_period_end: true }, { stripeAccount: order.stripe_account_id })
      await admin.from('store_orders').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('id', order.id)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('storefront error:', error)
    return json({ error: error instanceof Error ? error.message : 'Something went wrong' }, 500)
  }
})
