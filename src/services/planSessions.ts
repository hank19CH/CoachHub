import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database'
import type { SessionExercise } from '@/types/import'

type PlanSession = Database['public']['Tables']['plan_sessions']['Row']
type PlanSessionInsert = Database['public']['Tables']['plan_sessions']['Insert']

export interface PlanSessionWithWorkout extends PlanSession {
  workout?: {
    id: string
    name: string
    description: string | null
    session_type: string | null
    session_focus: string | null
    target_rpe: number | null
  } | null
}

export const planSessionsService = {
  /**
   * Get all sessions for a specific week.
   * Includes optional workout relation (only present for promoted sessions).
   */
  async getWeekSessions(weekId: string): Promise<PlanSessionWithWorkout[]> {
    const { data, error } = await supabase
      .from('plan_sessions')
      .select(`
        *,
        workout:workouts(id, name, description, session_type, session_focus, target_rpe)
      `)
      .eq('block_week_id', weekId)
      .order('day_of_week')
      .order('order_index')

    if (error) {
      console.error('Error fetching week sessions:', error)
      throw new Error(error.message || 'Failed to fetch week sessions')
    }

    // Normalize workout relation (Supabase FK may return as array)
    const normalized = (data || []).map(session => ({
      ...session,
      workout: Array.isArray((session as any).workout)
        ? (session as any).workout[0] ?? null
        : (session as any).workout ?? null
    }))

    return normalized
  },

  /**
   * Create a self-contained plan session.
   * Does NOT create a workouts record — exercise data lives in session_data JSONB
   * until the coach explicitly promotes the session to the library.
   */
  async createSelfContainedSession(params: {
    blockWeekId: string
    dayOfWeek: number
    orderIndex?: number
    sessionName?: string
    sessionData?: SessionExercise[]
  }): Promise<PlanSession> {
    const { data, error } = (await (supabase
      .from('plan_sessions') as any)
      .insert({
        block_week_id: params.blockWeekId,
        day_of_week: params.dayOfWeek,
        order_index: params.orderIndex ?? 0,
        session_name: params.sessionName ?? null,
        session_data: (params.sessionData ?? []) as unknown as Json,
        // workout_id intentionally omitted — self-contained session
      })
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error creating self-contained plan session:', error)
      throw new Error(error.message || 'Failed to create plan session')
    }
    return data
  },

  /**
   * Legacy: create a plan session linked to an existing workout.
   * Used when a workout record already exists (e.g. manually created library workouts).
   */
  async createPlanSession(session: PlanSessionInsert): Promise<PlanSession> {
    const { data, error } = (await (supabase
      .from('plan_sessions') as any)
      .insert(session)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error creating plan session:', error)
      throw new Error(error.message || 'Failed to create plan session')
    }
    return data
  },

  /**
   * Update session exercise data (JSONB).
   */
  async updateSessionData(sessionId: string, sessionData: SessionExercise[], sessionName?: string): Promise<void> {
    const updates: Record<string, any> = {
      session_data: sessionData as unknown as Json,
      updated_at: new Date().toISOString(),
    }
    if (sessionName !== undefined) {
      updates.session_name = sessionName
    }

    const { error } = await (supabase
      .from('plan_sessions') as any)
      .update(updates)
      .eq('id', sessionId)

    if (error) {
      console.error('Error updating session data:', error)
      throw new Error(error.message || 'Failed to update session data')
    }
  },

  /**
   * Promote a self-contained plan session to the Workout Library.
   * Creates a workouts record with is_library = true, copies session_data → exercises table,
   * and links the workout via plan_sessions.workout_id.
   */
  async promoteSessionToLibrary(params: {
    planSessionId: string
    workoutName: string
    coachId: string
    sessionType?: string
  }): Promise<{ workoutId: string }> {
    // 1. Fetch the plan session to get session_data
    const { data: session, error: fetchErr } = await supabase
      .from('plan_sessions')
      .select('id, session_data, session_name, workout_id')
      .eq('id', params.planSessionId)
      .single()

    if (fetchErr || !session) {
      throw new Error(fetchErr?.message || 'Plan session not found')
    }

    if ((session as any).workout_id) {
      throw new Error('Session is already linked to a workout')
    }

    const exercises = (session as any).session_data as SessionExercise[] ?? []

    // 2. Create the workouts record (is_library = true)
    const { data: workout, error: workoutErr } = (await (supabase
      .from('workouts') as any)
      .insert({
        coach_id: params.coachId,
        name: params.workoutName,
        session_type: params.sessionType ?? null,
        is_library: true,
        is_template: true,
      })
      .select('id')
      .single()) as { data: any; error: any }

    if (workoutErr || !workout) {
      throw new Error(workoutErr?.message || 'Failed to create workout')
    }

    // 3. Copy session_data exercises into the exercises table
    if (exercises.length > 0) {
      const exerciseRows = exercises.map((ex, i) => ({
        workout_id: workout.id,
        name: ex.name,
        order_index: ex.order ?? i,
        sets: ex.sets ?? null,
        reps: ex.reps ?? null,
        distance_meters: ex.distance_meters ?? null,
        duration_seconds: ex.duration_seconds ?? null,
        rest_seconds: ex.rest_seconds ?? null,
        intensity_percent: ex.load_percent ?? ex.intensity_percent ?? null,
        target_time_seconds: ex.target_time_seconds ?? null,
        rpe: ex.rpe ?? null,
        tempo: ex.tempo ?? null,
        category: ex.category ?? null,
        weight_kg: ex.weight ? parseWeightToKg(ex.weight) : null,
        notes: ex.notes ?? null,
        superset_group: ex.superset_group ?? null,
        is_section_header: ex.is_section_header || false,
      }))

      const { error: exErr } = await (supabase
        .from('exercises') as any)
        .insert(exerciseRows)

      if (exErr) {
        console.error('Error inserting exercises for promoted session:', exErr)
        // Don't throw — workout was created, exercises are non-critical
      }
    }

    // 4. Link the workout to the plan session
    const { error: linkErr } = await (supabase
      .from('plan_sessions') as any)
      .update({
        workout_id: workout.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.planSessionId)

    if (linkErr) {
      console.error('Error linking workout to plan session:', linkErr)
    }

    return { workoutId: workout.id }
  },

  /**
   * Get a single plan session by ID.
   * Includes optional workout relation.
   */
  async getSessionById(sessionId: string): Promise<PlanSessionWithWorkout | null> {
    const { data, error } = await supabase
      .from('plan_sessions')
      .select(`
        *,
        workout:workouts(id, name, description, session_type, session_focus, target_rpe)
      `)
      .eq('id', sessionId)
      .single()

    if (error) {
      console.error('Error fetching plan session:', error)
      return null
    }

    if (!data) return null

    // Normalize workout relation
    return {
      ...data,
      workout: Array.isArray((data as any).workout)
        ? (data as any).workout[0] ?? null
        : (data as any).workout ?? null
    } as PlanSessionWithWorkout
  },

  /**
   * Delete a plan session
   */
  async deletePlanSession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('plan_sessions')
      .delete()
      .eq('id', sessionId)

    if (error) {
      console.error('Error deleting plan session:', error)
      throw new Error(error.message || 'Failed to delete plan session')
    }
  },

  /**
   * Update session order/day
   */
  async updatePlanSession(sessionId: string, updates: { day_of_week?: number; order_index?: number }): Promise<void> {
    const { error } = await (supabase
      .from('plan_sessions') as any)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (error) {
      console.error('Error updating plan session:', error)
      throw new Error(error.message || 'Failed to update plan session')
    }
  },

  /**
   * Update only the session name (lightweight — no exercise data needed).
   */
  async updateSessionName(sessionId: string, name: string): Promise<void> {
    const { error } = await (supabase
      .from('plan_sessions') as any)
      .update({ session_name: name, updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (error) {
      console.error('Error renaming session:', error)
      throw new Error(error.message || 'Failed to rename session')
    }
  },

  /**
   * Get the next available order_index for a given day in a week.
   * Useful for supporting multiple sessions per day.
   */
  async getNextOrderIndex(weekId: string, dayOfWeek: number): Promise<number> {
    const { data } = await supabase
      .from('plan_sessions')
      .select('order_index')
      .eq('block_week_id', weekId)
      .eq('day_of_week', dayOfWeek)
      .order('order_index', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      return (data[0].order_index ?? 0) + 1
    }
    return 0
  },
}

/**
 * Parse a weight string to kg (simple helper for promote flow).
 * "100kg" → 100, "225lbs" → ~102, anything else → null
 */
function parseWeightToKg(weight: string): number | null {
  if (!weight) return null
  const trimmed = weight.trim().toLowerCase()
  if (trimmed.endsWith('%')) return null

  const kgMatch = trimmed.match(/^([\d.]+)\s*kg$/i)
  if (kgMatch) return parseFloat(kgMatch[1])

  const lbMatch = trimmed.match(/^([\d.]+)\s*(lbs?|pounds?)$/i)
  if (lbMatch) return Math.round(parseFloat(lbMatch[1]) * 0.4536 * 10) / 10

  return null
}
