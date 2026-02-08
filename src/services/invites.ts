import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

/**
 * Look up an invite code and return the coach_id
 * Re-exported from athletes.ts for convenience
 */
export { lookupInviteCode, acceptInviteCode } from '@/services/athletes'

/**
 * Fetch coach profile by ID
 */
export async function fetchCoachProfile(coachId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, user_type')
    .eq('id', coachId)
    .eq('user_type', 'coach')
    .single()

  if (error) {
    console.error('Error fetching coach profile:', error)
    throw new Error('Coach not found')
  }

  return data as Profile
}

/**
 * Check if a coach-athlete relationship already exists
 */
export async function checkExistingRelationship(
  coachId: string,
  athleteId: string
) {
  const { data, error } = await supabase
    .from('coach_athletes')
    .select('id, status')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .maybeSingle()

  if (error) {
    console.error('Error checking relationship:', error)
    return null
  }

  return data
}
