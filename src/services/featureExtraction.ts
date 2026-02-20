import type {
  ExtractedMetrics,
  ProgramForExtraction,
  WorkoutForExtraction,
  ExerciseForExtraction,
  IntensityDistribution,
  SessionTypeMix,
} from '@/types/methodology'

// ============================================
// Feature Extraction Engine
// Extracts quantifiable metrics from structured workout data
// Pure computation — no API calls, no database queries
// ============================================

// Exercise name classification keywords
const SPEED_KEYWORDS = ['sprint', 'fly', 'dash', 'acceleration', 'max velocity', 'speed', 'top speed', 'relay', 'block start', 'drive phase', 'high start', 'power pole', 'competition']
const TEMPO_KEYWORDS = ['tempo', 'easy run', 'recovery run', 'jog', 'aerobic']
const STRENGTH_KEYWORDS = ['squat', 'deadlift', 'press', 'bench', 'row', 'pull-up', 'pullup', 'chin-up', 'clean', 'snatch', 'jerk']
const HYPERTROPHY_KEYWORDS = ['curl', 'extension', 'raise', 'fly', 'isolation', 'pump', 'bodybuilding']
const POWER_KEYWORDS = ['jump', 'plyometric', 'plyo', 'explosive', 'power clean', 'box jump', 'med ball', 'medicine ball', 'throw']
const ENDURANCE_KEYWORDS = ['long run', 'distance', 'endurance', 'steady state', 'lsd', 'continuous']
const THRESHOLD_KEYWORDS = ['threshold', 'tempo run', 'lactate', 'cruise interval', 'ftp']
const CONDITIONING_KEYWORDS = ['circuit', 'hiit', 'tabata', 'metcon', 'conditioning', 'wod', 'emom', 'amrap']
const MOBILITY_KEYWORDS = ['mobility', 'stretch', 'yoga', 'foam roll', 'warmup', 'cool down', 'cooldown', 'flexibility']
const RECOVERY_KEYWORDS = ['recovery', 'active recovery', 'deload', 'easy', 'regeneration', 'flush']

// Movement pattern classification
const SQUAT_PATTERNS = ['squat', 'lunge', 'leg press', 'step up', 'split squat', 'goblet']
const HINGE_PATTERNS = ['deadlift', 'rdl', 'romanian', 'hip thrust', 'good morning', 'swing', 'hinge', 'glute bridge']
const PUSH_PATTERNS = ['press', 'bench', 'push-up', 'pushup', 'overhead press', 'ohp', 'dip', 'incline', 'decline']
const PULL_PATTERNS = ['row', 'pull-up', 'pullup', 'chin-up', 'chinup', 'lat pulldown', 'pull down', 'face pull']
const CARRY_PATTERNS = ['carry', 'farmer', 'suitcase', 'waiter walk']

/**
 * Main extraction function — takes structured program data and returns metrics
 */
export function extractMetrics(programs: ProgramForExtraction[]): ExtractedMetrics {
  const allWorkouts: WorkoutForExtraction[] = []
  const allExercises: ExerciseForExtraction[] = []
  let totalWeeks = 0

  // Flatten all programs into workouts and exercises
  for (const program of programs) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        totalWeeks++
        for (const workout of week.workouts) {
          allWorkouts.push({
            ...workout,
            week_number: week.week_number,
            block_name: block.name,
            block_type: block.block_type,
          })
          allExercises.push(...workout.exercises)
        }
      }
    }
  }

  if (allWorkouts.length === 0) {
    return emptyMetrics(programs.length)
  }

  return {
    intensity_distribution: computeIntensityDistribution(allWorkouts, allExercises),
    session_type_mix: computeSessionTypeMix(allWorkouts),
    volume_intensity_correlation: computeVolumeIntensityCorrelation(programs),
    deload_frequency_weeks: detectDeloadFrequency(programs),
    deload_volume_reduction: detectDeloadVolumeReduction(programs),
    sessions_per_week_avg: computeSessionsPerWeek(allWorkouts, totalWeeks),
    high_intensity_gap_hours: computeHighIntensityGap(allWorkouts),
    progression_pattern: detectProgressionPattern(programs),
    volume_progression_slope: computeVolumeSlope(programs),
    top_exercises: computeTopExercises(allExercises, allWorkouts.length),
    movement_pattern_distribution: computeMovementPatterns(allExercises),
    exercise_rotation_frequency: computeExerciseRotation(programs),
    avg_block_duration_weeks: computeAvgBlockDuration(programs),
    block_type_distribution: computeBlockTypeDistribution(programs),
    programs_analyzed: programs.length,
    workouts_analyzed: allWorkouts.length,
    exercises_analyzed: allExercises.length,
    total_weeks_analyzed: totalWeeks,
  }
}

