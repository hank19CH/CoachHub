/**
 * programEngine.ts — CoachHub Block Modeler engine
 * ------------------------------------------------------------------
 * Replaces the extrapolation half of progressionEngine.ts.
 *
 * Mental model (three primitives, same in MVP and end state):
 *   1. SHAPE  — how hard each WEEK is, relative to Week 1
 *               (volume index 1.0 = Week 1; intensity = "steps" above Week 1)
 *   2. LEVER  — how each EXERCISE expresses that week
 *               (load climbs? reps climb? meters climb? nothing?)
 *   3. PIN    — any cell the coach edits by hand is locked;
 *               regeneration never overwrites it
 *
 * Pure + deterministic: no Supabase, no AI, no Date. Same input → same output.
 * Safe to run client-side, in an Edge Function, or in tests.
 *
 * Input format = plan_sessions.session_data (array of loose, often string-typed
 * exercise objects). Everything is parsed defensively.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type ShapeSlug = 'steady_build' | 'accumulate' | 'intensify' | 'peak' | 'maintain'
export type DeloadCadence = 'none' | 'every_3' | 'every_4' | 'final'
export type Lever = 'hold' | 'load' | 'volume' | 'reps' | 'distance' | 'ladder'

export interface WeekTarget {
  week: number           // 1-based
  volume: number         // multiplier vs Week 1 (1.0 = same)
  intensity: number      // intensity steps above Week 1 (0 = same, can be negative on deloads)
  buildIndex: number     // how many build weeks precede this one (drives rep/distance ladders)
  isDeload: boolean
  isTaper: boolean
  label: string
  pinned?: boolean       // coach dragged this week on the chart
}

export interface ShapeConfig {
  shape: ShapeSlug
  weeks: number                                   // 2–12 (UI offers 4–8)
  deload: DeloadCadence
  overrides?: Record<number, { volume?: number; intensity?: number }>
}

/** One exercise row, as stored in plan_sessions.session_data */
export interface Prescription {
  name: string
  order: number
  sets?: string | number | null
  reps?: string | number | null
  distance_meters?: string | number | null
  intensity_percent?: string | number | null
  load_percent?: string | number | null
  weight_kg?: string | number | null
  rpe?: string | number | null
  category?: string | null
  is_section_header?: boolean
  /** Optional per-exercise rule. Absent → defaultLever() decides. */
  progression?: {
    lever: Lever
    step?: number
    /** 'ladder' only: explicit per-week values, cycling. ladder[0] = Week 1. e.g. 5/3/1 waves */
    ladder?: Array<Partial<Pick<Prescription, 'sets' | 'reps' | 'intensity_percent' | 'rpe' | 'distance_meters'>>>
  }
  /** Set true when the coach hand-edits a generated cell. */
  pinned?: boolean
  /** Stable link back to the Week 1 exercise: `${day_of_week}:${order}` */
  canonical_ref?: string
  [key: string]: unknown
}

export interface Session {
  day_of_week: number
  session_name: string
  exercises: Prescription[]
}

export interface WeekTotals {
  sets: number
  loadedReps: number      // reps on exercises with a % / kg / RPE
  relativeLoad: number    // Σ sets × reps × (%/100) — tonnage proxy without bodyweights
  meters: number          // running/sprint distance
  contacts: number        // plyometric foot contacts
  avgIntensity: number | null
}

export interface GeneratedWeek {
  target: WeekTarget
  sessions: Session[]
  totals: WeekTotals
}

// ─── Shape library ──────────────────────────────────────────────────
// Each shape answers: for build week b (0 = Week 1), what's volume & intensity?
// Deloads and tapers are layered on top so shape + cadence stay independent.

interface ShapeDef {
  name: string
  coachLine: string
  build: (b: number) => { volume: number; intensity: number }
  defaultDeload: DeloadCadence
}

export const SHAPES: Record<ShapeSlug, ShapeDef> = {
  steady_build: {
    name: 'Steady build',
    coachLine: 'Volume holds, intensity climbs a step each week. The classic.',
    build: b => ({ volume: 1 + 0.025 * b, intensity: b }),
    defaultDeload: 'every_4',
  },
  accumulate: {
    name: 'Accumulate',
    coachLine: 'Volume climbs, intensity holds. GPP, hypertrophy, work capacity.',
    build: b => ({ volume: Math.min(1.4, 1 + 0.08 * b), intensity: 0 }),
    defaultDeload: 'every_4',
  },
  intensify: {
    name: 'Intensify',
    coachLine: 'Volume comes down as intensity goes up. SPP, strength, speed.',
    build: b => ({ volume: Math.max(0.6, 1 - 0.1 * b), intensity: b }),
    defaultDeload: 'every_4',
  },
  peak: {
    name: 'Peak',
    coachLine: 'Sharpen, then cut volume hard in the final weeks. Competition.',
    build: b => ({ volume: Math.max(0.7, 1 - 0.05 * b), intensity: b }),
    defaultDeload: 'none',
  },
  maintain: {
    name: 'Maintain',
    coachLine: 'Same work every week. In-season — keep what you built.',
    build: () => ({ volume: 1, intensity: 0 }),
    defaultDeload: 'none',
  },
}

