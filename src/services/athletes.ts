import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type CoachAthlete = Database['public']['Tables']['coach_athletes']['Row']

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

  // Transform the data to include last workout date
  // For now, we'll set it as null since we don't have workouts yet
  const athletesWithProfile = data.map((relation: any) => ({
    ...relation,
    last_workout_date: null, // TODO: Add this when we build workout completions
  }))

  return athletesWithProfile as AthleteWithProfile[]
}

/**
 * Generate a unique invite code for a coach
 */
function generateInviteCode(): string {
  // Generate a random 8-character code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Removed confusing characters
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Create an invite code for a coach to share with potential athletes
 */
export async function createInviteCode(coachId: string): Promise<string> {
  const inviteCode = generateInviteCode()
  
  // Create a pending coach_athletes record with the invite code
  const { data, error } = await supabase
    .from('coach_athletes')
    .insert({
      coach_id: coachId,
      athlete_id: null, // Will be filled when athlete accepts
      status: 'pending',
      invited_via: 'link',
      invite_code: inviteCode,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating invite code:', error)
    throw error
  }

  return inviteCode
}

/**
 * Get an existing unused invite code or create a new one
 * This prevents creating too many unused codes
 */
export async function getOrCreateInviteCode(coachId: string): Promise<string> {
  // Check if there's an existing unused invite code
  const { data: existingInvite, error: fetchError } = await supabase
    .from('coach_athletes')
    .select('invite_code')
    .eq('coach_id', coachId)
    .eq('status', 'pending')
    .is('athlete_id', null)
    .not('invite_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!fetchError && existingInvite?.invite_code) {
    return existingInvite.invite_code
  }

  // No existing code, create a new one
  return await createInviteCode(coachId)
}

/**
 * Accept an invite code (athlete side - we'll use this later)
 */
export async function acceptInviteCode(inviteCode: string, athleteId: string): Promise<void> {
  // Find the pending invite
  const { data: invite, error: findError } = await supabase
    .from('coach_athletes')
    .select('*')
    .eq('invite_code', inviteCode)
    .eq('status', 'pending')
    .is('athlete_id', null)
    .single()

  if (findError || !invite) {
    throw new Error('Invalid or expired invite code')
  }

  // Update the invite with athlete ID and set status to active
  const { error: updateError } = await supabase
    .from('coach_athletes')
    .update({
      athlete_id: athleteId,
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .eq('id', invite.id)

  if (updateError) {
    console.error('Error accepting invite:', updateError)
    throw updateError
  }
}

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
  /**
   * Get coach athletes as flat profile objects (id, display_name, username, avatar_url)
   * Used by AssignWorkoutModal and similar components
   */
  async getCoachAthletes(coachId: string): Promise<Profile[]> {
    const relations = await fetchCoachAthletes(coachId)
    return relations.map((r) => r.athlete)
  },

  fetchCoachAthletes,
  getOrCreateInviteCode,
  createInviteCode,
  acceptInviteCode,
  removeAthlete,
  searchAthletes,
}