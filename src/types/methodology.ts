// ============================================
// Methodology Fingerprinting Types
// Used by feature extraction, pattern matching, and AI guardrails
// ============================================

/** Range for numeric fingerprint matching */
export interface NumericRange {
  min: number
  max: number
}

/** Intensity distribution fingerprint (% of sessions at each level) */
export interface IntensityDistribution {
  high: number   // >90% effort / RPE 9+
  medium: number // 75-90% effort / RPE 6-8
  low: number    // <75% effort / RPE 1-5
}

/** Session type frequency (sessions per week) */
export interface SessionTypeMix {
  speed?: number
  tempo?: number
  strength?: number
  hypertrophy?: number
  power?: number
  recovery?: number
  endurance?: number
  threshold?: number
  conditioning?: number
  mobility?: number
}

/** Block/phase structure template */
export interface BlockTemplate {
  name: string
  duration_weeks: NumericRange
  focus: string
  typical_position: number  // 0-based order in mesocycle
}

/** Weighted fingerprint marker */
export interface FingerprintMarker {
  marker_id: string
  weight: number
  description: string
  detection_rule?: string
}

/** Exclusion rule — disqualifies a methodology match */
export interface ExclusionRule {
  rule_id: string
  threshold: number
  operator: 'gt' | 'lt' | 'eq' | 'between'
  penalty: number  // negative number
  description: string
}

/** AI guardrails for a methodology */
export interface AiGuardrails {
  must: string[]       // things the AI MUST do when following this methodology
  must_not: string[]   // things the AI MUST NOT do
  prefer: string[]     // soft suggestions
  flag_if: string[]    // conditions that should trigger a coach alert
}

/** Diagnostic questions for different confidence levels */
export interface DiagnosticQuestions {
  low: string[]      // <40% confidence — broad exploratory questions
  medium: string[]   // 40-79% — hypothesis with evidence
  high: string[]     // 80%+ — confirmation check
}

// ============================================
// Main Methodology Profile
// ============================================

export interface MethodologyProfile {
  id: string
  name: string
  short_name: string
  category: 'speed_power' | 'endurance' | 'periodization' | 'strength' | 'hybrid'
  sport_context: string[]

  // Fingerprint ranges
  intensity_distribution: {
    high: NumericRange
    medium: NumericRange
    low: NumericRange
  }
  session_type_mix: Record<string, NumericRange>
  volume_intensity_relationship: 'inverse' | 'inverse_strict' | 'parallel' | 'independent' | 'phase_dependent'
  deload_pattern: {
    frequency_weeks: NumericRange
    volume_reduction_pct: NumericRange
  }
  recovery_spacing: {
    high_intensity_gap_hours: NumericRange
    pattern: string
  }
  progression_model: 'linear' | 'wave' | 'step' | 'undulating' | 'conjugate' | 'phase_shift'
  typical_block_structure: BlockTemplate[]
  sessions_per_week: NumericRange

  // Scoring
  primary_markers: FingerprintMarker[]
  secondary_markers: FingerprintMarker[]
  exclusion_rules: ExclusionRule[]
  total_weight: number

  // AI integration
  ai_guardrails: AiGuardrails
  diagnostic_questions: DiagnosticQuestions

  created_at: string
  updated_at: string
}

// ============================================
// Coach Match Results
// ============================================

export interface CoachMethodologyMatch {
  id: string
  coach_id: string
  methodology_id: string
  confidence: number  // 0-100
  status: 'detected' | 'confirmed' | 'rejected' | 'modified'
  extracted_metrics: ExtractedMetrics
  marker_scores: Record<string, number>
  coach_confirmed: boolean | null
  coach_notes: string | null
  confirmed_at: string | null
  programs_analyzed: number
  last_analysis_at: string
  created_at: string
  updated_at: string

  // Joined
  methodology?: MethodologyProfile
}

// ============================================
// Extracted Metrics (from local computation)
// ============================================

export interface ExtractedMetrics {
  // Core metrics
  intensity_distribution: IntensityDistribution
  session_type_mix: SessionTypeMix
  volume_intensity_correlation: number  // -1.0 to 1.0
  deload_frequency_weeks: number | null
  deload_volume_reduction: number | null
  sessions_per_week_avg: number
  high_intensity_gap_hours: number | null
  progression_pattern: string | null
  volume_progression_slope: number | null

  // Exercise metrics
  top_exercises: Array<{ name: string; frequency: number }>
  movement_pattern_distribution: Record<string, number>
  exercise_rotation_frequency: number | null

  // Block metrics
  avg_block_duration_weeks: number | null
  block_type_distribution: Record<string, number>

  // Source data
  programs_analyzed: number
  workouts_analyzed: number
  exercises_analyzed: number
  total_weeks_analyzed: number
}

// ============================================
// Feature Extraction Input Types
// ============================================

/** Structured workout data for feature extraction (from DB or import) */
export interface WorkoutForExtraction {
  id?: string
  name: string
  day_of_week: number
  week_number: number
  block_name?: string
  block_type?: string
  target_rpe?: number
  estimated_duration_min?: number
  session_type?: string
  session_focus?: string[]
  exercises: ExerciseForExtraction[]
}

export interface ExerciseForExtraction {
  name: string
  sets?: number
  reps?: string | number
  weight_kg?: number
  weight_pct?: number  // percentage-based (e.g. 85 for 85%)
  rpe?: number
  duration_seconds?: number
  distance_meters?: number
  rest_seconds?: number
  category?: string
  movement_pattern?: string
  intensity_percent?: number
  superset_group?: string | null
}

/** A full program structure for extraction */
export interface ProgramForExtraction {
  name: string
  blocks: Array<{
    name: string
    block_type?: string
    weeks: Array<{
      week_number: number
      is_deload?: boolean
      workouts: WorkoutForExtraction[]
    }>
  }>
}

// ============================================
// Matching Result
// ============================================

export interface MethodologyMatchResult {
  methodology_id: string
  methodology_name: string
  confidence: number  // 0-100
  marker_scores: Record<string, number>
  penalties: Array<{ rule_id: string; penalty: number; reason: string }>
  total_score: number
  max_possible: number
  evidence: string[]  // human-readable evidence statements
}

export interface MatchingOutput {
  matches: MethodologyMatchResult[]
  extracted_metrics: ExtractedMetrics
  top_match: MethodologyMatchResult | null
  needs_confirmation: boolean  // true if top match is 40-79%
  suggested_question: string | null  // diagnostic question if applicable
}

// ============================================
// Learning Log
// ============================================

export interface MethodologyLearningEntry {
  id: string
  coach_id: string
  methodology_id: string
  action: 'confirmed' | 'rejected' | 'corrected' | 'suggested_alternative'
  confidence_at_action: number | null
  coach_feedback: string | null
  alternative_methodology_id: string | null
  extracted_metrics_snapshot: ExtractedMetrics | null
  created_at: string
}