// ============================================
// Intensity Distribution
// ============================================

function computeIntensityDistribution(
  workouts: WorkoutForExtraction[],
  exercises: ExerciseForExtraction[]
): IntensityDistribution {
  let high = 0
  let medium = 0
  let low = 0
  let classified = 0

  for (const workout of workouts) {
    const intensity = estimateWorkoutIntensity(workout)
    if (intensity === null) continue
    classified++

    if (intensity >= 0.90) high++
    else if (intensity >= 0.75) medium++
    else low++
  }

  if (classified === 0) {
    // Fallback: classify by exercise-level data
    return classifyByExerciseIntensity(exercises)
  }

  return {
    high: high / classified,
    medium: medium / classified,
    low: low / classified,
  }
}

function estimateWorkoutIntensity(workout: WorkoutForExtraction): number | null {
  // Priority 1: Explicit RPE on workout
  if (workout.target_rpe != null) {
    return workout.target_rpe / 10
  }

  // Priority 2: Average exercise intensity
  const intensities: number[] = []
  for (const ex of workout.exercises) {
    if (ex.rpe != null) intensities.push(ex.rpe / 10)
    else if (ex.intensity_percent != null) intensities.push(ex.intensity_percent / 100)
    else if (ex.weight_pct != null) intensities.push(ex.weight_pct / 100)
  }

  if (intensities.length > 0) {
    return intensities.reduce((a, b) => a + b, 0) / intensities.length
  }

  // Priority 3: Classify by workout name/type
  return classifyWorkoutByName(workout)
}

function classifyWorkoutByName(workout: WorkoutForExtraction): number | null {
  const name = (workout.name + ' ' + (workout.session_type || '')).toLowerCase()

  if (matchesAny(name, SPEED_KEYWORDS)) return 0.95
  if (matchesAny(name, POWER_KEYWORDS)) return 0.90
  if (matchesAny(name, THRESHOLD_KEYWORDS)) return 0.85
  if (matchesAny(name, CONDITIONING_KEYWORDS)) return 0.82
  if (matchesAny(name, STRENGTH_KEYWORDS)) return 0.80
  if (matchesAny(name, HYPERTROPHY_KEYWORDS)) return 0.72
  if (matchesAny(name, TEMPO_KEYWORDS)) return 0.65
  if (matchesAny(name, ENDURANCE_KEYWORDS)) return 0.60
  if (matchesAny(name, RECOVERY_KEYWORDS)) return 0.50
  if (matchesAny(name, MOBILITY_KEYWORDS)) return 0.40

  return null
}

function classifyByExerciseIntensity(exercises: ExerciseForExtraction[]): IntensityDistribution {
  let high = 0, medium = 0, low = 0, total = 0

  for (const ex of exercises) {
    let intensity: number | null = null
    if (ex.rpe != null) intensity = ex.rpe / 10
    else if (ex.intensity_percent != null) intensity = ex.intensity_percent / 100
    else if (ex.weight_pct != null) intensity = ex.weight_pct / 100

    if (intensity === null) continue
    total++

    if (intensity >= 0.90) high++
    else if (intensity >= 0.75) medium++
    else low++
  }

  if (total === 0) return { high: 0.33, medium: 0.34, low: 0.33 } // unknown

  return {
    high: high / total,
    medium: medium / total,
    low: low / total,
  }
}

// ============================================
// Session Type Mix
// ============================================

