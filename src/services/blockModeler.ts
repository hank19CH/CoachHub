/**
 * blockModeler.ts — Supabase access for the Block Modeler (Sprint 14)
 * ------------------------------------------------------------------
 * All reads/writes for the Progression tab live here; components never touch
 * Supabase directly. Math lives in programEngine.ts — this file only maps rows
 * to engine types and persists what the engine generated.
 *
 * Storage model:
 *   - Week 1 plan_sessions = canonical week (levers live on its exercises)
 *   - training_blocks       = shape config (progression_pattern, deload_cadence, week_overrides)
 *   - block_weeks           = one row per week with the engine's WeekTarget
 *   - plan_sessions 2..N    = generated weeks (is_generated, canonical_session_id)
 */
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database'
import {
  SHAPES,
  LEGACY_SHAPE_MAP,
  num,
  type DeloadCadence,
  type GeneratedWeek,
  type Prescription,
  type Session,
  type ShapeConfig,
  type ShapeSlug,
} from './programEngine'

type TrainingBlock = Database['public']['Tables']['training_blocks']['Row']
type BlockWeek = Database['public']['Tables']['block_weeks']['Row']
type PlanSession = Database['public']['Tables']['plan_sessions']['Row']
type WeekTemplateRow = Database['public']['Tables']['week_templates']['Row']

const DELOADS: DeloadCadence[] = ['none', 'every_3', 'every_4', 'final']

export interface ModelingData {
  block: TrainingBlock
  weeks: BlockWeek[]
  /** Week 1 sessions in engine form (exercises = session_data) */
  canonical: Session[]
  /** Week 1 row ids, index-aligned with `canonical` */
  canonicalRows: Pick<PlanSession, 'id' | 'order_index'>[]
  /** Saved weeks 2..N in engine form — generateBlock() carries their pinned cells */
  existing: Record<number, Session[]>
  /** Raw plan_sessions per week number (for overwrite checks) */
  rowsByWeek: Record<number, PlanSession[]>
  cfg: ShapeConfig
}

export interface WeekTemplate {
  id: string
  slug: string | null
  name: string
  coachLine: string | null
  sportTags: string[]
  level: string | null
  shape: ShapeSlug
  deload: DeloadCadence
  weeks: number
  days: Session[]
}

// ─── Row ↔ engine mapping ───────────────────────────────────────────

/** session_data stores load as "100kg"; the engine reads weight_kg. */
function parseKg(weight: unknown): number | null {
  const m = String(weight ?? '').trim().match(/^([\d.]+)\s*kg$/i)
  return m ? parseFloat(m[1]!) : null
}

function toPrescription(raw: Record<string, unknown>, i: number): Prescription {
  const ex = { ...raw, name: String(raw.name ?? ''), order: num(raw.order) ?? i } as Prescription
  if (ex.weight_kg == null) {
    const kg = parseKg(raw.weight)
    if (kg !== null) ex.weight_kg = kg
  }
  return ex
}

/** Engine output → session_data row: kg back to "Nkg", numeric fields back to numbers. */
export function toSessionExercise(ex: Prescription): Record<string, unknown> {
  const { weight_kg, ...out } = ex as Record<string, unknown>
  const kg = num(weight_kg)
  if (kg !== null) out.weight = `${kg}kg`
  for (const k of ['intensity_percent', 'load_percent', 'rpe', 'distance_meters']) {
    const n = num(out[k])
    if (n !== null) out[k] = n
  }
  return out
}

function toSession(row: PlanSession): Session {
  const data = Array.isArray(row.session_data) ? (row.session_data as Record<string, unknown>[]) : []
  return {
    day_of_week: row.day_of_week,
    session_name: row.session_name ?? '',
    exercises: data.map(toPrescription),
  }
}

function isShape(v: unknown): v is ShapeSlug {
  return typeof v === 'string' && v in SHAPES
}

/** Block row → engine config. Legacy Sprint 13.6 presets map onto the new shapes. */
export function resolveShapeConfig(block: TrainingBlock, weekCount: number): ShapeConfig {
  const params = (block.progression_params ?? {}) as Record<string, unknown>
  const legacy = LEGACY_SHAPE_MAP[String(params.preset_shape ?? '')]
  const valid = isShape(block.progression_pattern)
  const shape: ShapeSlug = valid ? (block.progression_pattern as ShapeSlug) : legacy?.shape ?? 'steady_build'
  const deload: DeloadCadence = valid || !legacy
    ? (DELOADS.includes(block.deload_cadence) ? block.deload_cadence : SHAPES[shape].defaultDeload)
    : legacy.deload

  const overrides: ShapeConfig['overrides'] = {}
  const raw = (block.week_overrides ?? {}) as Record<string, { volume?: number; intensity?: number }>
  for (const [k, v] of Object.entries(raw)) {
    const w = parseInt(k, 10)
    if (w > 1 && v && typeof v === 'object') overrides[w] = v
  }

  return { shape, deload, weeks: block.duration_weeks || weekCount || 4, overrides }
}

