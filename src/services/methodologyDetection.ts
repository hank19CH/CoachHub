import { supabase } from '@/lib/supabase'
import { extractMetrics } from './featureExtraction'
import { matchAgainstMethodologies } from './fingerprintMatcher'
import type {
  MethodologyProfile,
  ExtractedMetrics,
  MatchingOutput,
  CoachMethodologyMatch,
  ProgramForExtraction,
} from '@/types/methodology'

// ============================================
// Methodology Detection Service
// Orchestrates: data loading → feature extraction → fingerprint matching → storage
// Replaces full AI analysis for methodology identification
// ============================================

/**
 * Load all methodology profiles from DB
 */
export async function getMethodologyProfiles(): Promise<MethodologyProfile[]> {
  const { data, error } = await (supabase as any)
    .from('methodology_profiles')
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Get a single methodology profile by ID
 */
export async function getMethodologyProfile(id: string): Promise<MethodologyProfile | null> {
  const { data, error } = await (supabase as any)
    .from('methodology_profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

/**
 * Get coach's existing methodology matches
 */
export async function getCoachMethodologyMatches(
  coachId: string
): Promise<CoachMethodologyMatch[]> {
  const { data, error } = await (supabase as any)
    .from('coach_methodology_matches')
    .select('*, methodology:methodology_profiles(*)')
    .eq('coach_id', coachId)
    .order('confidence', { ascending: false })

  if (error) throw new Error(error.message)

  // Normalize FK relations
  return (data || []).map((m: any) => ({
    ...m,
    methodology: Array.isArray(m.methodology) ? m.methodology[0] ?? null : m.methodology ?? null,
  }))
}

/**
 * Get coach's extracted metrics
 */
export async function getCoachExtractedMetrics(
  coachId: string
): Promise<ExtractedMetrics | null> {
  const { data, error } = await (supabase as any)
    .from('coach_extracted_metrics')
    .select('*')
    .eq('coach_id', coachId)
    .single()

  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return data
}

// ============================================
// Main Detection Pipeline
// ============================================

/**
 * Run the full methodology detection pipeline for a coach
 * 1. Load coach's programs from DB
 * 2. Extract metrics locally
 * 3. Match against methodology profiles
 * 4. Store results
 *
 * Returns the matching output for immediate UI use
 */
export async function detectCoachMethodology(coachId: string): Promise<MatchingOutput> {
  // 1. Load coach's programs with full structure
  const programs = await loadCoachPrograms(coachId)

  if (programs.length === 0) {
    throw new Error('No programs found for analysis')
  }

  // 2. Extract metrics locally (no API call)
  const metrics = extractMetrics(programs)

  // 3. Load methodology profiles
  const profiles = await getMethodologyProfiles()

  if (profiles.length === 0) {
    throw new Error('No methodology profiles configured')
  }

  // 4. Match against all profiles
  const output = matchAgainstMethodologies(metrics, profiles)

  // 5. Store extracted metrics
  await upsertExtractedMetrics(coachId, metrics)

  // 6. Store methodology matches
  await upsertMethodologyMatches(coachId, output, metrics)

  // 7. Update coach_philosophy with primary methodology
  if (output.top_match && output.top_match.confidence >= 40) {
    await updateCoachPhilosophyMethodology(coachId, output)
  }

  return output
}

/**
 * Quick re-match: use existing extracted metrics, just re-score against profiles
 * Useful when methodology profiles are updated
 */
export async function rematchCoachMethodology(coachId: string): Promise<MatchingOutput | null> {
  const existingMetrics = await getCoachExtractedMetrics(coachId)
  if (!existingMetrics) return null

  const profiles = await getMethodologyProfiles()
  if (profiles.length === 0) return null

  const output = matchAgainstMethodologies(existingMetrics, profiles)

  await upsertMethodologyMatches(coachId, output, existingMetrics)

  if (output.top_match && output.top_match.confidence >= 40) {
    await updateCoachPhilosophyMethodology(coachId, output)
  }

  return output
}

// ============================================
// Coach Confirmation Actions
// ============================================

/**
 * Coach confirms a detected methodology
 */
export async function confirmMethodology(
  coachId: string,
  methodologyId: string,
  notes?: string
): Promise<void> {
  const now = new Date().toISOString()

  await (supabase as any)
    .from('coach_methodology_matches')
    .update({
      status: 'confirmed',
      coach_confirmed: true,
      coach_notes: notes || null,
      confirmed_at: now,
      updated_at: now,
    })
    .eq('coach_id', coachId)
    .eq('methodology_id', methodologyId)

  // Log the learning event
  await logLearningEvent(coachId, methodologyId, 'confirmed', notes)

  // Update coach_philosophy
  await (supabase as any)
    .from('coach_philosophy')
    .upsert({
      coach_id: coachId,
      primary_methodology_id: methodologyId,
      methodology_confirmed: true,
      updated_at: now,
    }, { onConflict: 'coach_id' })
}

/**
 * Coach rejects a detected methodology
 */
export async function rejectMethodology(
  coachId: string,
  methodologyId: string,
  feedback?: string
): Promise<void> {
  const now = new Date().toISOString()

  await (supabase as any)
    .from('coach_methodology_matches')
    .update({
      status: 'rejected',
      coach_confirmed: false,
      coach_notes: feedback || null,
      confirmed_at: now,
      updated_at: now,
    })
    .eq('coach_id', coachId)
    .eq('methodology_id', methodologyId)

  await logLearningEvent(coachId, methodologyId, 'rejected', feedback)
}

/**
 * Coach says "actually it's X" — corrects to a different methodology
 */
export async function correctMethodology(
  coachId: string,
  detectedMethodologyId: string,
  correctMethodologyId: string,
  feedback?: string
): Promise<void> {
  const now = new Date().toISOString()

  // Reject the detected one
  await (supabase as any)
    .from('coach_methodology_matches')
    .update({
      status: 'rejected',
      coach_confirmed: false,
      coach_notes: feedback || null,
      confirmed_at: now,
      updated_at: now,
    })
    .eq('coach_id', coachId)
    .eq('methodology_id', detectedMethodologyId)

  // Confirm the correct one (or create if not detected)
  await (supabase as any)
    .from('coach_methodology_matches')
    .upsert({
      coach_id: coachId,
      methodology_id: correctMethodologyId,
      confidence: 100, // manual confirmation = 100%
      status: 'confirmed',
      coach_confirmed: true,
      coach_notes: feedback || `Manually selected (was detected as ${detectedMethodologyId})`,
      confirmed_at: now,
      programs_analyzed: 0,
      last_analysis_at: now,
      updated_at: now,
    }, { onConflict: 'coach_id,methodology_id' })

  // Update coach_philosophy
  await (supabase as any)
    .from('coach_philosophy')
    .upsert({
      coach_id: coachId,
      primary_methodology_id: correctMethodologyId,
      methodology_confirmed: true,
      updated_at: now,
    }, { onConflict: 'coach_id' })

  // Log both events
  await logLearningEvent(coachId, detectedMethodologyId, 'corrected', feedback, correctMethodologyId)
}

// ============================================
// Data Loading
// ============================================

async function loadCoachPrograms(coachId: string): Promise<ProgramForExtraction[]> {
  // Load from plans + training_blocks + block_weeks + plan_sessions + workouts + exercises
  const { data: plans, error: plansError } = await (supabase as any)
    .from('plans')
    .select(`
      id, name,
      training_blocks (
        name, block_type, order_index,
        block_weeks (
          week_number, is_deload,
          plan_sessions (
            day_of_week, order_index,
            workout:workouts (
              id, name, session_type, session_focus, target_rpe, estimated_duration_min,
              exercises (
                name, sets, reps, weight_kg, rpe, intensity_percent,
                duration_seconds, distance_meters, rest_seconds,
                category, movement_pattern, superset_group
              )
            )
          )
        )
      )
    `)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: true })

  if (plansError) throw new Error(plansError.message)

  // Also load standalone programs (legacy)
  const { data: programs, error: programsError } = await (supabase as any)
    .from('programs')
    .select(`
      id, name,
      program_weeks (
        week_number, name,
        workouts (
          id, name, day_of_week, session_type, session_focus, target_rpe, estimated_duration_min,
          exercises (
            name, sets, reps, weight_kg, rpe, intensity_percent,
            duration_seconds, distance_meters, rest_seconds,
            category, movement_pattern, superset_group
          )
        )
      )
    `)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: true })

  if (programsError) throw new Error(programsError.message)

  const result: ProgramForExtraction[] = []

  // Convert plans to extraction format
  for (const plan of (plans || [])) {
    const blocks = (Array.isArray(plan.training_blocks) ? plan.training_blocks : [plan.training_blocks].filter(Boolean))
    result.push({
      name: plan.name,
      blocks: blocks.map((block: any) => ({
        name: block.name,
        block_type: block.block_type,
        weeks: (Array.isArray(block.block_weeks) ? block.block_weeks : [block.block_weeks].filter(Boolean))
          .map((week: any) => ({
            week_number: week.week_number,
            is_deload: week.is_deload,
            workouts: (Array.isArray(week.plan_sessions) ? week.plan_sessions : [week.plan_sessions].filter(Boolean))
              .map((session: any) => {
                const workout = Array.isArray(session.workout) ? session.workout[0] : session.workout
                if (!workout) return null
                return {
                  id: workout.id,
                  name: workout.name,
                  day_of_week: session.day_of_week,
                  week_number: week.week_number,
                  session_type: workout.session_type,
                  session_focus: workout.session_focus,
                  target_rpe: workout.target_rpe,
                  estimated_duration_min: workout.estimated_duration_min,
                  exercises: (Array.isArray(workout.exercises) ? workout.exercises : [workout.exercises].filter(Boolean))
                    .map((ex: any) => ({
                      name: ex.name,
                      sets: ex.sets,
                      reps: ex.reps,
                      weight_kg: ex.weight_kg,
                      rpe: ex.rpe,
                      intensity_percent: ex.intensity_percent,
                      duration_seconds: ex.duration_seconds,
                      distance_meters: ex.distance_meters,
                      rest_seconds: ex.rest_seconds,
                      category: ex.category,
                      movement_pattern: ex.movement_pattern,
                      superset_group: ex.superset_group,
                    })),
                }
              })
              .filter(Boolean),
          })),
      })),
    })
  }

  // Convert legacy programs to extraction format
  for (const program of (programs || [])) {
    const weeks = Array.isArray(program.program_weeks) ? program.program_weeks : [program.program_weeks].filter(Boolean)
    result.push({
      name: program.name,
      blocks: [{
        name: 'Main',
        block_type: 'general',
        weeks: weeks.map((week: any) => ({
          week_number: week.week_number,
          workouts: (Array.isArray(week.workouts) ? week.workouts : [week.workouts].filter(Boolean))
            .map((w: any) => ({
              id: w.id,
              name: w.name,
              day_of_week: w.day_of_week,
              week_number: week.week_number,
              session_type: w.session_type,
              session_focus: w.session_focus,
              target_rpe: w.target_rpe,
              estimated_duration_min: w.estimated_duration_min,
              exercises: (Array.isArray(w.exercises) ? w.exercises : [w.exercises].filter(Boolean))
                .map((ex: any) => ({
                  name: ex.name,
                  sets: ex.sets,
                  reps: ex.reps,
                  weight_kg: ex.weight_kg,
                  rpe: ex.rpe,
                  intensity_percent: ex.intensity_percent,
                  duration_seconds: ex.duration_seconds,
                  distance_meters: ex.distance_meters,
                  rest_seconds: ex.rest_seconds,
                  category: ex.category,
                  movement_pattern: ex.movement_pattern,
                  superset_group: ex.superset_group,
                })),
            })),
        })),
      }],
    })
  }

  return result
}

