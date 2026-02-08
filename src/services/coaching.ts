import { supabase } from '@/lib/supabase'

/**
 * Fetch all workout completions for a coach's athletes.
 * Uses workout_assignments to find completions belonging to a coach's athletes.
 */
export async function getAthleteCompletions(
  coachId: string,
  filters?: {
    athleteId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }
) {
  // First get all athlete IDs for this coach
  const { data: coachAthletes, error: caError } = await supabase
    .from('coach_athletes')
    .select('athlete_id')
    .eq('coach_id', coachId)
    .eq('status', 'active')

  if (caError) throw caError
  if (!coachAthletes || coachAthletes.length === 0) return []

  const athleteIds = filters?.athleteId
    ? [filters.athleteId]
    : coachAthletes.map(ca => ca.athlete_id)

  let query = supabase
    .from('workout_completions')
    .select(`
      *,
      athlete:profiles!workout_completions_athlete_id_fkey(
        id,
        display_name,
        avatar_url,
        username
      ),
      assignment:workout_assignments!workout_completions_assignment_id_fkey(
        *,
        workout:workouts(
          name,
          description
        )
      ),
      exercise_results(
        *,
        exercise:exercises(name)
      )
    `)
    .in('athlete_id', athleteIds)
    .order('completed_at', { ascending: false })

  if (filters?.startDate) {
    query = query.gte('completed_at', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('completed_at', filters.endDate)
  }
  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/**
 * Fetch detailed workout history for a specific athlete
 */
export async function getAthleteWorkoutHistory(
  athleteId: string,
  coachId: string,
  limit: number = 30
) {
  // Verify coach-athlete relationship
  const { data: relationship } = await supabase
    .from('coach_athletes')
    .select('id')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single()

  if (!relationship) throw new Error('No active coach-athlete relationship')

  const { data, error } = await supabase
    .from('workout_completions')
    .select(`
      *,
      athlete:profiles!workout_completions_athlete_id_fkey(
        id,
        display_name,
        avatar_url,
        username
      ),
      assignment:workout_assignments!workout_completions_assignment_id_fkey(
        *,
        workout:workouts(*)
      ),
      exercise_results(
        *,
        exercise:exercises(*)
      )
    `)
    .eq('athlete_id', athleteId)
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Calculate compliance metrics for an athlete over a date range
 */
export async function calculateCompliance(
  athleteId: string,
  coachId: string,
  dateRange: { start: string; end: string }
) {
  const { data: assignments, error: assignError } = await supabase
    .from('workout_assignments')
    .select('id, status, assigned_date')
    .eq('athlete_id', athleteId)
    .eq('coach_id', coachId)
    .gte('assigned_date', dateRange.start)
    .lte('assigned_date', dateRange.end)
    .order('assigned_date', { ascending: true })

  if (assignError) throw assignError

  const totalAssigned = assignments?.length || 0
  const totalCompleted = assignments?.filter(a => a.status === 'completed').length || 0

  const complianceRate = totalAssigned > 0
    ? (totalCompleted / totalAssigned) * 100
    : 0

  // Calculate current streak (consecutive completed assignments from most recent)
  let currentStreak = 0
  if (assignments && assignments.length > 0) {
    const sorted = [...assignments].reverse() // most recent first
    for (const a of sorted) {
      if (a.status === 'completed') {
        currentStreak++
      } else {
        break
      }
    }
  }

  return {
    totalAssigned,
    totalCompleted,
    complianceRate: Math.round(complianceRate),
    currentStreak,
    missedWorkouts: totalAssigned - totalCompleted
  }
}

/**
 * Add or update feedback on a workout completion
 */
export async function addWorkoutFeedback(
  completionId: string,
  feedback: string,
  coachId: string
) {
  // Verify coach owns this athlete via coach_athletes relationship
  const { data: completion, error: fetchError } = await supabase
    .from('workout_completions')
    .select('athlete_id')
    .eq('id', completionId)
    .single()

  if (fetchError) throw fetchError

  const { data: relationship } = await supabase
    .from('coach_athletes')
    .select('id')
    .eq('coach_id', coachId)
    .eq('athlete_id', completion.athlete_id)
    .eq('status', 'active')
    .single()

  if (!relationship) {
    throw new Error('Unauthorized to provide feedback on this workout')
  }

  const { data, error } = await supabase
    .from('workout_completions')
    .update({
      coach_feedback: feedback,
      feedback_at: new Date().toISOString()
    })
    .eq('id', completionId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch performance trends data for charts
 */
export async function getPerformanceTrends(
  athleteId: string,
  coachId: string,
  weeks: number = 12
) {
  // Verify relationship
  const { data: relationship } = await supabase
    .from('coach_athletes')
    .select('id')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single()

  if (!relationship) throw new Error('No active coach-athlete relationship')

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (weeks * 7))

  const { data, error } = await supabase
    .from('workout_completions')
    .select(`
      completed_at,
      duration_minutes,
      overall_rpe,
      has_pb,
      exercise_results(
        sets_completed,
        reps_completed,
        weight_used_kg,
        distance_meters,
        is_pb
      )
    `)
    .eq('athlete_id', athleteId)
    .gte('completed_at', startDate.toISOString())
    .order('completed_at', { ascending: true })

  if (error) throw error
  return data || []
}
