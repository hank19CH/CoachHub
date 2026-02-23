import { supabase } from '@/lib/supabase'
import type {
  SubscriptionTier,
  SubscriptionStatus,
  BillingInterval,
  UpgradePromptType,
  UpgradePromptAction,
} from '@/types/database'

// ============================================
// Subscription Info Types
// ============================================

export interface CoachSubscription {
  subscription_tier: SubscriptionTier
  subscription_status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  billing_interval: BillingInterval
  is_beta_user: boolean
  trial_ends_at: string | null
  subscription_started_at: string | null
  subscription_ends_at: string | null
  athlete_limit: number
  bonus_seats_granted: number
  peak_athlete_count: number
}

export interface SeatInfo {
  current: number
  limit: number
  bonus: number
  effectiveLimit: number
  isUnlimited: boolean
  canAddAthlete: boolean
  utilizationPercent: number
}

// ============================================
// Pricing Constants
// ============================================

export const PRICING = {
  coach: {
    beta: { monthly: 19, annual: 190 },
    standard: { monthly: 29, annual: 290 },
    athleteLimit: 20,
    bonusSeats: 3,
    softNudgeAt: 18,
    hardCapWithBonus: 23,
  },
  team: {
    beta: { monthly: 59, annual: 590 },
    standard: { monthly: 79, annual: 790 },
    athleteLimit: Infinity,
  },
  free: {
    athleteLimit: 3,
  },
  trialDays: 9,
  betaSpotsTotal: 50,
} as const

// ============================================
// Fetch Subscription Data
// ============================================

export async function fetchCoachSubscription(
  coachId: string
): Promise<CoachSubscription | null> {
  const { data, error } = await (supabase
    .from('coach_profiles') as any)
    .select(`
      subscription_tier,
      subscription_status,
      stripe_customer_id,
      stripe_subscription_id,
      billing_interval,
      is_beta_user,
      trial_ends_at,
      subscription_started_at,
      subscription_ends_at,
      athlete_limit,
      bonus_seats_granted,
      peak_athlete_count
    `)
    .eq('id', coachId)
    .single()

  if (error) {
    console.error('Error fetching coach subscription:', error)
    return null
  }

  return data as CoachSubscription
}

// ============================================
// Seat Management
// ============================================

export async function getSeatInfo(coachId: string): Promise<SeatInfo> {
  const sub = await fetchCoachSubscription(coachId)
  if (!sub) {
    return {
      current: 0,
      limit: PRICING.free.athleteLimit,
      bonus: 0,
      effectiveLimit: PRICING.free.athleteLimit,
      isUnlimited: false,
      canAddAthlete: true,
      utilizationPercent: 0,
    }
  }

  const { count, error } = await supabase
    .from('coach_athletes')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .eq('status', 'active')

  if (error) {
    console.error('Error counting athletes:', error)
  }

  const current = count ?? 0
  const isUnlimited = sub.subscription_tier === 'team'
  const effectiveLimit = sub.athlete_limit + sub.bonus_seats_granted

  return {
    current,
    limit: sub.athlete_limit,
    bonus: sub.bonus_seats_granted,
    effectiveLimit,
    isUnlimited,
    canAddAthlete: isUnlimited || current < effectiveLimit,
    utilizationPercent: isUnlimited ? 0 : Math.round((current / effectiveLimit) * 100),
  }
}

export async function canAddAthlete(coachId: string): Promise<boolean> {
  const seatInfo = await getSeatInfo(coachId)
  return seatInfo.canAddAthlete
}

// ============================================
// Bonus Seats Logic
// ============================================

export async function grantBonusSeats(coachId: string): Promise<boolean> {
  const { error } = await (supabase
    .from('coach_profiles') as any)
    .update({
      bonus_seats_granted: PRICING.coach.bonusSeats,
    })
    .eq('id', coachId)

  if (error) {
    console.error('Error granting bonus seats:', error)
    return false
  }
  return true
}

export async function updatePeakAthleteCount(
  coachId: string,
  currentCount: number
): Promise<void> {
  const { error } = await (supabase
    .from('coach_profiles') as any)
    .update({ peak_athlete_count: currentCount })
    .eq('id', coachId)
    .lt('peak_athlete_count', currentCount)

  if (error) {
    console.error('Error updating peak athlete count:', error)
  }
}

