-- ============================================
-- Fix RLS Policies for Training Blocks
-- ============================================

-- Enable RLS on training_blocks if not already enabled
ALTER TABLE training_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_weeks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "training_blocks_select_by_coach" ON training_blocks;
DROP POLICY IF EXISTS "training_blocks_insert_by_coach" ON training_blocks;
DROP POLICY IF EXISTS "training_blocks_update_by_coach" ON training_blocks;
DROP POLICY IF EXISTS "training_blocks_delete_by_coach" ON training_blocks;

DROP POLICY IF EXISTS "block_weeks_select_by_coach" ON block_weeks;
DROP POLICY IF EXISTS "block_weeks_insert_by_coach" ON block_weeks;
DROP POLICY IF EXISTS "block_weeks_update_by_coach" ON block_weeks;
DROP POLICY IF EXISTS "block_weeks_delete_by_coach" ON block_weeks;

-- ============================================
-- Training Blocks Policies
-- ============================================

-- Allow coaches to SELECT their own training blocks
CREATE POLICY "training_blocks_select_by_coach"
  ON training_blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = training_blocks.plan_id
      AND plans.coach_id = auth.uid()
    )
  );

-- Allow coaches to INSERT training blocks into their own plans
CREATE POLICY "training_blocks_insert_by_coach"
  ON training_blocks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = training_blocks.plan_id
      AND plans.coach_id = auth.uid()
    )
  );

-- Allow coaches to UPDATE their own training blocks
CREATE POLICY "training_blocks_update_by_coach"
  ON training_blocks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = training_blocks.plan_id
      AND plans.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = training_blocks.plan_id
      AND plans.coach_id = auth.uid()
    )
  );

-- Allow coaches to DELETE their own training blocks
CREATE POLICY "training_blocks_delete_by_coach"
  ON training_blocks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM plans
      WHERE plans.id = training_blocks.plan_id
      AND plans.coach_id = auth.uid()
    )
  );

-- ============================================
-- Block Weeks Policies
-- ============================================

-- Allow coaches to SELECT block weeks for their training blocks
CREATE POLICY "block_weeks_select_by_coach"
  ON block_weeks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM training_blocks
      JOIN plans ON plans.id = training_blocks.plan_id
      WHERE training_blocks.id = block_weeks.training_block_id
      AND plans.coach_id = auth.uid()
    )
  );

-- Allow coaches to INSERT block weeks into their training blocks
CREATE POLICY "block_weeks_insert_by_coach"
  ON block_weeks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM training_blocks
      JOIN plans ON plans.id = training_blocks.plan_id
      WHERE training_blocks.id = block_weeks.training_block_id
      AND plans.coach_id = auth.uid()
    )
  );

-- Allow coaches to UPDATE their block weeks
CREATE POLICY "block_weeks_update_by_coach"
  ON block_weeks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM training_blocks
      JOIN plans ON plans.id = training_blocks.plan_id
      WHERE training_blocks.id = block_weeks.training_block_id
      AND plans.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM training_blocks
      JOIN plans ON plans.id = training_blocks.plan_id
      WHERE training_blocks.id = block_weeks.training_block_id
      AND plans.coach_id = auth.uid()
    )
  );

-- Allow coaches to DELETE their block weeks
CREATE POLICY "block_weeks_delete_by_coach"
  ON block_weeks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM training_blocks
      JOIN plans ON plans.id = training_blocks.plan_id
      WHERE training_blocks.id = block_weeks.training_block_id
      AND plans.coach_id = auth.uid()
    )
  );

-- ============================================
-- Also ensure plans table has proper RLS
-- ============================================

-- Enable RLS on plans if not already enabled
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Drop and recreate plans policies
DROP POLICY IF EXISTS "plans_select_by_coach" ON plans;
DROP POLICY IF EXISTS "plans_insert_by_coach" ON plans;
DROP POLICY IF EXISTS "plans_update_by_coach" ON plans;
DROP POLICY IF EXISTS "plans_delete_by_coach" ON plans;

-- Allow coaches to SELECT their own plans
CREATE POLICY "plans_select_by_coach"
  ON plans
  FOR SELECT
  USING (coach_id = auth.uid());

-- Allow coaches to INSERT their own plans
CREATE POLICY "plans_insert_by_coach"
  ON plans
  FOR INSERT
  WITH CHECK (coach_id = auth.uid());

-- Allow coaches to UPDATE their own plans
CREATE POLICY "plans_update_by_coach"
  ON plans
  FOR UPDATE
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- Allow coaches to DELETE their own plans
CREATE POLICY "plans_delete_by_coach"
  ON plans
  FOR DELETE
  USING (coach_id = auth.uid());

-- ============================================
-- Add indexes for performance
-- ============================================

-- Index on training_blocks.plan_id for faster FK checks
CREATE INDEX IF NOT EXISTS idx_training_blocks_plan_id ON training_blocks(plan_id);

-- Index on block_weeks.training_block_id for faster FK checks
CREATE INDEX IF NOT EXISTS idx_block_weeks_training_block_id ON block_weeks(training_block_id);

-- Index on plans.coach_id for faster RLS checks
CREATE INDEX IF NOT EXISTS idx_plans_coach_id ON plans(coach_id);
