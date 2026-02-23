/**
 * Progression Engine — Sprint 13.5a Foundation
 *
 * Pure TypeScript service. No AI cost. Calculates week N prescription from
 * canonical Week 1 workout + block progression parameters.
 *
 * Used by:
 * - Planner "Apply Progression" (13.5b)
 * - Smart Import mesocycle detection (13.5a)
 * - AI Suggestions layer (13.5c)
 */

import type { ProgressionPattern, LoadMetric } from '@/types/database'
import type { ExerciseWeekEntry, ExerciseSlot } from '@/types/import'

// ── Types ────────────────────────────────────────────────────────────────

export interface BlockProgressionConfig {
  duration_weeks: number
  load_metric: LoadMetric
  progression_pattern: ProgressionPattern
  intensity_start: number | null   // % 1RM or equivalent
  intensity_end: number | null
  volume_start: number | null      // total tonnage, metres, etc.
  volume_end: number | null
  deload_week: number | null       // which week is deload (1-indexed)
  deload_volume_factor: number     // multiplier (0.6 = 40% cut)
}

export interface CanonicalExercise {
  name: string
  sets: string          // "4" or "4,4,3,2"
  reps: string          // "6" or "6-8"
  intensity_percent?: number
  rpe?: number
  rest_seconds?: number
  weight?: string
  notes?: string
}

export interface WeekPrescription {
  week: number
  sets: string
  reps: string
  intensity_percent?: number
  rpe?: number
  rest_seconds?: number
  weight?: string
  notes?: string
  variation_name?: string | null
}

// ── Load Factor Calculation ─────────────────────────────────────────────

/**
 * Get the load factor for a given week within a progression pattern.
 * Returns a 0-1 multiplier where 0 = start, 1 = end.
 * Deload weeks return a special reduced factor.
 */
export function getWeekLoadFactor(
  weekNumber: number,
  config: BlockProgressionConfig,
): number {
  const { duration_weeks, progression_pattern, deload_week, deload_volume_factor } = config

  // Deload week override
  if (deload_week && weekNumber === deload_week) {
    return deload_volume_factor
  }

  // Calculate effective weeks (excluding deload for progression curve)
  const loadingWeeks = deload_week ? duration_weeks - 1 : duration_weeks
  const effectiveWeek = deload_week && weekNumber > deload_week
    ? weekNumber - 1  // shift after deload
    : weekNumber

  if (loadingWeeks <= 1) return 0

  switch (progression_pattern) {
    case 'linear':
      return (effectiveWeek - 1) / (loadingWeeks - 1)

    case 'wave_3_1':
      return waveLoadFactor(effectiveWeek, 3, loadingWeeks)

    case 'wave_2_1':
      return waveLoadFactor(effectiveWeek, 2, loadingWeeks)

    case 'step':
      // Step loading: hold for 2 weeks, then jump
      return Math.floor((effectiveWeek - 1) / 2) / Math.floor((loadingWeeks - 1) / 2 || 1)

    case 'descending_sets':
      // For descending sets, the factor controls intensity (reps decrease within session)
      // Volume decreases linearly while intensity increases
      return (effectiveWeek - 1) / (loadingWeeks - 1)

    case 'conjugate':
      // Westside: alternating ME (high intensity, low volume) and DE (moderate intensity, high speed)
      // Odd weeks = ME, even = DE
      return effectiveWeek % 2 === 1
        ? (effectiveWeek - 1) / (loadingWeeks - 1)             // ME: progressive
        : ((effectiveWeek - 1) / (loadingWeeks - 1)) * 0.65    // DE: ~65% of ME

    case 'prilepin':
      // Prilepin's chart maps intensity zones to optimal rep ranges
      // Linear intensity ramp, reps auto-calculated
      return (effectiveWeek - 1) / (loadingWeeks - 1)

    case 'custom':
      // Custom: no calculation — expect per-week values in progression_params
      return (effectiveWeek - 1) / (loadingWeeks - 1)

    default:
      return (effectiveWeek - 1) / (loadingWeeks - 1)
  }
}

/**
 * Wave loading: N weeks up, 1 week slight dip, repeat.
 * Returns 0-1 factor within the overall block progression.
 */
function waveLoadFactor(week: number, loadPhaseLength: number, totalWeeks: number): number {
  const cycleLength = loadPhaseLength + 1
  const cyclePosition = ((week - 1) % cycleLength) + 1
  const cycleNumber = Math.floor((week - 1) / cycleLength)
  const totalCycles = Math.ceil(totalWeeks / cycleLength)

  // Within a cycle: 1..N = loading, N+1 = mini-deload
  if (cyclePosition <= loadPhaseLength) {
    // Loading phase: ramp within cycle
    const cycleBase = totalCycles > 1 ? cycleNumber / totalCycles : 0
    const cycleRamp = (cyclePosition - 1) / loadPhaseLength
    const withinCycleFactor = cycleBase + (cycleRamp / totalCycles)
    return Math.min(withinCycleFactor, 1)
  } else {
    // Mini-deload: drop back to start of this cycle's range
    const cycleBase = totalCycles > 1 ? cycleNumber / totalCycles : 0
    return cycleBase * 0.85 // 15% dip from cycle start
  }
}

