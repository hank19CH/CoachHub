import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

// ============================================
// Adaptive Suggestion Types
// ============================================
export type SuggestionType =
  | 'progressive_overload'
  | 'deload_recommended'
  | 'readiness_adjustment'
  | 'compliance_alert'
  | 'volume_check'
  | 'recovery_needed'

export type SuggestionPriority = 'low' | 'medium' | 'high' | 'critical'

export interface AdaptiveSuggestion {
  type: SuggestionType
  priority: SuggestionPriority
  title: string
  description: string
  rationale: string
  /** What to change — e.g. { action: 'reduce_volume', percent: 15 } */
  recommendation: Record<string, any>
  /** Confidence 0-100 */
  confidence: number
  /** The context this suggestion applies to */
  contextType: 'plan' | 'block' | 'week' | 'session' | 'exercise' | 'athlete'
  contextId?: string
}

// ============================================
// Constants — Evidence-based thresholds
// ============================================
const ACWR_HIGH_RISK = 1.3        // Acute:Chronic > 1.3 = injury risk
const ACWR_LOW_RISK = 0.8         // Below 0.8 = detraining
const RPE_OVERREACH_THRESHOLD = 1.5 // Sessions exceeding target by this much
const RPE_OVERREACH_WINDOW = 2    // Number of consecutive sessions
const READINESS_LOW_THRESHOLD = 4  // Readiness score 1-10 (4 or below = modify)
const READINESS_VERY_LOW = 3       // Very low = significant reduction
const COMPLIANCE_WARNING = 0.7     // Below 70% = flag
const COMPLIANCE_CRITICAL = 0.5    // Below 50% = critical alert
const OVERLOAD_INCREMENT = 0.025   // 2.5% progressive overload default

