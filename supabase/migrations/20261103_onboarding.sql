-- ════════════════════════════════════════════════════════════════════
-- Sprint 14.5 — Onboarding (coach + athlete flows, tours, checklist)
-- ────────────────────────────────────────────────────────────────────
--   1. profiles.onboarding_completed_at — null = still onboarding.
--      Backfilled ONCE (when the column is first added) for every existing
--      profile, so current users are never pushed into onboarding.
--   2. profiles.onboarding_flags — tours seen, checklist dismissed, …
--      e.g. {'tour:coach-hub','checklist:dismissed'}
--   3. athlete_profiles.events / goals — from "About you"
--   4. personal_bests.source — 'logged' (from a completed session) or
--      'self_reported' (typed during onboarding)
--   5. Own-row policies so a user can save their own onboarding answers.
--      Permissive policies OR together; these only ever allow a user to
--      touch their own row.
--
-- Additive + idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════
begin;

-- ─── 1 + 2. profiles ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_completed_at'
  ) then
    alter table public.profiles add column onboarding_completed_at timestamptz;
    -- Everyone who already exists has, in effect, onboarded.
    update public.profiles set onboarding_completed_at = coalesce(created_at, now());
  end if;
end $$;

alter table public.profiles
  add column if not exists onboarding_flags text[] not null default '{}';

-- ─── 3. athlete_profiles ────────────────────────────────────────────
alter table public.athlete_profiles
  add column if not exists events text[] not null default '{}',
  add column if not exists goals  text[] not null default '{}';

-- ─── 4. personal_bests.source ───────────────────────────────────────
alter table public.personal_bests
  add column if not exists source text not null default 'logged';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personal_bests_source_check') then
    alter table public.personal_bests add constraint personal_bests_source_check
      check (source in ('logged', 'self_reported'));
  end if;
end $$;

-- ─── 5. Own-row policies for onboarding writes ──────────────────────
-- An UPDATE only reaches rows the user can also SELECT, so each table gets
-- an own-row read policy alongside its own-row write policy.
drop policy if exists onboarding_select_own_athlete_profile on public.athlete_profiles;
create policy onboarding_select_own_athlete_profile on public.athlete_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists onboarding_select_own_coach_profile on public.coach_profiles;
create policy onboarding_select_own_coach_profile on public.coach_profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists onboarding_update_own_athlete_profile on public.athlete_profiles;
create policy onboarding_update_own_athlete_profile on public.athlete_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists onboarding_update_own_coach_profile on public.coach_profiles;
create policy onboarding_update_own_coach_profile on public.coach_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists onboarding_insert_own_pbs on public.personal_bests;
create policy onboarding_insert_own_pbs on public.personal_bests
  for insert to authenticated with check (athlete_id = auth.uid());

drop policy if exists onboarding_select_own_pbs on public.personal_bests;
create policy onboarding_select_own_pbs on public.personal_bests
  for select to authenticated using (athlete_id = auth.uid());

commit;