// ── Prilepin's Chart ─────────────────────────────────────────────────────

interface PrilepinZone {
  intensityRange: [number, number]
  repsPerSet: [number, number]
  optimalTotal: number
  totalRange: [number, number]
}

const PRILEPIN_ZONES: PrilepinZone[] = [
  { intensityRange: [55, 65], repsPerSet: [3, 6], optimalTotal: 24, totalRange: [18, 30] },
  { intensityRange: [70, 80], repsPerSet: [3, 6], optimalTotal: 18, totalRange: [12, 24] },
  { intensityRange: [80, 90], repsPerSet: [2, 4], optimalTotal: 15, totalRange: [10, 20] },
  { intensityRange: [90, 100], repsPerSet: [1, 2], optimalTotal: 7, totalRange: [4, 10] },
]

function getPrilepinReps(intensity: number): { reps: string; sets: number } {
  const zone = PRILEPIN_ZONES.find(z => intensity >= z.intensityRange[0] && intensity <= z.intensityRange[1])
    ?? PRILEPIN_ZONES[PRILEPIN_ZONES.length - 1]

  const avgReps = Math.round((zone.repsPerSet[0] + zone.repsPerSet[1]) / 2)
  const sets = Math.round(zone.optimalTotal / avgReps)
  return { reps: String(avgReps), sets }
}

// ── Extrapolate Session ─────────────────────────────────────────────────

/**
 * Generate the prescription for a single exercise at a given week,
 * based on its canonical Week 1 values and block progression config.
 */
export function extrapolateExercise(
  canonical: CanonicalExercise,
  weekNumber: number,
  config: BlockProgressionConfig,
): WeekPrescription {
  // Week 1 = canonical (no changes)
  if (weekNumber === 1) {
    return {
      week: 1,
      sets: canonical.sets,
      reps: canonical.reps,
      intensity_percent: canonical.intensity_percent,
      rpe: canonical.rpe,
      rest_seconds: canonical.rest_seconds,
      weight: canonical.weight,
      notes: canonical.notes,
    }
  }

  const factor = getWeekLoadFactor(weekNumber, config)
  const isDeload = config.deload_week === weekNumber

  // Parse canonical values
  const canonicalIntensity = canonical.intensity_percent ?? config.intensity_start ?? null
  const canonicalRpe = canonical.rpe
  const canonicalSets = parseSetsString(canonical.sets)
  const canonicalReps = parseRepsString(canonical.reps)

  // Calculate target intensity for this week
  let intensity: number | undefined
  if (config.intensity_start != null && config.intensity_end != null) {
    if (isDeload) {
      intensity = config.intensity_start * config.deload_volume_factor
    } else {
      intensity = config.intensity_start + (config.intensity_end - config.intensity_start) * factor
    }
    intensity = Math.round(intensity * 10) / 10
  } else if (canonicalIntensity != null) {
    // Scale from canonical
    const endMultiplier = config.progression_pattern === 'linear' ? 1.15 : 1.1
    intensity = isDeload
      ? canonicalIntensity * config.deload_volume_factor
      : canonicalIntensity * (1 + (endMultiplier - 1) * factor)
    intensity = Math.round(intensity * 10) / 10
  }

  // Calculate RPE progression
  let rpe: number | undefined
  if (canonicalRpe != null) {
    if (isDeload) {
      rpe = Math.max(5, canonicalRpe - 2)
    } else {
      // RPE creeps up slightly across block
      rpe = Math.min(10, canonicalRpe + factor * 1.5)
      rpe = Math.round(rpe * 10) / 10
    }
  }

  // Prilepin pattern: override sets/reps based on intensity zone
  if (config.progression_pattern === 'prilepin' && intensity != null) {
    const prilepin = getPrilepinReps(intensity)
    return {
      week: weekNumber,
      sets: String(prilepin.sets),
      reps: prilepin.reps,
      intensity_percent: intensity,
      rpe,
      rest_seconds: canonical.rest_seconds,
      notes: isDeload ? 'Deload' : undefined,
    }
  }

  // Calculate sets and reps
  let sets = canonical.sets
  let reps = canonical.reps

  if (config.progression_pattern === 'descending_sets') {
    // Descending: reduce reps within sets as weeks progress
    // e.g. Week 1: 4x6, Week 2: 4x5, Week 3: 4x4, Week 4: 4x3
    if (canonicalReps != null && !isDeload) {
      const repDrop = Math.round(factor * (canonicalReps * 0.5))
      const newReps = Math.max(1, canonicalReps - repDrop)
      reps = String(newReps)
    }
    if (isDeload) {
      // Deload: reduce sets
      const deloadSets = Math.max(2, Math.round(canonicalSets * config.deload_volume_factor))
      sets = String(deloadSets)
    }
  } else {
    // Standard progression: slight volume manipulation
    if (isDeload) {
      const deloadSets = Math.max(2, Math.round(canonicalSets * config.deload_volume_factor))
      sets = String(deloadSets)
      // Keep reps same or slightly lower
      if (canonicalReps != null) {
        reps = String(Math.max(1, canonicalReps - 1))
      }
    }
    // Non-deload weeks: sets stay constant, intensity drives progression
  }

  return {
    week: weekNumber,
    sets,
    reps,
    intensity_percent: intensity,
    rpe,
    rest_seconds: canonical.rest_seconds,
    weight: canonical.weight,
    notes: isDeload ? 'Deload' : undefined,
  }
}