function computeSessionTypeMix(workouts: WorkoutForExtraction[]): SessionTypeMix {
  const typeCounts: Record<string, number> = {}
  // Use unique block+week combos to avoid counting week_number 1 from different programs as same week
  const effectiveWeeks = new Set(workouts.map(w => `${w.block_name || ''}_${w.week_number}`)).size || 1

  for (const workout of workouts) {
    const type = classifySessionType(workout)
    typeCounts[type] = (typeCounts[type] || 0) + 1
  }

  // Convert to per-week frequency
  const mix: SessionTypeMix = {}
  for (const [type, count] of Object.entries(typeCounts)) {
    (mix as any)[type] = Math.round((count / effectiveWeeks) * 100) / 100
  }

  return mix
}

function classifySessionType(workout: WorkoutForExtraction): string {
  // Priority 1: Explicit session_type
  if (workout.session_type) {
    return normalizeSessionType(workout.session_type)
  }

  // Priority 2: Classify by name and exercises
  const name = workout.name.toLowerCase()
  const exerciseNames = workout.exercises.map(e => e.name.toLowerCase()).join(' ')
  const combined = name + ' ' + exerciseNames

  if (matchesAny(combined, SPEED_KEYWORDS)) return 'speed'
  if (matchesAny(combined, TEMPO_KEYWORDS)) return 'tempo'
  if (matchesAny(combined, THRESHOLD_KEYWORDS)) return 'threshold'
  if (matchesAny(combined, POWER_KEYWORDS)) return 'power'
  if (matchesAny(combined, CONDITIONING_KEYWORDS)) return 'conditioning'
  if (matchesAny(combined, ENDURANCE_KEYWORDS)) return 'endurance'
  if (matchesAny(combined, RECOVERY_KEYWORDS)) return 'recovery'
  if (matchesAny(combined, MOBILITY_KEYWORDS)) return 'mobility'

  // Priority 3: Classify by exercise patterns
  const hasHeavyCompounds = workout.exercises.some(e => {
    const n = e.name.toLowerCase()
    return matchesAny(n, STRENGTH_KEYWORDS) && (parseInt(String(e.sets)) || 0) >= 3
  })
  const avgReps = computeAvgReps(workout.exercises)

  if (hasHeavyCompounds && avgReps <= 6) return 'strength'
  if (hasHeavyCompounds && avgReps <= 12) return 'hypertrophy'
  if (avgReps > 12) return 'endurance'

  return 'strength' // default
}

function normalizeSessionType(type: string): string {
  const t = type.toLowerCase().trim()
  if (t.includes('speed') || t.includes('sprint')) return 'speed'
  if (t.includes('tempo')) return 'tempo'
  if (t.includes('threshold') || t.includes('lactate')) return 'threshold'
  if (t.includes('power') || t.includes('explosive')) return 'power'
  if (t.includes('strength') || t.includes('max')) return 'strength'
  if (t.includes('hypertrophy') || t.includes('muscle') || t.includes('body')) return 'hypertrophy'
  if (t.includes('endurance') || t.includes('cardio') || t.includes('aerobic')) return 'endurance'
  if (t.includes('conditioning') || t.includes('circuit') || t.includes('hiit') || t.includes('metcon')) return 'conditioning'
  if (t.includes('recovery') || t.includes('easy')) return 'recovery'
  if (t.includes('mobility') || t.includes('flexibility')) return 'mobility'
  return t
}

// ============================================
// Volume-Intensity Correlation
// ============================================

function computeVolumeIntensityCorrelation(programs: ProgramForExtraction[]): number {
  const weeklyData: Array<{ volume: number; intensity: number }> = []

  for (const program of programs) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        let weekVolume = 0
        const weekIntensities: number[] = []

        for (const workout of week.workouts) {
          for (const ex of workout.exercises) {
            const sets = parseInt(String(ex.sets)) || 1
            const reps = parseReps(ex.reps)
            const weight = ex.weight_kg || 0
            weekVolume += sets * reps * weight

            if (ex.rpe != null) weekIntensities.push(ex.rpe / 10)
            else if (ex.intensity_percent != null) weekIntensities.push(ex.intensity_percent / 100)
          }
        }

        if (weekVolume > 0 && weekIntensities.length > 0) {
          weeklyData.push({
            volume: weekVolume,
            intensity: weekIntensities.reduce((a, b) => a + b, 0) / weekIntensities.length,
          })
        }
      }
    }
  }

  if (weeklyData.length < 3) return 0

  return pearsonCorrelation(
    weeklyData.map(d => d.volume),
    weeklyData.map(d => d.intensity)
  )
}

