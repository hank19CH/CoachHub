// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events for subscription lifecycle management, plus (Sprint 15)
// storefront events from coaches' connected accounts (event.account is set).
// Two Stripe endpoints point here: the platform endpoint (STRIPE_WEBHOOK_SECRET) and the
// Connect endpoint "events on connected accounts" (STRIPE_CONNECT_WEBHOOK_SECRET).
// NO JWT verification — Stripe calls this directly, verified via webhook signature
// Uses SUPABASE_SERVICE_ROLE_KEY for admin-level DB access

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { fulfilOrder, revokeOrder } from '../_shared/storeFulfilment.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const STRIPE_CONNECT_WEBHOOK_SECRET = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')

// Athlete limits by tier (must match billing.ts PRICING constants)
const TIER_LIMITS: Record<string, number> = {
  coach: 20,
  team: 999999,
  free: 3,
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'content-type, stripe-signature',
        },
      })
    }

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET')
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY)
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Verify webhook signature (platform endpoint first, then the Connect endpoint)
    let event: Stripe.Event | null = null
    for (const secret of [STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET]) {
      if (!secret) continue
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, secret)
        break
      } catch {
        // try the next secret
      }
    }
    if (!event) {
      console.error('Webhook signature verification failed for all configured secrets')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Use service role client (no user JWT in webhook requests)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    console.log(`Handling Stripe event: ${event.type}${event.account ? ` (connected ${event.account})` : ''}`)

    // Storefront: events from a coach's connected account
    if (event.account) {
      await handleConnectEvent(stripe, supabaseAdmin, event)
      return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id
        if (!userId) {
          console.warn('No supabase_user_id in subscription metadata')
          break
        }

        const tier = (subscription.metadata?.tier || 'coach') as string
        const interval = (subscription.metadata?.interval || 'monthly') as string

        const statusMap: Record<string, string> = {
          trialing: 'trialing',
          active: 'active',
          past_due: 'past_due',
          canceled: 'canceled',
          incomplete: 'inactive',
          incomplete_expired: 'inactive',
          unpaid: 'past_due',
          paused: 'paused',
        }

        const mappedStatus = statusMap[subscription.status] || 'inactive'
        const isActive = ['trialing', 'active'].includes(mappedStatus)

        const updateData: Record<string, any> = {
          subscription_tier: tier,
          subscription_status: mappedStatus,
          stripe_subscription_id: subscription.id,
          billing_interval: interval,
          athlete_limit: isActive ? (TIER_LIMITS[tier] ?? 20) : TIER_LIMITS.free,
          subscription_started_at: subscription.start_date
            ? new Date(subscription.start_date * 1000).toISOString()
            : null,
          subscription_ends_at: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        }

        // Only set trial_ends_at if there's a trial
        if (subscription.trial_end) {
          updateData.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString()
        }

        const { error: updateError } = await supabaseAdmin
          .from('coach_profiles')
          .update(updateData)
          .eq('id', userId)

        if (updateError) {
          console.error('Error updating coach subscription:', updateError)
        } else {
          console.log(`Updated coach ${userId}: tier=${tier}, status=${mappedStatus}`)
        }

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id
        if (!userId) {
          console.warn('No supabase_user_id in subscription metadata')
          break
        }

        // Downgrade to free tier
        const { error: updateError } = await supabaseAdmin
          .from('coach_profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'canceled',
            athlete_limit: TIER_LIMITS.free,
            subscription_ends_at: new Date().toISOString(),
          })
          .eq('id', userId)

        if (updateError) {
          console.error('Error downgrading coach:', updateError)
        } else {
          console.log(`Downgraded coach ${userId} to free tier`)
        }

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id

        if (!subscriptionId) break

        // Look up coach by subscription ID
        const { data: coach } = await supabaseAdmin
          .from('coach_profiles')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (coach) {
          await supabaseAdmin
            .from('coach_profiles')
            .update({ subscription_status: 'past_due' })
            .eq('id', coach.id)

          console.log(`Marked coach ${coach.id} as past_due`)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('stripe-webhook error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Webhook error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// ════════════════════════════════════════════════════════════════════
// Storefront (Stripe Connect, direct charges on the coach's account)
// ════════════════════════════════════════════════════════════════════
// deno-lint-ignore no-explicit-any
async function handleConnectEvent(stripe: Stripe, admin: any, event: Stripe.Event) {
  const account = event.account as string
  const now = new Date().toISOString()

  switch (event.type) {
    case 'account.updated': {
      const acct = event.data.object as Stripe.Account
      await admin.from('coach_payout_accounts').update({
        charges_enabled: acct.charges_enabled,
        payouts_enabled: acct.payouts_enabled,
        details_submitted: acct.details_submitted,
        country: acct.country,
        default_currency: acct.default_currency,
        updated_at: now,
      }).eq('stripe_account_id', acct.id)
      break
    }

    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.order_id
      if (!orderId) break
      const { data: order } = await admin.from('store_orders').select('id, stripe_account_id').eq('id', orderId).maybeSingle()
      if (!order || order.stripe_account_id !== account) {
        console.error(`checkout for unknown order ${orderId} on ${account}`)
        break
      }
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') break // async payment pending

      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null
      let periodEnd: string | null = null
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId, {}, { stripeAccount: account })
        periodEnd = new Date(sub.current_period_end * 1000).toISOString()
      }
      await admin.from('store_orders').update({
        status: subscriptionId ? 'active' : 'paid',
        stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
        stripe_subscription_id: subscriptionId,
        current_period_end: periodEnd,
        updated_at: now,
      }).eq('id', orderId)
      await fulfilOrder(admin, orderId)
      break
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.metadata?.order_id) {
        await admin.from('store_orders').update({ status: 'expired', updated_at: now })
          .eq('id', session.metadata.order_id).eq('status', 'pending')
      }
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const { data: order } = await admin.from('store_orders').select('id, status').eq('stripe_subscription_id', sub.id).maybeSingle()
      if (!order) break
      const status = event.type === 'customer.subscription.deleted' || sub.status === 'canceled' || sub.status === 'incomplete_expired'
        ? 'canceled'
        : sub.status === 'past_due' || sub.status === 'unpaid'
          ? 'past_due'
          : 'active'
      await admin.from('store_orders').update({
        status,
        cancel_at_period_end: sub.cancel_at_period_end,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: now,
      }).eq('id', order.id)
      if (status === 'canceled' && order.status !== 'canceled') await revokeOrder(admin, order.id)
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      if (!charge.refunded) break // partial refund: keep access
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (pi) {
        await admin.from('store_orders').update({ status: 'refunded', updated_at: now })
          .eq('stripe_payment_intent_id', pi).eq('stripe_account_id', account)
      }
      break
    }

    default:
      console.log(`Unhandled connected-account event: ${event.type}`)
  }
}
