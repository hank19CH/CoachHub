export interface ImportResult {
  programName: string
  durationWeeks: number
  periodization: 'linear' | 'undulating' | 'block' | 'conjugate' | 'mixed'
  sport?: string
  weeks: ImportWeek[]
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
  exercises: ImportExercise[]
}

export interface ImportExercise {
  name: string
  sets?: number
  reps?: string // Can be "8-10" or "5"
  weight?: string // Can be "80%" or "135 lbs"
  duration_seconds?: number
  distance_meters?: number
  rpe?: number
  notes?: string
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
  status: 'processing' | 'success' | 'partial' | 'failed'
  error_message?: string
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