const DELOAD_VOLUME = 0.6     // deload = 60% of the previous build week's volume
const DELOAD_INT_DROP = 2     // and two intensity steps lighter
const TAPER_CUT = 0.2         // each taper week removes another 20% of volume
const TAPER_FLOOR = 0.4

function isDeloadWeek(week: number, total: number, cadence: DeloadCadence): boolean {
  if (week === 1) return false
  if (cadence === 'every_3') return week % 3 === 0
  if (cadence === 'every_4') return week % 4 === 0
  if (cadence === 'final') return week === total
  return false
}

/** Shape + cadence + overrides → one target per week. Week 1 is always {1.0, 0}. */
export function buildWeekTargets(cfg: ShapeConfig): WeekTarget[] {
  const total = clamp(Math.round(cfg.weeks), 2, 12)
  const def = SHAPES[cfg.shape] ?? SHAPES.steady_build
  const taperWeeks = cfg.shape === 'peak' ? Math.max(1, Math.round(total / 3)) : 0
  const taperStart = total - taperWeeks + 1

  const out: WeekTarget[] = []
  let b = 0
  let lastBuild = { volume: 1, intensity: 0 }

  for (let w = 1; w <= total; w++) {
    let t: WeekTarget
    if (taperWeeks && w >= taperStart) {
      const k = w - taperStart + 1
      t = {
        week: w, buildIndex: b, isDeload: false, isTaper: true,
        volume: Math.max(TAPER_FLOOR, lastBuild.volume * (1 - TAPER_CUT * k)),
        intensity: lastBuild.intensity,
        label: 'Taper',
      }
    } else if (isDeloadWeek(w, total, cfg.deload)) {
      t = {
        week: w, buildIndex: b, isDeload: true, isTaper: false,
        volume: lastBuild.volume * DELOAD_VOLUME,
        intensity: lastBuild.intensity - DELOAD_INT_DROP,
        label: 'Deload',
      }
    } else {
      const v = def.build(b)
      lastBuild = v
      t = { week: w, buildIndex: b, isDeload: false, isTaper: false, ...v, label: w === 1 ? 'Week 1' : 'Build' }
      b++
    }

    const o = cfg.overrides?.[w]
    if (o && w > 1) {
      if (o.volume !== undefined) t.volume = o.volume
      if (o.intensity !== undefined) t.intensity = o.intensity
      t.pinned = true
    }
    t.volume = round(t.volume, 3)
    out.push(t)
  }
  return out
}

// ─── Parsing helpers (session_data is loosely typed) ────────────────

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/** "8-12" | "8–12" → {min:8,max:12}; "5" → {min:5,max:5}; "15s"/"AMRAP" → null */
export function parseRange(v: unknown): { min: number; max: number } | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/)
  if (m) return { min: +m[1]!, max: +m[2]! }
  return /^\d+(\.\d+)?$/.test(s) ? { min: +s, max: +s } : null
}

const HOLD_CATEGORIES = new Set(['warm_up', 'warmup', 'mobility', 'cooldown', 'drill', 'technique'])
const VOLUME_CATEGORIES = new Set(['sprint', 'plyometric', 'conditioning', 'tempo', 'run'])

function intensityOf(ex: Prescription): number | null {
  return num(ex.intensity_percent) ?? num(ex.load_percent)
}

/** Smart default so coaches rarely touch the lever. Order matters. */
export function defaultLever(ex: Prescription): Lever {
  if (ex.is_section_header) return 'hold'
  const cat = (ex.category ?? '').toLowerCase()
  if (HOLD_CATEGORIES.has(cat)) return 'hold'
  if (VOLUME_CATEGORIES.has(cat)) return 'volume'
  if (num(ex.distance_meters) && !intensityOf(ex) && !num(ex.weight_kg)) return 'volume'
  if (intensityOf(ex) !== null || num(ex.weight_kg) !== null || num(ex.rpe) !== null) return 'load'
  const r = parseRange(ex.reps)
  if (r && r.max > r.min) return 'reps'
  return 'hold'
}

