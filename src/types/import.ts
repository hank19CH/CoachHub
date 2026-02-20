// --- Plan Type Classification ---

/** The four training document structures CoachHub recognises */
export type PlanType =
  | 'single_session'    // One workout, fixed prescription
  | 'evolving_session'  // One session repeated N weeks, prescription changes each week
  | 'block_plan'        // Multiple sessions across a mesocycle
  | 'season_plan'       // Multiple blocks chained, full season or annual plan

/** Human-readable labels for UI display */
export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  single_session:   'Single Session',
  evolving_session: 'Evolving Session',
  block_plan:       'Block Plan',
  season_plan:      'Season / Annual Plan',
}

/** Descriptions shown in the plan type selector UI */
export const PLAN_TYPE_DESCRIPTIONS: Record<PlanType, string> = {
  single_session:   'One workout with a fixed prescription. No week-to-week changes.',
  evolving_session: 'One session repeated over several weeks. Prescription changes each week.',
  block_plan:       'Multiple sessions (e.g. Mon/Wed/Fri) that evolve across a training block.',
  season_plan:      'Multiple blocks chained together. A full season or annual plan.',
}

// --- Pre-Import Context (Coach hints before AI processing) ---

/** Sport categories mapping 1:1 to edge function SPORT_RULES keys */
export type ImportSportCategory =
  | 'auto'
  | 'sprint_track'
  | 'distance_running'
  | 'swimming'
  | 'cycling'
  | 'strength'
  | 'crossfit'
  | 'rowing'
  | 'combat'
  | 'team_sport'
  | 'gymnastics'

export const IMPORT_SPORT_OPTIONS: Array<{ value: ImportSportCategory; label: string }> = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'sprint_track', label: 'Sprints / Track & Field' },
  { value: 'distance_running', label: 'Distance Running / XC' },
  { value: 'swimming', label: 'Swimming' },
  { value: 'cycling', label: 'Cycling / Triathlon' },
  { value: 'strength', label: 'Strength / Powerlifting' },
  { value: 'crossfit', label: 'CrossFit / Functional Fitness' },
  { value: 'rowing', label: 'Rowing / Erging' },
  { value: 'combat', label: 'Combat Sports' },
  { value: 'team_sport', label: 'Team Sport (Soccer, Rugby, etc.)' },
  { value: 'gymnastics', label: 'Gymnastics / Calisthenics' },
]

/** Training focus/modality options */
export type ImportTrainingFocus =
  | 'auto'
  | 'speed'
  | 'strength'
  | 'power'
  | 'hypertrophy'
  | 'conditioning'
  | 'endurance'
  | 'mixed'

export const IMPORT_FOCUS_OPTIONS: Array<{ value: ImportTrainingFocus; label: string }> = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'speed', label: 'Speed / Velocity' },
  { value: 'strength', label: 'Strength / Maximal' },
  { value: 'power', label: 'Power / Explosive' },
  { value: 'hypertrophy', label: 'Hypertrophy / Muscle Growth' },
  { value: 'conditioning', label: 'Conditioning / MetCon' },
  { value: 'endurance', label: 'Endurance / Aerobic' },
  { value: 'mixed', label: 'Mixed / General' },
]

/** Coach-friendly plan type labels for the pre-import dropdown */
export const IMPORT_PLAN_TYPE_OPTIONS: Array<{ value: PlanType | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'single_session', label: 'Single Workout' },
  { value: 'evolving_session', label: 'Single Multi-Week Session' },
  { value: 'block_plan', label: 'Block Plan (Multi-Week)' },
  { value: 'season_plan', label: 'Season / Annual Plan' },
]

/** Payload shape for pre-import context hints */
export interface PreImportContext {
  coachSport?: ImportSportCategory
  coachPlanType?: PlanType
  coachTrainingFocus?: ImportTrainingFocus
}

// --- Session & Exercise Types ---

