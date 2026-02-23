// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events for subscription lifecycle management
// NO JWT verification — Stripe calls this directly, verified via webhook signature
// Uses SUPABASE_SERVICE_ROLE_KEY for admin-level DB access

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')

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

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
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

    console.log(`Handling Stripe event: ${event.type}`)

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
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
