/**
 * channels.ts — multi-metric block planning
 * ------------------------------------------------------------------
 * A CHANNEL is a training mode measured in its own native unit. Units are
 * never added together (meters + kg is meaningless); channels are compared
 * as % of their own Week 1.
 *
 *   speed        sprint meters ≥ 90% (sub-metrics: accel / max-V / speed endurance)
 *   tempo        sprint meters < 90% (extensive + intensive)
 *   plyo         foot contacts
 *   strength     heavy reps (≥ 80%), relative load, sets, tonnage when kg known
 *   conditioning meters (runs, intervals)
 *   other        warm-up, mobility, drills — not planned
 *
 * Each block gives every channel a ROLE. The block's shape hits the FOCUS
 * channel in full; other channels respond less on the way up and more on the
 * way down, so the focus quality gets room to express itself.
 *
 *   role      build weeks     deload       taper / peak
 *   focus     full growth     full cut     softened cut (×0.6)
 *   support   half growth     full cut     full cut
 *   maintain  held at Week 1  cut ×1.25    cut ×1.5
 *
 * Evidence: tapers cutting volume 41–60% while holding intensity + frequency
 * perform best (Bosquet 2007) → intensity is never cut in a taper, and every
 * channel keeps a floor (MIN_VOLUME) so short-residual qualities (speed ~5±3
 * days, Issurin) are still touched weekly.
 */
import {
  buildWeekTargets, applyLever, refOf, num, parseRange,
  type Prescription, type Session, type ShapeConfig, type WeekTarget,
} from './programEngine'

export type Channel = 'speed' | 'tempo' | 'plyo' | 'strength' | 'conditioning' | 'other'
export type ChannelRole = 'focus' | 'support' | 'maintain'

export const CHANNELS: Record<Channel, { name: string; unit: string }> = {
  speed:        { name: 'Speed',        unit: 'm' },
  tempo:        { name: 'Tempo',        unit: 'm' },
  plyo:         { name: 'Plyometrics',  unit: 'contacts' },
  strength:     { name: 'Strength',     unit: 'heavy reps' },
  conditioning: { name: 'Conditioning', unit: 'm' },
  other:        { name: 'Other',        unit: '' },
}

/** Plannable key metrics. The coach flags ONE per block. */
export const METRICS = {
  'speed.meters':        { channel: 'speed',        name: 'Sprint meters (≥90%)' },
  'speed.accel':         { channel: 'speed',        name: 'Acceleration meters' },
  'speed.maxV':          { channel: 'speed',        name: 'Max-velocity meters' },
  'speed.se':            { channel: 'speed',        name: 'Speed-endurance meters' },
  'tempo.meters':        { channel: 'tempo',        name: 'Tempo meters' },
  'plyo.contacts':       { channel: 'plyo',         name: 'Foot contacts' },
  'strength.heavyReps':  { channel: 'strength',     name: 'Heavy reps (≥80%)' },
  'strength.relLoad':    { channel: 'strength',     name: 'Relative load (sets×reps×%)' },
  'strength.tonnage':    { channel: 'strength',     name: 'Tonnage (kg)' },
  'conditioning.meters': { channel: 'conditioning', name: 'Conditioning meters' },
} as const
export type MetricKey = keyof typeof METRICS

/** Sport/block presets: default roles + key metric. Coaches change any of it. */
export const SPORT_PRESETS: Record<string, { name: string; roles: Partial<Record<Channel, ChannelRole>>; focusMetric: MetricKey }> = {
  sprinter_speed:    { name: 'Sprinter — speed block',    focusMetric: 'speed.meters',        roles: { speed: 'focus', tempo: 'support', plyo: 'support', strength: 'maintain' } },
  sprinter_gpp:      { name: 'Sprinter — GPP block',      focusMetric: 'tempo.meters',        roles: { tempo: 'focus', strength: 'support', plyo: 'support', speed: 'maintain' } },
  sprinter_strength: { name: 'Sprinter — strength block', focusMetric: 'strength.heavyReps',  roles: { strength: 'focus', speed: 'support', plyo: 'maintain', tempo: 'maintain' } },
  field_offseason:   { name: 'Field sport — off-season',  focusMetric: 'strength.heavyReps',  roles: { strength: 'focus', speed: 'support', plyo: 'support', conditioning: 'support' } },
  field_inseason:    { name: 'Field sport — in-season',   focusMetric: 'speed.maxV',          roles: { speed: 'focus', strength: 'maintain', plyo: 'maintain', conditioning: 'maintain' } },
  endurance:         { name: 'Endurance',                 focusMetric: 'conditioning.meters', roles: { conditioning: 'focus', strength: 'maintain', speed: 'maintain' } },
  lifter:            { name: 'Strength sport',            focusMetric: 'strength.relLoad',    roles: { strength: 'focus', plyo: 'maintain' } },
}

