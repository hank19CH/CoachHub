import type {
  ExtractedMetrics,
  MethodologyProfile,
  MethodologyMatchResult,
  MatchingOutput,
  NumericRange,
  FingerprintMarker,
  ExclusionRule,
} from '@/types/methodology'

// ============================================
// Fingerprint Matching Engine
// Compares extracted metrics against methodology profiles
// Pure computation — no API calls, no database queries
// ============================================

/**
 * Main matching function — compares metrics against all methodology profiles
 */
export function matchAgainstMethodologies(
  metrics: ExtractedMetrics,
  profiles: MethodologyProfile[]
): MatchingOutput {
  const matches: MethodologyMatchResult[] = []

  for (const profile of profiles) {
    const result = scoreMethodology(metrics, profile)
    matches.push(result)
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence)

  const topMatch = matches.length > 0 && matches[0].confidence > 20 ? matches[0] : null
  const needsConfirmation = topMatch !== null && topMatch.confidence >= 40 && topMatch.confidence < 80

  // Select appropriate diagnostic question
  let suggestedQuestion: string | null = null
  if (topMatch && needsConfirmation) {
    const profile = profiles.find(p => p.id === topMatch.methodology_id)
    if (profile) {
      suggestedQuestion = selectDiagnosticQuestion(topMatch.confidence, profile, topMatch.evidence)
    }
  }

  return {
    matches,
    extracted_metrics: metrics,
    top_match: topMatch,
    needs_confirmation: needsConfirmation,
    suggested_question: suggestedQuestion,
  }
}

/**
 * Score a single methodology against extracted metrics
 */