// ============================================
// Deload Detection
// ============================================

function detectDeloadFrequency(programs: ProgramForExtraction[]): number | null {
  const deloadPositions: number[] = []
  let weekIndex = 0

  for (const program of programs) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        weekIndex++
        if (isDeloadWeek(week, block)) {
          deloadPositions.push(weekIndex)
        }
      }
    }
  }

  if (deloadPositions.length < 2) return null

  // Calculate average gap between deloads
  const gaps: number[] = []
  for (let i = 1; i < deloadPositions.length; i++) {
    gaps.push(deloadPositions[i] - deloadPositions[i - 1])
  }

  return Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10
}

function detectDeloadVolumeReduction(programs: ProgramForExtraction[]): number | null {
  const normalVolumes: number[] = []
  const deloadVolumes: number[] = []

  for (const program of programs) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        const weekVolume = computeWeekVolume(week.workouts)
        if (weekVolume === 0) continue

        if (isDeloadWeek(week, block)) {
          deloadVolumes.push(weekVolume)
        } else {
          normalVolumes.push(weekVolume)
        }
      }
    }
  }

  if (normalVolumes.length === 0 || deloadVolumes.length === 0) return null

  const avgNormal = normalVolumes.reduce((a, b) => a + b, 0) / normalVolumes.length
  const avgDeload = deloadVolumes.reduce((a, b) => a + b, 0) / deloadVolumes.length

  if (avgNormal === 0) return null
  return Math.round(((avgNormal - avgDeload) / avgNormal) * 100)
}

function isDeloadWeek(
  week: { is_deload?: boolean; workouts: WorkoutForExtraction[] },
  block: { weeks: Array<{ workouts: WorkoutForExtraction[] }> }
): boolean {
  // Explicit flag
  if (week.is_deload) return true

  // Name-based detection
  const hasDeloadWorkout = week.workouts.some(w =>
    w.name.toLowerCase().includes('deload') ||
    w.name.toLowerCase().includes('recovery') ||
    w.name.toLowerCase().includes('unload')
  )
  if (hasDeloadWorkout) return true

  // Volume-based detection: if this week has significantly less volume than block average
  if (block.weeks.length >= 3) {
    const blockVolumes = block.weeks.map(w => computeWeekVolume(w.workouts))
    const avgBlockVolume = blockVolumes.reduce((a, b) => a + b, 0) / blockVolumes.length
    const thisVolume = computeWeekVolume(week.workouts)

    if (avgBlockVolume > 0 && thisVolume < avgBlockVolume * 0.65) {
      return true
    }
  }

  return false
}

// ============================================
// Sessions Per Week & Recovery
// ============================================

function computeSessionsPerWeek(workouts: WorkoutForExtraction[], totalWeeks: number): number {
  if (totalWeeks === 0) return 0

  // Count only weeks that actually have workouts (don't dilute with empty plan weeks)
  const weeksWithWorkouts = new Set(workouts.map(w => `${w.block_name || ''}_${w.week_number}`)).size
  const effectiveWeeks = Math.max(weeksWithWorkouts, 1)

  return Math.round((workouts.length / effectiveWeeks) * 10) / 10
}

function computeHighIntensityGap(workouts: WorkoutForExtraction[]): number | null {
  // Group workouts by week and day, find high-intensity ones
  const highIntensityDays: number[] = [] // absolute day numbers

  for (const workout of workouts) {
    const intensity = estimateWorkoutIntensity(workout)
    if (intensity !== null && intensity >= 0.85) {
      // Use week_number * 7 + day_of_week as absolute day
      const absDay = (workout.week_number - 1) * 7 + workout.day_of_week
      highIntensityDays.push(absDay)
    }
  }

  highIntensityDays.sort((a, b) => a - b)

  if (highIntensityDays.length < 2) return null

  // Compute average gap between high-intensity days
  const gaps: number[] = []
  for (let i = 1; i < highIntensityDays.length; i++) {
    gaps.push(highIntensityDays[i] - highIntensityDays[i - 1])
  }

  const avgGapDays = gaps.reduce((a, b) => a + b, 0) / gaps.length
  return Math.round(avgGapDays * 24) // convert to hours
}

// ============================================
// Progression Pattern Detection
// ============================================