// ─── Load ───────────────────────────────────────────────────────────

export async function loadBlockForModeling(blockId: string): Promise<ModelingData> {
  const { data: block, error: blockErr } = await supabase
    .from('training_blocks')
    .select('*')
    .eq('id', blockId)
    .single()
  if (blockErr || !block) throw new Error(blockErr?.message || 'Block not found')

  const { data: weekRows, error: weeksErr } = await supabase
    .from('block_weeks')
    .select('*')
    .eq('training_block_id', blockId)
    .order('week_number')
  if (weeksErr) throw new Error(weeksErr.message)
  const weeks = (weekRows ?? []) as BlockWeek[]

  let sessions: PlanSession[] = []
  if (weeks.length) {
    const { data, error } = await supabase
      .from('plan_sessions')
      .select('*')
      .in('block_week_id', weeks.map(w => w.id))
      .order('day_of_week')
      .order('order_index')
    if (error) throw new Error(error.message)
    sessions = (data ?? []) as PlanSession[]
  }

  const weekNumberById = new Map(weeks.map(w => [w.id, w.week_number]))
  const rowsByWeek: Record<number, PlanSession[]> = {}
  for (const s of sessions) {
    const wk = weekNumberById.get(s.block_week_id)
    if (wk !== undefined) (rowsByWeek[wk] ??= []).push(s)
  }

  const week1 = rowsByWeek[1] ?? []
  const existing: Record<number, Session[]> = {}
  for (const [wk, rows] of Object.entries(rowsByWeek)) {
    if (+wk > 1) existing[+wk] = rows.map(toSession)
  }

  return {
    block: block as TrainingBlock,
    weeks,
    canonical: week1.map(toSession),
    canonicalRows: week1.map(r => ({ id: r.id, order_index: r.order_index })),
    existing,
    rowsByWeek,
    cfg: resolveShapeConfig(block as TrainingBlock, weeks.length),
  }
}

// ─── Pre-save checks (the UI confirms before destructive writes) ────

/** Weeks beyond the new length; deleting them cascades to their sessions. */
export function weeksToRemove(model: ModelingData, totalWeeks: number): BlockWeek[] {
  return model.weeks.filter(w => w.week_number > totalWeeks)
}

/** Hand-built (non-generated) sessions in weeks 2..N that generation would overwrite. */
export function manualSessionsToReplace(model: ModelingData, totalWeeks: number): PlanSession[] {
  const keys = new Set(model.canonical.map((s, i) => `${s.day_of_week}:${model.canonicalRows[i]!.order_index}`))
  const out: PlanSession[] = []
  for (let wk = 2; wk <= totalWeeks; wk++) {
    for (const row of model.rowsByWeek[wk] ?? []) {
      if (!row.is_generated && keys.has(`${row.day_of_week}:${row.order_index}`)) out.push(row)
    }
  }
  return out
}

// ─── Save ───────────────────────────────────────────────────────────

/**
 * Persist a modeled block. `model.canonical` carries any lever changes (they are
 * written back onto the Week 1 exercises). Weeks beyond cfg.weeks are deleted.
 */