function scoreMethodology(
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MethodologyMatchResult {
  const markerScores: Record<string, number> = {}
  const evidence: string[] = []
  let totalScore = 0
  const penalties: Array<{ rule_id: string; penalty: number; reason: string }> = []

  // Score primary markers
  for (const marker of profile.primary_markers) {
    const score = evaluateMarker(marker, metrics, profile)
    markerScores[marker.marker_id] = score.points
    totalScore += score.points
    if (score.evidence) evidence.push(score.evidence)
  }

  // Score secondary markers
  for (const marker of profile.secondary_markers) {
    const score = evaluateMarker(marker, metrics, profile)
    markerScores[marker.marker_id] = score.points
    totalScore += score.points
    if (score.evidence) evidence.push(score.evidence)
  }

  // Apply exclusion rules (penalties)
  for (const rule of profile.exclusion_rules) {
    const penaltyResult = evaluateExclusion(rule, metrics)
    if (penaltyResult.triggered) {
      penalties.push({
        rule_id: rule.rule_id,
        penalty: rule.penalty,
        reason: rule.description,
      })
      totalScore += rule.penalty // negative number
    }
  }

  // Ensure score doesn't go below 0
  totalScore = Math.max(0, totalScore)

  // Convert to 0-100 confidence
  const confidence = Math.min(100, Math.round((totalScore / profile.total_weight) * 100))

  return {
    methodology_id: profile.id,
    methodology_name: profile.name,
    confidence,
    marker_scores: markerScores,
    penalties,
    total_score: totalScore,
    max_possible: profile.total_weight,
    evidence,
  }
}

// ============================================
// Marker Evaluation
// ============================================

interface MarkerScore {
  points: number
  evidence: string | null
}

function evaluateMarker(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  switch (marker.marker_id) {
    case 'intensity_distribution':
      return evaluateIntensityDistribution(marker, metrics, profile)
    case 'intensity_polarization':
      return evaluateIntensityPolarization(marker, metrics, profile)
    case 'session_type_mix':
      return evaluateSessionTypeMix(marker, metrics, profile)
    case 'volume_intensity_relationship':
      return evaluateVolumeIntensityRelationship(marker, metrics, profile)
    case 'deload_pattern':
      return evaluateDeloadPattern(marker, metrics, profile)
    case 'recovery_spacing':
      return evaluateRecoverySpacing(marker, metrics, profile)
    case 'sessions_per_week':
      return evaluateSessionsPerWeek(marker, metrics, profile)
    case 'progression_model':
      return evaluateProgressionModel(marker, metrics, profile)
    case 'exercise_rotation':
      return evaluateExerciseRotation(marker, metrics, profile)
    case 'block_structure':
      return evaluateBlockStructure(marker, metrics, profile)
    case 'tempo_emphasis':
      return evaluateSessionTypeEmphasis(marker, metrics, 'tempo', profile)
    case 'speed_emphasis':
      return evaluateSessionTypeEmphasis(marker, metrics, 'speed', profile)
    case 'threshold_emphasis':
      return evaluateSessionTypeEmphasis(marker, metrics, 'threshold', profile)
    case 'endurance_emphasis':
      return evaluateSessionTypeEmphasis(marker, metrics, 'endurance', profile)
    case 'strength_emphasis':
      return evaluateSessionTypeEmphasis(marker, metrics, 'strength', profile)
    case 'cns_recovery_structure':
      return evaluateRecoverySpacing(marker, metrics, profile)
    case 'max_effort_dynamic_effort_split':
      return evaluateMaxEffortDynamicEffort(marker, metrics, profile)
    case 'rep_range_variation':
      return evaluateRepRangeVariation(marker, metrics)
    default:
      return { points: 0, evidence: null }
  }
}

// ============================================
// Specific Marker Evaluators
// ============================================

function evaluateIntensityDistribution(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  const md = metrics.intensity_distribution
  const fp = profile.intensity_distribution

  let matchCount = 0
  let total = 0
  const details: string[] = []

  // Check each intensity zone
  for (const zone of ['high', 'medium', 'low'] as const) {
    const actual = md[zone]
    const expected = fp[zone]
    if (!expected) continue
    total++

    if (isInRange(actual, expected)) {
      matchCount++
      details.push(`${zone}: ${pct(actual)} (expected ${pct(expected.min)}-${pct(expected.max)})`)
    }
  }

  if (total === 0) return { points: 0, evidence: null }

  const ratio = matchCount / total
  const points = Math.round(marker.weight * ratio)
  const evidence = matchCount > 0
    ? `Intensity distribution matches: ${details.join(', ')}`
    : null

  return { points, evidence }
}

function evaluateIntensityPolarization(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  // Polarization = high + low are dominant, medium is small
  const md = metrics.intensity_distribution
  const polarization = md.high + md.low  // should be close to 1.0 for polarized
  const mediumPenalty = md.medium // lower is more polarized

  // For methods like CF or Polarized: medium should be < 15%
  const fp = profile.intensity_distribution
  if (!fp.medium) return { points: 0, evidence: null }

  if (isInRange(md.medium, fp.medium)) {
    return {
      points: marker.weight,
      evidence: `Intensity polarization detected: ${pct(md.medium)} medium zone (expected ${pct(fp.medium.min)}-${pct(fp.medium.max)})`,
    }
  }

  // Partial credit if close
  if (md.medium < fp.medium.max * 1.5) {
    return {
      points: Math.round(marker.weight * 0.5),
      evidence: `Partial polarization: ${pct(md.medium)} medium zone (slightly above ${pct(fp.medium.max)} target)`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateSessionTypeMix(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  const mix = metrics.session_type_mix
  const expected = profile.session_type_mix

  let matchCount = 0
  let total = 0
  const details: string[] = []

  for (const [type, range] of Object.entries(expected)) {
    total++
    const actual = (mix as any)[type] || 0
    if (isInRange(actual, range as NumericRange)) {
      matchCount++
      details.push(`${type}: ${actual}/wk`)
    }
  }

  if (total === 0) return { points: 0, evidence: null }

  const ratio = matchCount / total
  const points = Math.round(marker.weight * ratio)
  const evidence = matchCount > 0
    ? `Session mix matches: ${details.join(', ')}`
    : null

  return { points, evidence }
}

function evaluateVolumeIntensityRelationship(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  const corr = metrics.volume_intensity_correlation
  const expected = profile.volume_intensity_relationship

  let match = false
  let description = ''

  switch (expected) {
    case 'inverse':
    case 'inverse_strict':
      match = corr < -0.3
      if (expected === 'inverse_strict') match = corr < -0.6
      description = `volume-intensity correlation: ${corr} (${expected})`
      break
    case 'parallel':
      match = corr > 0.3
      description = `volume-intensity correlation: ${corr} (parallel)`
      break
    case 'independent':
      match = Math.abs(corr) < 0.3
      description = `volume-intensity correlation: ${corr} (independent)`
      break
    case 'phase_dependent':
      // Any correlation is acceptable
      match = true
      description = `volume-intensity correlation varies by phase`
      break
  }

  return {
    points: match ? marker.weight : 0,
    evidence: match ? `Volume-intensity: ${description}` : null,
  }
}

function evaluateDeloadPattern(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  const freq = metrics.deload_frequency_weeks
  const reduction = metrics.deload_volume_reduction
  const expected = profile.deload_pattern

  if (freq === null) return { points: 0, evidence: null }

  let score = 0
  const details: string[] = []

  if (expected.frequency_weeks && isInRange(freq, expected.frequency_weeks)) {
    score += 0.6
    details.push(`deload every ${freq} weeks`)
  }

  if (reduction !== null && expected.volume_reduction_pct &&
      isInRange(reduction, expected.volume_reduction_pct)) {
    score += 0.4
    details.push(`${reduction}% volume reduction`)
  }

  const points = Math.round(marker.weight * score)
  return {
    points,
    evidence: details.length > 0 ? `Deload pattern: ${details.join(', ')}` : null,
  }
}

function evaluateRecoverySpacing(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  const gap = metrics.high_intensity_gap_hours
  const expected = profile.recovery_spacing

  if (gap === null || !expected.high_intensity_gap_hours) {
    return { points: 0, evidence: null }
  }

  if (isInRange(gap, expected.high_intensity_gap_hours)) {
    return {
      points: marker.weight,
      evidence: `Recovery spacing: ${gap}hrs between high-intensity (expected ${expected.high_intensity_gap_hours.min}-${expected.high_intensity_gap_hours.max}hrs)`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateSessionsPerWeek(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  const actual = metrics.sessions_per_week_avg
  const expected = profile.sessions_per_week

  if (isInRange(actual, expected)) {
    return {
      points: marker.weight,
      evidence: `Sessions/week: ${actual} (expected ${expected.min}-${expected.max})`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateProgressionModel(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  if (!metrics.progression_pattern) return { points: 0, evidence: null }

  if (metrics.progression_pattern === profile.progression_model) {
    return {
      points: marker.weight,
      evidence: `Progression model: ${metrics.progression_pattern}`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateExerciseRotation(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  // Conjugate methods rotate exercises frequently (>0.6)
  // Linear/block methods keep exercises stable (<0.3)
  const rotation = metrics.exercise_rotation_frequency
  if (rotation === null) return { points: 0, evidence: null }

  // Check against what the methodology expects
  const methodExpectsRotation = profile.progression_model === 'conjugate'
  const isHighRotation = rotation > 0.5
  const isLowRotation = rotation < 0.25

  if (methodExpectsRotation && isHighRotation) {
    return {
      points: marker.weight,
      evidence: `High exercise rotation: ${rotation} (consistent with ${profile.name})`,
    }
  }
  if (!methodExpectsRotation && isLowRotation) {
    return {
      points: marker.weight,
      evidence: `Stable exercise selection: ${rotation} (consistent with ${profile.name})`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateBlockStructure(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  const avgDuration = metrics.avg_block_duration_weeks
  if (avgDuration === null || profile.typical_block_structure.length === 0) {
    return { points: 0, evidence: null }
  }

  // Check if block durations match expected ranges
  const expectedDurations = profile.typical_block_structure.map(b => b.duration_weeks)
  const matchesAnyBlock = expectedDurations.some(range => isInRange(avgDuration, range))

  if (matchesAnyBlock) {
    return {
      points: marker.weight,
      evidence: `Block duration: ${avgDuration} weeks (matches ${profile.name} structure)`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateSessionTypeEmphasis(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  sessionType: string,
  profile: MethodologyProfile
): MarkerScore {
  const mix = metrics.session_type_mix
  const actual = (mix as any)[sessionType] || 0
  const expected = profile.session_type_mix[sessionType]

  if (!expected) return { points: 0, evidence: null }

  if (isInRange(actual, expected)) {
    return {
      points: marker.weight,
      evidence: `${sessionType} emphasis: ${actual}/wk (expected ${expected.min}-${expected.max})`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateMaxEffortDynamicEffort(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
  profile: MethodologyProfile
): MarkerScore {
  // For conjugate/Westside: look for both max effort (1-3 reps) and dynamic effort (speed work) sessions
  const mix = metrics.session_type_mix
  const hasStrength = (mix.strength || 0) >= 1.5
  const hasPower = (mix.power || 0) >= 1 || (mix.speed || 0) >= 1

  if (hasStrength && hasPower) {
    return {
      points: marker.weight,
      evidence: `Max effort + Dynamic effort split detected: ${mix.strength || 0} strength + ${(mix.power || 0) + (mix.speed || 0)} power/speed sessions/wk`,
    }
  }

  return { points: 0, evidence: null }
}

function evaluateRepRangeVariation(
  marker: FingerprintMarker,
  metrics: ExtractedMetrics,
): MarkerScore {
  // For DUP: look for mixed session types within the same week
  const mix = metrics.session_type_mix
  const typesPresent = Object.entries(mix).filter(([_, v]) => v > 0.5).length

  if (typesPresent >= 3) {
    return {
      points: marker.weight,
      evidence: `High rep range variation: ${typesPresent} distinct session types per week`,
    }
  }

  return { points: 0, evidence: null }
}

// ============================================
// Exclusion Rule Evaluation
// ============================================

function evaluateExclusion(rule: ExclusionRule, metrics: ExtractedMetrics): { triggered: boolean } {
  const value = getMetricValue(rule.rule_id, metrics)
  if (value === null) return { triggered: false }

  switch (rule.operator) {
    case 'gt':
      return { triggered: value > rule.threshold }
    case 'lt':
      return { triggered: value < rule.threshold }
    case 'eq':
      return { triggered: Math.abs(value - rule.threshold) < 0.01 }
    default:
      return { triggered: false }
  }
}

function getMetricValue(ruleId: string, metrics: ExtractedMetrics): number | null {
  switch (ruleId) {
    case 'medium_intensity_pct':
      return metrics.intensity_distribution.medium
    case 'high_intensity_pct':
      return metrics.intensity_distribution.high
    case 'low_intensity_pct':
      return metrics.intensity_distribution.low
    case 'sessions_per_week':
      return metrics.sessions_per_week_avg
    case 'exercise_rotation':
      return metrics.exercise_rotation_frequency
    case 'deload_frequency':
      return metrics.deload_frequency_weeks
    case 'volume_intensity_corr':
      return metrics.volume_intensity_correlation
    default:
      return null
  }
}

// ============================================
// Diagnostic Question Selection
// ============================================

function selectDiagnosticQuestion(
  confidence: number,
  profile: MethodologyProfile,
  evidence: string[]
): string {
  const questions = profile.diagnostic_questions

  // Build context-aware question
  const evidenceSummary = evidence.slice(0, 2).join('; ')

  if (confidence < 40 && questions.low.length > 0) {
    return questions.low[Math.floor(Math.random() * questions.low.length)]
  }

  if (confidence < 80 && questions.medium.length > 0) {
    // Insert evidence into question template
    const template = questions.medium[Math.floor(Math.random() * questions.medium.length)]
    return template.replace('{evidence}', evidenceSummary)
  }

  if (questions.high.length > 0) {
    return questions.high[Math.floor(Math.random() * questions.high.length)]
  }

  return `Your programming shows patterns consistent with ${profile.name}. Is this intentional?`
}

// ============================================
// Utilities
// ============================================

function isInRange(value: number, range: NumericRange): boolean {
  return value >= range.min && value <= range.max
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}