/** Default step per lever when the coach hasn't set one. */
export const DEFAULT_STEPS: Record<Lever, number> = {
  hold: 0,
  load: 2.5,      // %1RM points per intensity step (or kg if only weight_kg; RPE uses 0.5)
  volume: 0,      // volume lever holds intensity by default (sprints stay fast)
  reps: 1,        // +1 rep per build week inside the range
  distance: 10,   // +10 m per build week (short-to-long)
  ladder: 0,      // values come from the ladder itself
}

// ─── Lever application ──────────────────────────────────────────────

/** Ladders (reps, distance) climb on build weeks only; deload/taper weeks hold the last build rung. */
function ladderIndex(t: WeekTarget): number {
  return t.isDeload || t.isTaper ? Math.max(0, t.buildIndex - 1) : t.buildIndex
}
/** Scale a count ("4", "3-4"). Reductions round DOWN so deloads genuinely unload. */
function scaleCount(v: unknown, f: number): string | number | null | undefined {
  const r = parseRange(v)
  if (!r) return v as string | number | null | undefined
  // Moderate cuts (deloads, 50–99%) bias down so they genuinely unload; deep cuts (<50%)
  // round to nearest so integer sets don't overshoot the floor (4 × 0.4 → 2, not 1).
  const rnd = (x: number) => (f < 1 && f >= 0.5 ? Math.round(x - 0.25) : Math.round(x))
  const lo = Math.max(1, rnd(r.min * f))
  const hi = Math.max(1, rnd(r.max * f))
  return lo === hi ? String(lo) : `${lo}-${hi}`
}

function setIntensity(ex: Prescription, value: number) {
  const v = String(round(clamp(value, 30, 100), 1))
  if (ex.intensity_percent !== undefined && ex.intensity_percent !== '') ex.intensity_percent = v
  if (ex.load_percent !== undefined && ex.load_percent !== '') ex.load_percent = v
}

/** Week 1 exercise + week target → that exercise in week N. Never mutates input. */
export function applyLever(base: Prescription, t: WeekTarget): Prescription {
  const { pinned: _drop, ...rest } = base   // generated cells start unpinned
  const ex: Prescription = { ...rest }
  if (t.week === 1) return ex

  const lever = base.progression?.lever ?? defaultLever(base)
  const step = base.progression?.step ?? DEFAULT_STEPS[lever]

  switch (lever) {
    case 'hold':
      return ex

    case 'load': {
      const pct = intensityOf(base)
      const kg = num(base.weight_kg)
      const rpe = num(base.rpe)
      if (pct !== null) setIntensity(ex, pct + step * t.intensity)
      else if (kg !== null) ex.weight_kg = String(Math.max(0, roundTo(kg + step * t.intensity, 2.5)))
      else if (rpe !== null) ex.rpe = String(clamp(round(rpe + 0.5 * t.intensity, 1), 5, 10))
      ex.sets = scaleCount(base.sets, t.volume)
      return ex
    }

    case 'volume': {
      // Volume rides on whichever count carries the work: the larger of sets/reps,
      // or the distance itself for single continuous efforts (e.g. 1 × 2000m tempo).
      const s = num(base.sets) ?? 0
      const r = num(base.reps) ?? 0
      if (s <= 1 && r <= 1 && num(base.distance_meters)) {
        ex.distance_meters = roundTo(num(base.distance_meters)! * t.volume, 10)
      } else if (r >= s) ex.reps = scaleCount(base.reps, t.volume)
      else ex.sets = scaleCount(base.sets, t.volume)
      const pct = intensityOf(base)
      if (pct !== null && step) setIntensity(ex, pct + step * t.intensity)
      return ex
    }

    case 'reps': {
      // Planned double progression: climb the rep range one build week at a time.
      const range = parseRange(base.reps)
      if (range) {
        const top = range.max > range.min ? range.max : range.min + 3
        ex.reps = t.isDeload
          ? String(range.min)
          : String(Math.min(top, range.min + step * ladderIndex(t)))
      }
      ex.sets = scaleCount(base.sets, t.volume)   // accumulate adds sets; deload removes them
      return ex
    }

    case 'ladder': {
      // Explicit per-week scheme (5/3/1, wave loading, coach's own table). Shape is ignored;
      // the ladder carries its own deloads. If the ladder sets a %, keep both % fields in sync.
      const L = base.progression?.ladder ?? []
      if (!L.length) return ex
      const rung = L[(t.week - 1) % L.length]!
      Object.assign(ex, rung)
      if (rung.intensity_percent !== undefined) setIntensity(ex, num(rung.intensity_percent) ?? 0)
      return ex
    }

    case 'distance': {
      // Short-to-long: rep distance grows each build week; rep count follows the
      // week's volume (so deloads still unload). Total meters rise naturally.
      const d0 = num(base.distance_meters)
      if (d0) {
        ex.distance_meters = d0 + step * ladderIndex(t)
        if (num(base.reps) !== null) ex.reps = scaleCount(base.reps, t.volume)
        else ex.sets = scaleCount(base.sets, t.volume)
      }
      return ex
    }
  }
}