export async function saveModeledBlock(
  blockId: string,
  cfg: ShapeConfig,
  generated: GeneratedWeek[],
  model: ModelingData,
): Promise<void> {
  const total = generated.length
  const now = new Date().toISOString()

  // 1. Block config
  const { error: blockErr } = await (supabase.from('training_blocks') as any)
    .update({
      progression_pattern: cfg.shape,
      deload_cadence: cfg.deload,
      week_overrides: (cfg.overrides ?? {}) as Json,
      duration_weeks: total,
      modeled_at: now,
      updated_at: now,
    })
    .eq('id', blockId)
  if (blockErr) throw new Error(blockErr.message)

  // 2. block_weeks 1..N
  const weekIds: Record<number, string> = {}
  await Promise.all(generated.map(async ({ target }) => {
    const fields = {
      volume_modifier: target.volume,
      intensity_modifier: target.intensity,
      is_deload: target.isDeload,
      is_taper: target.isTaper,
      is_pinned: !!target.pinned,
      updated_at: now,
    }
    const row = model.weeks.find(w => w.week_number === target.week)
    if (row) {
      const { error } = await (supabase.from('block_weeks') as any).update(fields).eq('id', row.id)
      if (error) throw new Error(error.message)
      weekIds[target.week] = row.id
    } else {
      const { data, error } = await (supabase.from('block_weeks') as any)
        .insert({ training_block_id: blockId, week_number: target.week, ...fields })
        .select('id')
        .single()
      if (error || !data) throw new Error(error?.message || 'Failed to create week')
      weekIds[target.week] = data.id
    }
  }))

  // 3. Drop weeks beyond N (cascade removes their sessions)
  const stale = weeksToRemove(model, total)
  if (stale.length) {
    const { error } = await supabase.from('block_weeks').delete().in('id', stale.map(w => w.id))
    if (error) throw new Error(error.message)
  }

  // 4. Week 1: write changed levers back onto the canonical exercises (only `progression` is touched)
  await Promise.all(model.canonical.map(async (s, i) => {
    const row = model.rowsByWeek[1]?.find(r => r.id === model.canonicalRows[i]!.id)
    const raw = Array.isArray(row?.session_data) ? (row!.session_data as Record<string, unknown>[]) : []
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
    if (s.exercises.every((ex, j) => same(ex.progression, raw[j]?.progression))) return
    const data = raw.map((r, j) => {
      const progression = s.exercises[j]?.progression
      return progression ? { ...r, progression } : r
    })
    const { error } = await (supabase.from('plan_sessions') as any)
      .update({ session_data: data as unknown as Json, updated_at: now })
      .eq('id', model.canonicalRows[i]!.id)
    if (error) throw new Error(error.message)
  }))

  // 5. Weeks 2..N: upsert on (block_week_id, day_of_week, order_index)
  for (const week of generated.slice(1)) {
    const wk = week.target.week
    const weekId = weekIds[wk]!
    const { data: current, error: curErr } = await supabase
      .from('plan_sessions')
      .select('id, day_of_week, order_index, is_generated')
      .eq('block_week_id', weekId)
    if (curErr) throw new Error(curErr.message)
    const rows = (current ?? []) as Pick<PlanSession, 'id' | 'day_of_week' | 'order_index' | 'is_generated'>[]
    const matched = new Set<string>()

    await Promise.all(week.sessions.map(async (s, i) => {
      const canon = model.canonicalRows[i]!
      const fields = {
        session_name: s.session_name || null,
        session_data: s.exercises.map(toSessionExercise) as unknown as Json,
        is_generated: true,
        canonical_session_id: canon.id,
        updated_at: now,
      }
      const hit = rows.find(r => r.day_of_week === s.day_of_week && r.order_index === canon.order_index)
      if (hit) {
        matched.add(hit.id)
        const { error } = await (supabase.from('plan_sessions') as any).update(fields).eq('id', hit.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await (supabase.from('plan_sessions') as any)
          .insert({ block_week_id: weekId, day_of_week: s.day_of_week, order_index: canon.order_index, ...fields })
        if (error) throw new Error(error.message)
      }
    }))

    // Generated sessions whose Week 1 source is gone; hand-built extras stay.
    const orphans = rows.filter(r => r.is_generated && !matched.has(r.id)).map(r => r.id)
    if (orphans.length) {
      const { error } = await supabase.from('plan_sessions').delete().in('id', orphans)
      if (error) throw new Error(error.message)
    }
  }
}

// ─── Templates ──────────────────────────────────────────────────────

export async function listWeekTemplates(): Promise<WeekTemplate[]> {
  const { data, error } = await supabase
    .from('week_templates')
    .select('*')
    .order('name')
  if (error) throw new Error(error.message)
  return ((data ?? []) as WeekTemplateRow[]).map(t => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    coachLine: t.coach_line,
    sportTags: t.sport_tags,
    level: t.level,
    shape: isShape(t.shape) ? t.shape : 'steady_build',
    deload: t.deload,
    weeks: t.weeks,
    days: Array.isArray(t.days) ? (t.days as unknown as Session[]) : [],
  }))
}

/**
 * Replace Week 1 with a template's days. Creates Week 1 if the block has none.
 * Existing Week 1 sessions are deleted — the UI confirms first.
 */
export async function applyTemplate(blockId: string, slug: string): Promise<WeekTemplate> {
  const template = (await listWeekTemplates()).find(t => t.slug === slug)
  if (!template) throw new Error('Template not found')

  const { data: week1 } = await supabase
    .from('block_weeks')
    .select('id')
    .eq('training_block_id', blockId)
    .eq('week_number', 1)
    .maybeSingle()

  let weekId = (week1 as { id: string } | null)?.id
  if (!weekId) {
    const { data, error } = await (supabase.from('block_weeks') as any)
      .insert({ training_block_id: blockId, week_number: 1 })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message || 'Failed to create Week 1')
    weekId = data.id as string
  }

  const { error: delErr } = await supabase.from('plan_sessions').delete().eq('block_week_id', weekId)
  if (delErr) throw new Error(delErr.message)

  const perDay: Record<number, number> = {}
  const rows = template.days.map(d => ({
    block_week_id: weekId,
    day_of_week: d.day_of_week,
    order_index: (perDay[d.day_of_week] = (perDay[d.day_of_week] ?? -1) + 1),
    session_name: d.session_name,
    session_data: d.exercises.map(toSessionExercise) as unknown as Json,
  }))
  if (rows.length) {
    const { error } = await (supabase.from('plan_sessions') as any).insert(rows)
    if (error) throw new Error(error.message)
  }
  return template
}