// ============================================
// Storage Helpers
// ============================================

async function upsertExtractedMetrics(
  coachId: string,
  metrics: ExtractedMetrics
): Promise<void> {
  const now = new Date().toISOString()

  const { error } = await (supabase as any)
    .from('coach_extracted_metrics')
    .upsert({
      coach_id: coachId,
      intensity_distribution: metrics.intensity_distribution,
      session_type_mix: metrics.session_type_mix,
      volume_intensity_correlation: metrics.volume_intensity_correlation,
      deload_frequency_weeks: metrics.deload_frequency_weeks,
      deload_volume_reduction: metrics.deload_volume_reduction,
      sessions_per_week_avg: metrics.sessions_per_week_avg,
      high_intensity_gap_hours: metrics.high_intensity_gap_hours,
      progression_pattern: metrics.progression_pattern,
      volume_progression_slope: metrics.volume_progression_slope,
      top_exercises: metrics.top_exercises,
      movement_pattern_distribution: metrics.movement_pattern_distribution,
      exercise_rotation_frequency: metrics.exercise_rotation_frequency,
      avg_block_duration_weeks: metrics.avg_block_duration_weeks,
      block_type_distribution: metrics.block_type_distribution,
      programs_analyzed: metrics.programs_analyzed,
      workouts_analyzed: metrics.workouts_analyzed,
      exercises_analyzed: metrics.exercises_analyzed,
      total_weeks_analyzed: metrics.total_weeks_analyzed,
      last_extraction_at: now,
      updated_at: now,
    }, { onConflict: 'coach_id' })

  if (error) console.error('Error upserting extracted metrics:', error)
}