function detectProgressionPattern(programs: ProgramForExtraction[]): string | null {
  const weeklyVolumes: number[] = []

  for (const program of programs) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        weeklyVolumes.push(computeWeekVolume(week.workouts))
      }
    }
  }

  if (weeklyVolumes.length < 4) return null

  // Check for wave pattern: up, up, up, down, up, up, up, down
  const diffs = weeklyVolumes.slice(1).map((v, i) => v - weeklyVolumes[i])
  const signChanges = diffs.slice(1).filter((d, i) => {
    return (d > 0 && diffs[i] < 0) || (d < 0 && diffs[i] > 0)
  }).length

  const signChangeRate = signChanges / (diffs.length - 1)

  // Wave: regular sign changes every 3-4 weeks
  if (signChangeRate >= 0.2 && signChangeRate <= 0.4) return 'wave'

  // Undulating: frequent sign changes (nearly every week)
  if (signChangeRate > 0.5) return 'undulating'

  // Linear: mostly positive or mostly negative
  const positiveRatio = diffs.filter(d => d > 0).length / diffs.length
  if (positiveRatio > 0.7) return 'linear'
  if (positiveRatio < 0.3) return 'linear' // decreasing linear (taper)

  // Step: flat periods with jumps
  return 'step'
}

function computeVolumeSlope(programs: ProgramForExtraction[]): number | null {
  const weeklyVolumes: number[] = []

  for (const program of programs) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        weeklyVolumes.push(computeWeekVolume(week.workouts))
      }
    }
  }

  if (weeklyVolumes.length < 3) return null

  // Simple linear regression slope
  const n = weeklyVolumes.length
  const xMean = (n - 1) / 2
  const yMean = weeklyVolumes.reduce((a, b) => a + b, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (weeklyVolumes[i] - yMean)
    den += (i - xMean) * (i - xMean)
  }

  if (den === 0) return 0

  // Normalize by average volume to get percentage change per week
  const slope = num / den
  if (yMean === 0) return 0
  return Math.round((slope / yMean) * 10000) / 10000 // 4 decimal places
}

// ============================================
// Exercise & Movement Pattern Analysis
// ============================================

function computeTopExercises(
  exercises: ExerciseForExtraction[],
  totalWorkouts: number
): Array<{ name: string; frequency: number }> {
  const counts: Record<string, number> = {}

  for (const ex of exercises) {
    const normalized = normalizeExerciseName(ex.name)
    counts[normalized] = (counts[normalized] || 0) + 1
  }

  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      frequency: Math.round((count / totalWorkouts) * 100) / 100,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20)
}

function computeMovementPatterns(exercises: ExerciseForExtraction[]): Record<string, number> {
  const patterns: Record<string, number> = {
    squat: 0, hinge: 0, push: 0, pull: 0, carry: 0, other: 0,
  }
  let total = 0

  for (const ex of exercises) {
    const pattern = classifyMovementPattern(ex)
    patterns[pattern] = (patterns[pattern] || 0) + 1
    total++
  }

  if (total === 0) return patterns

  // Normalize to ratios
  for (const key of Object.keys(patterns)) {
    patterns[key] = Math.round((patterns[key] / total) * 100) / 100
  }

  return patterns
}

function classifyMovementPattern(exercise: ExerciseForExtraction): string {
  if (exercise.movement_pattern) {
    return exercise.movement_pattern.toLowerCase()
  }

  const name = exercise.name.toLowerCase()
  if (matchesAny(name, SQUAT_PATTERNS)) return 'squat'
  if (matchesAny(name, HINGE_PATTERNS)) return 'hinge'
  if (matchesAny(name, PUSH_PATTERNS)) return 'push'
  if (matchesAny(name, PULL_PATTERNS)) return 'pull'
  if (matchesAny(name, CARRY_PATTERNS)) return 'carry'
  return 'other'
}

