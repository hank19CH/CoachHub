-- ════════════════════════════════════════════════════════════════════
-- Phase 2 — Program Engine (Version B, target end state)
-- ────────────────────────────────────────────────────────────────────
-- DO NOT RUN BEFORE BETA FEEDBACK. Staged so the end-state shape is
-- visible now and Sprint 14 choices stay forward-compatible.
-- Requires: 20261005_sprint14_block_modeler.sql
--
-- Adds four things:
--   1. athlete_benchmarks      — the numbers that turn "80%" into "142.5 kg" / "11.2 s"
--   2. athlete_plan_overrides  — one group plan, per-athlete deviations
--   3. progression_proposals   — assisted progression: engine proposes, coach approves
--   4. weekly_athlete_load     — planned-vs-actual + sRPE load (informational, not a risk score)
-- RLS: one-way policies via SECURITY DEFINER helper — no circular references.
-- ════════════════════════════════════════════════════════════════════
begin;

-- Helper: is the current user this athlete's coach? (breaks RLS recursion)
create or replace function public.is_coach_of(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_athletes ca where ca.coach_id = auth.uid() and ca.athlete_id = p_athlete)
$$;

-- ─── 1. Benchmarks (training maxes, test results, PR-derived paces) ─
create table if not exists public.athlete_benchmarks (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,                       -- matches prescription.name (case-insensitive)
  metric        text not null check (metric in ('1rm','training_max','e1rm','3rm','5rm','best_time_s','max_velocity_ms','vo2max','threshold_pace_s_km','max_hr')),
  value         numeric not null,
  unit          text not null,                       -- kg | s | m/s | ml/kg/min | s/km | bpm
  source        text not null default 'coach_entered' check (source in ('test','coach_entered','estimated_from_log','personal_best')),
  measured_at   date not null default current_date,
  is_current    boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_benchmark_current
  on public.athlete_benchmarks (athlete_id, lower(exercise_name), metric) where is_current;

alter table public.athlete_benchmarks enable row level security;
drop policy if exists benchmarks_rw on public.athlete_benchmarks;
create policy benchmarks_rw on public.athlete_benchmarks for all to authenticated
  using (athlete_id = auth.uid() or public.is_coach_of(athlete_id))
  with check (athlete_id = auth.uid() or public.is_coach_of(athlete_id));

-- ─── 2. Per-athlete overrides on a shared plan ──────────────────────
create table if not exists public.athlete_plan_overrides (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.plans(id) on delete cascade,
  athlete_id     uuid not null references public.profiles(id) on delete cascade,
  block_week_id  uuid not null references public.block_weeks(id) on delete cascade,
  canonical_ref  text not null,                      -- "day:order" from session_data
  prescription   jsonb not null,                     -- full replacement Prescription
  reason         text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (athlete_id, block_week_id, canonical_ref)
);
alter table public.athlete_plan_overrides enable row level security;
drop policy if exists overrides_coach on public.athlete_plan_overrides;
create policy overrides_coach on public.athlete_plan_overrides for all to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));
drop policy if exists overrides_athlete_read on public.athlete_plan_overrides;
create policy overrides_athlete_read on public.athlete_plan_overrides for select to authenticated
  using (athlete_id = auth.uid());

-- ─── 3. Assisted progression ────────────────────────────────────────
-- Deterministic rules write proposals after each completed week; the coach
-- approves in one batch ("Review 7 changes"). auto_apply is opt-in per athlete.
create table if not exists public.progression_proposals (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.plans(id) on delete cascade,
  athlete_id       uuid not null references public.profiles(id) on delete cascade,
  block_week_id    uuid not null references public.block_weeks(id) on delete cascade,  -- week being changed
  canonical_ref    text not null,
  current_rx       jsonb not null,
  proposed_rx      jsonb not null,
  rule             text not null check (rule in ('top_of_range','rpe_below_target','rpe_above_target','missed_reps','readiness_low','benchmark_updated')),
  evidence         jsonb not null default '{}'::jsonb,   -- {"logged":[...], "target_rpe":8, "avg_rpe":6.5}
  explanation      text,                                 -- one plain sentence; Haiku may polish
  status           text not null default 'pending' check (status in ('pending','approved','rejected','auto_applied','expired')),
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_proposals_pending on public.progression_proposals(plan_id, status) where status = 'pending';
alter table public.progression_proposals enable row level security;
drop policy if exists proposals_coach on public.progression_proposals;
create policy proposals_coach on public.progression_proposals for all to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));

create table if not exists public.progression_settings (
  coach_id              uuid not null references public.profiles(id) on delete cascade,
  athlete_id            uuid references public.profiles(id) on delete cascade,  -- null = coach default
  auto_apply            boolean not null default false,
  max_load_jump_pct     numeric not null default 5,     -- never propose more than +5% week to week
  rpe_window            numrange not null default numrange(7, 9, '[]'),
  readiness_floor       int not null default 5,         -- readiness_logs.subjective_score below → propose easier day
  updated_at            timestamptz not null default now()
);
create unique index if not exists uq_progression_settings
  on public.progression_settings (coach_id, coalesce(athlete_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.progression_settings enable row level security;
drop policy if exists progression_settings_owner on public.progression_settings;
create policy progression_settings_owner on public.progression_settings for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- ─── 4. Weekly load (sRPE = minutes × session RPE; Foster method) ────
-- Shown as information ("load up 18% vs your 4-week average"), never as an
-- injury-risk score — ACWR's predictive value is contested in the literature.
create or replace view public.weekly_athlete_load with (security_invoker = true) as
with s as (
  select wc.athlete_id,
         date_trunc('week', wc.completed_at)::date as week_start,
         wc.duration_minutes * coalesce(sf.session_rpe, wc.overall_rpe) as srpe_load,
         coalesce(sf.session_rpe, wc.overall_rpe) as rpe
  from public.workout_completions wc
  left join public.session_feedback sf on sf.completion_id = wc.id
  where wc.duration_minutes is not null
), w as (
  select athlete_id, week_start, count(*) sessions, sum(srpe_load) load, round(avg(rpe), 1) avg_rpe
  from s group by 1, 2
)
select w.*,
       round(avg(load) over (partition by athlete_id order by week_start rows between 4 preceding and 1 preceding), 0) as prior_4wk_avg,
       round(100.0 * (load / nullif(avg(load) over (partition by athlete_id order by week_start rows between 4 preceding and 1 preceding), 0) - 1), 0) as pct_vs_prior_4wk
from w;

commit;
