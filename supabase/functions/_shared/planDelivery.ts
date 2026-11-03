/**
 * Plan delivery — turn a plan's week (plan_sessions) into dated workouts for athletes.
 *
 * Pure, dependency-free TypeScript so BOTH the app (Publish Week) and Edge Functions
 * (storefront program purchases) use the exact same rules:
 *
 *  - A week is the list of plan_sessions for a block_week. day_of_week is 0 = Monday … 6 = Sunday.
 *  - Dates match the Planner's week view: start + weekOffset × 7 + day_of_week, where weekOffset
 *    is the week's position across ALL blocks (blocks by order_index, weeks by week_number).
 *  - A session already linked to a workout (workout_id) is delivered as that workout. A
 *    self-contained session (session_data only) is snapshotted into a new workout + exercises,
 *    so athletes keep exactly what was published even if the plan changes later.
 */

export interface DeliveryBlock {
  id: string
  order_index: number | null
  block_weeks: { id: string; week_number: number }[]
}

export interface DeliverySession {
  id: string
  block_week_id: string
  day_of_week: number
  order_index: number | null
  session_name: string | null
  session_data: unknown
  workout_id: string | null
}

/** Ordered week ids across the whole plan (the Planner's week order). */
export function orderedWeekIds(blocks: DeliveryBlock[]): string[] {
  return [...blocks]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .flatMap(b => [...(b.block_weeks ?? [])].sort((x, y) => x.week_number - y.week_number).map(w => w.id))
}

/** YYYY-MM-DD for a Date, in local calendar terms (no timezone drift). */
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse YYYY-MM-DD as a local date (new Date('2026-11-02') would be UTC midnight). */
export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, n: number): string {
  const d = parseIsoDate(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** The Monday on or after `from` (used to start a purchased program next week). */
export function nextMonday(from: Date): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const dow = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow))
  return isoDate(d)
}

export function sessionDate(startIso: string, weekOffset: number, dayOfWeek: number): string {
  const dow = Math.min(6, Math.max(0, Math.round(dayOfWeek)))
  return addDays(startIso, weekOffset * 7 + dow)
}

export function parseWeightToKg(weight: unknown): number | null {
  if (typeof weight !== 'string' || !weight) return null
  const t = weight.trim().toLowerCase()
  if (t.endsWith('%')) return null
  const kg = t.match(/^([\d.]+)\s*kg$/i)
  if (kg) return parseFloat(kg[1]!)
  const lb = t.match(/^([\d.]+)\s*(lbs?|pounds?)$/i)
  if (lb) return Math.round(parseFloat(lb[1]!) * 0.4536 * 10) / 10
  return null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : Math.round(n)
}
/** exercises.superset_group is an integer; session_data may say "A", "B", … */
function supersetGroup(v: unknown): number | null {
  const n = int(v)
  if (n !== null) return n
  if (typeof v === 'string' && /^[a-z]$/i.test(v.trim())) return v.trim().toUpperCase().charCodeAt(0) - 64
  return null
}
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))

/** exercises rows for a snapshot workout, from a plan session's session_data. */
export function exerciseRowsFromSession(workoutId: string, sessionData: unknown): Record<string, unknown>[] {
  const list = Array.isArray(sessionData) ? sessionData : []
  return list
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as any).name === 'string' && (e as any).name.trim() !== '')
    .map((ex, i) => ({
      workout_id: workoutId,
      name: ex.name,
      order_index: int(ex.order) ?? i,
      sets: str(ex.sets),
      reps: str(ex.reps),
      distance_meters: num(ex.distance_meters),
      duration_seconds: int(ex.duration_seconds),
      rest_seconds: int(ex.rest_seconds),
      intensity_percent: num(ex.load_percent) ?? num(ex.intensity_percent),
      target_time_seconds: int(ex.target_time_seconds),
      rpe: num(ex.rpe),
      tempo: str(ex.tempo),
      category: str(ex.category),
      weight_kg: parseWeightToKg(ex.weight),
      notes: str(ex.notes),
      superset_group: supersetGroup(ex.superset_group),
      is_section_header: ex.is_section_header === true,
    }))
}

/** Sessions in delivery order: by day, then order_index. */
export function sortSessions<T extends Pick<DeliverySession, 'day_of_week' | 'order_index'>>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => a.day_of_week - b.day_of_week || (a.order_index ?? 0) - (b.order_index ?? 0))
}