function computeExerciseRotation(programs: ProgramForExtraction[]): number | null {
  // How often do exercises change between weeks?
  // 0 = same exercises every week, 1 = completely different every week
  const weekExerciseSets: Set<string>[] = []

  for (const program of programs) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        const weekExercises = new Set<string>()
        for (const workout of week.workouts) {
          for (const ex of workout.exercises) {
            weekExercises.add(normalizeExerciseName(ex.name))
          }
        }
        if (weekExercises.size > 0) {
          weekExerciseSets.push(weekExercises)
        }
      }
    }
  }

  if (weekExerciseSets.length < 2) return null

  // Compare consecutive weeks using Jaccard distance
  let totalDistance = 0
  for (let i = 1; i < weekExerciseSets.length; i++) {
    const a = weekExerciseSets[i - 1]
    const b = weekExerciseSets[i]
    const intersection = new Set([...a].filter(x => b.has(x)))
    const union = new Set([...a, ...b])
    const jaccard = union.size > 0 ? 1 - (intersection.size / union.size) : 0
    totalDistance += jaccard
  }

  return Math.round((totalDistance / (weekExerciseSets.length - 1)) * 100) / 100
}

// ============================================
// Block Analysis
// ============================================

function computeAvgBlockDuration(programs: ProgramForExtraction[]): number | null {
  const durations: number[] = []

  for (const program of programs) {
    for (const block of program.blocks) {
      if (block.weeks.length > 0) {
        durations.push(block.weeks.length)
      }
    }
  }

  if (durations.length === 0) return null
  return Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
}

function computeBlockTypeDistribution(programs: ProgramForExtraction[]): Record<string, number> {
  const typeCounts: Record<string, number> = {}
  let total = 0

  for (const program of programs) {
    for (const block of program.blocks) {
      const type = (block.block_type || 'general').toLowerCase()
      typeCounts[type] = (typeCounts[type] || 0) + 1
      total++
    }
  }

  if (total === 0) return {}

  const distribution: Record<string, number> = {}
  for (const [type, count] of Object.entries(typeCounts)) {
    distribution[type] = Math.round((count / total) * 100) / 100
  }

  return distribution
}

// ============================================
// Utility Functions
// ============================================

function computeWeekVolume(workouts: WorkoutForExtraction[]): number {
  let volume = 0
  for (const workout of workouts) {
    for (const ex of workout.exercises) {
      const sets = parseInt(String(ex.sets)) || 1
      const reps = parseReps(ex.reps)
      const weight = ex.weight_kg || 1

      // Volume = sets × reps × weight (or just sets × reps if no weight)
      volume += sets * reps * weight
    }
  }
  return volume
}

function computeAvgReps(exercises: ExerciseForExtraction[]): number {
  const reps = exercises.map(e => parseReps(e.reps)).filter(r => r > 0)
  if (reps.length === 0) return 8 // reasonable default
  return reps.reduce((a, b) => a + b, 0) / reps.length
}

function parseReps(reps?: string | number): number {
  if (reps == null) return 0
  if (typeof reps === 'number') return reps

  // Handle "8-10" → take midpoint
  const rangeMatch = reps.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (rangeMatch) {
    return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2
  }

  // Handle "AMRAP" or text
  const num = parseInt(reps)
  return isNaN(num) ? 0 : num
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw))
}

function normalizeExerciseName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(barbell|dumbbell|db|bb|kb|kettlebell)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n < 3) return 0

  const xMean = x.reduce((a, b) => a + b, 0) / n
  const yMean = y.reduce((a, b) => a + b, 0) / n

  let num = 0
  let denX = 0
  let denY = 0

  for (let i = 0; i < n; i++) {
    const dx = x[i] - xMean
    const dy = y[i] - yMean
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }

  const den = Math.sqrt(denX * denY)
  if (den === 0) return 0

  return Math.round((num / den) * 100) / 100
}

function emptyMetrics(programCount: number): ExtractedMetrics {
  return {
    intensity_distribution: { high: 0, medium: 0, low: 0 },
    session_type_mix: {},
    volume_intensity_correlation: 0,
    deload_frequency_weeks: null,
    deload_volume_reduction: null,
    sessions_per_week_avg: 0,
    high_intensity_gap_hours: null,
    progression_pattern: null,
    volume_progression_slope: null,
    top_exercises: [],
    movement_pattern_distribution: {},
    exercise_rotation_frequency: null,
    avg_block_duration_weeks: null,
    block_type_distribution: {},
    programs_analyzed: programCount,
    workouts_analyzed: 0,
    exercises_analyzed: 0,
    total_weeks_analyzed: 0,
  }
}