export const adaptiveService = {
  // ============================================
  // Main Entry: Generate all suggestions for a context
  // ============================================

  /**
   * Get all adaptive suggestions for a plan/athlete combo
   */
  async getSuggestionsForPlan(
    planId: string,
    coachId: string,
    athleteId?: string
  ): Promise<AdaptiveSuggestion[]> {
    const suggestions: AdaptiveSuggestion[] = []

    try {
      // Run all checks in parallel
      const [overloadSugs, deloadSugs, readinessSugs, complianceSugs] = await Promise.all([
        this.checkProgressiveOverload(planId, coachId),
        this.checkDeloadNeeded(planId, coachId, athleteId),
        athleteId ? this.checkReadinessAdjustment(athleteId) : Promise.resolve([]),
        athleteId ? this.checkComplianceAlerts(planId, athleteId) : Promise.resolve([]),
      ])

      suggestions.push(...overloadSugs, ...deloadSugs, ...readinessSugs, ...complianceSugs)

      // Sort by priority (critical first)
      const priorityOrder: Record<SuggestionPriority, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      }
      suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    } catch (e) {
      console.error('Error generating adaptive suggestions:', e)
    }

    return suggestions
  },

  /**
   * Get suggestions for the current session context
   */
  async getSuggestionsForSession(
    workoutId: string,
    athleteId: string
  ): Promise<AdaptiveSuggestion[]> {
    const suggestions: AdaptiveSuggestion[] = []

    try {
      // Check readiness
      const readinessSugs = await this.checkReadinessAdjustment(athleteId)
      suggestions.push(...readinessSugs)

      // Check if progressive overload should be applied to exercises
      const exerciseSugs = await this.getExerciseProgressionSuggestions(workoutId, athleteId)
      suggestions.push(...exerciseSugs)
    } catch (e) {
      console.error('Error generating session suggestions:', e)
    }

    return suggestions
  },

  // ============================================
  // 1. Progressive Overload Calculator
  // ============================================

  /**
   * Based on last session's actuals, suggest next prescriptions
   */
  async checkProgressiveOverload(
    planId: string,
    coachId: string
  ): Promise<AdaptiveSuggestion[]> {
    const suggestions: AdaptiveSuggestion[] = []

    try {
      // Get recent completed workouts for this plan
      const { data: assignments } = await supabase
        .from('workout_assignments')
        .select('workout_id, athlete_id, status')
        .eq('plan_id', planId)
        .eq('status', 'completed')
        .order('assigned_date', { ascending: false })
        .limit(20)

      if (!assignments || assignments.length === 0) return suggestions

      // Get the most recent completed workout's exercise results
      const workoutIds = [...new Set(assignments.map(a => a.workout_id))]
      const { data: completions } = await supabase
        .from('workout_completions')
        .select('id, workout_id, exercise_results(*, exercise:exercises!exercise_results_exercise_id_fkey(name, sets, reps, weight_kg))')
        .in('workout_id', workoutIds.slice(0, 5))
        .order('completed_at', { ascending: false })
        .limit(5)

      if (!completions || completions.length === 0) return suggestions

      // Analyze results for overload opportunities
      for (const completion of completions) {
        const results = (completion as any).exercise_results || []
        for (const result of results) {
          const exercise = Array.isArray(result.exercise) ? result.exercise[0] : result.exercise
          if (!exercise) continue

          const prescribedWeight = exercise.weight_kg || 0
          const actualWeight = result.weight_used_kg || 0
          const prescribedReps = parseInt(String(exercise.reps || '0')) || 0
          const actualReps = parseInt(String(result.reps_completed || '0')) || 0
          const rpe = result.rpe || 0

          // If athlete completed prescribed work at RPE < 8, suggest increase
          if (actualWeight >= prescribedWeight && actualReps >= prescribedReps && rpe > 0 && rpe <= 7.5) {
            const suggestedIncrease = Math.round(prescribedWeight * OVERLOAD_INCREMENT * 10) / 10
            suggestions.push({
              type: 'progressive_overload',
              priority: 'low',
              title: `Increase ${exercise.name}`,
              description: `${exercise.name}: completed at RPE ${rpe}. Consider +${suggestedIncrease}kg (${Math.round(OVERLOAD_INCREMENT * 100)}%).`,
              rationale: `Athlete completed ${actualReps} reps × ${actualWeight}kg at RPE ${rpe}, indicating room for progression.`,
              recommendation: {
                action: 'increase_weight',
                exercise_name: exercise.name,
                current_weight: prescribedWeight,
                suggested_weight: Math.round((prescribedWeight + suggestedIncrease) * 10) / 10,
                rpe_basis: rpe,
              },
              confidence: rpe <= 6 ? 85 : 70,
              contextType: 'exercise',
              contextId: result.exercise_id,
            })
          }
        }
      }
    } catch (e) {
      console.error('Error checking progressive overload:', e)
    }

    return suggestions
  },

  // ============================================
  // 2. Deload Detector
  // ============================================

  /**
   * ACWR > 1.3 OR avg session RPE > target + 1.5 for 2+ sessions → suggest deload
   */
  async checkDeloadNeeded(
    planId: string,
    coachId: string,
    athleteId?: string
  ): Promise<AdaptiveSuggestion[]> {
    const suggestions: AdaptiveSuggestion[] = []

    try {
      // Get recent session feedback via workout_completions (which has overall_rpe)
      // workout_completions has assignment_id, not workout_id — join through workout_assignments
      let completionsQuery = supabase
        .from('workout_completions')
        .select('id, athlete_id, assignment_id, overall_rpe, completed_at, workout_assignment:workout_assignments!workout_completions_assignment_id_fkey(workout_id)')
        .order('completed_at', { ascending: false })
        .limit(10)

      // Filter by athlete if specified
      if (athleteId) {
        completionsQuery = completionsQuery.eq('athlete_id', athleteId)
      }

      const { data: recentCompletions } = await completionsQuery

      if (!recentCompletions || recentCompletions.length < 2) return suggestions

      // Convert to feedback format — normalize FK relation
      const recentFeedback = (recentCompletions as any[])
        .filter(c => c.overall_rpe != null)
        .map(c => {
          const assignment = Array.isArray(c.workout_assignment) ? c.workout_assignment[0] : c.workout_assignment
          return {
            session_rpe: c.overall_rpe,
            created_at: c.completed_at,
            athlete_id: c.athlete_id,
            workout_id: assignment?.workout_id || null
          }
        })

      // Check for consecutive high-RPE sessions
      const feedbackWithRpe = recentFeedback.filter(f => f.session_rpe != null)
      let consecutiveOverreach = 0

      // Get target RPEs from workouts to compare
      for (const fb of feedbackWithRpe) {
        // Skip if no workout_id (broken assignment link)
        if (!fb.workout_id) continue

        // Get the workout's target RPE
        const { data: workout } = await supabase
          .from('workouts')
          .select('target_rpe')
          .eq('id', fb.workout_id)
          .single()

        const targetRpe = (workout as any)?.target_rpe || 7
        const actualRpe = fb.session_rpe!

        if (actualRpe > targetRpe + RPE_OVERREACH_THRESHOLD) {
          consecutiveOverreach++
        } else {
          break // Reset on a non-overreaching session
        }
      }

      if (consecutiveOverreach >= RPE_OVERREACH_WINDOW) {
        suggestions.push({
          type: 'deload_recommended',
          priority: 'high',
          title: 'Deload recommended',
          description: `${consecutiveOverreach} consecutive sessions exceeded target RPE by ${RPE_OVERREACH_THRESHOLD}+. Consider a deload or reduced volume week.`,
          rationale: `Sustained overreaching detected. Average session RPE has been ${RPE_OVERREACH_THRESHOLD}+ points above prescribed targets for ${consecutiveOverreach} sessions, indicating accumulated fatigue.`,
          recommendation: {
            action: 'insert_deload',
            duration: '3-5 days',
            volume_reduction: 40,
            intensity_cap: 70,
          },
          confidence: consecutiveOverreach >= 3 ? 90 : 75,
          contextType: 'plan',
          contextId: planId,
        })
      }

      // ACWR check: compute acute (1-week) vs chronic (4-week) load ratio
      // Uses volume load (sets × reps × weight) as the workload metric
      const acwrSuggestion = await this._computeAcwr(planId, coachId, athleteId)
      if (acwrSuggestion) {
        suggestions.push(acwrSuggestion)
      }
    } catch (e) {
      console.error('Error checking deload need:', e)
    }

    return suggestions
  },

  /**
   * Compute Acute:Chronic Workload Ratio (ACWR)
   * Acute = last 7 days of volume load
   * Chronic = avg weekly volume over last 28 days
   */
  async _computeAcwr(
    planId: string,
    coachId: string,
    athleteId?: string
  ): Promise<AdaptiveSuggestion | null> {
    try {
      const now = new Date()
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString()

      // Get completions from last 4 weeks
      let query = supabase
        .from('workout_completions')
        .select('id, completed_at, exercise_results(sets_completed, reps_completed, weight_used_kg)')
        .gte('completed_at', fourWeeksAgo)
        .order('completed_at', { ascending: true })

      if (athleteId) {
        query = query.eq('athlete_id', athleteId)
      }

      const { data: completions } = await query

      if (!completions || completions.length < 4) return null

      // Compute weekly volumes
      let acuteVolume = 0
      let chronicVolumeTotal = 0
      let chronicWeeks = 0

      // Split into 4 one-week buckets
      for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
        const weekStart = new Date(now.getTime() - (weekOffset + 1) * 7 * 24 * 60 * 60 * 1000)
        const weekEnd = new Date(now.getTime() - weekOffset * 7 * 24 * 60 * 60 * 1000)

        let weekVolume = 0
        for (const c of completions) {
          const completedAt = new Date(c.completed_at)
          if (completedAt >= weekStart && completedAt < weekEnd) {
            const results = (c as any).exercise_results || []
            for (const r of results) {
              const sets = r.sets_completed || 0
              const reps = parseInt(String(r.reps_completed || '0')) || 0
              const weight = r.weight_used_kg || 0
              weekVolume += sets * reps * weight
            }
          }
        }

        if (weekOffset === 0) {
          acuteVolume = weekVolume
        }
        if (weekVolume > 0) {
          chronicVolumeTotal += weekVolume
          chronicWeeks++
        }
      }

      if (chronicWeeks === 0) return null

      const chronicAvg = chronicVolumeTotal / chronicWeeks
      if (chronicAvg === 0) return null

      const acwr = acuteVolume / chronicAvg

      if (acwr > ACWR_HIGH_RISK) {
        return {
          type: 'deload_recommended',
          priority: 'high',
          title: 'High workload spike detected',
          description: `ACWR is ${acwr.toFixed(2)} (threshold: ${ACWR_HIGH_RISK}). This week's load is significantly higher than the 4-week average.`,
          rationale: `Acute:Chronic Workload Ratio of ${acwr.toFixed(2)} exceeds the ${ACWR_HIGH_RISK} threshold. Research indicates this increases injury risk. Acute load: ${Math.round(acuteVolume)}kg, Chronic avg: ${Math.round(chronicAvg)}kg.`,
          recommendation: {
            action: 'reduce_volume',
            acwr: Math.round(acwr * 100) / 100,
            acute_load: Math.round(acuteVolume),
            chronic_avg: Math.round(chronicAvg),
            suggested_reduction_percent: Math.round((1 - (ACWR_HIGH_RISK / acwr)) * 100),
          },
          confidence: 80,
          contextType: 'plan',
          contextId: planId,
        }
      }

      if (acwr < ACWR_LOW_RISK && acuteVolume > 0) {
        return {
          type: 'volume_check',
          priority: 'low',
          title: 'Training volume may be too low',
          description: `ACWR is ${acwr.toFixed(2)} (below ${ACWR_LOW_RISK}). Current training load may be insufficient for adaptation.`,
          rationale: `Acute:Chronic Workload Ratio of ${acwr.toFixed(2)} is below the optimal range. This may indicate detraining risk.`,
          recommendation: {
            action: 'increase_volume',
            acwr: Math.round(acwr * 100) / 100,
            suggested_increase_percent: Math.round(((ACWR_LOW_RISK / acwr) - 1) * 100),
          },
          confidence: 65,
          contextType: 'plan',
          contextId: planId,
        }
      }
    } catch (e) {
      console.error('Error computing ACWR:', e)
    }

    return null
  },

  // ============================================
  // 3. Readiness-Based Adjustment
  // ============================================

  /**
   * Morning readiness below threshold → modify session
   */
  async checkReadinessAdjustment(
    athleteId: string
  ): Promise<AdaptiveSuggestion[]> {
    const suggestions: AdaptiveSuggestion[] = []

    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: todayLog } = await supabase
        .from('readiness_logs')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('log_date', today)
        .maybeSingle()

      if (!todayLog || !todayLog.subjective_score) return suggestions

      const score = todayLog.subjective_score

      if (score <= READINESS_VERY_LOW) {
        suggestions.push({
          type: 'readiness_adjustment',
          priority: 'critical',
          title: 'Very low readiness — modify session',
          description: `Readiness score: ${score}/10. Consider replacing with recovery/mobility session or rest day.`,
          rationale: buildReadinessRationale(todayLog),
          recommendation: {
            action: 'swap_to_recovery',
            readiness_score: score,
            suggested_session_type: 'recovery',
            volume_reduction: 60,
            intensity_cap: 50,
          },
          confidence: 90,
          contextType: 'athlete',
          contextId: athleteId,
        })
      } else if (score <= READINESS_LOW_THRESHOLD) {
        const volumeReduction = score <= 3 ? 40 : 25
        suggestions.push({
          type: 'readiness_adjustment',
          priority: 'medium',
          title: 'Low readiness — reduce intensity',
          description: `Readiness score: ${score}/10. Suggest reducing volume by ${volumeReduction}% and capping intensity.`,
          rationale: buildReadinessRationale(todayLog),
          recommendation: {
            action: 'reduce_session',
            readiness_score: score,
            volume_reduction: volumeReduction,
            intensity_cap: score <= 3 ? 65 : 75,
          },
          confidence: 75,
          contextType: 'athlete',
          contextId: athleteId,
        })
      }
    } catch (e) {
      console.error('Error checking readiness adjustment:', e)
    }

    return suggestions
  },

  // ============================================
  // 4. Compliance Tracker
  // ============================================

  /**
   * 2+ missed sessions → flag and suggest modification
   */
  async checkComplianceAlerts(
    planId: string,
    athleteId: string
  ): Promise<AdaptiveSuggestion[]> {
    const suggestions: AdaptiveSuggestion[] = []

    try {
      const { data: assignments } = await supabase
        .from('workout_assignments')
        .select('status, assigned_date')
        .eq('plan_id', planId)
        .eq('athlete_id', athleteId)

      if (!assignments || assignments.length === 0) return suggestions

      const total = assignments.length
      const completed = assignments.filter(a => a.status === 'completed').length
      const skipped = assignments.filter(a => a.status === 'skipped').length
      const pending = assignments.filter(a => a.status === 'pending').length

      // Check for past-due pending (should have been completed)
      const today = new Date().toISOString().split('T')[0]
      const pastDue = assignments.filter(a =>
        a.status === 'pending' && a.assigned_date < today
      ).length

      const complianceRate = total > 0 ? completed / total : 1
      const missedRecent = skipped + pastDue

      if (complianceRate < COMPLIANCE_CRITICAL && total >= 3) {
        suggestions.push({
          type: 'compliance_alert',
          priority: 'critical',
          title: 'Very low compliance',
          description: `Only ${Math.round(complianceRate * 100)}% of sessions completed. ${missedRecent} sessions missed/overdue. Consider simplifying the program.`,
          rationale: `Athlete has completed ${completed} of ${total} assigned sessions (${Math.round(complianceRate * 100)}%). ${skipped} skipped, ${pastDue} overdue. This suggests the program may be too demanding or not well-suited.`,
          recommendation: {
            action: 'simplify_program',
            compliance_rate: Math.round(complianceRate * 100),
            sessions_missed: missedRecent,
            reduce_frequency: true,
            suggested_sessions_per_week: 3,
          },
          confidence: 85,
          contextType: 'athlete',
          contextId: athleteId,
        })
      } else if (complianceRate < COMPLIANCE_WARNING && total >= 3) {
        suggestions.push({
          type: 'compliance_alert',
          priority: 'medium',
          title: 'Low compliance — check in with athlete',
          description: `${Math.round(complianceRate * 100)}% compliance. ${missedRecent} sessions missed recently.`,
          rationale: `Compliance has dropped below ${Math.round(COMPLIANCE_WARNING * 100)}% threshold. A check-in may help identify barriers (schedule, motivation, difficulty).`,
          recommendation: {
            action: 'check_in',
            compliance_rate: Math.round(complianceRate * 100),
            sessions_missed: missedRecent,
          },
          confidence: 70,
          contextType: 'athlete',
          contextId: athleteId,
        })
      }
    } catch (e) {
      console.error('Error checking compliance:', e)
    }

    return suggestions
  },

  // ============================================
  // 5. Exercise-Level Progression Suggestions
  // ============================================

  /**
   * For each exercise in a workout, suggest progressions based on history
   */
  async getExerciseProgressionSuggestions(
    workoutId: string,
    athleteId: string
  ): Promise<AdaptiveSuggestion[]> {
    const suggestions: AdaptiveSuggestion[] = []

    try {
      // Get exercises in this workout
      const { data: exercises } = await supabase
        .from('exercises')
        .select('id, name, sets, reps, weight_kg, rpe, intensity_percent')
        .eq('workout_id', workoutId)
        .order('order_index', { ascending: true })

      if (!exercises) return suggestions

      // For each exercise, check previous results
      for (const exercise of exercises) {
        const { data: prevResults } = await supabase
          .from('exercise_results')
          .select('sets_completed, reps_completed, weight_used_kg, rpe')
          .eq('exercise_id', exercise.id)
          .order('created_at', { ascending: false })
          .limit(3)

        if (!prevResults || prevResults.length === 0) continue

        // Use the most recent result
        const lastResult = prevResults[0]
        const lastRpe = lastResult.rpe || 0
        const lastWeight = lastResult.weight_used_kg || 0
        const prescribedWeight = exercise.weight_kg || 0

        // If last RPE was ≤ 7 and they completed all reps at or above prescribed weight
        if (lastRpe > 0 && lastRpe <= 7 && lastWeight >= prescribedWeight && prescribedWeight > 0) {
          const increment = prescribedWeight <= 40 ? 1.25 : 2.5 // Smaller increments for lighter lifts
          suggestions.push({
            type: 'progressive_overload',
            priority: 'low',
            title: `Progress ${exercise.name}`,
            description: `Last session: ${lastWeight}kg × RPE ${lastRpe}. Suggest ${prescribedWeight + increment}kg (+${increment}kg).`,
            rationale: `Based on previous performance at RPE ${lastRpe}, there is room for progressive overload.`,
            recommendation: {
              action: 'increase_weight',
              exercise_id: exercise.id,
              exercise_name: exercise.name,
              current_weight: prescribedWeight,
              suggested_weight: prescribedWeight + increment,
              last_rpe: lastRpe,
            },
            confidence: lastRpe <= 6 ? 85 : 70,
            contextType: 'exercise',
            contextId: exercise.id,
          })
        }
      }
    } catch (e) {
      console.error('Error getting exercise progression suggestions:', e)
    }

    return suggestions
  },

  // ============================================
  // Log suggestion to ai_plan_logs
  // ============================================

  /**
   * Persist a suggestion to the audit trail
   */
  async logSuggestion(
    coachId: string,
    suggestion: AdaptiveSuggestion,
    actionTaken: 'accepted' | 'modified' | 'rejected' | 'pending' = 'pending',
    coachNotes?: string
  ): Promise<void> {
    try {
      await (supabase.from('ai_plan_logs') as any).insert({
        coach_id: coachId,
        context_type: suggestion.contextType,
        context_id: suggestion.contextId || null,
        prompt_summary: `[Tier 1 / Rules] ${suggestion.type}: ${suggestion.title}`,
        suggestion: {
          type: suggestion.type,
          priority: suggestion.priority,
          description: suggestion.description,
          rationale: suggestion.rationale,
          recommendation: suggestion.recommendation,
          confidence: suggestion.confidence,
        } as unknown as Json,
        action_taken: actionTaken,
        coach_notes: coachNotes || null,
      })
    } catch (e) {
      console.error('Error logging suggestion:', e)
    }
  },
}

// ============================================
// Helpers
// ============================================

function buildReadinessRationale(log: any): string {
  const factors: string[] = []
  if (log.sleep_quality && log.sleep_quality <= 2) factors.push(`poor sleep quality (${log.sleep_quality}/5)`)
  if (log.sleep_hours && log.sleep_hours < 6) factors.push(`only ${log.sleep_hours}h sleep`)
  if (log.muscle_soreness && log.muscle_soreness >= 4) factors.push(`high soreness (${log.muscle_soreness}/5)`)
  if (log.energy_level && log.energy_level <= 2) factors.push(`low energy (${log.energy_level}/5)`)
  if (log.stress_level && log.stress_level >= 4) factors.push(`high stress (${log.stress_level}/5)`)

  const base = `Overall readiness score: ${log.subjective_score}/10.`
  if (factors.length > 0) {
    return `${base} Contributing factors: ${factors.join(', ')}.`
  }
  return `${base} Athlete self-reported low readiness today.`
}
