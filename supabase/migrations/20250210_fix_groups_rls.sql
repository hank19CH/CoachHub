-- ============================================
-- Teams, Groups & Group Members
-- ============================================
-- Creates tables + RLS policies for the groups/teams system
-- Uses SECURITY DEFINER helper functions to avoid infinite recursion
-- between groups <-> group_members cross-referencing RLS policies

-- ============================================
-- Step 1: Create tables
-- ============================================

CREATE TABLE IF NOT EXISTS teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id uuid NOT NULL REFERENCES profiles(id),
  name text NOT NULL,
  sport_id uuid REFERENCES sports(id),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id uuid NOT NULL REFERENCES profiles(id),
  name text NOT NULL,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  sport_id uuid REFERENCES sports(id),
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES profiles(id),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, athlete_id)
);

-- ============================================
-- Step 2: Enable RLS
-- ============================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 3: SECURITY DEFINER helper functions
-- These bypass RLS to break the circular dependency between
-- groups and group_members policies
-- ============================================

CREATE OR REPLACE FUNCTION is_group_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND athlete_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_group_coach(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id AND coach_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION is_team_athlete(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE g.team_id = p_team_id AND gm.athlete_id = p_user_id
  );
$$;

-- ============================================
-- Step 4: RLS Policies
-- ============================================

-- GROUPS
CREATE POLICY "Users can view relevant groups"
  ON groups FOR SELECT
  USING (auth.uid() = coach_id OR is_group_member(id, auth.uid()));

CREATE POLICY "Coaches can insert groups"
  ON groups FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update their groups"
  ON groups FOR UPDATE
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can delete their groups"
  ON groups FOR DELETE
  USING (auth.uid() = coach_id);

-- GROUP_MEMBERS
CREATE POLICY "Users can view group memberships"
  ON group_members FOR SELECT
  USING (athlete_id = auth.uid() OR is_group_coach(group_id, auth.uid()));

CREATE POLICY "Coaches can insert group members"
  ON group_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_id AND groups.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can delete group members"
  ON group_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id AND groups.coach_id = auth.uid()
    )
  );

-- TEAMS
CREATE POLICY "Users can view relevant teams"
  ON teams FOR SELECT
  USING (coach_id = auth.uid() OR is_team_athlete(id, auth.uid()));

CREATE POLICY "Coaches can insert teams"
  ON teams FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update their teams"
  ON teams FOR UPDATE
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can delete their teams"
  ON teams FOR DELETE
  USING (auth.uid() = coach_id);
