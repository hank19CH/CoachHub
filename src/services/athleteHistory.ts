import { supabase } from '@/lib/supabase'

// ============================================
// Athlete History Analysis Service
// Pre-computes training context for AI prompts (9.5b+)
// ============================================

export interface AthleteHistorySummary {
  athleteId: string
  displayName: string
  level: string | null
  weeksAnalyzed: number
  /** Total volume load (sets × reps × weight) over the period */
  totalVolumeLoad: number
  /** Average weekly volume */
  avgWeeklyVolume: number
  /** Volume trend: increasing, stable, decreasing */
  volumeTrend: 'increasing' | 'stable' | 'decreasing'
  /** Average session RPE from feedback */
  avgSessionRpe: number | null
  /** Average readiness score (last 2 weeks) */
  avgReadiness: number | null
  /** Top exercises by frequency */
  topExercises: { name: string; frequency: number; bestWeight: number | null }[]
  /** ACWR estimate */
  acwr: number | null
  /** Flags for overtraining indicators */
  flags: string[]
  /** Compact text summary for LLM prompt context */
  contextText: string
}

export const athleteHistoryService = {
  /**
   * Generate a compact training history summary for an athlete.
   * Used as context for AI plan/session generation (Tier 2 & 3).
   * Pulls last 8-12 weeks of data.
   */
  async getAthleteSummary(
    athleteId: string,
    weeksBack = 10
  ): Promise<AthleteHistorySummary> {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - weeksBack * 7)
    const fromStr = fromDate.toISOString()

    // Get athlete profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', athleteId)
      .single()

    const { data: athleteProfile } = await supabase
      .from('athlete_profiles')
      .select('competition_level, injury_notes')
      .eq('id', athleteId)
      .single()

    // Get completions with exercise results
    const { data: completions } = await supabase
      .from('workout_completions')
      .select(`
        id,
        completed_at,
        overall_rpe,
        duration_minutes,
        exercise_results(
          exercise_id,
          sets_completed,
          reps_completed,
          weight_used_kg,
          rpe,
          is_pb,
          exercise:exercises!exercise_results_exercise_id_fkey(name)
        )
      `)
      .eq('athlete_id', athleteId)
      .gte('completed_at', fromStr)
      .order('completed_at', { ascending: true })

    // Get session feedback (RPE trends) via workout_completions
    const { data: feedbackCompletions } = await supabase
      .from('workout_completions')
      .select(`
        id,
        completed_at,
        overall_rpe
      `)
      .eq('athlete_id', athleteId)
      .gte('completed_at', fromStr)
      .order('completed_at', { ascending: true })

    // Convert to feedback format (use overall_rpe as session_rpe)
    const feedbacks = feedbackCompletions?.map(fc => ({
      session_rpe: fc.overall_rpe,
      created_at: fc.completed_at
    })) || []

    // Get readiness logs (last 2 weeks for recent trend)
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const { data: readinessLogs } = await supabase
      .from('readiness_logs')
      .select('subjective_score, sleep_quality, muscle_soreness, energy_level')
      .eq('athlete_id', athleteId)
      .gte('log_date', twoWeeksAgo.toISOString().split('T')[0])

    // ============================================
    // Compute metrics
    // ============================================

    // Volume per week
    const weeklyVolumes: Map<string, number> = new Map()
    const exerciseFreq: Map<string, { count: number; bestWeight: number }> = new Map()

    for (const c of (completions || [])) {
      const weekKey = getISOWeek(new Date(c.completed_at))
      const currentWeekVol = weeklyVolumes.get(weekKey) || 0
      let sessionVolume = 0

      for (const r of ((c as any).exercise_results || [])) {
        const sets = r.sets_completed || 0
        const reps = parseInt(String(r.reps_completed || '0')) || 0
        const weight = r.weight_used_kg || 0
        sessionVolume += sets * reps * weight

        // Track exercise frequency
        const exName = getExerciseName(r)
        if (exName) {
          const existing = exerciseFreq.get(exName) || { count: 0, bestWeight: 0 }
          existing.count++
          if (weight > existing.bestWeight) existing.bestWeight = weight
          exerciseFreq.set(exName, existing)
        }
      }

      weeklyVolumes.set(weekKey, currentWeekVol + sessionVolume)
    }

    const weekVolsArray = Array.from(weeklyVolumes.values())
    const totalVolumeLoad = weekVolsArray.reduce((sum, v) => sum + v, 0)
    const avgWeeklyVolume = weekVolsArray.length > 0
      ? Math.round(totalVolumeLoad / weekVolsArray.length)
      : 0

    // Volume trend (compare first half vs second half)
    let volumeTrend: 'increasing' | 'stable' | 'decreasing' = 'stable'
    if (weekVolsArray.length >= 4) {
      const midpoint = Math.floor(weekVolsArray.length / 2)
      const firstHalf = weekVolsArray.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint
      const secondHalf = weekVolsArray.slice(midpoint).reduce((a, b) => a + b, 0) / (weekVolsArray.length - midpoint)
      const changePercent = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0
      if (changePercent > 10) volumeTrend = 'increasing'
      else if (changePercent < -10) volumeTrend = 'decreasing'
    }

    // RPE trends
    const rpeValues = (feedbacks || [])
      .filter(f => f.session_rpe != null)
      .map(f => f.session_rpe!)
    const avgSessionRpe = rpeValues.length > 0
      ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
      : null

    // Readiness
    const readinessScores = (readinessLogs || [])
      .filter(r => r.subjective_score != null)
      .map(r => r.subjective_score!)
    const avgReadiness = readinessScores.length > 0
      ? Math.round((readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length) * 10) / 10
      : null

    // ACWR (simplified: last week / 4-week avg)
    let acwr: number | null = null
    if (weekVolsArray.length >= 4) {
      const lastWeek = weekVolsArray[weekVolsArray.length - 1]
      const fourWeekAvg = weekVolsArray.slice(-4).reduce((a, b) => a + b, 0) / 4
      if (fourWeekAvg > 0) {
        acwr = Math.round((lastWeek / fourWeekAvg) * 100) / 100
      }
    }

    // Top exercises
    const topExercises = Array.from(exerciseFreq.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, data]) => ({
        name,
        frequency: data.count,
        bestWeight: data.bestWeight > 0 ? data.bestWeight : null,
      }))

    // Flags
    const flags: string[] = []
    if (acwr && acwr > 1.3) flags.push(`High ACWR (${acwr}) — injury risk`)
    if (acwr && acwr < 0.8 && acwr > 0) flags.push(`Low ACWR (${acwr}) — possible detraining`)
    if (avgSessionRpe && avgSessionRpe >= 8.5) flags.push(`High avg RPE (${avgSessionRpe}) — possible overreaching`)
    if (avgReadiness && avgReadiness <= 4) flags.push(`Low readiness trend (${avgReadiness}/10)`)
    if (volumeTrend === 'decreasing') flags.push('Volume trend: decreasing')

    // Check for high soreness
    const avgSoreness = readinessLogs && readinessLogs.length > 0
      ? readinessLogs.filter(r => r.muscle_soreness != null).reduce((a, r) => a + (r.muscle_soreness || 0), 0) / readinessLogs.length
      : 0
    if (avgSoreness >= 3.5) flags.push(`Elevated soreness (avg ${avgSoreness.toFixed(1)}/5)`)

    // Build compact text for LLM context
    const contextText = buildContextText({
      displayName: profile?.display_name || 'Athlete',
      level: athleteProfile?.competition_level || null,
      injuries: athleteProfile?.injury_notes || null,
      weeksAnalyzed: weekVolsArray.length,
      avgWeeklyVolume,
      volumeTrend,
      avgSessionRpe,
      avgReadiness,
      acwr,
      topExercises,
      flags,
    })

    return {
      athleteId,
      displayName: profile?.display_name || 'Unknown',
      level: athleteProfile?.competition_level || null,
      weeksAnalyzed: weekVolsArray.length,
      totalVolumeLoad: Math.round(totalVolumeLoad),
      avgWeeklyVolume,
      volumeTrend,
      avgSessionRpe,
      avgReadiness,
      topExercises,
      acwr,
      flags,
      contextText,
    }
  },
}

