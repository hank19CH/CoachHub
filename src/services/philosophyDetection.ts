import { supabase } from '@/lib/supabase'
import type { CoachPhilosophy } from '@/types/import'

/**
 * Analyze coach's programming philosophy using all their programs
 * Calls the analyze-philosophy Edge Function
 */
export async function analyzeCoachPhilosophy(coachId: string): Promise<CoachPhilosophy> {
  const { data, error } = await supabase.functions.invoke('analyze-philosophy', {
    body: { coachId },
  })

  if (error) throw new Error(error.message || 'Philosophy analysis failed')
  if (!data?.success) throw new Error(data?.error || 'Analysis returned no result')

  return data.philosophy
}

/**
 * Get coach philosophy (returns null if not yet analyzed)
 */
export async function getCoachPhilosophy(coachId: string): Promise<CoachPhilosophy | null> {
  const { data, error } = await (supabase as any)
    .from('coach_philosophy')
    .select('*')
    .eq('coach_id', coachId)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    throw new Error(error.message)
  }

  return data
}

/**
 * Manually trigger philosophy analysis
 */
export async function triggerPhilosophyAnalysis(coachId: string): Promise<CoachPhilosophy> {
  return await analyzeCoachPhilosophy(coachId)
}

/**
 * Get program count for a coach
 */
export async function getCoachProgramCount(coachId: string): Promise<number> {
  const { count, error } = await (supabase as any)
    .from('programs')
    .select('*', { count: 'exact', head: true })
    .eq('coach_id', coachId)

  if (error) throw new Error(error.message)
  return count || 0
}
