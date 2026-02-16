/**
 * Training Methodology Fingerprint Profiles
 *
 * Quantifiable detection profiles for automatic methodology identification
 * via pattern matching against imported training programs.
 *
 * Sources: Primary literature by each methodology's creator:
 * - Charlie Francis: "Training for Speed" (1997), CFTS Manual
 * - Arthur Lydiard: "Running to the Top" (1995)
 * - Stephen Seiler: MSSE/IJSPP/Frontiers research (2006-2019)
 * - Norwegian: Olympiatoppen research, Casado et al. (2023)
 * - Issurin: "Block Periodization" (2008, 2019)
 * - Matveyev: "Fundamentals of Sports Training" (1981), Bompa
 * - DUP: Zourdos, Schoenfeld, Harries et al. (2015)
 * - Westside: Simmons "Westside Barbell Book of Methods" (2007)
 * - Wendler: "5/3/1" (2011), "5/3/1 Forever" (2017)
 * - Dietz: "Triphasic Training" (2012)
 */

// ============================================
// Type Definitions
// ============================================

export interface Range {
  min: number
  max: number
}

export interface IntensityDistribution {
  /** % of sessions at >85% 1RM or >90% HRmax / max velocity */
  high: Range
  /** % of sessions at 70-85% 1RM or 75-90% HRmax / threshold zone */
  medium: Range
  /** % of sessions at <70% 1RM or <75% HRmax / easy/recovery */
  low: Range
}

export interface SessionTypeMix {
  [sessionType: string]: Range // sessions per week
}

export type VolumeIntensityRelationship =
  | 'inverse'               // Volume down as intensity up (Linear, Block across phases)
  | 'sequential'            // Volume first, then intensity later (Lydiard)
  | 'parallel'              // Both maintained simultaneously (Polarized)
  | 'additive'              // Both increase together (Norwegian)
  | 'concurrent'            // All qualities every week, no phasing (Westside)
  | 'daily_inverse'         // Undulates day-to-day within each week (DUP)
  | 'micro_undulating'      // Small wave within 3-4 week cycles (5/3/1)
  | 'stable_type_shift'     // Intensity stable, contraction type changes (Triphasic)

export type ProgressionModel =
  | 'step_loading'          // Step up over 2-3 weeks, deload, repeat higher (Francis)
  | 'phase_sequential'      // Build volume in one phase, add intensity in next (Lydiard)
  | 'distribution_maintenance' // Maintain the zone ratio, gradually progress intervals (Polarized)
  | 'lactate_guided'        // Progression defined by lactate response shifts (Norwegian)
  | 'concentrated_sequential' // A-T-R blocks, each block raises one quality (Block)
  | 'unidirectional_linear' // Reps decrease monotonically, intensity increases monotonically (Linear)
  | 'multi_variable_micro'  // Each day type progresses independently by small increments (DUP)
  | 'conjugate_rotation'    // Exercise rotates to prevent accommodation, wave DE% (Westside)
  | 'slow_linear_microload' // +5/+10 lbs per cycle off training max (5/3/1)
  | 'contraction_type_sequential' // Ecc -> Iso -> Con phases, each builds on prior (Triphasic)

export interface DeloadPattern {
  frequency_weeks: Range       // how often deloads occur (in weeks)
  volume_reduction_pct: Range  // % reduction during deload
  has_formal_deload: boolean   // does the method use explicit deload weeks?
  notes: string
}

export interface RecoverySpacing {
  high_intensity_gap_hours: Range  // min/max hours between high-CNS/high-intensity sessions
  notes: string
}

export interface Marker {
  id: string
  description: string
  weight: number       // scoring weight: higher = more discriminatory
  detectionHint: string // how to detect this in imported program data
}

export interface ExclusionRule {
  id: string
  description: string
  penalty: number      // negative score applied if violated (typically -50 to -100)
  detectionHint: string
}

export interface AIGuardrails {
  must: string[]       // things the AI MUST do when generating for this methodology
  must_not: string[]   // things the AI MUST NOT do
}

export interface DiagnosticQuestions {
  low_confidence: string[]    // ask these when confidence < 40
  medium_confidence: string[] // ask these when 40 <= confidence < 70
  high_confidence: string[]   // ask these when confidence >= 70 (confirmation)
}

export type TrainingDomain =
  | 'sprint_power'
  | 'distance_running'
  | 'endurance_general'
  | 'strength_power'
  | 'powerlifting'
  | 'team_sport'
  | 'general_fitness'

export interface PhaseTemplate {
  name: string
  duration_weeks: Range
  primary_focus: string
  rep_range?: string
  intensity_pct?: Range
  notes?: string
}

export interface MethodologyFingerprint {
  id: string
  name: string
  shortName: string
  creator: string
  domains: TrainingDomain[]
  primarySource: string

  intensity_distribution: IntensityDistribution
  session_type_mix: SessionTypeMix
  volume_intensity_relationship: VolumeIntensityRelationship
  deload_pattern: DeloadPattern
  recovery_spacing: RecoverySpacing
  progression_model: ProgressionModel
  sessions_per_week: Range

  phase_structure: PhaseTemplate[]
  typical_macrocycle_weeks: Range

  primary_markers: Marker[]
  secondary_markers: Marker[]
  exclusion_rules: ExclusionRule[]

  ai_guardrails: AIGuardrails
  diagnostic_questions: DiagnosticQuestions

  keyword_signals: string[]  // terms that suggest this methodology in imported text
  common_variations: string[]
}


// ============================================
// Fingerprint Profiles
// ============================================

