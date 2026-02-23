// Supabase Edge Function: create-checkout-session
// Creates a Stripe Checkout session for coach/team subscription signup

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')

// Price IDs — set in Supabase Dashboard > Edge Functions > Secrets
const PRICE_IDS: Record<string, Record<string, { beta: string; standard: string }>> = {
  coach: {
    monthly: {
      beta: Deno.env.get('STRIPE_PRICE_COACH_MONTHLY_BETA') ?? '',
      standard: Deno.env.get('STRIPE_PRICE_COACH_MONTHLY') ?? '',
    },
    annual: {
      beta: Deno.env.get('STRIPE_PRICE_COACH_ANNUAL_BETA') ?? '',
      standard: Deno.env.get('STRIPE_PRICE_COACH_ANNUAL') ?? '',
    },
  },
  team: {
    monthly: {
      beta: Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY_BETA') ?? '',
      standard: Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY') ?? '',
    },
    annual: {
      beta: Deno.env.get('STRIPE_PRICE_TEAM_ANNUAL_BETA') ?? '',
      standard: Deno.env.get('STRIPE_PRICE_TEAM_ANNUAL') ?? '',
    },
  },
}

Deno.serve(async (req) => {
  try {
    // CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    // JWT verification
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { tier, interval, successUrl, cancelUrl } = await req.json()

    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY)

    // Check if coach already has a Stripe customer ID
    const { data: coachProfile } = await supabaseClient
      .from('coach_profiles')
      .select('stripe_customer_id, is_beta_user')
      .eq('id', user.id)
      .single()

    let customerId = coachProfile?.stripe_customer_id

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      await supabaseClient
        .from('coach_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Determine price ID based on tier, interval, and beta status
    const isBeta = coachProfile?.is_beta_user ?? false
    const priceKey = isBeta ? 'beta' : 'standard'
    const priceId = PRICE_IDS[tier]?.[interval]?.[priceKey]

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: 'Invalid tier or interval' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build checkout session params
    const sessionParams: any = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 9,
        metadata: {
          supabase_user_id: user.id,
          tier,
          interval,
        },
      },
      metadata: { supabase_user_id: user.id },
    }

    // Coach tier: no card required for trial (lower friction)
    // Team tier: card required (filters for serious users, prevents AI abuse)
    if (tier === 'coach') {
      sessionParams.payment_method_collection = 'if_required'
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('create-checkout-session error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
