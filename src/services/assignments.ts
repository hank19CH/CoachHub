import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type WorkoutAssignment = Database['public']['Tables']['workout_assignments']['Row']
type WorkoutAssignmentInsert = Database['public']['Tables']['workout_assignments']['Insert']
type WorkoutAssignmentUpdate = Database['public']['Tables']['workout_assignments']['Update']

export interface Assignment {
  id: string
  workout_id: string
  athlete_id: string
  coach_id: string
  assigned_date: string
  status: 'pending' | 'completed' | 'skipped'
  notes: string | null
  created_at: string
  workout: {
    id: string
    name: string
    description: string | null
    estimated_duration_min: number | null
    workout_type: string | null
  } | null
  coach: {
    id: string
    display_name: string
    username: string
    avatar_url: string | null
  } | null
  exercises?: Exercise[]
}

export interface Exercise {
  id: string
  workout_id: string
  name: string
  order_index: number
  sets: number | null
  reps: string | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_meters: number | null
  rpe: number | null
  intensity_percent: number | null
  rest_seconds: number | null
  notes: string | null
}

// ─── Workout Completion Types ───────────────────────────────────────────────

export interface ExerciseResultData {
  exercise_id: string
  sets_completed: number | null
  reps_completed: string | null
  weight_used_kg: number | null
  duration_seconds: number | null
  distance_meters: number | null
  rpe: number | null
  is_pb: boolean
  notes: string | null
}

// ─── Workout Completion Functions ───────────────────────────────────────────

/**
 * Complete a workout assignment
 * Creates workout_completion record and exercise_results, updates assignment status
 */
