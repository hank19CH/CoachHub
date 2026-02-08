import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Workout = Database['public']['Tables']['workouts']['Row']
type WorkoutInsert = Database['public']['Tables']['workouts']['Insert']
type WorkoutUpdate = Database['public']['Tables']['workouts']['Update']
type Exercise = Database['public']['Tables']['exercises']['Row']

export interface WorkoutWithExercises extends Workout {
  exercises: Exercise[]
}

export const workoutsService = {
  /**
   * Get all workouts for a specific coach
   */
  async getCoachWorkouts(coachId: string): Promise<Workout[]> {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('coach_id', coachId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching coach workouts:', error)
      throw new Error('Failed to fetch workouts')
    }

    return data || []
  },

  /**
   * Get a single workout by ID with its exercises.
   * Pass coachId to verify ownership (recommended for coach-facing views).
   */
  async getWorkoutById(workoutId: string, coachId?: string): Promise<WorkoutWithExercises> {
    let query = supabase
      .from('workouts')
      .select(`
        *,
        exercises (
          id,
          name,
          description,
          order_index,
          sets,
          reps,
          weight_kg,
          duration_seconds,
          distance_meters,
          rpe,
          intensity_percent,
          target_time_seconds,
          rest_seconds,
          notes,
          video_url
        )
      `)
      .eq('id', workoutId)

    if (coachId) {
      query = query.eq('coach_id', coachId)
    }

    const { data, error } = await query.single()

    if (error) {
      console.error('Error fetching workout:', error)
      throw new Error('Failed to fetch workout')
    }

    // Sort exercises by order_index
    if (data.exercises) {
      data.exercises.sort((a: Exercise, b: Exercise) => a.order_index - b.order_index)
    }

    return data as WorkoutWithExercises
  },

  /**
   * Get template workouts for a coach
   */
  async getTemplateWorkouts(coachId: string): Promise<Workout[]> {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('coach_id', coachId)
      .eq('is_template', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching template workouts:', error)
      throw new Error('Failed to fetch template workouts')
    }

    return data || []
  },

  /**
   * Create a new workout
   */
  async createWorkout(workout: WorkoutInsert): Promise<Workout> {
    const { data, error } = await supabase
      .from('workouts')
      .insert(workout)
      .select()
      .single()

    if (error) {
      console.error('Error creating workout:', error)
      throw new Error('Failed to create workout')
    }

    return data
  },

  /**
   * Update an existing workout. Pass coachId to verify ownership.
   */
  async updateWorkout(workoutId: string, updates: WorkoutUpdate, coachId?: string): Promise<Workout> {
    let query = supabase
      .from('workouts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', workoutId)

    if (coachId) {
      query = query.eq('coach_id', coachId)
    }

    const { data, error } = await query.select().single()

    if (error) {
      console.error('Error updating workout:', error)
      throw new Error('Failed to update workout')
    }

    return data
  },

  /**
   * Delete a workout and its exercises. Pass coachId to verify ownership.
   */
  async deleteWorkout(workoutId: string, coachId?: string): Promise<void> {
    // Exercises will cascade delete if FK is set up, otherwise delete manually
    const { error: exerciseError } = await supabase
      .from('exercises')
      .delete()
      .eq('workout_id', workoutId)

    if (exerciseError) {
      console.error('Error deleting workout exercises:', exerciseError)
      throw new Error('Failed to delete workout exercises')
    }

    let query = supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId)

    if (coachId) {
      query = query.eq('coach_id', coachId)
    }

    const { error } = await query

    if (error) {
      console.error('Error deleting workout:', error)
      throw new Error('Failed to delete workout')
    }
  },

  /**
   * Duplicate a workout (create a copy)
   */
  async duplicateWorkout(workoutId: string, coachId: string): Promise<WorkoutWithExercises> {
    // Fetch original workout with exercises (verify ownership)
    const original = await workoutsService.getWorkoutById(workoutId, coachId)

    // Create the new workout
    const { data: newWorkout, error: workoutError } = await supabase
      .from('workouts')
      .insert({
        coach_id: coachId,
        name: `${original.name} (Copy)`,
        description: original.description,
        workout_type: original.workout_type,
        estimated_duration_min: original.estimated_duration_min,
        is_template: original.is_template,
      })
      .select()
      .single()

    if (workoutError || !newWorkout) {
      console.error('Error duplicating workout:', workoutError)
      throw new Error('Failed to duplicate workout')
    }

    // Copy exercises
    if (original.exercises.length > 0) {
      const newExercises = original.exercises.map((ex) => ({
        workout_id: newWorkout.id,
        name: ex.name,
        description: ex.description,
        order_index: ex.order_index,
        sets: ex.sets,
        reps: ex.reps,
        weight_kg: ex.weight_kg,
        duration_seconds: ex.duration_seconds,
        distance_meters: ex.distance_meters,
        rpe: ex.rpe,
        intensity_percent: ex.intensity_percent,
        target_time_seconds: ex.target_time_seconds,
        rest_seconds: ex.rest_seconds,
        notes: ex.notes,
        video_url: ex.video_url,
      }))

      const { error: exerciseError } = await supabase
        .from('exercises')
        .insert(newExercises)

      if (exerciseError) {
        console.error('Error duplicating exercises:', exerciseError)
        // Workout was created but exercises failed - still return it
      }
    }

    return workoutsService.getWorkoutById(newWorkout.id)
  },

  /**
   * Search workouts by name
   */
  async searchWorkouts(coachId: string, query: string): Promise<Workout[]> {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('coach_id', coachId)
      .ilike('name', `%${query}%`)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error searching workouts:', error)
      throw new Error('Failed to search workouts')
    }

    return data || []
  },

  /**
   * Get workouts by type
   */
  async getWorkoutsByType(coachId: string, workoutType: string): Promise<Workout[]> {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('coach_id', coachId)
      .eq('workout_type', workoutType)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching workouts by type:', error)
      throw new Error('Failed to fetch workouts')
    }

    return data || []
  }
}