async function upsertMethodologyMatches(
  coachId: string,
  output: MatchingOutput,
  metrics: ExtractedMetrics
): Promise<void> {
  const now = new Date().toISOString()

  // Only store matches with confidence > 20%
  const significantMatches = output.matches.filter(m => m.confidence > 20)

  for (const match of significantMatches) {
    // Don't overwrite confirmed matches
    const { data: existing } = await (supabase as any)
      .from('coach_methodology_matches')
      .select('status, coach_confirmed')
      .eq('coach_id', coachId)
      .eq('methodology_id', match.methodology_id)
      .single()

    if (existing?.coach_confirmed === true) {
      // Coach already confirmed — just update the scores, don't change status
      await (supabase as any)
        .from('coach_methodology_matches')
        .update({
          confidence: match.confidence,
          extracted_metrics: metrics,
          marker_scores: match.marker_scores,
          programs_analyzed: metrics.programs_analyzed,
          last_analysis_at: now,
          updated_at: now,
        })
        .eq('coach_id', coachId)
        .eq('methodology_id', match.methodology_id)
    } else {
      await (supabase as any)
        .from('coach_methodology_matches')
        .upsert({
          coach_id: coachId,
          methodology_id: match.methodology_id,
          confidence: match.confidence,
          status: 'detected',
          extracted_metrics: metrics,
          marker_scores: match.marker_scores,
          programs_analyzed: metrics.programs_analyzed,
          last_analysis_at: now,
          updated_at: now,
        }, { onConflict: 'coach_id,methodology_id' })
    }
  }
}