/**
 * Generate full week-by-week prescriptions for all exercises in a canonical session.
 */
export function extrapolateSession(
  exercises: CanonicalExercise[],
  config: BlockProgressionConfig,
): ExerciseSlot[] {
  return exercises.map((ex, idx) => {
    const weeks: ExerciseWeekEntry[] = []

    for (let w = 1; w <= config.duration_weeks; w++) {
      const prescription = extrapolateExercise(ex, w, config)
      weeks.push({
        week: w,
        sets: prescription.sets,
        reps: prescription.reps,
        intensity_percent: prescription.intensity_percent,
        rpe: prescription.rpe,
        rest_seconds: prescription.rest_seconds,
        weight: prescription.weight,
        notes: prescription.notes,
        variation_name: null,
      })
    }

    return {
      order_index: idx,
      canonical_name: ex.name,
      weeks,
      has_variation: false,
    }
  })
}

// ── Detect Progression Pattern ──────────────────────────────────────────

/**
 * Analyze exercise week data to detect which progression pattern is being used.
 * Used by Smart Import to classify mesocycle programs.
 */
export function detectProgressionPattern(
  exerciseSlots: ExerciseSlot[],
): { pattern: ProgressionPattern; confidence: number; load_metric: LoadMetric } {
  // Look at exercises that have actual numeric progressions
  const slotsWithIntensity = exerciseSlots.filter(s =>
    s.weeks.some(w => w.intensity_percent != null)
  )
  const slotsWithRpe = exerciseSlots.filter(s =>
    s.weeks.some(w => w.rpe != null)
  )

  // Determine load metric
  let load_metric: LoadMetric = 'reps_only'
  if (slotsWithIntensity.length > slotsWithRpe.length && slotsWithIntensity.length > 0) {
    load_metric = 'relative_intensity'
  } else if (slotsWithRpe.length > 0) {
    load_metric = 'rpe'
  }

  // Analyze rep patterns across weeks
  const repPatterns: Array<{ direction: 'up' | 'down' | 'wave' | 'flat'; magnitude: number }> = []

  for (const slot of exerciseSlots) {
    if (slot.is_section_header) continue
    const repValues = slot.weeks
      .map(w => parseRepsString(w.reps))
      .filter((v): v is number => v != null)

    if (repValues.length < 2) continue

    const isDescending = repValues.every((v, i) => i === 0 || v <= repValues[i - 1])
    const isAscending = repValues.every((v, i) => i === 0 || v >= repValues[i - 1])
    const isFlat = repValues.every(v => v === repValues[0])

    if (isFlat) {
      repPatterns.push({ direction: 'flat', magnitude: 0 })
    } else if (isDescending) {
      repPatterns.push({ direction: 'down', magnitude: repValues[0] - repValues[repValues.length - 1] })
    } else if (isAscending) {
      repPatterns.push({ direction: 'up', magnitude: repValues[repValues.length - 1] - repValues[0] })
    } else {
      repPatterns.push({ direction: 'wave', magnitude: Math.max(...repValues) - Math.min(...repValues) })
    }
  }

  // Check for descending sets within sessions
  const hasDescendingSets = exerciseSlots.some(s =>
    s.weeks.some(w => w.sets.includes(','))
  )

  if (hasDescendingSets) {
    return { pattern: 'descending_sets', confidence: 0.8, load_metric }
  }

  // Classify based on rep direction patterns
  const descendingCount = repPatterns.filter(p => p.direction === 'down').length
  const waveCount = repPatterns.filter(p => p.direction === 'wave').length
  const flatCount = repPatterns.filter(p => p.direction === 'flat').length
  const total = repPatterns.length

  if (total === 0) {
    return { pattern: 'custom', confidence: 0.3, load_metric }
  }

  if (descendingCount / total > 0.6) {
    // Reps decreasing → intensity likely increasing → linear or step
    const intensitySlots = slotsWithIntensity.length > 0 ? slotsWithIntensity : exerciseSlots
    const hasStepPattern = intensitySlots.some(s => {
      const vals = s.weeks.map(w => w.intensity_percent).filter((v): v is number => v != null)
      // Step = holds steady for 2+ weeks then jumps
      return vals.length >= 4 && vals.some((v, i) => i > 0 && v === vals[i - 1])
    })

    return hasStepPattern
      ? { pattern: 'step', confidence: 0.7, load_metric }
      : { pattern: 'linear', confidence: 0.75, load_metric }
  }

  if (waveCount / total > 0.4) {
    // Check 3+1 vs 2+1
    const weekCounts = exerciseSlots[0]?.weeks.length ?? 0
    if (weekCounts >= 4 && weekCounts % 4 === 0) {
      return { pattern: 'wave_3_1', confidence: 0.65, load_metric }
    }
    if (weekCounts >= 3 && weekCounts % 3 === 0) {
      return { pattern: 'wave_2_1', confidence: 0.6, load_metric }
    }
    return { pattern: 'wave_3_1', confidence: 0.5, load_metric }
  }

  if (flatCount / total > 0.7) {
    return { pattern: 'custom', confidence: 0.5, load_metric }
  }

  return { pattern: 'linear', confidence: 0.5, load_metric }
}