export const METHODOLOGY_FINGERPRINTS: MethodologyFingerprint[] = [

  // ──────────────────────────────────────────
  // 1. CHARLIE FRANCIS (HIGH-LOW)
  // ──────────────────────────────────────────
  {
    id: 'charlie_francis',
    name: 'Charlie Francis High-Low System',
    shortName: 'Francis',
    creator: 'Charlie Francis',
    domains: ['sprint_power', 'team_sport'],
    primarySource: 'Training for Speed (1997), CFTS Manual',

    intensity_distribution: {
      high:   { min: 30, max: 40 },  // 95-100% max velocity / >85% 1RM
      medium: { min: 0,  max: 0 },   // ZERO -- explicitly forbidden
      low:    { min: 60, max: 70 },   // <75% max velocity / <70% 1RM (tempo runs)
    },

    session_type_mix: {
      speed:             { min: 2, max: 3 },   // 95-100% sprints, 30-60m
      speed_endurance:   { min: 0, max: 1 },   // 80-150m at 95-100%
      tempo:             { min: 3, max: 3 },   // 65-75% max velocity, 1500-3000m volume
      max_strength:      { min: 2, max: 3 },   // 85-95% 1RM, ON HIGH days only
      plyometrics:       { min: 1, max: 3 },   // on HIGH days
      recovery:          { min: 0, max: 1 },   // pool, massage (in addition to tempo)
    },

    volume_intensity_relationship: 'inverse',

    deload_pattern: {
      frequency_weeks:    { min: 3, max: 4 },  // 3:1 typical, sometimes 2:1
      volume_reduction_pct: { min: 30, max: 50 }, // sprint volume reduction
      has_formal_deload: true,
      notes: 'LOW day tempo volume only drops 10-20% during deload. Pre-competition taper 10-14 days with 60-70% sprint volume reduction.',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 48, max: 72 },
      notes: 'HIGH days NEVER consecutive. Always 1-2 LOW days between HIGH days. Within sprint sessions: 3-7 min rest between reps, up to 15 min for speed endurance.',
    },

    progression_model: 'step_loading',

    sessions_per_week: { min: 6, max: 7 },  // 3 HIGH + 3 LOW + 0-1 rest

    phase_structure: [
      { name: 'GPP (General Prep)', duration_weeks: { min: 6, max: 8 }, primary_focus: 'Tempo volume building, acceleration mechanics, general strength', intensity_pct: { min: 85, max: 95 }, notes: '3 HIGH + 3 LOW. Sprint volume 500-600m/HIGH session.' },
      { name: 'SPP I (Special Prep)', duration_weeks: { min: 4, max: 6 }, primary_focus: 'Speed endurance, max strength, plyometric intensity', intensity_pct: { min: 90, max: 100 }, notes: 'Sprint volume 300-400m/HIGH session.' },
      { name: 'SPP II (Pre-Competition)', duration_weeks: { min: 3, max: 4 }, primary_focus: 'Competition distances, speed maintenance', intensity_pct: { min: 95, max: 100 }, notes: 'Sprint volume 150-250m/HIGH session.' },
      { name: 'Competition', duration_weeks: { min: 6, max: 12 }, primary_focus: 'Peaking, minimal volume, maximal intensity', intensity_pct: { min: 98, max: 100 }, notes: '2-3 HIGH + 3-4 LOW per week.' },
    ],

    typical_macrocycle_weeks: { min: 20, max: 30 },

    primary_markers: [
      { id: 'cf_zero_medium',      description: 'ZERO medium-intensity sessions (75-95% zone completely absent)', weight: 35, detectionHint: 'Check that no sessions have intensity between 75-95% of max. No "moderate" or "threshold" sessions exist.' },
      { id: 'cf_tempo_range',      description: 'Tempo/recovery runs at precisely 65-75% max velocity', weight: 25, detectionHint: 'Look for sessions labeled "tempo" or recovery runs with 65-75% intensity, or pace targets at ~65-75%.' },
      { id: 'cf_cns_classification', description: 'Days classified by CNS demand (HIGH/LOW), not muscle group', weight: 20, detectionHint: 'Sessions labeled "high CNS" or "low CNS" or similar neural-demand classification rather than body-part split.' },
      { id: 'cf_weights_on_high',  description: 'Heavy lifting always paired with sprints on HIGH days, never on LOW days', weight: 20, detectionHint: 'Days with sprints also contain heavy compound lifts (squats, bench, deadlifts at >80%). Days with tempo runs have zero heavy lifting.' },
    ],

    secondary_markers: [
      { id: 'cf_sprint_volume_cap', description: 'Sprint volume per session never exceeds 600m', weight: 12, detectionHint: 'Sum total sprint distances within speed sessions. Should be 200-600m, never >800m.' },
      { id: 'cf_alternating_days',  description: 'Strict HIGH-LOW-HIGH-LOW alternation pattern', weight: 12, detectionHint: 'Day sequence shows no two consecutive HIGH days.' },
      { id: 'cf_short_to_long',     description: 'Speed development progresses from 30m to 60m to 100m across phases', weight: 8, detectionHint: 'Early phase sprint distances are shorter (10-40m), later phases use longer distances (60-150m).' },
      { id: 'cf_no_long_runs',      description: 'No continuous running exceeding 30 minutes', weight: 8, detectionHint: 'No sessions with continuous running >30 min. Tempo runs are interval-based (100-300m repeats).' },
    ],

    exclusion_rules: [
      { id: 'cf_ex_medium_zone',     description: 'Any session at 80-90% intensity (medium zone)', penalty: -100, detectionHint: 'If any session targets 80-90% of max effort/velocity/1RM, this is NOT Francis.' },
      { id: 'cf_ex_heavy_on_low',    description: 'Heavy lifting (>80% 1RM) on LOW/tempo/recovery days', penalty: -100, detectionHint: 'If heavy compound lifts appear on days also containing tempo runs or marked as recovery.' },
      { id: 'cf_ex_consecutive_high', description: 'Two consecutive HIGH-CNS days', penalty: -80, detectionHint: 'Two consecutive days both containing sprints + heavy weights.' },
      { id: 'cf_ex_sprint_overcap',  description: 'Sprint volume exceeds 800m in a single session', penalty: -60, detectionHint: 'Sum sprint distances in any single session. If >800m, not Francis.' },
      { id: 'cf_ex_endurance',       description: 'Continuous endurance runs >30 minutes', penalty: -60, detectionHint: 'Any single continuous running effort exceeding 30 minutes.' },
    ],

    ai_guardrails: {
      must: [
        'Alternate HIGH and LOW days with zero medium-intensity sessions',
        'Pair heavy lifting with speed work on HIGH days only',
        'Keep tempo runs at 65-75% max velocity, never faster',
        'Limit sprint volume to 200-600m per HIGH session',
        'Allow 48-72 hours between HIGH CNS days',
        'Include tempo runs (1500-3000m volume) on every LOW day',
        'Apply 3:1 loading-to-deload ratio',
      ],
      must_not: [
        'Program any session at 75-95% intensity (medium zone)',
        'Place heavy lifting on LOW/tempo/recovery days',
        'Schedule consecutive HIGH days',
        'Exceed 600m sprint volume per session (800m absolute max)',
        'Include continuous runs longer than 30 minutes',
        'Prescribe steady-state threshold/tempo runs at 80-88% effort',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Does the program split days into HIGH (CNS-intensive) and LOW (recovery) categories?',
        'Is the medium-intensity zone (75-95% effort) completely avoided?',
        'Are sprints and heavy lifting always on the same day?',
      ],
      medium_confidence: [
        'Are tempo runs prescribed at 65-75% max velocity (not threshold pace)?',
        'Is sprint volume capped below 600m per session?',
        'Are HIGH days separated by at least 48 hours?',
      ],
      high_confidence: [
        'Confirm: zero sessions exist in the 75-95% intensity zone',
        'Confirm: every HIGH day pairs speed work with max strength work',
        'Confirm: LOW days contain only tempo runs, circuits, and recovery modalities',
      ],
    },

    keyword_signals: [
      'high-low', 'high low', 'tempo runs', 'CNS', 'central nervous system',
      'charlie francis', 'CFTS', 'no man\'s land', 'no-man\'s-land',
      'speed day', 'tempo day', 'regeneration day', 'short to long',
      'sprint training', 'high CNS', 'low CNS',
    ],

    common_variations: [
      'Pure Francis: Strict high-low with zero medium work',
      'Modified Francis (team sport): Sport practice replaces some speed work',
      'Concurrent Francis: Adds moderate strength on LOW days (violates purity)',
      'Short-to-Long vs Long-to-Short: Sprint distance progression direction varies',
    ],
  },


  // ──────────────────────────────────────────
  // 2. ARTHUR LYDIARD (BASE BUILDING)
  // ──────────────────────────────────────────
  {
    id: 'lydiard',
    name: 'Arthur Lydiard Base Building System',
    shortName: 'Lydiard',
    creator: 'Arthur Lydiard',
    domains: ['distance_running'],
    primarySource: 'Running to the Top (1995), Running with Lydiard',

    intensity_distribution: {
      high:   { min: 0,  max: 5 },   // Base phase: 0%; Sharpening: up to 25-30%
      medium: { min: 5,  max: 10 },  // Minimal even in later phases
      low:    { min: 85, max: 95 },  // Base phase: 85-95% of all sessions
    },

    session_type_mix: {
      long_aerobic_run:    { min: 2, max: 2 },  // 22-35 km at 60-75% effort
      easy_aerobic_run:    { min: 3, max: 5 },  // 13-19 km at 60-70% effort
      recovery_run:        { min: 0, max: 1 },  // 10-13 km at 55-65% effort
      hill_circuits:       { min: 0, max: 3 },  // Hill phase only: bounding/springing
      track_intervals:     { min: 0, max: 3 },  // Anaerobic phase only
      rest_day:            { min: 0, max: 0 },  // Almost never in Lydiard
    },

    volume_intensity_relationship: 'sequential',

    deload_pattern: {
      frequency_weeks:    { min: 0, max: 0 },  // NO formal deload weeks
      volume_reduction_pct: { min: 0, max: 0 },
      has_formal_deload: false,
      notes: 'Lydiard did NOT use deload weeks. Recovery embedded in daily easy-hard rhythm. Volume drops naturally at phase transitions (~20% per phase).',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 48, max: 72 },
      notes: 'Easy-hard alternation. During base phase, intensity is uniformly low so recovery spacing is less critical. Anaerobic phase: 48-72hr between track sessions. Rest days are extremely rare.',
    },

    progression_model: 'phase_sequential',

    sessions_per_week: { min: 7, max: 14 },  // 7 runs/day, up to 14 with doubles

    phase_structure: [
      { name: 'Base Building / Aerobic Conditioning', duration_weeks: { min: 10, max: 14 }, primary_focus: 'Aerobic volume: all easy running, 2 long runs, doubles', rep_range: 'N/A (running)', notes: 'Weekly mileage 100-160 km. Add 5-10 km/week. Zero intensity.' },
      { name: 'Hill Resistance', duration_weeks: { min: 4, max: 6 }, primary_focus: 'Hill circuits (bounding/springing) + aerobic runs', rep_range: 'N/A', notes: 'Weekly mileage 80-120 km. 3 hill circuit sessions/week.' },
      { name: 'Anaerobic Development (Track)', duration_weeks: { min: 4, max: 6 }, primary_focus: 'Intervals (200-1600m), time trials + aerobic runs', rep_range: 'N/A', notes: 'Weekly mileage 70-100 km. 2-3 track sessions/week.' },
      { name: 'Coordination / Speed', duration_weeks: { min: 2, max: 4 }, primary_focus: 'Fast relaxed striders, race-pace work, tune-up races', rep_range: 'N/A', notes: 'Weekly mileage 60-80 km.' },
      { name: 'Taper & Racing', duration_weeks: { min: 2, max: 4 }, primary_focus: 'Easy running, 1-2 sharpening sessions, target race', rep_range: 'N/A', notes: 'Weekly mileage 40-60 km. Volume drops 50%+.' },
    ],

    typical_macrocycle_weeks: { min: 24, max: 34 },

    primary_markers: [
      { id: 'ly_massive_base',     description: '100+ km/week aerobic base phase lasting 10-14 weeks with zero intensity work', weight: 35, detectionHint: 'Look for 10+ consecutive weeks of pure aerobic running at 100+ km/week with no intervals or speed sessions.' },
      { id: 'ly_no_deload',        description: 'No formal deload weeks in the entire program', weight: 20, detectionHint: 'Check that no "deload", "recovery week", or planned volume reduction weeks exist.' },
      { id: 'ly_zero_intensity_base', description: 'Zero speed/interval sessions during the base building phase', weight: 25, detectionHint: 'First 10+ weeks of program contain only easy/aerobic runs. No threshold, tempo, or interval sessions.' },
      { id: 'ly_hill_phase',       description: 'Distinct hill circuit phase with bounding/springing drills', weight: 15, detectionHint: 'A 4-6 week phase containing "hill circuits", "bounding", "springing", or similar hill-specific drills.' },
    ],

    secondary_markers: [
      { id: 'ly_7_days_running',    description: '7 days/week running with no scheduled rest days', weight: 12, detectionHint: 'All 7 days of the week contain running sessions. No "rest" or "off" days.' },
      { id: 'ly_two_long_runs',     description: 'Two long runs (22+ km) per week during base', weight: 10, detectionHint: 'At least 2 runs per week exceed 22 km during the base phase.' },
      { id: 'ly_sharp_transitions', description: 'Sharp phase transitions (base -> hills is abrupt, not gradual)', weight: 8, detectionHint: 'Weeks transition from 100% aerobic to including hill circuits with no gradual blend.' },
      { id: 'ly_doubles',           description: 'Double-run days common (AM easy + PM main session)', weight: 8, detectionHint: 'Multiple days per week have two running sessions.' },
    ],

    exclusion_rules: [
      { id: 'ly_ex_early_intensity', description: 'Intervals/speed sessions during weeks 1-10 of the program', penalty: -100, detectionHint: 'Any interval, speed, or high-intensity session in the first 10 weeks.' },
      { id: 'ly_ex_low_mileage',     description: 'Weekly mileage below 60 km/week during base phase', penalty: -80, detectionHint: 'Base phase weeks with total running volume < 60 km.' },
      { id: 'ly_ex_deload_weeks',   description: 'Structured deload/recovery weeks present', penalty: -60, detectionHint: 'Any explicitly labeled deload or recovery weeks with planned volume reduction.' },
      { id: 'ly_ex_many_hard',      description: 'More than 2 high-intensity sessions per week (even in anaerobic phase)', penalty: -60, detectionHint: 'Any week with >2 sessions containing intervals, speed work, or racing.' },
      { id: 'ly_ex_cross_training', description: 'Significant cross-training or non-running days', penalty: -50, detectionHint: 'Cycling, swimming, lifting as primary sessions rather than supplemental.' },
      { id: 'ly_ex_short_base',     description: 'Base/aerobic phase shorter than 8 weeks', penalty: -80, detectionHint: 'The purely aerobic phase is less than 8 weeks long.' },
      { id: 'ly_ex_strength_focus', description: 'Strength/power training emphasis (Lydiard is running-only)', penalty: -80, detectionHint: 'Weight training constitutes a major part of the program.' },
    ],

    ai_guardrails: {
      must: [
        'Start with 10-14 weeks of purely aerobic base building at 100+ km/week',
        'Keep ALL running aerobic during base phase (no intervals, tempo, or threshold)',
        'Follow phase sequence: Base -> Hills -> Anaerobic -> Coordination -> Taper',
        'Include 7 runs per week with no rest days',
        'Include 2 long runs per week (22-35 km) during base',
        'Progress base volume by 5-10 km/week',
        'Use hill circuit phase (not just hill repeats) after base',
      ],
      must_not: [
        'Include ANY speed or interval work during the base building phase',
        'Schedule formal deload weeks (recovery is built into daily rhythm)',
        'Drop weekly mileage below 60 km during base phase',
        'Include more than 2-3 hard sessions per week in any phase',
        'Include significant cross-training or weight training',
        'Make base phase shorter than 8 weeks',
        'Blend phase characteristics (each phase has distinct focus)',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Does the program start with a prolonged period of purely aerobic running?',
        'Are there distinct phases (base, hills, track, racing)?',
        'Is running the sole training modality?',
      ],
      medium_confidence: [
        'Is the base phase at least 10 weeks with 100+ km/week?',
        'Are there zero intervals or speed sessions during the base phase?',
        'Is there a specific hill circuit phase (not just hill repeats)?',
      ],
      high_confidence: [
        'Confirm: base phase has 100+ km/week of purely aerobic running for 10+ weeks',
        'Confirm: no formal deload weeks exist in the program',
        'Confirm: phase transitions are sharp (base -> hills -> track -> race)',
      ],
    },

    keyword_signals: [
      'lydiard', 'base building', 'aerobic conditioning', 'aerobic base',
      'hill circuits', 'hill bounding', 'hill springing', 'anaerobic development',
      'sharpening phase', 'conditioning phase', 'marathon base', '100 miles per week',
      'running to the top',
    ],

    common_variations: [
      'Pure Lydiard: 100+ miles/week base, NO intensity until hill phase',
      'Modern Lydiard (Canova influence): Adds tempo/fartlek during late base phase',
      'Daniels-Lydiard hybrid: Lydiard base volume with Daniels V-dot threshold runs',
      'Shortened Lydiard: 6-8 week base for recreational runners',
      'Marathon-specific Lydiard: 16-20 week base, shortened hill phase',
    ],
  },


  // ──────────────────────────────────────────
  // 3. POLARIZED TRAINING (SEILER)
  // ──────────────────────────────────────────
  {
    id: 'polarized',
    name: 'Polarized Training (Seiler Model)',
    shortName: 'Polarized',
    creator: 'Stephen Seiler',
    domains: ['endurance_general', 'distance_running'],
    primarySource: 'Seiler & Kjerland (2006), Seiler (2010) MSSE/IJSPP/Frontiers',

    intensity_distribution: {
      high:   { min: 15, max: 20 },  // >VT2, >88% HRmax, >4 mmol/L
      medium: { min: 0,  max: 5 },   // VT1-VT2, 80-88% HRmax -- AVOIDED (<5%)
      low:    { min: 75, max: 85 },  // <VT1, <80% HRmax, <2 mmol/L
    },

    session_type_mix: {
      zone1_easy:        { min: 4, max: 5 },  // 45-90 min easy aerobic
      zone3_intervals:   { min: 2, max: 3 },  // VO2max intervals at >90% HRmax
      zone1_long:        { min: 1, max: 1 },  // 90-150 min long easy aerobic
      zone2_threshold:   { min: 0, max: 0 },  // ZERO -- Zone 2 avoided
    },

    volume_intensity_relationship: 'parallel',

    deload_pattern: {
      frequency_weeks:    { min: 3, max: 4 },
      volume_reduction_pct: { min: 20, max: 30 },
      has_formal_deload: true,
      notes: 'Not rigidly prescribed in research. Common practice: 3:1 or 4:1 loading. Zone 3 drops to 1 session/week during deload. Distribution still follows polarized split.',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 48, max: 72 },
      notes: 'Zone 3 sessions never consecutive. Zone 1 day always follows Zone 3 day. Doubles always Zone 1 for second session.',
    },

    progression_model: 'distribution_maintenance',

    sessions_per_week: { min: 5, max: 7 },

    phase_structure: [
      { name: 'General Prep', duration_weeks: { min: 4, max: 8 }, primary_focus: 'Volume building, 2 Zone 3 sessions/week', notes: 'Z1/Z2/Z3 split: 85/5/10' },
      { name: 'Specific Prep', duration_weeks: { min: 8, max: 12 }, primary_focus: '2-3 Zone 3 sessions/week, race-specific intervals', notes: 'Z1/Z2/Z3 split: 80/5/15' },
      { name: 'Competition', duration_weeks: { min: 4, max: 8 }, primary_focus: '2-3 Zone 3 sessions/week, race-specific intervals', notes: 'Z1/Z2/Z3 split: 75/5/20' },
      { name: 'Transition', duration_weeks: { min: 2, max: 4 }, primary_focus: 'Recovery, reduced volume, 1 Zone 3/week', notes: 'Z1/Z2/Z3 split: 90/5/5' },
    ],

    typical_macrocycle_weeks: { min: 20, max: 32 },

    primary_markers: [
      { id: 'pol_zone2_avoidance', description: 'Zone 2 (threshold/tempo) accounts for less than 5% of total training', weight: 35, detectionHint: 'Count sessions at 80-88% HRmax or threshold effort. Must be <5% of total sessions.' },
      { id: 'pol_80_20_split',     description: '75-85% Zone 1 (easy) + 15-20% Zone 3 (hard), with virtually nothing between', weight: 25, detectionHint: 'Calculate the percentage distribution across 3 zones. Should show bimodal distribution.' },
      { id: 'pol_year_round_hard', description: 'High-intensity Zone 3 sessions present in ALL phases (never eliminated)', weight: 20, detectionHint: 'Every phase/block of the program includes at least 1-2 Zone 3 sessions per week.' },
    ],

    secondary_markers: [
      { id: 'pol_three_zone_model', description: 'Uses 3-zone intensity model (not 5 or 7 zones)', weight: 12, detectionHint: 'Program references Zone 1/2/3 or VT1/VT2 demarcation rather than 5+ pace zones.' },
      { id: 'pol_consistent_hard',  description: '2-3 high-intensity sessions per week consistently across all phases', weight: 10, detectionHint: 'Weekly hard session count stays at 2-3 regardless of training phase.' },
      { id: 'pol_no_tempo',         description: 'No "tempo runs" prescribed (they fall in forbidden Zone 2)', weight: 10, detectionHint: 'No sessions labeled "tempo" at 80-88% HRmax or marathon/half-marathon pace.' },
      { id: 'pol_minimal_periodization', description: 'Intensity distribution barely changes across phases', weight: 8, detectionHint: 'The 80/20 split remains relatively constant throughout the entire program.' },
    ],

    exclusion_rules: [
      { id: 'pol_ex_zone2_heavy',     description: 'More than 10% of sessions in Zone 2 (threshold/tempo)', penalty: -100, detectionHint: 'If >10% of sessions target 80-88% HRmax or threshold.' },
      { id: 'pol_ex_regular_tempo',   description: 'Regular weekly tempo runs at threshold effort', penalty: -80, detectionHint: 'Tempo runs at 80-88% HRmax appearing as a regular weekly session.' },
      { id: 'pol_ex_no_hard_phase',   description: 'A multi-week phase with zero high-intensity sessions (Lydiard base pattern)', penalty: -80, detectionHint: 'Any period of 4+ weeks with no Zone 3 sessions.' },
      { id: 'pol_ex_bell_curve',      description: 'Intensity distribution shows a bell curve (most training moderate)', penalty: -80, detectionHint: 'If the most common intensity zone is the middle zone.' },
      { id: 'pol_ex_too_many_hard',   description: 'More than 3 Zone 3 sessions per week regularly', penalty: -50, detectionHint: 'Regularly exceeding 3 hard sessions per week.' },
    ],

    ai_guardrails: {
      must: [
        'Maintain 75-85% of training in Zone 1 (below VT1)',
        'Include 2-3 Zone 3 sessions per week (above VT2)',
        'Keep Zone 2 (threshold) below 5% of total training',
        'Place Zone 1 recovery days between all Zone 3 sessions',
        'Maintain polarized distribution year-round (minimal phase changes)',
        'Use 3-zone intensity model based on VT1/VT2',
      ],
      must_not: [
        'Program tempo runs at threshold/Zone 2 intensity (80-88% HRmax)',
        'Allow Zone 2 work to exceed 5% of total training',
        'Eliminate Zone 3 sessions for more than 1 week (not even in base building)',
        'Schedule Zone 3 sessions on consecutive days',
        'Create a bell-curve intensity distribution',
        'Use a 5+ zone intensity model (stick to 3 zones)',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Does the program avoid the threshold/tempo intensity zone?',
        'Is training split into mostly easy and some very hard, with little in between?',
        'Are high-intensity sessions present throughout the entire program?',
      ],
      medium_confidence: [
        'Is the Zone 2/threshold training volume below 5% of total training?',
        'Are there consistently 2-3 hard sessions per week?',
        'Does the easy/hard split approximate 80/20?',
      ],
      high_confidence: [
        'Confirm: threshold/Zone 2 work is less than 5% of total volume',
        'Confirm: Zone 3 sessions are present in every phase of the program',
        'Confirm: the distribution barely changes across training phases',
      ],
    },

    keyword_signals: [
      'polarized', '80/20', 'zone 1', 'zone 3', 'VT1', 'VT2',
      'ventilatory threshold', 'below VT1', 'above VT2', 'seiler',
      'avoid threshold', 'avoid zone 2', 'three zone', '3-zone',
      'polarized distribution', 'easy or hard',
    ],

    common_variations: [
      'Pure Seiler Polarized: Strict <5% Zone 2, HR/lactate monitoring',
      'Pyramidal (near-polarized): Zone 2 rises to 10-15% (Z1 > Z2 > Z3)',
      'Time-crunched polarized: 4-5 sessions/week, maintaining 80/20 ratio',
      'Triathlon polarized: Each discipline follows 80/20 independently',
    ],
  },


  // ──────────────────────────────────────────
  // 4. NORWEGIAN METHOD (DOUBLE THRESHOLD)
  // ──────────────────────────────────────────
  {
    id: 'norwegian',
    name: 'Norwegian Method (Double Threshold)',
    shortName: 'Norwegian',
    creator: 'Olympiatoppen / Gjert Ingebrigtsen',
    domains: ['distance_running', 'endurance_general'],
    primarySource: 'Norwegian Olympic Training Center research, Casado et al. (2023)',

    intensity_distribution: {
      high:   { min: 5,  max: 15 },  // >LT2, >4 mmol/L (VO2max)
      medium: { min: 25, max: 35 },  // LT1-LT2, 2-4 mmol/L (THRESHOLD -- the target zone)
      low:    { min: 55, max: 65 },  // <LT1, <2 mmol/L (easy)
    },

    session_type_mix: {
      threshold:     { min: 3, max: 5 },  // LT1-LT2 intervals (5-6 x 6 min at ~4 mmol/L)
      easy_run:      { min: 5, max: 8 },  // <LT1 easy aerobic
      vo2max:        { min: 0, max: 1 },  // >LT2 intervals (rare, 0-1/week)
      long_run:      { min: 1, max: 1 },  // 80-100 min aerobic
    },

    volume_intensity_relationship: 'additive',

    deload_pattern: {
      frequency_weeks:    { min: 2, max: 3 },
      volume_reduction_pct: { min: 20, max: 30 },
      has_formal_deload: true,
      notes: 'Deload every 2-3 weeks (2:1 or 3:1). Lactate monitoring guides timing -- if threshold lactate drifts up, deload regardless of schedule. Threshold sessions drop from 4-5 to 2-3/week during deload but are never eliminated.',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 12, max: 24 },
      notes: 'Between THRESHOLD sessions: as little as 12-24 hours (the "double threshold" concept). Double threshold days: AM + PM separated by 6-8 hours. Between VO2max sessions: 48-72 hours. Rest days: 0-1/week.',
    },

    progression_model: 'lactate_guided',

    sessions_per_week: { min: 10, max: 14 },  // doubles nearly every day

    phase_structure: [
      { name: 'Base / Foundation', duration_weeks: { min: 6, max: 10 }, primary_focus: '3-4 threshold sessions/week (shorter intervals)', notes: '0-1 VO2max session/week. Building threshold volume.' },
      { name: 'Build / Development', duration_weeks: { min: 8, max: 12 }, primary_focus: '4-5 threshold sessions/week (longer intervals, higher volume)', notes: '1 VO2max session/week.' },
      { name: 'Specific / Pre-Competition', duration_weeks: { min: 4, max: 6 }, primary_focus: '3-4 threshold sessions/week + race-specific intensities', notes: '1-2 VO2max sessions/week.' },
      { name: 'Competition / Peaking', duration_weeks: { min: 2, max: 4 }, primary_focus: '2-3 threshold sessions/week (reduced volume, maintained intensity)', notes: '1 VO2max session/week.' },
    ],

    typical_macrocycle_weeks: { min: 22, max: 32 },

    primary_markers: [
      { id: 'nor_double_threshold', description: 'Double threshold days (2 threshold sessions in one day: AM + PM)', weight: 35, detectionHint: 'Look for days with two sessions both at threshold intensity, separated by 6-8 hours.' },
      { id: 'nor_threshold_volume', description: '25-35% of total training at threshold intensity (5-7x more than Polarized)', weight: 30, detectionHint: 'Calculate % of sessions/volume at threshold (80-88% HRmax or LT1-LT2). Should be 25-35%.' },
      { id: 'nor_lactate_guided',   description: 'Sessions prescribed by blood lactate targets (e.g., "6 x 6 min at 3.5-4.0 mmol/L")', weight: 20, detectionHint: 'Look for lactate references: "mmol/L", "blood lactate", "LT1", "LT2", "lactate threshold".' },
    ],

    secondary_markers: [
      { id: 'nor_high_frequency',     description: '10-14 sessions per week (doubles nearly every day)', weight: 12, detectionHint: 'Count total sessions per week. Norwegian typically 10-14.' },
      { id: 'nor_low_vo2max',         description: 'Very low VO2max session frequency (0-1/week despite being for middle-distance)', weight: 10, detectionHint: 'VO2max/interval sessions at >90% HRmax limited to 0-1 per week.' },
      { id: 'nor_threshold_never_zero', description: 'Threshold sessions present in every phase year-round', weight: 10, detectionHint: 'No period of 2+ weeks without threshold sessions.' },
      { id: 'nor_short_recovery_ok',  description: 'Only 12-24 hours between threshold sessions (other methods require 48+)', weight: 10, detectionHint: 'Consecutive days both contain threshold work, or same day has two threshold sessions.' },
    ],

    exclusion_rules: [
      { id: 'nor_ex_few_threshold', description: 'Fewer than 3 threshold sessions per week', penalty: -100, detectionHint: 'If threshold sessions per week < 3 consistently.' },
      { id: 'nor_ex_no_doubles',    description: 'No double-session days exist in the program', penalty: -80, detectionHint: 'If no days have 2 sessions.' },
      { id: 'nor_ex_low_threshold', description: 'Threshold work is less than 20% of total volume', penalty: -80, detectionHint: 'If threshold sessions are <20% of all sessions/volume.' },
      { id: 'nor_ex_many_vo2max',   description: 'More than 2 VO2max sessions per week', penalty: -60, detectionHint: 'If VO2max/high-intensity sessions exceed 2/week regularly.' },
      { id: 'nor_ex_no_lactate',    description: 'No lactate references in the program', penalty: -40, detectionHint: 'No mention of "mmol/L", "blood lactate", "LT1", "LT2".' },
      { id: 'nor_ex_low_frequency', description: 'Fewer than 8 sessions per week', penalty: -60, detectionHint: 'Total weekly sessions < 8.' },
      { id: 'nor_ex_threshold_gap', description: 'A multi-week period with zero threshold work', penalty: -80, detectionHint: 'Any stretch of 2+ weeks without threshold sessions.' },
    ],

    ai_guardrails: {
      must: [
        'Include 3-5 threshold sessions per week at LT1-LT2 (2-4 mmol/L)',
        'Program double threshold days (AM + PM threshold sessions)',
        'Keep total sessions at 10-14 per week with doubles',
        'Use lactate-based intensity prescription when possible',
        'Maintain threshold work in ALL phases (never eliminate it)',
        'Limit VO2max sessions to 0-1 per week',
        'Include easy recovery runs between threshold days',
      ],
      must_not: [
        'Reduce threshold sessions below 3 per week',
        'Eliminate threshold work for more than 1 week',
        'Program more than 2 VO2max sessions per week',
        'Schedule fewer than 10 sessions per week (for elite version)',
        'Avoid the threshold zone (that would be Polarized, not Norwegian)',
        'Require 48+ hours between threshold sessions (Norwegian tolerates 12-24 hours)',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Does the program emphasize threshold/lactate threshold training as the primary hard session type?',
        'Are there double-session training days?',
        'Is training frequency 10+ sessions per week?',
      ],
      medium_confidence: [
        'Do threshold sessions constitute 25-35% of total training volume?',
        'Are there double-threshold days (two threshold sessions in one day)?',
        'Are lactate values or references used to prescribe intensity?',
      ],
      high_confidence: [
        'Confirm: 3-5 threshold sessions per week in all phases',
        'Confirm: double-threshold days exist (AM + PM threshold on same day)',
        'Confirm: VO2max sessions are limited to 0-1 per week',
      ],
    },

    keyword_signals: [
      'norwegian method', 'double threshold', 'threshold training',
      'lactate threshold', 'LT1', 'LT2', 'mmol/L', 'blood lactate',
      'lactate guided', 'ingebrigtsen', 'olympiatoppen',
      'threshold intervals', 'double session', 'AM/PM threshold',
    ],

    common_variations: [
      'Pure Norwegian (Ingebrigtsen): 4-5 double-threshold days/week, 160-180 km/week, lactate monitoring',
      'Adapted Norwegian (recreational): 2-3 threshold sessions/week (no doubles), pace-based',
      'Norwegian-Polarized hybrid: 3 threshold + 1 VO2max per week, easy days strict Zone 1',
      'Marathon Norwegian: 20-40 min continuous threshold instead of intervals',
    ],
  },


  // ──────────────────────────────────────────
  // 5. BLOCK PERIODIZATION (ISSURIN)
  // ──────────────────────────────────────────
  {
    id: 'block_periodization',
    name: 'Block Periodization (Issurin/Verkhoshansky)',
    shortName: 'Block',
    creator: 'Vladimir Issurin / Yuri Verkhoshansky',
    domains: ['strength_power', 'sprint_power', 'team_sport', 'endurance_general'],
    primarySource: 'Block Periodization (Issurin, 2008/2019), Supertraining (Verkhoshansky & Siff)',

    intensity_distribution: {
      // Average across the full A-T-R cycle
      high:   { min: 25, max: 40 },
      medium: { min: 30, max: 40 },
      low:    { min: 25, max: 40 },
    },

    session_type_mix: {
      hypertrophy:    { min: 0, max: 5 },  // Accumulation: 3-5/week; Transmutation: 0-1
      max_strength:   { min: 0, max: 5 },  // Accumulation: 0-1; Transmutation: 3-5/week
      power_speed:    { min: 0, max: 4 },  // Realization: 2-4/week
      maintenance:    { min: 1, max: 2 },  // Non-targeted qualities maintained at minimal dose
    },

    volume_intensity_relationship: 'inverse',

    deload_pattern: {
      frequency_weeks:    { min: 6, max: 10 },  // Built into A-T-R structure
      volume_reduction_pct: { min: 30, max: 50 },
      has_formal_deload: false,
      notes: 'Realization block IS the deload/taper. Between A-T-R cycles: 3-5 transition days. No deload within individual 2-4 week blocks (too short).',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 48, max: 96 },
      notes: 'Accumulation: 24-48hr (moderate intensity). Transmutation: 48-72hr. Realization: 72-96hr between maximal sessions. Between blocks: 2-5 transition days.',
    },

    progression_model: 'concentrated_sequential',

    sessions_per_week: { min: 3, max: 5 },

    phase_structure: [
      { name: 'Accumulation', duration_weeks: { min: 2, max: 4 }, primary_focus: 'Hypertrophy / Work Capacity (1 dominant quality)', rep_range: '8-15 reps', intensity_pct: { min: 60, max: 75 }, notes: 'HIGH volume, LOW-MODERATE intensity. 1-2 maintenance sessions for other qualities.' },
      { name: 'Transmutation', duration_weeks: { min: 2, max: 4 }, primary_focus: 'Max Strength (concentrated load)', rep_range: '3-6 reps', intensity_pct: { min: 80, max: 92 }, notes: 'MODERATE volume, HIGH intensity. 1 maintenance session for aerobic/hypertrophy.' },
      { name: 'Realization', duration_weeks: { min: 1, max: 2 }, primary_focus: 'Power / Speed / Competition expression', rep_range: '1-3 reps', intensity_pct: { min: 90, max: 100 }, notes: 'LOW volume, VERY HIGH intensity. Competition simulation.' },
      { name: 'Transition', duration_weeks: { min: 0, max: 1 }, primary_focus: 'Recovery between A-T-R cycles', rep_range: 'Unstructured', notes: '3-5 days of active recovery.' },
    ],

    typical_macrocycle_weeks: { min: 8, max: 20 },

    primary_markers: [
      { id: 'blk_atr_sequence',     description: 'Accumulation-Transmutation-Realization (A-T-R) block sequence', weight: 35, detectionHint: 'Look for 3 sequential blocks with clear shift: hypertrophy/volume -> strength -> power/peaking. Block names or rep ranges should show this sequence.' },
      { id: 'blk_short_blocks',     description: '2-4 week blocks (shorter than linear periodization 4-6 week phases)', weight: 20, detectionHint: 'Phase/block duration of 2-4 weeks. Not 4-6 weeks (linear) or 1 week (DUP).' },
      { id: 'blk_one_quality',      description: 'Each block has ONE dominant training quality (not multiple like DUP)', weight: 25, detectionHint: 'Within any given 2-4 week block, 60-80% of sessions target the same quality (hypertrophy OR strength OR power).' },
      { id: 'blk_abrupt_shifts',    description: 'Dramatic shifts at block boundaries (Week 4: hypertrophy -> Week 5: strength)', weight: 15, detectionHint: 'Rep ranges or intensity change sharply between blocks, not gradually week-by-week.' },
    ],

    secondary_markers: [
      { id: 'blk_maintenance',     description: 'Maintenance sessions for non-targeted qualities (1-2/week at minimal dose)', weight: 12, detectionHint: 'During a strength block, 1-2 sessions still target hypertrophy or aerobic capacity at reduced volume.' },
      { id: 'blk_residual_aware',  description: 'Block sequencing considers residual training effects', weight: 8, detectionHint: 'Quality trained last (closest to competition) has shortest residual. Speed/power near competition.' },
      { id: 'blk_multiple_cycles', description: 'Multiple A-T-R cycles within a macrocycle (2-4)', weight: 10, detectionHint: 'The A-T-R sequence repeats 2-4 times in the full program.' },
    ],

    exclusion_rules: [
      { id: 'blk_ex_all_equal',    description: 'All training qualities trained equally in every week', penalty: -100, detectionHint: 'If every week has similar amounts of hypertrophy, strength, and power work (that is DUP).' },
      { id: 'blk_ex_long_blocks',  description: 'Blocks longer than 6 weeks', penalty: -80, detectionHint: 'If any single-quality block exceeds 6 weeks.' },
      { id: 'blk_ex_gradual',      description: 'Volume and intensity change gradually week-by-week (linear periodization)', penalty: -80, detectionHint: 'If reps decrease by 1-2 each week across the program (not in block jumps).' },
      { id: 'blk_ex_constant_reps', description: 'Rep ranges stay constant across the entire program', penalty: -60, detectionHint: 'Same rep range used in weeks 1, 4, 8, 12.' },
      { id: 'blk_ex_no_shift',     description: 'No identifiable shift in dominant training quality between phases', penalty: -80, detectionHint: 'Training focus appears the same throughout.' },
      { id: 'blk_ex_too_many_qualities', description: 'A single block trains more than 3 primary qualities simultaneously', penalty: -60, detectionHint: 'A 2-4 week block has heavy hypertrophy, max strength, speed, AND plyometrics all as primary focuses.' },
    ],

    ai_guardrails: {
      must: [
        'Organize training into A-T-R blocks of 2-4 weeks each',
        'Focus each block on ONE primary training quality (concentrated load)',
        'Include 1-2 maintenance sessions per week for non-targeted qualities',
        'Create dramatic shifts at block boundaries (rep ranges, intensity)',
        'Follow volume-first, intensity-later logic within each A-T-R cycle',
        'Sequence blocks so shortest-residual qualities are closest to competition',
      ],
      must_not: [
        'Train all qualities equally in every week (that is DUP)',
        'Make blocks longer than 4 weeks (5-6 weeks is linear territory)',
        'Gradually shift volume/intensity week-by-week (that is linear)',
        'Keep rep ranges constant across blocks',
        'Focus on more than 2 primary qualities within a single block',
        'Skip maintenance of previously developed qualities',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Does the program have distinct multi-week blocks with different training focuses?',
        'Do rep ranges change between blocks (not just between individual sessions)?',
        'Are blocks 2-4 weeks long?',
      ],
      medium_confidence: [
        'Is there an Accumulation -> Transmutation -> Realization sequence?',
        'Does each block focus on one primary quality with maintenance of others?',
        'Are there dramatic shifts in intensity/volume at block boundaries?',
      ],
      high_confidence: [
        'Confirm: clear A-T-R block sequence with 2-4 week block durations',
        'Confirm: each block has one dominant quality (60-80% of sessions)',
        'Confirm: rep ranges shift abruptly between blocks (e.g., 10s -> 4s -> 2s)',
      ],
    },

    keyword_signals: [
      'block periodization', 'accumulation', 'transmutation', 'realization',
      'concentrated loading', 'residual training effect', 'issurin', 'verkhoshansky',
      'sequential loading', 'training block', 'mesocycle block', 'block sequence',
      'targeted ability', 'concentrated load',
    ],

    common_variations: [
      'Pure Issurin Block: Strict A-T-R, 2-3 week blocks, minimal maintenance',
      'Modified Block (Bompa-style): Longer blocks (3-5 weeks), more gradual transitions',
      'Conjugate Block (Bondarchuk): Rotating emphasis, not strict single-quality focus',
      'Endurance Block: Accumulation=aerobic, Transmutation=threshold, Realization=race-specific',
      'Team Sport Block: Blocks aligned with competitive calendar, shortened in-season',
    ],
  },


  // ──────────────────────────────────────────
  // 6. LINEAR PERIODIZATION (MATVEYEV)
  // ──────────────────────────────────────────
  {
    id: 'linear_periodization',
    name: 'Linear Periodization (Matveyev/Bompa)',
    shortName: 'Linear',
    creator: 'Lev Matveyev / Tudor Bompa',
    domains: ['strength_power', 'general_fitness', 'team_sport'],
    primarySource: 'Fundamentals of Sports Training (Matveyev, 1981), Periodization (Bompa)',

    intensity_distribution: {
      // Average across the full macrocycle
      high:   { min: 15, max: 30 },
      medium: { min: 30, max: 45 },
      low:    { min: 30, max: 50 },
    },

    session_type_mix: {
      hypertrophy:   { min: 0, max: 5 },  // Phase 1: 4-5/week; later: 0
      strength:      { min: 0, max: 5 },  // Phase 2: 4-5/week
      power:         { min: 0, max: 4 },  // Phase 3: 3-4/week
      peaking:       { min: 0, max: 3 },  // Phase 4: 2-3/week
    },

    volume_intensity_relationship: 'inverse',

    deload_pattern: {
      frequency_weeks:    { min: 4, max: 6 },  // End of each mesocycle
      volume_reduction_pct: { min: 30, max: 50 },
      has_formal_deload: true,
      notes: 'Standard 3:1 or 4:1 loading:deload ratio. 1-week deload at end of each 4-6 week mesocycle. Intensity maintained or slightly reduced during deload.',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 24, max: 96 },
      notes: 'Hypertrophy phase: 24-48hr. Strength phase: 48-72hr. Power/Peaking: 72-96hr. Recovery spacing increases as intensity increases across phases.',
    },

    progression_model: 'unidirectional_linear',

    sessions_per_week: { min: 3, max: 5 },

    phase_structure: [
      { name: 'Anatomical Adaptation', duration_weeks: { min: 2, max: 4 }, primary_focus: 'Movement patterns, conditioning', rep_range: '12-15 reps', intensity_pct: { min: 50, max: 65 }, notes: '15-20 sets/session.' },
      { name: 'Hypertrophy', duration_weeks: { min: 4, max: 6 }, primary_focus: 'Muscle cross-section, work capacity', rep_range: '8-12 reps', intensity_pct: { min: 65, max: 78 }, notes: '16-25 sets/session. 60-90 sec rest.' },
      { name: 'Basic Strength', duration_weeks: { min: 4, max: 6 }, primary_focus: 'Neural drive, max strength', rep_range: '4-6 reps', intensity_pct: { min: 78, max: 88 }, notes: '12-18 sets/session. 2-3 min rest.' },
      { name: 'Strength-Power', duration_weeks: { min: 3, max: 4 }, primary_focus: 'Rate of force development', rep_range: '2-4 reps', intensity_pct: { min: 85, max: 93 }, notes: '9-15 sets/session. 3-5 min rest.' },
      { name: 'Peaking/Competition', duration_weeks: { min: 2, max: 3 }, primary_focus: 'Competition performance', rep_range: '1-3 reps', intensity_pct: { min: 93, max: 100 }, notes: '5-9 sets/session. 5+ min rest.' },
      { name: 'Transition/Active Rest', duration_weeks: { min: 2, max: 4 }, primary_focus: 'Recovery', rep_range: 'Unstructured', notes: 'Minimal training.' },
    ],

    typical_macrocycle_weeks: { min: 16, max: 24 },

    primary_markers: [
      { id: 'lin_monotonic_decrease', description: 'Monotonic decrease in reps AND monotonic increase in intensity across the program', weight: 35, detectionHint: 'Plot average reps per week across the program. Should show a consistent downward trend. Plot average intensity -- consistent upward trend.' },
      { id: 'lin_one_rep_per_phase',  description: 'Each phase uses ONE primary rep range (8-12, then 4-6, then 2-4, then 1-3)', weight: 25, detectionHint: 'Within any phase, >80% of sets use the same rep range. Different phases use different rep ranges.' },
      { id: 'lin_no_returning',       description: 'Rep ranges never increase once they start decreasing (no cycling back)', weight: 20, detectionHint: 'Once the program moves from 10s to 5s, it never returns to 10s.' },
      { id: 'lin_four_phase',         description: 'Hypertrophy -> Strength -> Power -> Peaking 4-phase sequence', weight: 15, detectionHint: 'Phase names or rep ranges follow this specific 4-phase sequence.' },
    ],

    secondary_markers: [
      { id: 'lin_4_6_week_phases',  description: 'Phase durations of 4-6 weeks (longer than Block\'s 2-4)', weight: 10, detectionHint: 'Each training phase lasts 4-6 weeks.' },
      { id: 'lin_general_to_specific', description: 'Exercise selection moves from general to competition-specific', weight: 8, detectionHint: 'Early phases use more varied/general exercises; later phases focus on competition lifts.' },
      { id: 'lin_formal_deload',    description: 'Formalized deload weeks every 4-6 weeks', weight: 8, detectionHint: 'Explicit deload/recovery weeks at regular intervals.' },
      { id: 'lin_gradual_change',   description: 'Changes are gradual (2-3% load increase per week), not abrupt', weight: 8, detectionHint: 'Week-to-week intensity increases are small and consistent within phases.' },
    ],

    exclusion_rules: [
      { id: 'lin_ex_mixed_reps',     description: 'Multiple rep ranges in the same week (e.g., 12s AND 3s)', penalty: -100, detectionHint: 'If a single week has main work at both 10+ reps and 3-5 reps.' },
      { id: 'lin_ex_reps_increase',  description: 'Rep ranges increase at any point (going from 5 reps back to 10)', penalty: -100, detectionHint: 'If average reps per week increase after having decreased.' },
      { id: 'lin_ex_short_phases',   description: 'Blocks shorter than 3 weeks', penalty: -60, detectionHint: 'Any phase lasting less than 3 weeks.' },
      { id: 'lin_ex_intensity_drops', description: 'Intensity decreases at any point (except deload weeks)', penalty: -60, detectionHint: 'If average intensity drops in a non-deload week.' },
      { id: 'lin_ex_vol_increases_late', description: 'Volume increases in the second half of the program', penalty: -60, detectionHint: 'If total sets/session increase after the midpoint.' },
      { id: 'lin_ex_cycles_back',    description: 'Program cycles back to high-volume after peaking', penalty: -80, detectionHint: 'If high-rep (10+) work reappears after a peaking/low-rep phase.' },
      { id: 'lin_ex_simultaneous',   description: 'Multiple training qualities emphasized simultaneously within a week', penalty: -60, detectionHint: 'If a single week has sessions targeting both hypertrophy and power as primary focuses.' },
    ],

    ai_guardrails: {
      must: [
        'Decrease rep ranges monotonically across the program (12 -> 8 -> 5 -> 3 -> 1)',
        'Increase intensity monotonically across the program (60% -> 75% -> 85% -> 93% -> 100%)',
        'Use ONE primary rep range per phase',
        'Follow Hypertrophy -> Strength -> Power -> Peaking phase sequence',
        'Make phases 4-6 weeks long',
        'Include formalized deload weeks every 4-6 weeks',
        'Progress from general to specific exercise selection',
      ],
      must_not: [
        'Use multiple rep ranges in the same week (each week has one focus)',
        'Return to higher rep ranges after progressing to lower ones',
        'Increase volume in the second half of the macrocycle',
        'Create phases shorter than 3 weeks (that is block periodization)',
        'Simultaneously emphasize multiple training qualities in one week',
        'Allow intensity to decrease (except during planned deloads)',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Do rep ranges decrease across the program from high to low?',
        'Are there distinct multi-week phases with different rep ranges?',
        'Does intensity increase as the program progresses?',
      ],
      medium_confidence: [
        'Does the program follow a Hypertrophy -> Strength -> Power -> Peaking sequence?',
        'Is there only one primary rep range per phase?',
        'Are phases 4-6 weeks long?',
      ],
      high_confidence: [
        'Confirm: reps decrease monotonically and never return to previous levels',
        'Confirm: intensity increases monotonically across the program',
        'Confirm: no week has multiple primary rep ranges (all hypertrophy OR all strength, etc.)',
      ],
    },

    keyword_signals: [
      'linear periodization', 'classical periodization', 'traditional periodization',
      'matveyev', 'bompa', 'hypertrophy phase', 'strength phase', 'peaking phase',
      'power phase', 'anatomical adaptation', 'general preparation',
      'specific preparation', 'competition phase', 'transition phase',
    ],

    common_variations: [
      'Pure Matveyev Linear: Strictly unidirectional, one rep range per phase',
      'Bompa Linear: Adds anatomical adaptation phase, slightly more flexible',
      'Reverse Linear: High intensity -> low intensity (for hypertrophy endpoints)',
      'Modified Linear: Heavy/medium/light days within each phase, but phases still progress linearly',
      'Double/Triple Periodization: 2-3 compressed macrocycles per year',
    ],
  },


  // ──────────────────────────────────────────
  // 7. DAILY UNDULATING PERIODIZATION (DUP)
  // ──────────────────────────────────────────
  {
    id: 'dup',
    name: 'Daily Undulating Periodization',
    shortName: 'DUP',
    creator: 'Poliquin / Kraemer / Zourdos',
    domains: ['strength_power', 'powerlifting', 'general_fitness'],
    primarySource: 'Harries et al. (2015) Systematic Review, Zourdos/Schoenfeld research',

    intensity_distribution: {
      high:   { min: 25, max: 35 },  // Power day: 88-95% (within each week)
      medium: { min: 30, max: 40 },  // Strength day: 80-88%
      low:    { min: 25, max: 40 },  // Hypertrophy day: 65-75%
    },

    session_type_mix: {
      hypertrophy_day: { min: 1, max: 2 },  // 8-12 reps at 65-75%
      strength_day:    { min: 1, max: 2 },  // 3-5 reps at 80-88%
      power_day:       { min: 1, max: 1 },  // 1-3 reps at 88-95%
    },

    volume_intensity_relationship: 'daily_inverse',

    deload_pattern: {
      frequency_weeks:    { min: 4, max: 6 },
      volume_reduction_pct: { min: 40, max: 50 },
      has_formal_deload: true,
      notes: 'Every 4-6 weeks. Maintains undulating structure during deload (still H/S/P days, all at reduced loads). Some programs autoregulate via RPE.',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 48, max: 72 },
      notes: 'Between sessions for same muscle group: 48-72 hours. Rest days: 1-3/week. Because intensity varies daily, CNS fatigue is naturally distributed.',
    },

    progression_model: 'multi_variable_micro',

    sessions_per_week: { min: 3, max: 4 },

    phase_structure: [
      { name: 'Introductory', duration_weeks: { min: 1, max: 2 }, primary_focus: 'Conservative loads, H/S/P split at reduced intensity', rep_range: '3-12 reps (all types, reduced load)', notes: 'Same weekly structure, lighter weights.' },
      { name: 'Accumulation', duration_weeks: { min: 4, max: 6 }, primary_focus: 'Progressive overload within H/S/P structure', rep_range: '3-12 reps (undulating daily)', notes: 'Loads increase session-to-session within each day type.' },
      { name: 'Deload', duration_weeks: { min: 1, max: 1 }, primary_focus: 'Volume/intensity reduction', rep_range: '3-12 reps at 50-60% recent loads', notes: 'Same H/S/P structure, dramatically reduced loads.' },
      { name: 'Intensification', duration_weeks: { min: 4, max: 6 }, primary_focus: 'Higher baseline loads', rep_range: '3-12 reps (all types, higher starting point)', notes: 'Same structure, heavier baseline.' },
    ],

    typical_macrocycle_weeks: { min: 10, max: 16 },

    primary_markers: [
      { id: 'dup_same_lift_diff_reps', description: 'Same lifts trained at different rep ranges within the same week', weight: 35, detectionHint: 'Look for the same exercise (e.g., squat) appearing 2-3 times in one week at different rep ranges (10s, 5s, 3s).' },
      { id: 'dup_weekly_diversity',    description: 'Every week contains hypertrophy (8-12), strength (3-5), AND power (1-3) rep ranges', weight: 25, detectionHint: 'Each week has at least 3 different rep range categories across sessions.' },
      { id: 'dup_no_phases',           description: 'No distinct multi-week phases -- same H/S/P structure repeats weekly', weight: 20, detectionHint: 'The weekly structure (rep range mix) remains essentially the same across the entire program.' },
      { id: 'dup_high_lift_frequency', description: 'Each main lift trained 2-3x per week at different parameters', weight: 15, detectionHint: 'Main compound lifts appear 2-3 times per week in different sessions.' },
    ],

    secondary_markers: [
      { id: 'dup_stable_volume',    description: 'Total weekly volume relatively stable (not decreasing over time)', weight: 10, detectionHint: 'Weekly total sets or volume load stays relatively constant across the program.' },
      { id: 'dup_full_body',        description: 'Full-body or upper/lower sessions (not body-part split)', weight: 10, detectionHint: 'Each session works multiple major movement patterns, not isolated muscle groups.' },
      { id: 'dup_micro_progression', description: 'Small, independent progression per day type (2.5-5 lbs increments)', weight: 8, detectionHint: 'Each day type (H/S/P) tracks its own progression independently.' },
    ],

    exclusion_rules: [
      { id: 'dup_ex_same_reps',     description: 'All sessions in a week use the same rep range', penalty: -100, detectionHint: 'If every session in a week targets the same rep range (all 5x5 or all 3x10).' },
      { id: 'dup_ex_phase_shift',   description: 'Rep ranges change only between multi-week phases', penalty: -100, detectionHint: 'If rep ranges shift at 4-6 week intervals (that is linear periodization).' },
      { id: 'dup_ex_vol_decreases', description: 'Volume decreases monotonically over the program', penalty: -80, detectionHint: 'If weekly total sets steadily decrease across the program.' },
      { id: 'dup_ex_low_frequency', description: 'Only 1 session per week per major lift', penalty: -80, detectionHint: 'If main lifts only appear once per week.' },
      { id: 'dup_ex_body_part',     description: 'Training organized by body parts (chest day, back day)', penalty: -60, detectionHint: 'Sessions named "chest", "back", "legs", "arms" rather than movement-focused.' },
      { id: 'dup_ex_block_focus',   description: 'A clear multi-week block focuses on one quality', penalty: -80, detectionHint: 'If 3+ consecutive weeks are all hypertrophy or all strength focused.' },
      { id: 'dup_ex_exercise_rotation', description: 'Exercise selection changes dramatically between sessions', penalty: -40, detectionHint: 'If different sessions use completely different exercises (same lifts, different parameters is the DUP hallmark).' },
    ],

    ai_guardrails: {
      must: [
        'Train the same main lifts 2-3x per week at different rep ranges',
        'Include hypertrophy (8-12), strength (3-5), AND power (1-3) rep ranges every week',
        'Maintain the same weekly H/S/P structure across the entire program',
        'Keep exercise selection consistent (same lifts, different parameters)',
        'Progress each day type independently with small increments',
        'Use full-body or upper/lower session format',
      ],
      must_not: [
        'Use the same rep range for all sessions in a week',
        'Create distinct multi-week phases with different rep ranges (that is linear)',
        'Reduce volume monotonically across the program',
        'Train each main lift only 1x per week',
        'Use body-part splits (chest day, back day, etc.)',
        'Create multi-week blocks focused on one quality (that is block periodization)',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Are the same lifts trained multiple times per week at different rep ranges?',
        'Does every week include both high-rep and low-rep training?',
        'Is the weekly structure consistent across the program (no phase shifts)?',
      ],
      medium_confidence: [
        'Are there hypertrophy (8-12), strength (3-5), and power (1-3) sessions every week?',
        'Do main lifts appear 2-3x per week at different parameters?',
        'Does weekly total volume stay relatively stable?',
      ],
      high_confidence: [
        'Confirm: same lifts trained at 3 different rep ranges within the same week',
        'Confirm: no distinct multi-week phases (same structure repeats weekly)',
        'Confirm: weekly volume is relatively stable (not monotonically decreasing)',
      ],
    },

    keyword_signals: [
      'DUP', 'daily undulating', 'undulating periodization', 'hypertrophy day',
      'strength day', 'power day', 'H/S/P', 'undulating', 'daily variation',
      'rep range rotation', 'zourdos', 'schoenfeld', 'weekly undulating',
    ],

    common_variations: [
      'Pure DUP (3-day): Mon Hypertrophy, Wed Strength, Fri Power. Full body.',
      '4-day Upper/Lower DUP: Upper/Lower split with H/S rotation',
      'Modified DUP (Zourdos): RPE-based autoregulation (RPE 6-7 hyp, 8-9 strength, 7-8 power)',
      'Weekly Undulating (WUP): Each WEEK has a focus, sessions within week are same type',
      'Powerlifting DUP: Competition lifts with pauses (H), variations (S), competition lifts (P)',
    ],
  },


  // ──────────────────────────────────────────
  // 8. WESTSIDE BARBELL CONJUGATE (SIMMONS)
  // ──────────────────────────────────────────
  {
    id: 'westside_conjugate',
    name: 'Westside Barbell Conjugate System',
    shortName: 'Westside',
    creator: 'Louie Simmons',
    domains: ['powerlifting', 'strength_power'],
    primarySource: 'Westside Barbell Book of Methods (2007), Simmons seminars/articles',

    intensity_distribution: {
      high:   { min: 20, max: 30 },  // ME days: 90-100%+ 1RM (2 sessions/week)
      medium: { min: 20, max: 30 },  // DE days: 50-60% bar + 25-30% AR = ~75-85% total
      low:    { min: 40, max: 60 },  // RE accessories: 60-75% (4 sessions' worth of accessory work)
    },

    session_type_mix: {
      max_effort_upper: { min: 1, max: 1 },   // Work up to 1-3RM on pressing variation
      max_effort_lower: { min: 1, max: 1 },   // Work up to 1-3RM on squat/DL variation
      dynamic_effort_upper: { min: 1, max: 1 }, // 8-9 x 3 at 50-60% + bands/chains
      dynamic_effort_lower: { min: 1, max: 1 }, // 10-12 x 2 at 50-60% + bands/chains
    },

    volume_intensity_relationship: 'concurrent',

    deload_pattern: {
      frequency_weeks:    { min: 0, max: 0 },  // No traditional deload
      volume_reduction_pct: { min: 0, max: 0 },
      has_formal_deload: false,
      notes: 'No traditional deload weeks. Recovery via exercise rotation on ME days (every 1-3 weeks). DE percentages wave in 3-week cycles (50/55/60% + AR). Exercise rotation IS the deload mechanism.',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 72, max: 96 },
      notes: 'ME Upper (Mon) -> ME Lower (Wed) -> DE Upper (Fri) -> DE Lower (Sun). 72hr rotation between ME and DE for same body region. Always 1-2 rest days between training days.',
    },

    progression_model: 'conjugate_rotation',

    sessions_per_week: { min: 4, max: 4 },  // Exactly 4 (almost never varies)

    phase_structure: [
      { name: 'ME Upper (ongoing)', duration_weeks: { min: 1, max: 3 }, primary_focus: 'Work up to 1-3RM on pressing variation, then 3-4 RE accessories', rep_range: '1-3 RM (main) + 6-15 (accessories)', intensity_pct: { min: 90, max: 100 }, notes: 'Exercise rotates every 1-3 weeks: floor press, board press, close-grip, incline, etc.' },
      { name: 'ME Lower (ongoing)', duration_weeks: { min: 1, max: 3 }, primary_focus: 'Work up to 1-3RM on squat/deadlift variation, then 3-4 RE accessories', rep_range: '1-3 RM (main) + 6-15 (accessories)', intensity_pct: { min: 90, max: 100 }, notes: 'Exercise rotates: box squat, rack pull, SSB squat, good morning, etc.' },
      { name: 'DE Upper (3-week wave)', duration_weeks: { min: 3, max: 3 }, primary_focus: 'Bench 8-9 x 3 at 50-60% + bands/chains (30-45s rest), then RE accessories', rep_range: '3 reps x 8-9 sets (main) + 6-15 (accessories)', intensity_pct: { min: 50, max: 60 }, notes: 'Week 1: 50%, Week 2: 55%, Week 3: 60%, then reset with potentially heavier bands.' },
      { name: 'DE Lower (3-week wave)', duration_weeks: { min: 3, max: 3 }, primary_focus: 'Box squat 10-12 x 2 at 50-60% + bands/chains (45-60s rest), then RE accessories', rep_range: '2 reps x 10-12 sets (main) + 6-15 (accessories)', intensity_pct: { min: 50, max: 60 }, notes: 'Same wave as DE Upper.' },
    ],

    typical_macrocycle_weeks: { min: 0, max: 0 },  // No macrocycle -- runs year-round

    primary_markers: [
      { id: 'ws_me_de_dual',        description: 'Max Effort (1-3RM) + Dynamic Effort (50-60% + bands/chains) both present in weekly plan', weight: 35, detectionHint: 'Look for sessions with 1-3RM attempts AND separate sessions with multiple sets of 2-3 reps at 50-60% with bands or chains.' },
      { id: 'ws_accommodating_resistance', description: 'Bands and/or chains used pervasively (present in every DE session)', weight: 25, detectionHint: 'Look for "bands", "chains", "accommodating resistance", "reverse bands" in DE sessions.' },
      { id: 'ws_exercise_rotation',  description: 'ME exercise rotates every 1-3 weeks (exercise itself changes, not just weight)', weight: 20, detectionHint: 'Different exercises appear as the ME movement across weeks (floor press one week, board press next).' },
      { id: 'ws_four_day_structure', description: 'Exactly 4 sessions/week: ME Upper, ME Lower, DE Upper, DE Lower', weight: 15, detectionHint: 'Exactly 4 distinct sessions per week, split into max effort and dynamic effort for upper and lower.' },
    ],

    secondary_markers: [
      { id: 'ws_box_squat',        description: 'Box squat as a staple movement (DE Lower)', weight: 12, detectionHint: 'Box squat appears regularly, especially on dynamic effort lower day.' },
      { id: 'ws_de_sets_reps',     description: 'DE days use 8-12 sets of 2-3 reps with short rest (30-60s)', weight: 10, detectionHint: 'Look for high set count (8-12) with very low reps (2-3) and short rest periods.' },
      { id: 'ws_no_phases',        description: 'No sequential training phases -- all qualities trained every week year-round', weight: 10, detectionHint: 'Same ME+DE structure in every week. No hypertrophy phase -> strength phase transition.' },
      { id: 'ws_weak_point_accessories', description: 'Accessories selected for specific weak points (sticking points)', weight: 8, detectionHint: 'Accessory exercises target specific weak points (triceps for lockout, hamstrings for off-the-floor, etc.).' },
    ],

    exclusion_rules: [
      { id: 'ws_ex_no_maxing',      description: 'No sessions involve working up to 1-3RM', penalty: -100, detectionHint: 'If no sessions have true max effort singles, doubles, or triples.' },
      { id: 'ws_ex_no_speed_work',  description: 'No speed/explosive work at submaximal loads', penalty: -80, detectionHint: 'If no sessions use compensatory acceleration at 50-60%.' },
      { id: 'ws_ex_phases_exist',   description: 'Training has distinct multi-week phases', penalty: -100, detectionHint: 'If the program shifts from hypertrophy phase to strength phase to peaking phase.' },
      { id: 'ws_ex_no_rotation',    description: 'Exercises stay the same for more than 3 weeks on ME days', penalty: -60, detectionHint: 'If the same ME exercise is used for 4+ consecutive weeks.' },
      { id: 'ws_ex_no_ar',          description: 'No bands, chains, or accommodating resistance used', penalty: -60, detectionHint: 'If zero sessions mention bands, chains, or accommodating resistance.' },
      { id: 'ws_ex_body_part_split', description: 'Program follows a body-part split', penalty: -80, detectionHint: 'If sessions are organized as "chest day", "back day", etc.' },
      { id: 'ws_ex_wrong_frequency', description: 'Training is fewer than 4 or more than 5 days per week', penalty: -40, detectionHint: 'If weekly session count is not 4 (or occasionally 5).' },
      { id: 'ws_ex_high_reps_main', description: 'Rep ranges exceed 5 on main lifts (except accessories)', penalty: -60, detectionHint: 'If main compound lifts are programmed for 6+ reps regularly.' },
      { id: 'ws_ex_heavy_de',       description: 'DE days use heavy loads (>70% bar weight) without accommodating resistance', penalty: -40, detectionHint: 'If "speed" or "dynamic" days use >70% bar weight with no bands/chains.' },
    ],

    ai_guardrails: {
      must: [
        'Include Max Effort sessions (work up to 1-3RM) 2x per week (upper + lower)',
        'Include Dynamic Effort sessions (50-60% + bands/chains) 2x per week (upper + lower)',
        'Rotate ME exercise every 1-3 weeks to prevent accommodation',
        'Use accommodating resistance (bands and/or chains) on all DE sessions',
        'Include 3-4 Repetition Effort (RE) accessory exercises per session',
        'Program exactly 4 training days per week',
        'Use 3-week DE percentage waves (50/55/60% + AR)',
        'Include box squats as a staple DE Lower movement',
      ],
      must_not: [
        'Create distinct multi-week phases (no hypertrophy -> strength -> peaking)',
        'Keep the same ME exercise for more than 3 consecutive weeks',
        'Omit bands or chains from DE sessions',
        'Program main lifts above 5 reps (accessories can be 6-15)',
        'Use body-part splits (use ME Upper, ME Lower, DE Upper, DE Lower)',
        'Reduce training to fewer than 4 days per week',
        'Use heavy loads (>70% bar) on DE days without accommodating resistance',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Does the program have both maximal effort (1-3RM) and speed work (50-60% + bands)?',
        'Are bands, chains, or accommodating resistance used?',
        'Is training split into exactly 4 days per week?',
      ],
      medium_confidence: [
        'Is there a Max Effort Upper, Max Effort Lower, Dynamic Effort Upper, Dynamic Effort Lower structure?',
        'Do ME exercises rotate every 1-3 weeks?',
        'Are DE sets 8-12 x 2-3 reps with short rest?',
      ],
      high_confidence: [
        'Confirm: ME + DE dual system with accommodating resistance on all DE sessions',
        'Confirm: exercises rotate every 1-3 weeks on ME days',
        'Confirm: no distinct training phases -- same structure year-round',
      ],
    },

    keyword_signals: [
      'westside', 'conjugate', 'max effort', 'dynamic effort', 'ME', 'DE',
      'accommodating resistance', 'bands', 'chains', 'box squat', 'louie simmons',
      'repetition effort', 'speed work', 'compensatory acceleration',
      'floor press', 'board press', 'rack pull', 'good morning',
      'speed bench', 'speed squat', 'reverse band',
    ],

    common_variations: [
      'Pure Westside: 4-day split exactly as Simmons prescribed, full AR, box squats',
      'Conjugate for Athletes: Adds sport conditioning, Olympic lifts replace DE barbell work',
      'Conjugate without AR: Uses straight weight for DE (loses key marker)',
      'Concurrent/Conjugate hybrid: Adds 5th RE hypertrophy day',
      '5/3/1-Conjugate hybrid: 5/3/1 percentages with Westside accessories and rotation',
    ],
  },


  // ──────────────────────────────────────────
  // 9. 5/3/1 (WENDLER)
  // ──────────────────────────────────────────
  {
    id: 'wendler_531',
    name: '5/3/1 (Jim Wendler)',
    shortName: '5/3/1',
    creator: 'Jim Wendler',
    domains: ['strength_power', 'powerlifting', 'general_fitness'],
    primarySource: '5/3/1 (Wendler, 2011), 5/3/1 Forever (2017), Beyond 5/3/1',

    intensity_distribution: {
      // Based on ACTUAL % of true 1RM (not training max)
      high:   { min: 5,  max: 15 },  // 95% TM = ~81% true max (only Week 3 top set)
      medium: { min: 30, max: 45 },  // 65-85% TM = 55-72% true max (most working sets)
      low:    { min: 40, max: 60 },  // FSL/BBB supplemental + assistance at 50-70% TM
    },

    session_type_mix: {
      squat:    { min: 1, max: 1 },  // One day per main lift
      bench:    { min: 1, max: 1 },
      deadlift: { min: 1, max: 1 },
      ohp:      { min: 1, max: 1 },
    },

    volume_intensity_relationship: 'micro_undulating',

    deload_pattern: {
      frequency_weeks:    { min: 3, max: 7 },  // Every 4th week (3:1) or 7th week protocol
      volume_reduction_pct: { min: 50, max: 65 },
      has_formal_deload: true,
      notes: 'MANDATORY deload every 3rd or 7th week. Deload uses 40/50/60% TM (3 sets of 5). 7th Week Protocol: TM test single at 100% TM. Wendler says never skip deloads.',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 24, max: 72 },
      notes: 'Each main lift trained 1x/week (maximum recovery). 4 sessions in 7 days with 1-2 rest days between. No daily undulation stress. Off-day conditioning (2-3x/week) encouraged.',
    },

    progression_model: 'slow_linear_microload',

    sessions_per_week: { min: 3, max: 4 },

    phase_structure: [
      { name: 'Week 1 (5s Week)', duration_weeks: { min: 1, max: 1 }, primary_focus: '3 working sets: 65% x 5, 75% x 5, 85% x 5+ (of TM)', rep_range: '5+ reps (AMRAP on last set)', intensity_pct: { min: 55, max: 72 }, notes: 'Actual true 1RM: 55/64/72%. AMRAP set is the PR test.' },
      { name: 'Week 2 (3s Week)', duration_weeks: { min: 1, max: 1 }, primary_focus: '3 working sets: 70% x 3, 80% x 3, 85% x 3+ (of TM)', rep_range: '3+ reps (AMRAP on last set)', intensity_pct: { min: 60, max: 72 }, notes: 'Actual true 1RM: 60/68/72%.' },
      { name: 'Week 3 (1s Week)', duration_weeks: { min: 1, max: 1 }, primary_focus: '3 working sets: 75% x 5, 85% x 3, 95% x 1+ (of TM)', rep_range: '1+ reps (AMRAP on last set)', intensity_pct: { min: 64, max: 81 }, notes: 'Actual true 1RM: 64/72/81%. Heaviest set of the cycle.' },
      { name: 'Week 4 (Deload)', duration_weeks: { min: 1, max: 1 }, primary_focus: '3 sets of 5 at 40/50/60% TM', rep_range: '5 reps (no AMRAP)', intensity_pct: { min: 34, max: 51 }, notes: 'Actual true 1RM: 34/43/51%. Mandatory deload.' },
    ],

    typical_macrocycle_weeks: { min: 4, max: 4 },  // Each cycle is 4 weeks, repeating

    primary_markers: [
      { id: '531_percentage_pattern', description: 'The 65/75/85 -> 70/80/85 -> 75/85/95 percentage wave (of training max)', weight: 35, detectionHint: 'Look for the specific percentage sequence across 3 weeks of the cycle. Percentages based on a "training max" (85-90% of true 1RM).' },
      { id: '531_amrap_sets',        description: 'AMRAP "plus" sets -- final set each day is as many reps as possible (5+, 3+, 1+)', weight: 25, detectionHint: 'Look for "+" notation on rep prescriptions (5+, 3+, 1+) or "AMRAP" notes on the last set.' },
      { id: '531_training_max',      description: 'Training Max concept: working off 85-90% of true 1RM (heaviest set only ~81% of actual 1RM)', weight: 20, detectionHint: 'Look for "training max", "TM", or prescriptions that seem conservative relative to true max.' },
      { id: '531_slow_progression',  description: '+5 lbs upper / +10 lbs lower body per 3-4 week cycle', weight: 15, detectionHint: 'Look for specific small increments per cycle (2.5 kg upper, 5 kg lower) or monthly progression rate.' },
    ],

    secondary_markers: [
      { id: '531_four_lifts',       description: 'Exactly 4 main lifts: Squat, Bench, Deadlift, OHP (each 1x/week, no rotation)', weight: 12, detectionHint: 'Program uses exactly these 4 lifts as mains, each appearing 1x/week consistently.' },
      { id: '531_mandatory_deload', description: 'Mandatory deload every 3rd or 7th week (never skipped)', weight: 10, detectionHint: 'Deload weeks appear at regular intervals with no exceptions.' },
      { id: '531_fsl_supplemental', description: 'FSL (First Set Last) supplemental work: 5x5 at first set percentage', weight: 8, detectionHint: 'Look for supplemental sets at the first working set percentage (65-75% TM).' },
      { id: '531_push_pull_legs',   description: 'Push/Pull/Single-Leg-Core assistance template: 25-50 reps each per session', weight: 8, detectionHint: 'Assistance categorized as Push + Pull + Legs/Core with rep targets of 25-50 each.' },
    ],

    exclusion_rules: [
      { id: '531_ex_too_heavy',     description: 'True 1RM percentages regularly exceed 85% (5/3/1 tops at ~81%)', penalty: -100, detectionHint: 'If working sets regularly use 85%+ of actual 1RM.' },
      { id: '531_ex_no_amrap',      description: 'No AMRAP/plus sets in the program', penalty: -100, detectionHint: 'If no sets have "+" or AMRAP notation.' },
      { id: '531_ex_multi_freq',    description: 'Main lifts trained more than 1x per week', penalty: -80, detectionHint: 'If squat, bench, or deadlift appear more than once per week (that is DUP).' },
      { id: '531_ex_exercise_rotation', description: 'Exercise selection rotates frequently', penalty: -60, detectionHint: 'If main lift exercises change from week to week (that is Westside).' },
      { id: '531_ex_no_deload',     description: 'No deload weeks in the program', penalty: -80, detectionHint: 'If no planned deload/recovery weeks exist.' },
      { id: '531_ex_fast_progression', description: 'Progression exceeds 10 lbs per cycle on any lift', penalty: -60, detectionHint: 'If weight increases faster than 5 lbs upper / 10 lbs lower per 3-4 week cycle.' },
      { id: '531_ex_phase_shift',   description: 'Distinct hypertrophy/strength/peaking phases', penalty: -80, detectionHint: 'If rep ranges shift across multi-week phases (that is linear periodization).' },
      { id: '531_ex_too_many_days', description: 'Training more than 4 days per week on main program', penalty: -40, detectionHint: 'If more than 4 main lifting sessions per week.' },
      { id: '531_ex_bands_chains',  description: 'Bands/chains or accommodating resistance central to program', penalty: -60, detectionHint: 'If bands/chains are primary tools (that is Westside).' },
    ],

    ai_guardrails: {
      must: [
        'Use Training Max (85-90% of true 1RM) as the base for all percentages',
        'Follow the 65/75/85 -> 70/80/85 -> 75/85/95 (of TM) percentage wave',
        'Include AMRAP "plus" sets on the last working set of each day',
        'Program mandatory deload every 3rd or 7th week',
        'Use exactly 4 main lifts (Squat, Bench, Deadlift, OHP), each 1x/week',
        'Progress by +5 lbs upper / +10 lbs lower per cycle',
        'Include FSL or similar supplemental work after main sets',
        'Include Push/Pull/Legs-Core assistance (25-50 reps each per session)',
      ],
      must_not: [
        'Use true 1RM for percentage calculations (always use Training Max)',
        'Program working sets above 95% of training max (~81% true 1RM)',
        'Skip deload weeks (they are mandatory)',
        'Train main lifts more than 1x per week',
        'Rotate exercise selection (same 4 lifts throughout)',
        'Progress faster than 5 lbs upper / 10 lbs lower per cycle',
        'Create distinct hypertrophy/strength/peaking phases',
        'Use bands, chains, or accommodating resistance as primary training tools',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Does the program use a Training Max (85-90% of true 1RM)?',
        'Are there "plus" or AMRAP sets at the end of the main work?',
        'Is each main lift trained exactly 1x per week?',
      ],
      medium_confidence: [
        'Do the percentages follow the 65/75/85 -> 70/80/85 -> 75/85/95 pattern (of TM)?',
        'Is there a mandatory deload every 3rd or 7th week?',
        'Is progression limited to +5 lbs upper / +10 lbs lower per cycle?',
      ],
      high_confidence: [
        'Confirm: 65/75/85 -> 70/80/85 -> 75/85/95 percentage pattern of Training Max',
        'Confirm: AMRAP sets on the last working set (5+, 3+, 1+)',
        'Confirm: deload every 3rd or 7th week with 40/50/60% TM',
      ],
    },

    keyword_signals: [
      '5/3/1', '531', 'wendler', 'training max', 'TM', 'AMRAP',
      'boring but big', 'BBB', 'first set last', 'FSL', 'second set last',
      'SSL', 'boring but strong', 'BBS', 'triumvirate',
      'joker sets', 'PR set', 'leader', 'anchor', '7th week protocol',
      'start light progress slow',
    ],

    common_variations: [
      'Original 5/3/1: Main sets + AMRAP only, minimal supplemental',
      'BBB (Boring But Big): 5/3/1 + 5x10 at 50-70% TM for hypertrophy',
      'FSL (First Set Last): 5/3/1 + 5x5 at first working set percentage',
      'BBS (Boring But Strong): 5/3/1 + 10x5 at FSL weight for volume',
      'SSL (Second Set Last): Supplemental at second set weight',
      '5/3/1 for Beginners: 2 main lifts/day, 3 days/week, faster progression',
      'Leaders & Anchors (Forever): Leader cycles (more volume) -> Anchor cycles (more intensity/PRs)',
    ],
  },


  // ──────────────────────────────────────────
  // 10. TRIPHASIC TRAINING (DIETZ)
  // ──────────────────────────────────────────
  {
    id: 'triphasic',
    name: 'Triphasic Training (Cal Dietz)',
    shortName: 'Triphasic',
    creator: 'Cal Dietz & Ben Peterson',
    domains: ['strength_power', 'team_sport'],
    primarySource: 'Triphasic Training (Dietz & Peterson, 2012)',

    intensity_distribution: {
      // Consistently moderate-to-high across ALL three phases
      high:   { min: 40, max: 65 },  // 85-95%+ across all phases
      medium: { min: 25, max: 40 },  // 70-85%
      low:    { min: 10, max: 20 },  // Accessories/plyometrics
    },

    session_type_mix: {
      eccentric_strength:  { min: 0, max: 4 },  // Phase 1: 3-4/week
      isometric_strength:  { min: 0, max: 4 },  // Phase 2: 3-4/week
      concentric_power:    { min: 0, max: 4 },  // Phase 3: 3-4/week
      plyometric_reactive: { min: 1, max: 2 },  // Concurrent across all phases
    },

    volume_intensity_relationship: 'stable_type_shift',

    deload_pattern: {
      frequency_weeks:    { min: 6, max: 9 },  // After completing full triphasic cycle
      volume_reduction_pct: { min: 30, max: 50 },
      has_formal_deload: true,
      notes: 'Between phases: 2-3 transition days. After full Ecc-Iso-Con cycle (6-9 weeks): 1 week deload. Phase transitions serve as partial deloads (switching contraction types rests specific structures).',
    },

    recovery_spacing: {
      high_intensity_gap_hours: { min: 48, max: 72 },
      notes: 'Eccentric phase: 72hr minimum between heavy eccentric sessions (severe DOMS). Isometric phase: 48-72hr. Concentric phase: 48hr sufficient (less muscle damage).',
    },

    progression_model: 'contraction_type_sequential',

    sessions_per_week: { min: 3, max: 4 },

    phase_structure: [
      { name: 'Eccentric Phase', duration_weeks: { min: 2, max: 3 }, primary_focus: 'Slow eccentric strength (5-6 sec lowering)', rep_range: '2-4 reps', intensity_pct: { min: 80, max: 120 }, notes: 'Tempo: 6/0/1/0. Load: 80-90% normal or 100-120% supramaximal with releasers. Weight releasers, partner overload.' },
      { name: 'Isometric Phase', duration_weeks: { min: 2, max: 3 }, primary_focus: 'Rate of force development at sticking points (3-6 sec pauses)', rep_range: '2-4 reps', intensity_pct: { min: 80, max: 90 }, notes: 'Tempo: 3/6/1/0 (pause at sticking point). Pin squats, pause bench, pause deadlift.' },
      { name: 'Concentric/Reactive Phase', duration_weeks: { min: 2, max: 3 }, primary_focus: 'Explosive concentric from dead stop', rep_range: '1-3 reps', intensity_pct: { min: 85, max: 95 }, notes: 'Tempo: 1/0/X/0 (X = explosive). Pin presses, dead-stop squats, block pulls.' },
      { name: 'Transition/Recovery', duration_weeks: { min: 0, max: 1 }, primary_focus: 'General fitness, active recovery, GPP', rep_range: 'Unstructured', intensity_pct: { min: 50, max: 60 }, notes: '3-7 days between cycles.' },
    ],

    typical_macrocycle_weeks: { min: 6, max: 9 },  // Single triphasic cycle

    primary_markers: [
      { id: 'tri_three_contraction_phases', description: 'Three distinct phases organized by contraction type: Eccentric -> Isometric -> Concentric', weight: 35, detectionHint: 'Look for phase names referencing contraction types (eccentric, isometric, concentric) or tempo shifts.' },
      { id: 'tri_slow_eccentrics',  description: 'Prescribed tempo with specific eccentric durations (5-6 second lowering)', weight: 25, detectionHint: 'Look for tempo prescriptions like "6/0/1/0" or notes specifying "5-6 second eccentric" or "slow lowering".' },
      { id: 'tri_iso_pauses',       description: 'Isometric pauses at sticking points (3-6 seconds)', weight: 20, detectionHint: 'Look for pause prescriptions at specific ROM positions (3-6 sec at bottom or mid-range).' },
      { id: 'tri_dead_stop',        description: 'Concentric phase uses dead-stop/pin work (eliminating SSC)', weight: 15, detectionHint: 'Look for "dead stop", "from pins", "pin press", "pin squat", "block pull" in concentric phase.' },
    ],

    secondary_markers: [
      { id: 'tri_supramaximal_ecc', description: 'Supramaximal eccentric loading (100-120% 1RM with weight releasers)', weight: 12, detectionHint: 'Look for "weight releasers", "supramaximal", or eccentric loads exceeding 100% 1RM.' },
      { id: 'tri_short_phases',     description: '2-3 week phases (shorter than most periodization models)', weight: 10, detectionHint: 'Each contraction-type block lasts only 2-3 weeks.' },
      { id: 'tri_concurrent_plyo',  description: 'Plyometric/reactive training paired with strength in each phase', weight: 10, detectionHint: 'Every phase includes reactive/plyometric work alongside the strength work.' },
      { id: 'tri_low_reps_always',  description: 'Rep ranges 1-4 for main lifts throughout (never 8+)', weight: 8, detectionHint: 'Main lift rep prescriptions are 1-4 reps across all phases.' },
    ],

    exclusion_rules: [
      { id: 'tri_ex_no_tempo',      description: 'No prescribed tempo (especially slow eccentrics) in the program', penalty: -100, detectionHint: 'If no exercises have tempo prescriptions or specific eccentric duration notes.' },
      { id: 'tri_ex_no_contraction_phases', description: 'Phases don\'t reference contraction types', penalty: -100, detectionHint: 'If phase names are "hypertrophy", "strength", "peaking" instead of "eccentric", "isometric", "concentric".' },
      { id: 'tri_ex_normal_tempo',  description: 'All sets use normal tempo (no slow eccentrics, pauses, or dead stops)', penalty: -80, detectionHint: 'If exercises are performed at normal/self-selected tempo throughout.' },
      { id: 'tri_ex_high_reps',     description: 'Rep ranges exceed 6 for main lifts', penalty: -60, detectionHint: 'If main compound lifts are programmed for 7+ reps regularly.' },
      { id: 'tri_ex_long_phases',   description: 'Phases longer than 4 weeks', penalty: -60, detectionHint: 'If any single phase exceeds 4 weeks.' },
      { id: 'tri_ex_hypertrophy',   description: 'Hypertrophy (8-12 rep) work as a primary phase focus', penalty: -60, detectionHint: 'If a distinct phase uses 8-12 reps as its primary focus.' },
      { id: 'tri_ex_no_plyo',       description: 'No plyometric/reactive training alongside strength work', penalty: -40, detectionHint: 'If no reactive, plyometric, or ballistic exercises appear in the program.' },
      { id: 'tri_ex_low_intensity', description: 'Main movement intensity below 75% in any phase', penalty: -40, detectionHint: 'If main compound lifts are prescribed below 75% 1RM (Triphasic trains heavy throughout).' },
    ],

    ai_guardrails: {
      must: [
        'Structure 3 distinct phases by contraction type: Eccentric -> Isometric -> Concentric',
        'Prescribe 5-6 second eccentric tempos in eccentric phase',
        'Include 3-6 second isometric pauses at sticking points in isometric phase',
        'Use dead-stop/pin work for concentric phase (eliminate stretch-shortening cycle)',
        'Keep rep ranges at 1-4 for main lifts across all phases',
        'Include plyometric/reactive training in every phase',
        'Keep phases to 2-3 weeks each',
        'Maintain 80-95%+ intensity across all phases',
      ],
      must_not: [
        'Name phases "hypertrophy" or "strength" (use eccentric/isometric/concentric)',
        'Use normal tempo for all exercises (prescribed tempos are essential)',
        'Program main lifts above 6 reps (Triphasic is 1-4 reps)',
        'Extend any phase beyond 4 weeks',
        'Include a primary hypertrophy (8-12 rep) phase',
        'Drop main movement intensity below 75% in any phase',
        'Omit plyometric/reactive work from any phase',
        'Skip the isometric phase (all three contraction types are required)',
      ],
    },

    diagnostic_questions: {
      low_confidence: [
        'Are phases named or structured around contraction types (eccentric, isometric, concentric)?',
        'Are specific tempos prescribed (especially slow eccentrics)?',
        'Are rep ranges consistently low (1-4) across all phases?',
      ],
      medium_confidence: [
        'Is there a phase with 5-6 second eccentric lowering?',
        'Is there a phase with 3-6 second isometric pauses at sticking points?',
        'Is there a phase with dead-stop/pin work?',
      ],
      high_confidence: [
        'Confirm: 3 phases organized as Eccentric -> Isometric -> Concentric',
        'Confirm: prescribed tempos (6/0/1/0 then 3/6/1/0 then 1/0/X/0)',
        'Confirm: all phases at 80-95% intensity with 1-4 rep ranges',
      ],
    },

    keyword_signals: [
      'triphasic', 'cal dietz', 'eccentric phase', 'isometric phase', 'concentric phase',
      'slow eccentric', 'tempo prescription', 'weight releasers', 'dead stop',
      'pin squat', 'pin press', 'pause at sticking point', 'supramaximal eccentric',
      'reactive training', 'force absorption', 'contraction type',
      'eccentric overload', 'isometric RFD', 'rate of force development',
    ],

    common_variations: [
      'Pure Triphasic (Dietz): Strict Ecc-Iso-Con, 2-3 weeks each, weight releasers, stress charts',
      'Simplified Triphasic: No weight releasers, shorter pauses (2-3s vs 5-6s)',
      'Team Sport Triphasic: Aligned with sport calendar, Ecc/Iso off-season, Con/Reactive pre-season',
      'Triphasic + DUP hybrid: Daily rep range undulation within contraction-type phases',
      'Upper/Lower Triphasic: Separate progressions offset by 1-2 weeks',
    ],
  },
]


