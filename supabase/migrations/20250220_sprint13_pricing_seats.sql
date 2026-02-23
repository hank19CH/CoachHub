-- ============================================================
-- Sprint 13: Pricing & Seat Management
-- Adds subscription tracking, athlete seat limits, and upgrade prompts.
-- All changes are additive (IF NOT EXISTS). Safe to re-run.
-- ============================================================

-- coach_profiles: subscription & seat management columns
ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'coach', 'team')),
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'paused')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS is_beta_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS athlete_limit integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS bonus_seats_granted integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_athlete_count integer DEFAULT 0;

-- Indexes for Stripe lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_stripe_customer
  ON coach_profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_stripe_subscription
  ON coach_profiles(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- upgrade_prompts: log nudges/gates shown to coaches
CREATE TABLE IF NOT EXISTS upgrade_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prompt_type text NOT NULL
    CHECK (prompt_type IN ('soft_nudge', 'bonus_delight', 'hard_gate', 'followup')),
  trigger_athlete_count integer NOT NULL,
  current_tier text NOT NULL,
  action_taken text
    CHECK (action_taken IS NULL OR action_taken IN ('dismissed', 'upgrade_clicked', 'downgraded')),
  shown_at timestamptz NOT NULL DEFAULT now(),
  acted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_upgrade_prompts_coach
  ON upgrade_prompts(coach_id, shown_at DESC);

-- Function: can_add_athlete(coach_uuid) -> boolean
-- Returns true if the coach has room for another athlete
CREATE OR REPLACE FUNCTION can_add_athlete(p_coach_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit integer;
  v_bonus integer;
  v_current integer;
  v_tier text;
BEGIN
  SELECT athlete_limit, bonus_seats_granted, subscription_tier
    INTO v_limit, v_bonus, v_tier
    FROM coach_profiles
    WHERE id = p_coach_id;

  -- Team tier has unlimited athletes
  IF v_tier = 'team' THEN
    RETURN true;
  END IF;

  SELECT count(*)
    INTO v_current
    FROM coach_athletes
    WHERE coach_id = p_coach_id AND status = 'active';

  RETURN v_current < (v_limit + v_bonus);
END;
$$;

-- Function: get_athlete_count(coach_uuid) -> integer
CREATE OR REPLACE FUNCTION get_athlete_count(p_coach_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT count(*)::integer
    FROM coach_athletes
    WHERE coach_id = p_coach_id AND status = 'active';
$$;

-- RLS policies for upgrade_prompts
ALTER TABLE upgrade_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own prompts"
  ON upgrade_prompts FOR SELECT
  USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own prompts"
  ON upgrade_prompts FOR INSERT
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update own prompts"
  ON upgrade_prompts FOR UPDATE
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());