/**
 * Detect if a deload week exists in the exercise data.
 * A deload week shows >=30% volume reduction from the previous week.
 */
export function detectDeloadWeek(exerciseSlots: ExerciseSlot[]): number | null {
  if (exerciseSlots.length === 0) return null

  const weekCount = exerciseSlots[0].weeks.length
  if (weekCount < 3) return null

  for (let w = 2; w <= weekCount; w++) {
    let totalPrevSets = 0
    let totalCurrSets = 0

    for (const slot of exerciseSlots) {
      if (slot.is_section_header) continue
      const prevWeek = slot.weeks.find(wk => wk.week === w - 1)
      const currWeek = slot.weeks.find(wk => wk.week === w)
      if (!prevWeek || !currWeek) continue

      totalPrevSets += parseSetsTotal(prevWeek.sets) * (parseRepsString(prevWeek.reps) ?? 1)
      totalCurrSets += parseSetsTotal(currWeek.sets) * (parseRepsString(currWeek.reps) ?? 1)
    }

    if (totalPrevSets > 0 && totalCurrSets > 0) {
      const ratio = totalCurrSets / totalPrevSets
      if (ratio <= 0.7) {
        return w
      }
    }
  }

  return null
}

// ── Formatting Helpers ──────────────────────────────────────────────────

/**
 * Format a week prescription as a human-readable string.
 * e.g. "4x6 @ 70%" or "3x8-10 RPE 8"
 */
export function formatPrescription(entry: ExerciseWeekEntry): string {
  const parts: string[] = []

  // Sets x Reps
  if (entry.sets && entry.reps) {
    parts.push(`${entry.sets}x${entry.reps}`)
  } else if (entry.sets) {
    parts.push(`${entry.sets} sets`)
  } else if (entry.reps) {
    parts.push(`${entry.reps} reps`)
  }

  // Intensity
  if (entry.intensity_percent != null) {
    parts.push(`@ ${entry.intensity_percent}%`)
  } else if (entry.rpe != null) {
    parts.push(`RPE ${entry.rpe}`)
  } else if (entry.weight) {
    parts.push(`@ ${entry.weight}`)
  }

  return parts.join(' ') || '—'
}

// ── Internal Helpers ────────────────────────────────────────────────────

function parseSetsString(sets: string): number {
  if (!sets) return 0
  // Handle comma-separated descending: "4,4,3,2" → total = 4 sets
  if (sets.includes(',')) {
    return sets.split(',').length
  }
  // Handle ranges: "3-4" → take lower bound
  if (sets.includes('-')) {
    return parseInt(sets.split('-')[0]) || 0
  }
  return parseInt(sets) || 0
}

function parseSetsTotal(sets: string): number {
  if (!sets) return 0
  // For descending: "4,4,3,2" → count of sets
  if (sets.includes(',')) {
    return sets.split(',').length
  }
  return parseInt(sets) || 0
}

function parseRepsString(reps: string): number | null {
  if (!reps) return null
  // Handle ranges: "6-8" → take lower bound
  if (reps.includes('-')) {
    return parseInt(reps.split('-')[0]) || null
  }
  // Handle "max"
  if (reps.toLowerCase() === 'max') return null
  // Handle complex: "2+1" → take first
  if (reps.includes('+')) {
    return parseInt(reps.split('+')[0]) || null
  }
  return parseInt(reps) || null
}
