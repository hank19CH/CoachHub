import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

export interface AthleteWithProfile {
  id: string
  coach_id: string
  athlete_id: string
  status: string
  invited_via: string | null
  invite_code: string | null
  started_at: string | null
  created_at: string
  athlete: Profile
  last_workout_date: string | null
}

/**
 * Fetch all athletes for a specific coach
 */
export async function fetchCoachAthletes(coachId: string): Promise<AthleteWithProfile[]> {
  const { data, error } = await supabase
    .from('coach_athletes')
    .select(`
      *,
      athlete:athlete_id (
        id,
        username,
        display_name,
        avatar_url,
        bio,
        user_type,
        is_private,
        created_at
      )
    `)
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching coach athletes:', error)
    throw error
  }

  const athletesWithProfile = data.map((relation: any) => ({
    ...relation,
    last_workout_date: null,
  }))

  return athletesWithProfile as AthleteWithProfile[]
}

// ============================================
// Invite Code Functions (using invite_codes table)
// ============================================

/**
 * Generate a unique 8-character invite code
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Create a new invite code for a coach
 */
export async function createInviteCode(coachId: string): Promise<string> {
  const code = generateCode()

  const { error } = await supabase
    .from('invite_codes')
    .insert({
      coach_id: coachId,
      code,
    })

  if (error) {
    console.error('Error creating invite code:', error)
    throw error
  }

  return code
}

/**
 * Get an existing active invite code for a coach, or create a new one
 */
export async function getOrCreateInviteCode(coachId: string): Promise<string> {
  const { data: existing, error: fetchError } = await supabase
    .from('invite_codes')
    .select('code')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!fetchError && existing?.code) {
    return existing.code
  }

  return await createInviteCode(coachId)
}

/**
 * Look up an invite code and return the coach_id
 * Used by athletes to find which coach invited them
 */
export async function lookupInviteCode(code: string): Promise<{ coach_id: string } | null> {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('coach_id')
    .eq('code', code)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !data) {
    console.error('Error looking up invite code:', error)
    return null
  }

  return data
}

/**
 * Accept an invite code: look up the code, then create the coach-athlete relationship
 */
export async function acceptInviteCode(code: string, athleteId: string): Promise<void> {
  // 1. Look up the code to get the coach_id
  const invite = await lookupInviteCode(code)
  if (!invite) {
    throw new Error('Invalid or expired invite code')
  }

  // 2. Check if relationship already exists
  const { data: existing } = await supabase
    .from('coach_athletes')
    .select('id')
    .eq('coach_id', invite.coach_id)
    .eq('athlete_id', athleteId)
    .maybeSingle()

  if (existing) {
    // Already connected, nothing to do
    return
  }

  // 3. Create the relationship
  const { error } = await supabase
    .from('coach_athletes')
    .insert({
      coach_id: invite.coach_id,
      athlete_id: athleteId,
      status: 'active',
      invited_via: 'link',
      invite_code: code,
      started_at: new Date().toISOString(),
    })

  if (error) {
    console.error('Error creating coach-athlete relationship:', error)
    throw error
  }
}

// ============================================
// Athlete Management Functions
// ============================================

/**
 * Remove an athlete from coach's roster (soft delete - set to inactive)
 */
export async function removeAthlete(coachId: string, athleteId: string): Promise<void> {
  const { error } = await supabase
    .from('coach_athletes')
    .update({
      status: 'inactive',
      ended_at: new Date().toISOString(),
    })
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')

  if (error) {
    console.error('Error removing athlete:', error)
    throw error
  }
}

/**
 * Search athletes by name or username
 */
export async function searchAthletes(
  coachId: string,
  searchQuery: string
): Promise<AthleteWithProfile[]> {
  const { data, error } = await supabase
    .from('coach_athletes')
    .select(`
      *,
      athlete:athlete_id (
        id,
        username,
        display_name,
        avatar_url,
        bio,
        user_type,
        is_private,
        created_at
      )
    `)
    .eq('coach_id', coachId)
    .eq('status', 'active')
    .or(`athlete.display_name.ilike.%${searchQuery}%,athlete.username.ilike.%${searchQuery}%`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error searching athletes:', error)
    throw error
  }

  return data as AthleteWithProfile[]
}

/**
 * Service object for use in components that expect an object-style API
 */
export const athletesService = {
  async getCoachAthletes(coachId: string): Promise<Profile[]> {
    const relations = await fetchCoachAthletes(coachId)
    return relations.map((r) => r.athlete)
  },

  fetchCoachAthletes,
  getOrCreateInviteCode,
  createInviteCode,
  acceptInviteCode,
  lookupInviteCode,
  removeAthlete,
  searchAthletes,
}
