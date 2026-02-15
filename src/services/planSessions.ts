import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

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
   * Get all sessions for a specific week
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

    // Normalize workout relation
    const normalized = (data || []).map(session => ({
      ...session,
      workout: Array.isArray((session as any).workout)
        ? (session as any).workout[0] ?? null
        : (session as any).workout ?? null
    }))

    return normalized
  },

  /**
   * Create a plan session (links a workout to a plan week/day)
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
  }
}
