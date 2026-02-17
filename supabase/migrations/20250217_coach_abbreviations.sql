-- ============================================
-- Coach Abbreviation Glossary
-- Stores coach-specific exercise shorthand mappings
-- Used by Smart Import to pre-expand abbreviations
-- ============================================

CREATE TABLE IF NOT EXISTS coach_abbreviations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  abbreviation TEXT NOT NULL,            -- stored UPPERCASE: 'PP', 'FG', 'FEF60'
  expansion TEXT NOT NULL,               -- 'Push Position Start'
  sport_context TEXT[] DEFAULT '{}',     -- optional sport scoping
  usage_count INT NOT NULL DEFAULT 1,    -- auto-incremented on each import use
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'import_correction' | 'bulk'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, abbreviation)
);

CREATE INDEX idx_coach_abbreviations_coach ON coach_abbreviations(coach_id);
CREATE INDEX idx_coach_abbreviations_lookup ON coach_abbreviations(coach_id, abbreviation);

ALTER TABLE coach_abbreviations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_abbreviations_select" ON coach_abbreviations
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach_abbreviations_insert" ON coach_abbreviations
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_abbreviations_update" ON coach_abbreviations
  FOR UPDATE TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach_abbreviations_delete" ON coach_abbreviations
  FOR DELETE TO authenticated USING (coach_id = auth.uid());

-- RPC to increment usage count (called non-critically after imports)
CREATE OR REPLACE FUNCTION increment_abbreviation_usage(
  p_coach_id UUID,
  p_abbreviation TEXT
) RETURNS VOID AS $$
  UPDATE coach_abbreviations
  SET usage_count = usage_count + 1, updated_at = now()
  WHERE coach_id = p_coach_id AND abbreviation = p_abbreviation;
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON TABLE coach_abbreviations IS 'Coach-specific exercise abbreviation glossary for Smart Import pre-processing';