// ─── Block generation ───────────────────────────────────────────────

export function refOf(day: number, ex: Prescription): string {
  return ex.canonical_ref ?? `${day}:${ex.order}`
}

/**
 * Canonical Week 1 + shape → full block.
 * `existing` = weeks already saved (keyed by week number). Pinned exercises in
 * those weeks are carried through untouched — the coach's hand edits always win.
 */
export function generateBlock(
  canonical: Session[],
  cfg: ShapeConfig,
  existing: Record<number, Session[]> = {},
): GeneratedWeek[] {
  const targets = buildWeekTargets(cfg)
  return targets.map(t => {
    const prior = existing[t.week] ?? []
    const sessions = canonical.map(s => {
      const priorSession = prior.find(p => p.day_of_week === s.day_of_week && p.session_name === s.session_name)
      const exercises = s.exercises.map(base => {
        const ref = refOf(s.day_of_week, base)
        const pinned = priorSession?.exercises.find(e => e.pinned && refOf(s.day_of_week, e) === ref)
        if (pinned) return pinned
        return { ...applyLever(base, t), canonical_ref: ref }
      })
      return { ...s, exercises }
    })
    return { target: t, sessions, totals: weekTotals(sessions) }
  })
}

// ─── Totals (what the chart's "planned" line is drawn from) ─────────

export function weekTotals(sessions: Session[]): WeekTotals {
  const tot: WeekTotals = { sets: 0, loadedReps: 0, relativeLoad: 0, meters: 0, contacts: 0, avgIntensity: null }
  let iSum = 0, iN = 0
  for (const s of sessions) for (const ex of s.exercises) {
    if (ex.is_section_header) continue
    const sets = parseRange(ex.sets)?.max ?? 1
    const reps = parseRange(ex.reps)?.max ?? 1
    const pct = intensityOf(ex)
    const cat = (ex.category ?? '').toLowerCase()
    tot.sets += parseRange(ex.sets)?.max ?? 0
    if (num(ex.distance_meters)) tot.meters += num(ex.distance_meters)! * sets * reps
    if (cat === 'plyometric') tot.contacts += sets * reps
    if (pct !== null || num(ex.weight_kg) !== null || num(ex.rpe) !== null) {
      tot.loadedReps += sets * reps
      if (pct !== null) {
        tot.relativeLoad += sets * reps * (pct / 100)
        iSum += pct; iN++
      }
    }
  }
  tot.relativeLoad = round(tot.relativeLoad, 1)
  tot.avgIntensity = iN ? round(iSum / iN, 1) : null
  return tot
}

/** "4×5 @ 80%" · "5×150m" · "3×8-12" — for previews and athlete cards */
export function formatPrescription(ex: Prescription): string {
  const sets = ex.sets === '' || ex.sets == null ? null : String(ex.sets)
  const reps = ex.reps === '' || ex.reps == null ? null : String(ex.reps)
  const dist = num(ex.distance_meters)
  let core = [sets, reps].filter(Boolean).join('×')
  if (dist) core = core ? `${core}×${dist}m` : `${dist}m`
  const pct = intensityOf(ex)
  const kg = num(ex.weight_kg)
  const rpe = num(ex.rpe)
  const load = pct !== null ? `${pct}%` : kg !== null ? `${kg}kg` : rpe !== null ? `RPE ${rpe}` : ''
  return [core || '—', load].filter(Boolean).join(' @ ')
}

// ─── Legacy mapping (Sprint 13.6 VolumeDesigner presets → new shapes) ─

export const LEGACY_SHAPE_MAP: Record<string, { shape: ShapeSlug; deload: DeloadCadence }> = {
  linear_ramp:   { shape: 'accumulate',   deload: 'none' },
  wave_3_1:      { shape: 'steady_build', deload: 'every_4' },
  wave_2_1:      { shape: 'steady_build', deload: 'every_3' },
  step_load:     { shape: 'steady_build', deload: 'every_4' },
  reverse_taper: { shape: 'peak',         deload: 'none' },
  front_loaded:  { shape: 'intensify',    deload: 'none' },
}

// ─── utils ──────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)) }
function round(n: number, dp: number) { const f = 10 ** dp; return Math.round(n * f) / f }
function roundTo(n: number, inc: number) { return Math.round(n / inc) * inc }