// ============================================
// Helper Utilities
// ============================================

/** Lookup a fingerprint by ID */
export function getFingerprint(id: string): MethodologyFingerprint | undefined {
  return METHODOLOGY_FINGERPRINTS.find(f => f.id === id)
}

/** Get all fingerprints for a given domain */
export function getFingerprintsByDomain(domain: TrainingDomain): MethodologyFingerprint[] {
  return METHODOLOGY_FINGERPRINTS.filter(f => f.domains.includes(domain))
}

/** Get all keyword signals flattened with their methodology ID */
export function getAllKeywordSignals(): Array<{ keyword: string; methodologyId: string }> {
  return METHODOLOGY_FINGERPRINTS.flatMap(f =>
    f.keyword_signals.map(kw => ({ keyword: kw.toLowerCase(), methodologyId: f.id }))
  )
}

/**
 * Score confidence thresholds:
 *   - 100+ = definitive match
 *   - 80-99 = confident match
 *   - 60-79 = likely match
 *   - 40-59 = possible match (ask diagnostic questions)
 *   - <40 = unlikely match
 */
export const CONFIDENCE_THRESHOLDS = {
  DEFINITIVE: 100,
  CONFIDENT: 80,
  LIKELY: 60,
  POSSIBLE: 40,
  UNLIKELY: 0,
} as const

export type ConfidenceLevel = 'definitive' | 'confident' | 'likely' | 'possible' | 'unlikely'

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.DEFINITIVE) return 'definitive'
  if (score >= CONFIDENCE_THRESHOLDS.CONFIDENT) return 'confident'
  if (score >= CONFIDENCE_THRESHOLDS.LIKELY) return 'likely'
  if (score >= CONFIDENCE_THRESHOLDS.POSSIBLE) return 'possible'
  return 'unlikely'
}