// ─── Classification ─────────────────────────────────────────────────

const intensity = (ex: Prescription) => num(ex.intensity_percent) ?? num(ex.load_percent)

/** Exercise → channel. `ex.channel` (coach override) always wins. */
export function classifyChannel(ex: Prescription): Channel {
  if (typeof ex.channel === 'string' && ex.channel in CHANNELS) return ex.channel as Channel
  if (ex.is_section_header) return 'other'
  const cat = (ex.category ?? '').toLowerCase()
  const pct = intensity(ex)
  if (['warm_up', 'warmup', 'mobility', 'cooldown', 'drill', 'technique'].includes(cat)) return 'other'
  if (cat === 'plyometric') return 'plyo'
  if (cat === 'sprint') return pct !== null && pct < 90 ? 'tempo' : 'speed'
  if (cat === 'conditioning') return 'conditioning'
  if (pct !== null || num(ex.weight_kg) !== null || num(ex.rpe) !== null || ['compound_lift', 'isolation'].includes(cat)) return 'strength'
  return 'other'
}

/** Speed sub-type: flys = max-V; ≥ 80 m = speed endurance; else acceleration. */
export function speedType(ex: Prescription): 'accel' | 'maxV' | 'se' {
  const n = ex.name.toLowerCase(), d = num(ex.distance_meters) ?? 0
  if (/fly|flying/.test(n)) return 'maxV'
  if (d >= 80) return 'se'
  return 'accel'
}

// ─── Totals per channel (native units) ──────────────────────────────

export interface ChannelTotals {
  speed: { meters: number; accel: number; maxV: number; se: number }
  tempo: { meters: number }
  plyo: { contacts: number }
  strength: { sets: number; heavyReps: number; relLoad: number; tonnage: number }
  conditioning: { meters: number }
}

export function channelTotals(sessions: Session[]): ChannelTotals {
  const t: ChannelTotals = {
    speed: { meters: 0, accel: 0, maxV: 0, se: 0 }, tempo: { meters: 0 }, plyo: { contacts: 0 },
    strength: { sets: 0, heavyReps: 0, relLoad: 0, tonnage: 0 }, conditioning: { meters: 0 },
  }
  for (const s of sessions) for (const ex of s.exercises) {
    const ch = classifyChannel(ex)
    const sets = parseRange(ex.sets)?.max ?? 1
    const reps = parseRange(ex.reps)?.max ?? 1
    const m = (num(ex.distance_meters) ?? 0) * sets * reps
    switch (ch) {
      case 'speed': t.speed.meters += m; t.speed[speedType(ex)] += m; break
      case 'tempo': t.tempo.meters += m; break
      case 'conditioning': t.conditioning.meters += m; break
      case 'plyo': t.plyo.contacts += m ? Math.round(m / 2.5) : sets * reps; break // bounds ≈ 1 contact / 2.5 m
      case 'strength': {
        const pct = intensity(ex), kg = num(ex.weight_kg)
        t.strength.sets += parseRange(ex.sets)?.max ?? 0
        if (pct !== null && pct >= 80) t.strength.heavyReps += sets * reps
        if (pct !== null) t.strength.relLoad += sets * reps * pct / 100
        if (kg !== null) t.strength.tonnage += sets * reps * kg
      }
    }
  }
  t.strength.relLoad = Math.round(t.strength.relLoad * 10) / 10
  return t
}

export function metricValue(t: ChannelTotals, key: MetricKey): number {
  const map: Record<MetricKey, number> = {
    'speed.meters': t.speed.meters, 'speed.accel': t.speed.accel, 'speed.maxV': t.speed.maxV, 'speed.se': t.speed.se,
    'tempo.meters': t.tempo.meters, 'plyo.contacts': t.plyo.contacts,
    'strength.heavyReps': t.strength.heavyReps, 'strength.relLoad': t.strength.relLoad, 'strength.tonnage': t.strength.tonnage,
    'conditioning.meters': t.conditioning.meters,
  }
  return map[key]
}

// ─── Role response ──────────────────────────────────────────────────

