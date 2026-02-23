-- ============================================================
-- Sprint 13.5a: Mesocycle Progression Engine
-- Adds progression parameters to training_blocks, creates
-- block_sessions linking table, and supporting indexes/RLS.
-- All changes are additive (IF NOT EXISTS). Safe to re-run.
-- ============================================================

-- ── 1. ALTER training_blocks — add structured progression columns ──

ALTER TABLE training_blocks
  ADD COLUMN IF NOT EXISTS load_metric text DEFAULT 'tonnage'
    CHECK (load_metric IN ('tonnage', 'relative_intensity', 'rpe', 'volume_load', 'reps_only')),
  ADD COLUMN IF NOT EXISTS progression_pattern text DEFAULT 'linear'
    CHECK (progression_pattern IN ('linear', 'wave_3_1', 'wave_2_1', 'descending_sets', 'step', 'conjugate', 'prilepin', 'custom')),
  ADD COLUMN IF NOT EXISTS intensity_start numeric,
  ADD COLUMN IF NOT EXISTS intensity_end numeric,
  ADD COLUMN IF NOT EXISTS volume_start numeric,
  ADD COLUMN IF NOT EXISTS volume_end numeric,
  ADD COLUMN IF NOT EXISTS deload_week integer,
  ADD COLUMN IF NOT EXISTS deload_volume_factor numeric DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS progression_params jsonb DEFAULT '{}';

COMMENT ON COLUMN training_blocks.load_metric IS 'Primary load tracking: tonnage | relative_intensity | rpe | volume_load | reps_only';
COMMENT ON COLUMN training_blocks.progression_pattern IS 'Progression algorithm: linear | wave_3_1 | wave_2_1 | descending_sets | step | conjugate | prilepin | custom';
COMMENT ON COLUMN training_blocks.intensity_start IS 'Starting intensity (% 1RM or equivalent) for Week 1';
COMMENT ON COLUMN training_blocks.intensity_end IS 'Peak intensity target for final loading week';
COMMENT ON COLUMN training_blocks.volume_start IS 'Week 1 volume target (kg tonnage, metres, etc.)';
COMMENT ON COLUMN training_blocks.volume_end IS 'Peak week volume target';
COMMENT ON COLUMN training_blocks.deload_week IS 'Which week number is the deload (null = no deload)';
COMMENT ON COLUMN training_blocks.deload_volume_factor IS 'Multiplier for deload week volume (0.6 = 40% reduction)';
COMMENT ON COLUMN training_blocks.progression_params IS 'JSONB: wave patterns, custom curves, per-exercise variation_name overrides';

-- ── 2. Create block_sessions — canonical workout linking table ──

CREATE TABLE IF NOT EXISTS block_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_block_id uuid NOT NULL REFERENCES training_blocks(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  session_day integer NOT NULL CHECK (session_day >= 0 AND session_day <= 6),
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE block_sessions IS 'Links canonical Week 1 workouts to a training block. One row per session per block.';
COMMENT ON COLUMN block_sessions.session_day IS 'Day of week 0-6 (Monday-Sunday)';
COMMENT ON COLUMN block_sessions.order_index IS 'Order when multiple sessions share a block (e.g. AM/PM)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_block_sessions_block
  ON block_sessions(training_block_id);

CREATE INDEX IF NOT EXISTS idx_block_sessions_workout
  ON block_sessions(workout_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_block_sessions_unique_day
  ON block_sessions(training_block_id, session_day, order_index);

-- ── 3. RLS for block_sessions ──
-- Access controlled via training_blocks → plans.coach_id = auth.uid()

ALTER TABLE block_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own block sessions"
  ON block_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM training_blocks tb
      JOIN plans p ON p.id = tb.plan_id
      WHERE tb.id = block_sessions.training_block_id
        AND p.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert own block sessions"
  ON block_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM training_blocks tb
      JOIN plans p ON p.id = tb.plan_id
      WHERE tb.id = block_sessions.training_block_id
        AND p.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can update own block sessions"
  ON block_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM training_blocks tb
      JOIN plans p ON p.id = tb.plan_id
      WHERE tb.id = block_sessions.training_block_id
        AND p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM training_blocks tb
      JOIN plans p ON p.id = tb.plan_id
      WHERE tb.id = block_sessions.training_block_id
        AND p.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete own block sessions"
  ON block_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM training_blocks tb
      JOIN plans p ON p.id = tb.plan_id
      WHERE tb.id = block_sessions.training_block_id
        AND p.coach_id = auth.uid()
    )
  );