/** Exercise prescription within a self-contained plan session */
export interface SessionExercise {
  order: number
  name: string
  sets: number | string
  reps?: string           // e.g. "6", "6 e/s", "30s", "10 Fly"
  distance_meters?: number
  duration_seconds?: number
  rest_seconds?: number
  load_percent?: number   // % of 1RM
  intensity_percent?: number
  target_time_seconds?: number
  weight?: string
  rpe?: number
  tempo?: string
  category?: string
  notes?: string
  superset_group?: string
  is_section_header?: boolean
}

/** Exercise prescription for an evolving session, varies week by week */
export interface EvolvingExercise {
  order: number
  name: string
  superset_group?: string
  rest_seconds?: number
  notes?: string
  weeks: Array<{
    week_number: number
    sets: number | string
    reps?: string
    load_percent?: number
    weight?: string
  }>
}

export interface ImportBlock {
  name: string
  blockType?: string  // e.g. "hypertrophy", "strength", "peaking", "gpp", "spp"
  weeks: ImportWeek[]
}

export interface ImportResult {
  programName: string
  durationWeeks: number
  periodization: 'linear' | 'undulating' | 'block' | 'conjugate' | 'mixed'
  sport?: string
  blocks: ImportBlock[]   // primary: blocks containing weeks
  weeks?: ImportWeek[]    // backward compat: cached results from old flat format
  detectedPlanType?: PlanType
  planTypeConfidence?: number  // 0-1
}

export interface ImportWeek {
  weekNumber: number
  name?: string
  workouts: ImportWorkout[]
}

export interface ImportWorkout {
  name: string
  dayOfWeek: number // 1-7 (Monday-Sunday)
  description?: string
  sessionType?: string // e.g. "speed", "strength", "power", "conditioning"
  exercises: ImportExercise[]
}

export interface ImportExercise {
  name: string
  raw_name?: string // original text exactly as written by the coach (before AI interpretation)
  sets?: number | string // Can be "3" or "3-4" — ranges preserved
  reps?: string // Can be "8-10" or "5" or "max" or "2+1"
  weight?: string // Can be "80%" or "135 lbs"
  duration_seconds?: number
  distance_meters?: number
  intensity_percent?: number // % of max (e.g. 80 for 80% 1RM, 95 for 95% sprint)
  rest_seconds?: number // rest between sets/reps in seconds
  target_time_seconds?: number // target completion time
  tempo?: string // lifting tempo "3-1-X-0"
  rpe?: number // rate of perceived exertion 1-10
  category?: string // movement category (sprint, drill, interval, compound_lift, etc.)
  notes?: string
  is_section_header?: boolean // true = visual section divider, not an exercise
}

export interface CoachAbbreviation {
  abbreviation: string  // UPPERCASE
  expansion: string
  sport_context?: string[]
}

export interface ImportHistoryRecord {
  id: string
  coach_id: string
  file_name: string
  file_type: string
  file_size_bytes: number
  storage_path: string
  ai_model_used: string
  processing_cost_usd: number
  processing_time_ms: number
  programs_imported: number
  workouts_imported: number
  exercises_imported: number
  detected_periodization?: string
  detected_duration_weeks?: number
  detected_sport?: string
  detected_plan_type?: PlanType | null
  plan_type_confidence?: number | null
  status: 'processing' | 'success' | 'partial' | 'failed'
  error_message?: string
  has_cached_result?: boolean
  created_at: string
}

export interface CoachPhilosophy {
  id: string
  coach_id: string
  programs_analyzed: number
  last_analysis_at?: string
  next_analysis_threshold: number
  primary_periodization: string[]
  avg_mesocycle_length_weeks?: number
  typical_deload_frequency?: number
  volume_progression_pattern?: string
  intensity_distribution?: {
    low: number
    medium: number
    high: number
  }
  top_exercises?: Array<{
    name: string
    frequency: number
  }>
  movement_patterns?: {
    squat?: number
    hinge?: number
    push?: number
    pull?: number
    carry?: number
  }
  coaching_style_summary?: string
  recommendations?: string[]
  created_at: string
  updated_at: string
}