async function updateCoachPhilosophyMethodology(
  coachId: string,
  output: MatchingOutput
): Promise<void> {
  const now = new Date().toISOString()

  if (!output.top_match) return

  const secondaryMatches = output.matches
    .filter(m => m.methodology_id !== output.top_match!.methodology_id && m.confidence > 30)
    .map(m => ({ id: m.methodology_id, confidence: m.confidence }))

  // Upsert to handle coaches without an existing coach_philosophy row
  await (supabase as any)
    .from('coach_philosophy')
    .upsert({
      coach_id: coachId,
      primary_methodology_id: output.top_match.methodology_id,
      methodology_confidence: output.top_match.confidence,
      secondary_methodologies: secondaryMatches,
      updated_at: now,
    }, { onConflict: 'coach_id' })
}

async function logLearningEvent(
  coachId: string,
  methodologyId: string,
  action: string,
  feedback?: string | null,
  alternativeId?: string
): Promise<void> {
  const metrics = await getCoachExtractedMetrics(coachId)

  await (supabase as any)
    .from('methodology_learning_log')
    .insert({
      coach_id: coachId,
      methodology_id: methodologyId,
      action,
      coach_feedback: feedback || null,
      alternative_methodology_id: alternativeId || null,
      extracted_metrics_snapshot: metrics,
    })
}
