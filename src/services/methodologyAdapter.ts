import { METHODOLOGY_FINGERPRINTS, type MethodologyFingerprint } from '@/data/methodologyFingerprints'
import type { MethodologyProfile, NumericRange, FingerprintMarker, ExclusionRule, AiGuardrails, DiagnosticQuestions } from '@/types/methodology'

// ============================================
// Adapter: converts research fingerprint format → matching engine format
// The research data uses absolute intensity % ranges,
// the matching engine expects 0.0-1.0 ratios for intensity distribution
// ============================================

/**
 * Convert all research fingerprints to matching-engine-compatible profiles
 */
export function getMethodologyProfilesFromData(): MethodologyProfile[] {
  return METHODOLOGY_FINGERPRINTS.map(fp => adaptFingerprint(fp))
}

/**
 * Convert a single fingerprint to a MethodologyProfile
 */
function adaptFingerprint(fp: MethodologyFingerprint): MethodologyProfile {
  // Convert intensity from percentages (0-100) to ratios (0.0-1.0)
  const intensityDist = {
    high: toRatioRange(fp.intensity_distribution.high),
    medium: toRatioRange(fp.intensity_distribution.medium),
    low: toRatioRange(fp.intensity_distribution.low),
  }

  // Convert session type mix (already in sessions/week, just remap)
  const sessionTypeMix: Record<string, NumericRange> = {}
  for (const [type, range] of Object.entries(fp.session_type_mix)) {
    sessionTypeMix[normalizeSessionKey(type)] = range
  }

  // Map volume-intensity relationship to our enum
  const volIntRel = mapVolumeIntensityRelationship(fp.volume_intensity_relationship)

  // Convert markers
  const primaryMarkers: FingerprintMarker[] = fp.primary_markers.map(m => ({
    marker_id: m.id,
    weight: m.weight,
    description: m.description,
    detection_rule: m.detectionHint,
  }))

  const secondaryMarkers: FingerprintMarker[] = fp.secondary_markers.map(m => ({
    marker_id: m.id,
    weight: m.weight,
    description: m.description,
    detection_rule: m.detectionHint,
  }))

  // Convert exclusion rules
  const exclusionRules: ExclusionRule[] = fp.exclusion_rules.map(r => ({
    rule_id: r.id,
    threshold: 0, // Detected via custom logic, not simple threshold
    operator: 'gt' as const,
    penalty: r.penalty,
    description: r.description,
  }))

  // Calculate total weight
  const totalWeight = [
    ...primaryMarkers.map(m => m.weight),
    ...secondaryMarkers.map(m => m.weight),
  ].reduce((a, b) => a + b, 0)

  // Map guardrails
  const aiGuardrails: AiGuardrails = {
    must: fp.ai_guardrails.must,
    must_not: fp.ai_guardrails.must_not,
    prefer: [],
    flag_if: [],
  }

  // Map diagnostic questions
  const diagnosticQuestions: DiagnosticQuestions = {
    low: fp.diagnostic_questions.low_confidence,
    medium: fp.diagnostic_questions.medium_confidence,
    high: fp.diagnostic_questions.high_confidence,
  }

  // Map category from domains
  const category = mapDomainToCategory(fp.domains)

  return {
    id: fp.id,
    name: fp.name,
    short_name: fp.shortName,
    category,
    sport_context: fp.domains,
    intensity_distribution: intensityDist,
    session_type_mix: sessionTypeMix,
    volume_intensity_relationship: volIntRel,
    deload_pattern: {
      frequency_weeks: fp.deload_pattern.frequency_weeks,
      volume_reduction_pct: fp.deload_pattern.volume_reduction_pct,
    },
    recovery_spacing: {
      high_intensity_gap_hours: fp.recovery_spacing.high_intensity_gap_hours,
      pattern: fp.recovery_spacing.notes.includes('alternating') ? 'alternating' : 'variable',
    },
    progression_model: mapProgressionModel(fp.progression_model),
    typical_block_structure: fp.phase_structure.map((phase, i) => ({
      name: phase.name,
      duration_weeks: phase.duration_weeks,
      focus: phase.primary_focus,
      typical_position: i,
    })),
    sessions_per_week: fp.sessions_per_week,
    primary_markers: primaryMarkers,
    secondary_markers: secondaryMarkers,
    exclusion_rules: exclusionRules,
    total_weight: totalWeight,
    ai_guardrails: aiGuardrails,
    diagnostic_questions: diagnosticQuestions,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

// ============================================
// Helper functions
// ============================================

function toRatioRange(range: { min: number; max: number }): NumericRange {
  return {
    min: range.min / 100,
    max: range.max / 100,
  }
}

function normalizeSessionKey(key: string): string {
  // Map research session types to our standard keys
  const map: Record<string, string> = {
    speed: 'speed',
    speed_endurance: 'speed',
    tempo: 'tempo',
    max_strength: 'strength',
    plyometrics: 'power',
    recovery: 'recovery',
    easy_run: 'endurance',
    long_run: 'endurance',
    fartlek: 'conditioning',
    hill_sprints: 'speed',
    hill_circuits: 'conditioning',
    intervals: 'conditioning',
    race_pace: 'threshold',
    sharpening: 'speed',
    anaerobic: 'threshold',
    z1_z2_easy: 'endurance',
    hiit_intervals: 'conditioning',
    threshold: 'threshold',
    double_threshold: 'threshold',
    hard_endurance: 'endurance',
    accumulation: 'hypertrophy',
    transmutation: 'strength',
    realization: 'power',
    general_strength: 'strength',
    hypertrophy: 'hypertrophy',
    strength: 'strength',
    power: 'power',
    peaking: 'power',
    max_effort: 'strength',
    dynamic_effort: 'power',
    repetition: 'hypertrophy',
    main_lift: 'strength',
    supplemental: 'hypertrophy',
    assistance: 'hypertrophy',
    conditioning: 'conditioning',
    eccentric: 'strength',
    isometric: 'strength',
    concentric: 'power',
    reactive: 'power',
    sport_specific: 'conditioning',
  }
  return map[key] || key
}

function mapVolumeIntensityRelationship(
  rel: string
): 'inverse' | 'inverse_strict' | 'parallel' | 'independent' | 'phase_dependent' {
  switch (rel) {
    case 'inverse': return 'inverse'
    case 'sequential': return 'inverse' // volume first, then intensity = inverse over time
    case 'parallel': return 'parallel'
    case 'additive': return 'parallel'
    case 'concurrent': return 'independent'
    case 'daily_inverse': return 'independent'
    case 'micro_undulating': return 'independent'
    case 'stable_type_shift': return 'phase_dependent'
    default: return 'independent'
  }
}

function mapProgressionModel(
  model: string
): 'linear' | 'wave' | 'step' | 'undulating' | 'conjugate' | 'phase_shift' {
  switch (model) {
    case 'step_loading': return 'step'
    case 'phase_sequential': return 'phase_shift'
    case 'distribution_maintenance': return 'linear'
    case 'lactate_guided': return 'linear'
    case 'concentrated_sequential': return 'phase_shift'
    case 'unidirectional_linear': return 'linear'
    case 'multi_variable_micro': return 'undulating'
    case 'conjugate_rotation': return 'conjugate'
    case 'slow_linear_microload': return 'wave'
    case 'contraction_type_sequential': return 'phase_shift'
    default: return 'linear'
  }
}

function mapDomainToCategory(
  domains: string[]
): 'speed_power' | 'endurance' | 'periodization' | 'strength' | 'hybrid' {
  const d = domains[0] || ''
  if (d.includes('sprint') || d.includes('power')) return 'speed_power'
  if (d.includes('distance') || d.includes('endurance')) return 'endurance'
  if (d.includes('strength') || d.includes('powerlifting')) return 'strength'
  if (d.includes('general') || d.includes('team')) return 'hybrid'
  return 'periodization'
}
