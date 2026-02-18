-- ============================================================
-- Sprint 12: Training document intelligence + planner fixes
-- All changes are additive (IF NOT EXISTS). Safe to re-run.
-- ============================================================

-- plans: what kind of training document is this?
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'block_plan'
    CHECK (plan_type IN ('single_session', 'evolving_session', 'block_plan', 'season_plan'));

-- workouts: library item or plan instance?
-- is_library: true = coach explicitly saved to library, false = plan instance only
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS is_library boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_evolving boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS evolution_weeks integer;

-- plan_sessions: allow self-contained sessions without a backing workouts record.
-- workout_id becomes optional. Sessions hold exercise data in session_data JSONB
-- until the coach explicitly promotes them to the library.
ALTER TABLE plan_sessions
  ALTER COLUMN workout_id DROP NOT NULL;

ALTER TABLE plan_sessions
  ADD COLUMN IF NOT EXISTS session_data jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS session_name text;

-- import_history: store AI-detected type
ALTER TABLE import_history
  ADD COLUMN IF NOT EXISTS detected_plan_type text
    CHECK (detected_plan_type IN ('single_session', 'evolving_session', 'block_plan', 'season_plan')),
  ADD COLUMN IF NOT EXISTS plan_type_confidence numeric(4,3);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plans_type ON plans(coach_id, plan_type);
CREATE INDEX IF NOT EXISTS idx_workouts_library ON workouts(coach_id, is_library);

-- Backfill existing workouts as library items (all were manually created)
UPDATE workouts SET is_library = true WHERE is_library = false OR is_library IS NULL;

-- Backfill existing plans as block_plan
UPDATE plans SET plan_type = 'block_plan' WHERE plan_type IS NULL;
