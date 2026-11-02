/**
 * onboarding.ts — Supabase access for the onboarding flow (Sprint 14.5).
 * Components call these; no queries in the onboarding views themselves.
 */
import { supabase } from '@/lib/supabase'
import { plansService } from '@/services/plans'
import { applyTemplate, listWeekTemplates } from '@/services/blockModeler'

export interface SelfReportedBest {
  exerciseName: string
  pbType: 'time' | 'weight'
  value: number
}

export interface Teammate {
  id: string
  display_name: string
  username: string
  avatar_url: string | null
  is_private: boolean
  role: 'coach' | 'teammate'
}

export interface ChecklistItem {
  key: 'profile' | 'invite' | 'week' | 'shape' | 'publish'
  label: string
  done: boolean
  to: string
}

// ─── Coach ──────────────────────────────────────────────────────────

export async function saveCoachProfile(coachId: string, input: {
  bio: string
  sportId: string | null
  experienceYears: number | null
  specialties: string[]
}) {
  const { error: profileError } = await (supabase.from('profiles') as any)
    .update({ bio: input.bio || null, sport_ids: input.sportId ? [input.sportId] : [] })
    .eq('id', coachId)
  if (profileError) throw new Error(profileError.message)

  const { error: coachError } = await (supabase.from('coach_profiles') as any)
    .update({ experience_years: input.experienceYears, specialties: input.specialties })
    .eq('id', coachId)
  if (coachError) throw new Error(coachError.message)
}

/**
 * New plan + one block shaped by the template, with the template's days as Week 1.
 * Returns the plan id so the coach can go straight to the Block Modeler.
 */
export async function startPlanFromTemplate(coachId: string, slug: string): Promise<string> {
  const template = (await listWeekTemplates()).find(t => t.slug === slug)
  if (!template) throw new Error('Template not found')

  const start = new Date()
  const end = new Date(start.getTime() + template.weeks * 7 * 24 * 60 * 60 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const plan = await plansService.createPlan({
    coach_id: coachId,
    name: template.name,
    start_date: iso(start),
    end_date: iso(end),
    status: 'draft',
    plan_type: 'block_plan',
  })
  const block = await plansService.createBlock({
    plan_id: plan.id,
    name: template.name,
    order_index: 0,
    duration_weeks: template.weeks,
    progression_pattern: template.shape,
    deload_cadence: template.deload,
  })
  await applyTemplate(block.id, slug)
  return plan.id
}

/** Getting-started checklist on the Coach Hub, derived from real data. */
export async function getCoachChecklist(coachId: string, hasProfile: boolean): Promise<ChecklistItem[]> {
  const count = async (q: PromiseLike<{ count: number | null }>) => ((await q).count ?? 0) > 0

  const [athletes, plans, published] = await Promise.all([
    count(supabase.from('coach_athletes').select('id', { count: 'exact', head: true }).eq('coach_id', coachId)),
    supabase.from('plans').select('id, training_blocks(id, modeled_at, block_weeks(week_number, plan_sessions(id)))').eq('coach_id', coachId),
    count(supabase.from('workout_assignments').select('id', { count: 'exact', head: true }).eq('coach_id', coachId)),
  ])

  const blocks = ((plans.data ?? []) as any[]).flatMap(p => p.training_blocks ?? [])
  const weekBuilt = blocks.some(b => (b.block_weeks ?? []).some((w: any) => w.week_number === 1 && (w.plan_sessions ?? []).length > 0))
  const blockShaped = blocks.some(b => !!b.modeled_at)

  return [
    { key: 'profile', label: 'Complete your profile', done: hasProfile, to: '/settings' },
    { key: 'invite', label: 'Invite an athlete', done: athletes, to: '/coach/athletes' },
    { key: 'week', label: 'Build Week 1', done: weekBuilt, to: '/coach/planner' },
    { key: 'shape', label: 'Shape your block', done: blockShaped, to: '/coach/planner' },
    { key: 'publish', label: 'Publish a week', done: published, to: '/coach/planner' },
  ]
}

// ─── Athlete ────────────────────────────────────────────────────────

export async function saveAthleteAbout(athleteId: string, input: {
  displayName: string
  sportId: string | null
  events: string[]
  goals: string[]
}) {
  const { error: profileError } = await (supabase.from('profiles') as any)
    .update({ display_name: input.displayName, sport_ids: input.sportId ? [input.sportId] : [] })
    .eq('id', athleteId)
  if (profileError) throw new Error(profileError.message)

  const { error: athleteError } = await (supabase.from('athlete_profiles') as any)
    .update({ primary_sport_id: input.sportId, events: input.events, goals: input.goals })
    .eq('id', athleteId)
  if (athleteError) throw new Error(athleteError.message)
}

/** Seed personal_bests so the first real PB is a real one. Never overwrites an existing PB. */
export async function saveSelfReportedBests(athleteId: string, bests: SelfReportedBest[]) {
  const rows = bests
    .filter(b => b.exerciseName.trim() && Number.isFinite(b.value) && b.value > 0)
    .map(b => ({
      athlete_id: athleteId,
      exercise_name: b.exerciseName.trim(),
      pb_type: b.pbType,
      value: b.value,
      achieved_at: new Date().toISOString(),
      source: 'self_reported',
    }))
  if (!rows.length) return
  const { error } = await (supabase.from('personal_bests') as any)
    .upsert(rows, { onConflict: 'athlete_id,exercise_name,pb_type', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

/** The athlete's coach plus teammates from their groups (where access rules allow). */
export async function getTeammates(athleteId: string): Promise<Teammate[]> {
  const out = new Map<string, Teammate>()
  const select = 'id, display_name, username, avatar_url, is_private'

  const { data: coaches } = await supabase
    .from('coach_athletes')
    .select(`coach:profiles!coach_id(${select})`)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
  for (const row of (coaches ?? []) as any[]) {
    const c = Array.isArray(row.coach) ? row.coach[0] : row.coach
    if (c) out.set(c.id, { ...c, role: 'coach' })
  }

  const { data: mine } = await supabase.from('group_members').select('group_id').eq('athlete_id', athleteId)
  const groupIds = ((mine ?? []) as { group_id: string }[]).map(g => g.group_id)
  if (groupIds.length) {
    const { data: members } = await supabase
      .from('group_members')
      .select(`athlete:profiles!athlete_id(${select})`)
      .in('group_id', groupIds)
      .neq('athlete_id', athleteId)
    for (const row of (members ?? []) as any[]) {
      const a = Array.isArray(row.athlete) ? row.athlete[0] : row.athlete
      if (a && !out.has(a.id)) out.set(a.id, { ...a, role: 'teammate' })
    }
  }
  return [...out.values()]
}