const ROLE_RESPONSE: Record<ChannelRole, { up: number; down: number; taper: number }> = {
  focus:    { up: 1,   down: 1,    taper: 0.6 },
  support:  { up: 0.5, down: 1,    taper: 1 },
  maintain: { up: 0,   down: 1.25, taper: 1.5 },
}
export const MIN_VOLUME = 0.4    // never cut a channel more than 60% (taper evidence: 41–60%) — keep the exposure

/** Block-level week target → this channel's target, given its role. */
export function roleTarget(t: WeekTarget, role: ChannelRole): WeekTarget {
  if (t.week === 1) return t
  const r = ROLE_RESPONSE[role]
  const delta = t.volume - 1
  const k = delta >= 0 ? r.up : t.isTaper ? r.taper : r.down
  const volume = Math.max(MIN_VOLUME, 1 + delta * k)
  // Maintain holds Week-1 intensity on build weeks; nobody loses intensity in a taper.
  const intensity = role === 'maintain' && !t.isDeload ? Math.min(t.intensity, 0) : t.intensity
  return { ...t, volume: Math.round(volume * 1000) / 1000, intensity }
}

// ─── Generation with channels ───────────────────────────────────────

export interface ChannelConfig {
  roles: Partial<Record<Channel, ChannelRole>>   // unlisted channels → 'support'
  focusMetric?: MetricKey
  /** Coach-typed weekly targets for the key metric (native units). null = shape decides. */
  focusTargets?: (number | null)[]
}

export interface ChannelWeek {
  target: WeekTarget
  sessions: Session[]
  channels: ChannelTotals
  warnings: string[]
}

export function generateChannelBlock(
  canonical: Session[], cfg: ShapeConfig, ch: ChannelConfig, existing: Record<number, Session[]> = {},
): ChannelWeek[] {
  const targets = buildWeekTargets(cfg)
  const focusCh = ch.focusMetric ? (METRICS[ch.focusMetric].channel as Channel) : undefined
  const w1Focus = ch.focusMetric ? metricValue(channelTotals(canonical), ch.focusMetric) : 0

  return targets.map((t, wi) => {
    const prior = existing[t.week] ?? []
    const build = (focusFactor: number | null): Session[] => canonical.map(s => {
      const priorSession = prior.find(p => p.day_of_week === s.day_of_week && p.session_name === s.session_name)
      return {
        ...s,
        exercises: s.exercises.map(base => {
          const ref = refOf(s.day_of_week, base)
          const pinned = priorSession?.exercises.find(e => e.pinned && refOf(s.day_of_week, e) === ref)
          if (pinned) return pinned
          const c = classifyChannel(base)
          if (c === 'other') return { ...applyLever(base, { ...t, volume: 1, intensity: 0 }), canonical_ref: ref }
          let ct = roleTarget(t, ch.roles[c] ?? 'support')
          if (c === focusCh && focusFactor !== null) ct = { ...ct, volume: focusFactor }
          return { ...applyLever(base, ct), canonical_ref: ref }
        }),
      }
    })

    // Coach-typed target for the key metric: start from typed/Week-1, then correct up to
    // 3 times — levers like short-to-long change meters on top of volume, so one pass misses.
    const typed = ch.focusTargets?.[wi]
    let sessions = build(null)
    if (typed != null && typed > 0 && w1Focus > 0 && t.week > 1 && ch.focusMetric) {
      // Whole reps make some totals unreachable (4×80 m can't make 300 m), so keep the
      // closest attempt rather than the last one.
      let factor = typed / w1Focus, bestErr = Infinity
      for (let i = 0; i < 6; i++) {
        const attempt = build(factor)
        const got = metricValue(channelTotals(attempt), ch.focusMetric)
        const err = Math.abs(got - typed)
        if (err < bestErr) { bestErr = err; sessions = attempt }
        if (!got || err / typed < 0.05) break
        factor *= typed / got
      }
    }
    return { target: t, sessions, channels: channelTotals(sessions), warnings: zoneWarnings(sessions) }
  })
}

/** Francis middle zone: sprint work at 76–94% — too slow for speed, too fast to recover from in 24 h. */
export function zoneWarnings(sessions: Session[]): string[] {
  const out: string[] = []
  for (const s of sessions) for (const ex of s.exercises) {
    const pct = intensity(ex)
    if ((ex.category ?? '').toLowerCase() === 'sprint' && pct !== null && pct > 75 && pct < 95)
      out.push(`${s.session_name}: ${ex.name} at ${pct}% sits in the 76–94% middle zone`)
  }
  return out
}