export async function completeWorkout(
  assignmentId: string,
  athleteId: string,
  completionData: {
    durationMinutes: number | null
    athleteNotes: string | null
    overallRpe: number | null
    exerciseResults: ExerciseResultData[]
  }
): Promise<{ success: boolean; completionId?: string; error?: string }> {
  try {
    // 1. Create workout completion record
    const { data: completion, error: completionError } = await supabase
      .from('workout_completions')
      .insert({
        assignment_id: assignmentId,
        athlete_id: athleteId,
        completed_at: new Date().toISOString(),
        duration_minutes: completionData.durationMinutes,
        athlete_notes: completionData.athleteNotes,
        overall_rpe: completionData.overallRpe,
        has_pb: completionData.exerciseResults.some(r => r.is_pb),
        caption: null,
        shared_exercise_ids: [],
        share_settings: {}
      })
      .select('id')
      .single()

    if (completionError) throw completionError

    // 2. Insert exercise results
    if (completionData.exerciseResults.length > 0) {
      const exerciseResultsToInsert = completionData.exerciseResults.map(result => ({
        completion_id: completion.id,
        exercise_id: result.exercise_id,
        sets_completed: result.sets_completed,
        reps_completed: result.reps_completed,
        weight_used_kg: result.weight_used_kg,
        duration_seconds: result.duration_seconds,
        distance_meters: result.distance_meters,
        rpe: result.rpe,
        is_pb: result.is_pb,
        notes: result.notes
      }))

      const { error: resultsError } = await supabase
        .from('exercise_results')
        .insert(exerciseResultsToInsert)

      if (resultsError) throw resultsError
    }

    // 3. Update assignment status to completed
    const { error: updateError } = await supabase
      .from('workout_assignments')
      .update({ status: 'completed' })
      .eq('id', assignmentId)

    if (updateError) throw updateError

    // 4. Update personal bests if any PBs detected
    const pbResults = completionData.exerciseResults.filter(r => r.is_pb)
    if (pbResults.length > 0) {
      await updatePersonalBests(athleteId, pbResults, completion.id)
    }

    return { success: true, completionId: completion.id }
  } catch (error: any) {
    console.error('Error completing workout:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Update personal bests for exercises where PB was achieved
 */
async function updatePersonalBests(
  athleteId: string,
  pbResults: ExerciseResultData[],
  completionId: string
): Promise<void> {
  try {
    for (const result of pbResults) {
      // Get exercise name
      const { data: exercise } = await supabase
        .from('exercises')
        .select('name')
        .eq('id', result.exercise_id)
        .single()

      if (!exercise) continue

      // Determine PB type and value
      let pbType: 'weight' | 'reps' | 'time' | 'distance' | null = null
      let value: number | null = null

      if (result.weight_used_kg && result.weight_used_kg > 0) {
        pbType = 'weight'
        value = result.weight_used_kg
      } else if (result.reps_completed) {
        pbType = 'reps'
        value = parseInt(result.reps_completed)
      } else if (result.duration_seconds && result.duration_seconds > 0) {
        pbType = 'time'
        value = result.duration_seconds
      } else if (result.distance_meters && result.distance_meters > 0) {
        pbType = 'distance'
        value = result.distance_meters
      }

      if (pbType && value && !isNaN(value)) {
        await supabase
          .from('personal_bests')
          .upsert({
            athlete_id: athleteId,
            exercise_name: exercise.name,
            pb_type: pbType,
            value: value,
            achieved_at: new Date().toISOString(),
            exercise_result_id: completionId
          }, {
            onConflict: 'athlete_id,exercise_name,pb_type'
          })
      }
    }
  } catch (error) {
    console.error('Error updating personal bests:', error)
    // Don't throw - PB update failure shouldn't block completion
  }
}

/**
 * Check if a result is a personal best
 */
export async function checkPersonalBest(
  athleteId: string,
  exerciseName: string,
  pbType: 'weight' | 'reps' | 'time' | 'distance',
  newValue: number
): Promise<boolean> {
  try {
    const { data: existingPb } = await supabase
      .from('personal_bests')
      .select('value')
      .eq('athlete_id', athleteId)
      .eq('exercise_name', exerciseName)
      .eq('pb_type', pbType)
      .single()

    // No existing PB means this is a new PB
    if (!existingPb) return true

    // For time, lower is better; for others, higher is better
    if (pbType === 'time') {
      return newValue < existingPb.value
    } else {
      return newValue > existingPb.value
    }
  } catch {
    // If error fetching PB (e.g., no rows), assume it's new
    return true
  }
}

// ─── Assignments Service ────────────────────────────────────────────────────

export const assignmentsService = {
  /**
   * Create a new workout assignment
   */
  async createAssignment(data: {
    workoutId: string
    athleteId: string
    coachId: string
    assignedDate: string
    notes?: string
  }): Promise<WorkoutAssignment> {
    const { data: assignment, error } = await supabase
      .from('workout_assignments')
      .insert({
        workout_id: data.workoutId,
        athlete_id: data.athleteId,
        coach_id: data.coachId,
        assigned_date: data.assignedDate,
        notes: data.notes || null,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating assignment:', error)
      throw new Error('Failed to create workout assignment')
    }

    return assignment
  },

  /**
   * Create multiple assignments at once (batch assign)
   */
  async createBatchAssignments(data: {
    workoutId: string
    athleteIds: string[]
    coachId: string
    assignedDate: string
    notes?: string
  }): Promise<WorkoutAssignment[]> {
    const assignments: WorkoutAssignmentInsert[] = data.athleteIds.map(athleteId => ({
      workout_id: data.workoutId,
      athlete_id: athleteId,
      coach_id: data.coachId,
      assigned_date: data.assignedDate,
      notes: data.notes || null,
      status: 'pending'
    }))

    const { data: createdAssignments, error } = await supabase
      .from('workout_assignments')
      .insert(assignments)
      .select()

    if (error) {
      console.error('Error creating batch assignments:', error)
      throw new Error('Failed to create workout assignments')
    }

    return createdAssignments
  },

  /**
   * Get all assignments for a specific coach
   */
  async getCoachAssignments(coachId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .select(`
        *,
        workout:workouts (
          id,
          name,
          workout_type,
          estimated_duration_min
        ),
        athlete:profiles!workout_assignments_athlete_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('coach_id', coachId)
      .order('assigned_date', { ascending: true })

    if (error) {
      console.error('Error fetching coach assignments:', error)
      throw new Error('Failed to fetch assignments')
    }

    return data || []
  },

  /**
   * Get assignments for a specific athlete
   */
  async getAthleteAssignments(athleteId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .select(`
        *,
        workout:workouts (
          id,
          name,
          description,
          workout_type,
          estimated_duration_min,
          exercises (
            id,
            name,
            sets,
            reps,
            order_index
          )
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('athlete_id', athleteId)
      .order('assigned_date', { ascending: true })

    if (error) {
      console.error('Error fetching athlete assignments:', error)
      throw new Error('Failed to fetch assignments')
    }

    return data || []
  },

  /**
   * Fetch assignments for a specific date with complete workout details
   * Used by athlete dashboard for date navigation
   */
  async fetchAssignmentsForDate(
    athleteId: string,
    date: string
  ): Promise<Assignment[]> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .select(`
        id,
        workout_id,
        athlete_id,
        coach_id,
        assigned_date,
        status,
        notes,
        created_at,
        workout:workouts (
          id,
          name,
          description,
          estimated_duration_min,
          workout_type
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('athlete_id', athleteId)
      .eq('assigned_date', date)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching assignments for date:', error)
      throw new Error('Failed to fetch assignments for the selected date')
    }

    // For each assignment, fetch exercises
    const assignmentsWithExercises = await Promise.all(
      (data || []).map(async (assignment: any) => {
        const { data: exercises, error: exercisesError } = await supabase
          .from('exercises')
          .select('*')
          .eq('workout_id', assignment.workout_id)
          .order('order_index', { ascending: true })

        if (exercisesError) {
          console.error('Error fetching exercises:', exercisesError)
          return { ...assignment, exercises: [] }
        }

        return {
          ...assignment,
          exercises: exercises || []
        }
      })
    )

    return assignmentsWithExercises as Assignment[]
  },

  /**
   * Fetch upcoming assignments (next 7 days from today)
   */
  async fetchUpcomingAssignments(athleteId: string): Promise<Assignment[]> {
    const today = new Date().toISOString().split('T')[0]
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextWeekStr = nextWeek.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('workout_assignments')
      .select(`
        id,
        workout_id,
        assigned_date,
        status,
        athlete_id,
        coach_id,
        notes,
        created_at,
        workout:workouts (
          id,
          name,
          description,
          workout_type,
          estimated_duration_min
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('athlete_id', athleteId)
      .gt('assigned_date', today)
      .lte('assigned_date', nextWeekStr)
      .order('assigned_date', { ascending: true })
      .limit(6)

    if (error) {
      console.error('Error fetching upcoming assignments:', error)
      return []
    }

    return (data || []) as Assignment[]
  },

  /**
   * Get assignment statistics for the athlete
   */
  async getAssignmentStats(athleteId: string): Promise<{
    thisWeek: number
    completed: number
    pending: number
    completionRate: number
  }> {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff)
    const mondayStr = monday.toISOString().split('T')[0]
    const todayStr = today.toISOString().split('T')[0]

    const { count: thisWeekCount } = await supabase
      .from('workout_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .gte('assigned_date', mondayStr)
      .lte('assigned_date', todayStr)

    const { count: completedCount } = await supabase
      .from('workout_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('status', 'completed')
      .gte('assigned_date', mondayStr)
      .lte('assigned_date', todayStr)

    const { count: pendingCount } = await supabase
      .from('workout_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('status', 'pending')
      .lte('assigned_date', todayStr)

    const completionRate = thisWeekCount && thisWeekCount > 0
      ? Math.round((completedCount || 0) / thisWeekCount * 100)
      : 0

    return {
      thisWeek: thisWeekCount || 0,
      completed: completedCount || 0,
      pending: pendingCount || 0,
      completionRate
    }
  },

  /**
   * Get assignments for a specific date range
   */
  async getAssignmentsByDateRange(
    coachId: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .select(`
        *,
        workout:workouts (
          id,
          name,
          workout_type
        ),
        athlete:profiles!workout_assignments_athlete_id_fkey (
          id,
          display_name,
          username
        )
      `)
      .eq('coach_id', coachId)
      .gte('assigned_date', startDate)
      .lte('assigned_date', endDate)
      .order('assigned_date', { ascending: true })

    if (error) {
      console.error('Error fetching assignments by date:', error)
      throw new Error('Failed to fetch assignments')
    }

    return data || []
  },

  /**
   * Get pending assignments count for an athlete
   */
  async getPendingAssignmentsCount(athleteId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0]

    const { count, error } = await supabase
      .from('workout_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('status', 'pending')
      .gte('assigned_date', today)

    if (error) {
      console.error('Error counting pending assignments:', error)
      return 0
    }

    return count || 0
  },

  /**
   * Update assignment status
   */
  async updateAssignmentStatus(
    assignmentId: string,
    status: 'pending' | 'completed' | 'skipped'
  ): Promise<WorkoutAssignment> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .update({ status })
      .eq('id', assignmentId)
      .select()
      .single()

    if (error) {
      console.error('Error updating assignment status:', error)
      throw new Error('Failed to update assignment status')
    }

    return data
  },

  /**
   * Reschedule an assignment (change the assigned date)
   */
  async rescheduleAssignment(
    assignmentId: string,
    newDate: string
  ): Promise<WorkoutAssignment> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .update({ assigned_date: newDate })
      .eq('id', assignmentId)
      .select()
      .single()

    if (error) {
      console.error('Error rescheduling assignment:', error)
      throw new Error('Failed to reschedule assignment')
    }

    return data
  },

  /**
   * Update assignment notes
   */
  async updateAssignmentNotes(
    assignmentId: string,
    notes: string
  ): Promise<WorkoutAssignment> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .update({ notes })
      .eq('id', assignmentId)
      .select()
      .single()

    if (error) {
      console.error('Error updating assignment notes:', error)
      throw new Error('Failed to update assignment notes')
    }

    return data
  },

  /**
   * Delete an assignment
   */
  async deleteAssignment(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('workout_assignments')
      .delete()
      .eq('id', assignmentId)

    if (error) {
      console.error('Error deleting assignment:', error)
      throw new Error('Failed to delete assignment')
    }
  },

  /**
   * Get assignments for a specific workout
   */
  async getWorkoutAssignments(workoutId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .select(`
        *,
        athlete:profiles!workout_assignments_athlete_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('workout_id', workoutId)
      .order('assigned_date', { ascending: true })

    if (error) {
      console.error('Error fetching workout assignments:', error)
      throw new Error('Failed to fetch workout assignments')
    }

    return data || []
  },

  /**
   * Get today's assignments for an athlete
   */
  async getTodaysAssignments(athleteId: string): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('workout_assignments')
      .select(`
        *,
        workout:workouts (
          id,
          name,
          description,
          workout_type,
          estimated_duration_min,
          exercises (
            id,
            name,
            order_index
          )
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('athlete_id', athleteId)
      .eq('assigned_date', today)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching today\'s assignments:', error)
      throw new Error('Failed to fetch today\'s assignments')
    }

    return data || []
  }
}
