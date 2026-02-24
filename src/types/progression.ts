/**
 * Progression types — Sprint 13.5b/13.6
 *
 * Re-exports ExerciseWeekEntry and ExerciseSlot from import.ts
 * and adds BlockProgressionParams for the JSONB shape stored in
 * training_blocks.progression_params.
 */

// Re-export the base types so consumers can import from one place
export type { ExerciseWeekEntry, ExerciseSlot } from './import'

/**
 * Shape of training_blocks.progression_params JSONB.
 * Stores per-exercise progressions (13.5b) and volume targets (13.6).
 */
export interface BlockProgressionParams {
  exercise_progressions: import('./import').ExerciseSlot[]
  /** One per week — volume targets from VolumeDesigner (13.6) */
  volume_targets?: number[]
  /** Derived from training_blocks.load_metric */
  volume_unit?: string
  /** One per week — intensity % targets from VolumeDesigner (13.6) */
  intensity_targets?: number[]
  /** Preset shape name — null if manual or import-populated */
  preset_shape?: string | null
  /** Override for deload week (1-indexed), mirrors training_blocks.deload_week */
  deload_week?: number
  /** Override for deload volume factor, mirrors training_blocks.deload_volume_factor */
  deload_volume_factor?: number
}

/**
 * A single volume/intensity spike detected by detectVolumeSpikes().
 * Tier 1 rule — no AI cost.
 */
export interface VolumeSpike {
  exercise_name: string
  exercise_index: number
  from_week: number
  to_week: number
  field: 'sets' | 'reps' | 'intensity' | 'volume'
  delta_percent: number
  message: string
}

/**
 * Load metric labels for UI display.
 */
export const LOAD_METRIC_LABELS: Record<string, string> = {
  tonnage:            'Tonnage (kg total)',
  relative_intensity: 'Relative Intensity (%1RM avg)',
  rpe:                'RPE Average',
  volume_load:        'Volume Load (m x intensity)',
  distance:           'Distance (metres)',
  duration:           'Duration (minutes)',
  reps_only:          'Total Reps',
}
