import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type ReadinessLog = Database['public']['Tables']['readiness_logs']['Row']
type ReadinessLogInsert = Database['public']['Tables']['readiness_logs']['Insert']
type ReadinessLogUpdate = Database['public']['Tables']['readiness_logs']['Update']
type SessionFeedback = Database['public']['Tables']['session_feedback']['Row']
type SessionFeedbackInsert = Database['public']['Tables']['session_feedback']['Insert']

export const readinessService = {
  /**
   * Submit a daily readiness check-in
   */
  async submitReadinessLog(log: ReadinessLogInsert): Promise<ReadinessLog> {
    // Upsert — one entry per athlete per day
    const { data, error } = (await (supabase
      .from('readiness_logs') as any)
      .upsert(log, { onConflict: 'athlete_id,log_date' })
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error submitting readiness log:', error)
      throw new Error('Failed to submit readiness check-in')
    }
    return data
  },

  /**
   * Get today's readiness log for an athlete
   */
  async getTodayLog(athleteId: string): Promise<ReadinessLog | null> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('readiness_logs')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('log_date', today)
      .maybeSingle()

    if (error) {
      console.error('Error fetching today readiness:', error)
      return null
    }
    return data
  },

  /**
   * Get readiness history for an athlete (last N days)
   */
  async getReadinessHistory(athleteId: string, days = 30): Promise<ReadinessLog[]> {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)

    const { data, error } = await supabase
      .from('readiness_logs')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('log_date', fromDate.toISOString().split('T')[0])
      .order('log_date', { ascending: false })

    if (error) {
      console.error('Error fetching readiness history:', error)
      throw new Error('Failed to fetch readiness history')
    }
    return data || []
  },

  /**
   * Get readiness logs for a coach's athletes (for dashboard)
   */
  async getCoachAthletesReadiness(coachId: string, date?: string): Promise<ReadinessLog[]> {
    const targetDate = date || new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('readiness_logs')
      .select('*')
      .eq('log_date', targetDate)

    if (error) {
      console.error('Error fetching coach athletes readiness:', error)
      throw new Error('Failed to fetch readiness data')
    }
    return data || []
  },

  // ============================================
  // Session Feedback
  // ============================================

  /**
   * Submit post-session feedback
   */
  async submitSessionFeedback(feedback: SessionFeedbackInsert): Promise<SessionFeedback> {
    const { data, error } = (await (supabase
      .from('session_feedback') as any)
      .insert(feedback)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error submitting session feedback:', error)
      throw new Error('Failed to submit session feedback')
    }
    return data
  },

  /**
   * Get session feedback for a completion
   */
  async getSessionFeedback(completionId: string): Promise<SessionFeedback | null> {
    const { data, error } = await supabase
      .from('session_feedback')
      .select('*')
      .eq('completion_id', completionId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching session feedback:', error)
      return null
    }
    return data
  },

  /**
   * Get session feedback history for an athlete
   */
  async getAthleteFeedbackHistory(athleteId: string, limit = 20): Promise<SessionFeedback[]> {
    // Join through workout_completions to get athlete's feedback
    const { data, error } = await supabase
      .from('session_feedback')
      .select(`
        *,
        completion:workout_completions!session_feedback_completion_id_fkey(
          athlete_id,
          completed_at
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching feedback history:', error)
      throw new Error('Failed to fetch feedback history')
    }

    // Filter for the specific athlete (post-query filter since we can't filter on joined table in same query easily)
    return (data || []).filter((fb: any) => {
      const completion = Array.isArray(fb.completion) ? fb.completion[0] : fb.completion
      return completion?.athlete_id === athleteId
    })
  },
}