// ============================================
// Helpers
// ============================================

function getISOWeek(date: Date): string {
  const d = new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function getExerciseName(result: any): string | null {
  const exercise = Array.isArray(result.exercise) ? result.exercise[0] : result.exercise
  return exercise?.name || null
}

function buildContextText(data: {
  displayName: string
  level: string | null
  injuries: string | null
  weeksAnalyzed: number
  avgWeeklyVolume: number
  volumeTrend: string
  avgSessionRpe: number | null
  avgReadiness: number | null
  acwr: number | null
  topExercises: { name: string; frequency: number; bestWeight: number | null }[]
  flags: string[]
}): string {
  const lines: string[] = [
    `Athlete: ${data.displayName}`,
  ]

  if (data.level) lines.push(`Level: ${data.level}`)
  if (data.injuries) lines.push(`Injuries/Notes: ${data.injuries}`)
  lines.push(`Training data: ${data.weeksAnalyzed} weeks analyzed`)
  lines.push(`Avg weekly volume: ${(data.avgWeeklyVolume / 1000).toFixed(1)} tonnes (${data.volumeTrend})`)
  if (data.avgSessionRpe) lines.push(`Avg session RPE: ${data.avgSessionRpe}/10`)
  if (data.avgReadiness) lines.push(`Recent readiness: ${data.avgReadiness}/10`)
  if (data.acwr) lines.push(`ACWR: ${data.acwr}`)

  if (data.topExercises.length > 0) {
    lines.push(`Top exercises: ${data.topExercises.slice(0, 5).map(e =>
      `${e.name}${e.bestWeight ? ` (best: ${e.bestWeight}kg)` : ''}`
    ).join(', ')}`)
  }

  if (data.flags.length > 0) {
    lines.push(`⚠ Flags: ${data.flags.join('; ')}`)
  }

  return lines.join('\n')
}