// ============================================
// Upgrade Prompt Tracking
// ============================================

export async function logUpgradePrompt(
  coachId: string,
  promptType: UpgradePromptType,
  athleteCount: number,
  tier: SubscriptionTier
): Promise<string | null> {
  const { data, error } = await (supabase
    .from('upgrade_prompts') as any)
    .insert({
      coach_id: coachId,
      prompt_type: promptType,
      trigger_athlete_count: athleteCount,
      current_tier: tier,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error logging upgrade prompt:', error)
    return null
  }
  return data.id
}

export async function recordPromptAction(
  promptId: string,
  action: UpgradePromptAction
): Promise<void> {
  const { error } = await (supabase
    .from('upgrade_prompts') as any)
    .update({
      action_taken: action,
      acted_at: new Date().toISOString(),
    })
    .eq('id', promptId)

  if (error) {
    console.error('Error recording prompt action:', error)
  }
}

/**
 * Check if a specific prompt type was already shown recently (within 24h)
 * to avoid spamming the same modal.
 */
export async function wasPromptShownRecently(
  coachId: string,
  promptType: UpgradePromptType
): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('upgrade_prompts')
    .select('id')
    .eq('coach_id', coachId)
    .eq('prompt_type', promptType)
    .gte('shown_at', oneDayAgo)
    .limit(1)

  if (error) {
    console.error('Error checking recent prompts:', error)
    return false
  }

  return (data?.length ?? 0) > 0
}

// ============================================
// Stripe Edge Function Calls
// ============================================

export async function createCheckoutSession(params: {
  tier: 'coach' | 'team'
  interval: BillingInterval
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string } | { error: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const response = await supabase.functions.invoke('create-checkout-session', {
    body: params,
  })

  if (response.error) {
    return { error: response.error.message }
  }

  return response.data as { url: string }
}

export async function createPortalSession(params: {
  returnUrl: string
}): Promise<{ url: string } | { error: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const response = await supabase.functions.invoke('create-portal-session', {
    body: params,
  })

  if (response.error) {
    return { error: response.error.message }
  }

  return response.data as { url: string }
}

// ============================================
// Seat Check Utility (for use in components)
// ============================================

/**
 * Determine which upgrade prompt to show based on current seat usage.
 * Returns null if no prompt is needed.
 */
export function getUpgradePromptType(
  current: number,
  tier: SubscriptionTier,
  limit: number,
  bonus: number
): UpgradePromptType | null {
  if (tier === 'team') return null

  const effectiveLimit = limit + bonus

  // Hard gate: at the absolute cap (limit + bonus)
  if (current >= effectiveLimit && effectiveLimit > limit) return 'hard_gate'

  // Bonus delight: just hit the base limit, no bonus granted yet
  if (current >= limit && bonus === 0 && tier !== 'free') return 'bonus_delight'

  // Soft nudge: approaching limit (2 away)
  if (current >= limit - 2 && current < limit && tier !== 'free') return 'soft_nudge'

  return null
}

/**
 * Get remaining beta slots (out of 50). Returns 0 when beta is closed.
 */
export async function getBetaSlotsRemaining(): Promise<number> {
  const { data, error } = await supabase.rpc('get_beta_slots_remaining')
  if (error) {
    console.error('Error fetching beta slots:', error)
    return 0
  }
  return (data as number) ?? 0
}

/**
 * Get tier display name for UI
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  switch (tier) {
    case 'free': return 'Free'
    case 'coach': return 'Coach'
    case 'team': return 'Team'
    default: return 'Free'
  }
}

/**
 * Get status display info for UI badges
 */
export function getStatusBadge(status: SubscriptionStatus): { label: string; color: string } {
  switch (status) {
    case 'active': return { label: 'Active', color: 'bg-emerald-100 text-emerald-800' }
    case 'trialing': return { label: 'Trial', color: 'bg-blue-100 text-blue-800' }
    case 'past_due': return { label: 'Past Due', color: 'bg-red-100 text-red-800' }
    case 'canceled': return { label: 'Canceled', color: 'bg-gray-100 text-gray-800' }
    case 'paused': return { label: 'Paused', color: 'bg-yellow-100 text-yellow-800' }
    default: return { label: 'Inactive', color: 'bg-gray-100 text-gray-600' }
  }
}
