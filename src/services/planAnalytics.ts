import { supabase } from '@/lib/supabase'

export interface WeeklyVolume {
  weekId: string
  weekNumber: number
  blockName: string
  blockType: string | null
  plannedVolume: number // sum of sets × reps × weight across workouts
  actualVolume: number  // from workout_completions
  plannedIntensity: number // avg intensity_percent
  actualIntensity: number  // avg actual RPE / target RPE
  sessionCount: number
  completedCount: number
  isDeload: boolean
}

export interface AthleteCompliance {
  athleteId: string
  displayName: string
  totalAssigned: number
  totalCompleted: number
  totalSkipped: number
  complianceRate: number
}

export interface BlockSummary {
  blockId: string
  blockName: string
  blockType: string | null
  weekCount: number
  totalSessions: number
  completedSessions: number
  plannedVolume: number
  actualVolume: number
  avgRpe: number | null
  pbCount: number
}

export const planAnalyticsService = {
  /**
   * Get weekly volume & intensity trends for a plan
   */
  async getWeeklyTrends(planId: string, coachId: string): Promise<WeeklyVolume[]> {
    // Get all blocks and weeks for the plan
    const { data: blocks, error: bErr } = await supabase
      .from('training_blocks')
      .select('*, block_weeks(*)')
      .eq('plan_id', planId)
      .order('order_index', { ascending: true })

    if (bErr || !blocks) return []

    const weeks: WeeklyVolume[] = []

    for (const block of blocks) {
      const blockWeeks = (block as any).block_weeks || []
      blockWeeks.sort((a: any, b: any) => a.week_number - b.week_number)

      for (const week of blockWeeks) {
        // Get workouts for this week
        const { data: workouts } = await supabase
          .from('workouts')
          .select('id, exercises(*)')
          .eq('block_week_id', week.id)
          .eq('coach_id', coachId)

        let plannedVolume = 0
        let intensitySum = 0
        let intensityCount = 0

        if (workouts) {
          for (const w of workouts) {
            const exercises = (w as any).exercises || []
            for (const ex of exercises) {
              const sets = ex.sets || 0
              const reps = parseInt(String(ex.reps || '0')) || 0
              const weight = ex.weight_kg || 0
              if (sets && reps && weight) {
                plannedVolume += sets * reps * weight
              }
              if (ex.intensity_percent) {
                intensitySum += ex.intensity_percent
                intensityCount++
              }
            }
          }
        }

        // Get completions for this week's workouts
        const workoutIds = workouts?.map(w => w.id) || []
        let actualVolume = 0
        let completedCount = 0

        if (workoutIds.length > 0) {
          const { data: completions } = await supabase
            .from('workout_completions')
            .select('id, workout_id, exercise_results(*)')
            .in('workout_id', workoutIds)

          if (completions) {
            completedCount = completions.length
            for (const c of completions) {
              const results = (c as any).exercise_results || []
              for (const r of results) {
                const sets = r.sets_completed || 0
                const reps = parseInt(String(r.reps_completed || '0')) || 0
                const weight = r.weight_used || 0
                if (sets && reps && weight) {
                  actualVolume += sets * reps * weight
                }
              }
            }
          }
        }

        weeks.push({
          weekId: week.id,
          weekNumber: week.week_number,
          blockName: block.name,
          blockType: block.block_type,
          plannedVolume,
          actualVolume,
          plannedIntensity: intensityCount > 0 ? Math.round(intensitySum / intensityCount) : 0,
          actualIntensity: 0, // Computed from session feedback RPE
          sessionCount: workouts?.length || 0,
          completedCount,
          isDeload: week.is_deload,
        })
      }
    }

    return weeks
  },

  /**
   * Get athlete compliance rates for a plan
   */
  async getAthleteCompliance(planId: string): Promise<AthleteCompliance[]> {
    const { data: assignments, error } = await supabase
      .from('workout_assignments')
      .select('athlete_id, status, athlete:profiles!workout_assignments_athlete_id_fkey(display_name)')
      .eq('plan_id', planId)

    if (error || !assignments) return []

    const map = new Map<string, AthleteCompliance>()

    for (const a of assignments) {
      const athleteProfile = Array.isArray((a as any).athlete) ? (a as any).athlete[0] : (a as any).athlete
      const name = athleteProfile?.display_name || 'Unknown'

      if (!map.has(a.athlete_id)) {
        map.set(a.athlete_id, {
          athleteId: a.athlete_id,
          displayName: name,
          totalAssigned: 0,
          totalCompleted: 0,
          totalSkipped: 0,
          complianceRate: 0,
        })
      }

      const entry = map.get(a.athlete_id)!
      entry.totalAssigned++
      if (a.status === 'completed') entry.totalCompleted++
      if (a.status === 'skipped') entry.totalSkipped++
    }

    // Calculate compliance rates
    for (const entry of map.values()) {
      entry.complianceRate = entry.totalAssigned > 0
        ? Math.round((entry.totalCompleted / entry.totalAssigned) * 100)
        : 0
    }

    return Array.from(map.values()).sort((a, b) => b.complianceRate - a.complianceRate)
  },

  /**
   * Get block-level summaries for a plan
   */
  async getBlockSummaries(planId: string, coachId: string): Promise<BlockSummary[]> {
    const weeklyTrends = await planAnalyticsService.getWeeklyTrends(planId, coachId)

    // Group by block
    const blockMap = new Map<string, BlockSummary>()

    for (const week of weeklyTrends) {
      const blockKey = `${week.blockName}`
      if (!blockMap.has(blockKey)) {
        blockMap.set(blockKey, {
          blockId: blockKey,
          blockName: week.blockName,
          blockType: week.blockType,
          weekCount: 0,
          totalSessions: 0,
          completedSessions: 0,
          plannedVolume: 0,
          actualVolume: 0,
          avgRpe: null,
          pbCount: 0,
        })
      }
      const summary = blockMap.get(blockKey)!
      summary.weekCount++
      summary.totalSessions += week.sessionCount
      summary.completedSessions += week.completedCount
      summary.plannedVolume += week.plannedVolume
      summary.actualVolume += week.actualVolume
    }

    return Array.from(blockMap.values())
  },

  /**
   * Get PB count per block (personal bests achieved)
   */
  async getPbsByBlock(planId: string): Promise<Map<string, number>> {
    // Fetch PBs that were achieved during this plan's timeframe
    const { data: plan } = await supabase
      .from('plans')
      .select('start_date, end_date')
      .eq('id', planId)
      .single()

    if (!plan) return new Map()

    const { data: pbs } = await supabase
      .from('personal_bests')
      .select('id, created_at')
      .gte('created_at', plan.start_date)
      .lte('created_at', plan.end_date || new Date().toISOString())

    // For now return total count (block-level attribution would require more joins)
    const map = new Map<string, number>()
    map.set('total', pbs?.length || 0)
    return map
  },

  /**
   * Get readiness trend data (for overlay on volume chart)
   */
  async getReadinessTrend(athleteId: string, startDate: string, endDate: string): Promise<{ date: string; score: number }[]> {
    const { data, error } = await supabase
      .from('readiness_logs')
      .select('log_date, subjective_score')
      .eq('athlete_id', athleteId)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date', { ascending: true })

    if (error || !data) return []
    return data
      .filter(d => d.subjective_score != null)
      .map(d => ({ date: d.log_date, score: d.subjective_score! }))
  },
}
