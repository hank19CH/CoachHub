import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

/**
 * Decode invite code to extract coach ID
 *
 * The invite code format is: base64(coach_id:random_string)
 * Example: 'abc123xyz' decodes to 'uuid-here:nanoid-here'
 */
export function decodeInviteCode(code: string): string | null {
  try {
    const decoded = atob(code)
    const [coachId] = decoded.split(':')
    return coachId || null
  } catch (error) {
    console.error('Error decoding invite code:', error)
    return null
  }
}

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
 * Create coach-athlete relationship
 * Called after athlete has signed up or logged in
 */
export async function acceptInvitation(
  coachId: string,
  athleteId: string,
  inviteCode: string
) {
  const { data, error } = await supabase
    .from('coach_athletes')
    .insert({
      coach_id: coachId,
      athlete_id: athleteId,
      status: 'active',
      invited_via: 'link',
      invite_code: inviteCode,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Error accepting invitation:', error)
    throw new Error('Failed to accept invitation')
  }

  return data
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
