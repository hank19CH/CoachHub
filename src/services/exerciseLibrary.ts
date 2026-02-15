import { supabase } from '@/lib/supabase'
import type { Database, ExerciseCategory, MovementPattern } from '@/types/database'

type ExerciseLibraryItem = Database['public']['Tables']['exercise_library']['Row']
type ExerciseLibraryInsert = Database['public']['Tables']['exercise_library']['Insert']
type ExerciseLibraryUpdate = Database['public']['Tables']['exercise_library']['Update']

export interface ExerciseLibraryFilters {
  search?: string
  category?: ExerciseCategory | ''
  movementPattern?: MovementPattern | ''
  equipment?: string
  muscleGroup?: string
  coachId?: string | null  // null = system only, undefined = all
}

export const exerciseLibraryService = {
  /**
   * Search the exercise library with filters
   */
  async searchExercises(
    filters: ExerciseLibraryFilters = {},
    limit = 50,
    offset = 0
  ): Promise<{ data: ExerciseLibraryItem[]; count: number }> {
    let query = supabase
      .from('exercise_library')
      .select('*', { count: 'exact' })

    // Text search
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`)
    }

    // Category filter
    if (filters.category) {
      query = query.eq('category', filters.category)
    }

    // Movement pattern filter
    if (filters.movementPattern) {
      query = query.eq('movement_pattern', filters.movementPattern)
    }

    // Equipment filter (array contains)
    if (filters.equipment) {
      query = query.contains('equipment', [filters.equipment])
    }

    // Muscle group filter (array contains)
    if (filters.muscleGroup) {
      query = query.contains('muscle_groups', [filters.muscleGroup])
    }

    // Coach filter: system exercises (coach_id IS NULL) + coach's own
    if (filters.coachId !== undefined) {
      if (filters.coachId) {
        query = query.or(`coach_id.is.null,coach_id.eq.${filters.coachId}`)
      } else {
        query = query.is('coach_id', null)
      }
    }

    query = query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error searching exercise library:', error)
      throw new Error('Failed to search exercises')
    }

    return { data: data || [], count: count || 0 }
  },

  /**
   * Get a single exercise by ID
   */
  async getExerciseById(exerciseId: string): Promise<ExerciseLibraryItem> {
    const { data, error } = await supabase
      .from('exercise_library')
      .select('*')
      .eq('id', exerciseId)
      .single()

    if (error) {
      console.error('Error fetching exercise:', error)
      throw new Error('Failed to fetch exercise')
    }
    return data
  },

  /**
   * Create a custom exercise (coach's personal library)
   */
  async createExercise(exercise: ExerciseLibraryInsert): Promise<ExerciseLibraryItem> {
    const { data, error } = (await (supabase
      .from('exercise_library') as any)
      .insert(exercise)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error creating exercise:', error)
      throw new Error('Failed to create exercise')
    }
    return data
  },

  /**
   * Update a custom exercise (only coach's own)
   */
  async updateExercise(exerciseId: string, updates: ExerciseLibraryUpdate, coachId: string): Promise<ExerciseLibraryItem> {
    const { data, error } = (await (supabase
      .from('exercise_library') as any)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', exerciseId)
      .eq('coach_id', coachId)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error updating exercise:', error)
      throw new Error('Failed to update exercise')
    }
    return data
  },

  /**
   * Delete a custom exercise (only coach's own)
   */
  async deleteExercise(exerciseId: string, coachId: string): Promise<void> {
    const { error } = await supabase
      .from('exercise_library')
      .delete()
      .eq('id', exerciseId)
      .eq('coach_id', coachId)

    if (error) {
      console.error('Error deleting exercise:', error)
      throw new Error('Failed to delete exercise')
    }
  },

  /**
   * Get distinct equipment values for filter dropdown
   */
  async getEquipmentOptions(): Promise<string[]> {
    const { data, error } = await supabase
      .from('exercise_library')
      .select('equipment')

    if (error) {
      console.error('Error fetching equipment options:', error)
      return []
    }

    const allEquipment = new Set<string>()
    for (const row of data || []) {
      if (row.equipment) {
        for (const eq of row.equipment) {
          allEquipment.add(eq)
        }
      }
    }
    return Array.from(allEquipment).sort()
  },

  /**
   * Get distinct muscle group values for filter dropdown
   */
  async getMuscleGroupOptions(): Promise<string[]> {
    const { data, error } = await supabase
      .from('exercise_library')
      .select('muscle_groups')

    if (error) {
      console.error('Error fetching muscle group options:', error)
      return []
    }

    const allMuscles = new Set<string>()
    for (const row of data || []) {
      if (row.muscle_groups) {
        for (const mg of row.muscle_groups) {
          allMuscles.add(mg)
        }
      }
    }
    return Array.from(allMuscles).sort()
  },
}
