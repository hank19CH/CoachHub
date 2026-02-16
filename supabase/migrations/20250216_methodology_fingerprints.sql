-- ============================================
-- Sprint 12: Methodology Fingerprints & Pattern Learning
-- Stores training methodology profiles for local pattern matching
-- Eliminates need for full AI analysis in philosophy detection
-- ============================================

-- 1. Methodology Profiles — the reference library
-- Each row is one training methodology (Charlie Francis, Lydiard, etc.)
-- Contains quantifiable fingerprint markers for pattern matching
CREATE TABLE IF NOT EXISTS methodology_profiles (
  id TEXT PRIMARY KEY,  -- e.g. 'charlie_francis', 'lydiard', 'block_periodization'
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,  -- e.g. 'CF', 'Lydiard', 'Block'
  category TEXT NOT NULL,  -- 'speed_power', 'endurance', 'periodization', 'strength', 'hybrid'
  sport_context TEXT[] DEFAULT '{}',  -- sports where this method is most commonly applied

  -- Fingerprint markers (JSONB for flexible range-based matching)
  -- Each marker has { min: number, max: number } or specific patterns
  intensity_distribution JSONB NOT NULL DEFAULT '{}',
  -- { "high": { "min": 0.25, "max": 0.35 }, "medium": { "min": 0.0, "max": 0.15 }, "low": { "min": 0.55, "max": 0.65 } }

  session_type_mix JSONB NOT NULL DEFAULT '{}',
  -- { "speed": { "min": 2, "max": 3 }, "tempo": { "min": 2, "max": 3 }, "strength": { "min": 1, "max": 2 } }

  volume_intensity_relationship TEXT NOT NULL DEFAULT 'inverse',
  -- 'inverse' (CF, linear), 'parallel' (some phases), 'independent' (DUP), 'inverse_strict' (block)

  deload_pattern JSONB NOT NULL DEFAULT '{}',
  -- { "frequency_weeks": { "min": 3, "max": 4 }, "volume_reduction_pct": { "min": 40, "max": 60 } }

  recovery_spacing JSONB NOT NULL DEFAULT '{}',
  -- { "high_intensity_gap_hours": { "min": 48, "max": 72 }, "pattern": "alternating" }

  progression_model TEXT NOT NULL DEFAULT 'linear',
  -- 'linear', 'wave', 'step', 'undulating', 'conjugate', 'phase_shift'

  typical_block_structure JSONB NOT NULL DEFAULT '[]',
  -- [{ "name": "GPP", "duration_weeks": [3, 6], "focus": "volume" }, ...]

  sessions_per_week JSONB NOT NULL DEFAULT '{}',
  -- { "min": 4, "max": 6 }

  -- Weighted markers for scoring (primary = high discriminatory power)
  primary_markers JSONB NOT NULL DEFAULT '[]',
  -- [{ "marker_id": "intensity_distribution", "weight": 25, "description": "..." }]

  secondary_markers JSONB NOT NULL DEFAULT '[]',
  -- [{ "marker_id": "tempo_emphasis", "weight": 15, "description": "..." }]

  exclusion_rules JSONB NOT NULL DEFAULT '[]',
  -- [{ "rule_id": "medium_intensity_pct", "threshold": 0.25, "penalty": -30, "description": "..." }]

  -- Guardrails for AI planner — what the AI MUST and MUST NOT do
  ai_guardrails JSONB NOT NULL DEFAULT '{}',
  -- { "must": ["high/low split", "48hr CNS recovery"], "must_not": ["sessions at 80-90%", "speed volume >1200m"] }

  -- Diagnostic questions for different confidence levels
  diagnostic_questions JSONB NOT NULL DEFAULT '{}',
  -- { "low": ["..."], "medium": ["..."], "high": ["..."] }

  -- Metadata
  total_weight INTEGER NOT NULL DEFAULT 100,  -- Sum of all marker weights
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Coach methodology matches — results of fingerprint matching
-- Replaces the current full-AI philosophy detection for methodology identification
CREATE TABLE IF NOT EXISTS coach_methodology_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  methodology_id TEXT NOT NULL REFERENCES methodology_profiles(id),
  confidence REAL NOT NULL DEFAULT 0,  -- 0-100 score from fingerprint matching
  status TEXT NOT NULL DEFAULT 'detected',  -- 'detected', 'confirmed', 'rejected', 'modified'

  -- The extracted metrics that led to this match
  extracted_metrics JSONB NOT NULL DEFAULT '{}',
  -- { "intensity_distribution": { "high": 0.28, "medium": 0.12, "low": 0.60 }, ... }

  -- Per-marker scores breakdown
  marker_scores JSONB NOT NULL DEFAULT '{}',
  -- { "intensity_distribution": 23, "cns_recovery": 18, "tempo_emphasis": 15, ... }

  -- Coach feedback on this match
  coach_confirmed BOOLEAN DEFAULT NULL,  -- null = not asked, true = yes, false = no
  coach_notes TEXT,  -- "I blend CF with block periodization"
  confirmed_at TIMESTAMPTZ,

  -- Programs that contributed to this match
  programs_analyzed INTEGER NOT NULL DEFAULT 0,
  last_analysis_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One match per coach per methodology
  UNIQUE (coach_id, methodology_id)
);

-- 3. Coach extracted metrics — the raw feature extraction results
-- Stored separately so we can re-match against updated methodology profiles without re-extracting
CREATE TABLE IF NOT EXISTS coach_extracted_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Core extracted metrics (all from local computation, no AI)
  intensity_distribution JSONB NOT NULL DEFAULT '{}',
  -- { "high": 0.28, "medium": 0.12, "low": 0.60 }

  session_type_mix JSONB NOT NULL DEFAULT '{}',
  -- { "speed": 2.1, "tempo": 2.3, "strength": 1.2, "hypertrophy": 0.8, "recovery": 0.5 }

  volume_intensity_correlation REAL,  -- -1.0 to 1.0 (negative = inverse relationship)

  deload_frequency_weeks REAL,  -- average weeks between deload weeks
  deload_volume_reduction REAL,  -- average % volume drop in deload weeks

  sessions_per_week_avg REAL,
  high_intensity_gap_hours REAL,  -- average hours between high-intensity sessions

  progression_pattern TEXT,  -- 'linear', 'wave', 'step', 'undulating'
  volume_progression_slope REAL,  -- weekly change rate

  -- Exercise-level metrics
  top_exercises JSONB DEFAULT '[]',
  movement_pattern_distribution JSONB DEFAULT '{}',
  exercise_rotation_frequency REAL,  -- how often exercises change (0 = never, 1 = every session)

  -- Block/phase metrics
  avg_block_duration_weeks REAL,
  block_type_distribution JSONB DEFAULT '{}',
  -- { "base": 0.3, "build": 0.4, "peak": 0.2, "taper": 0.1 }

  -- Source data counts
  programs_analyzed INTEGER NOT NULL DEFAULT 0,
  workouts_analyzed INTEGER NOT NULL DEFAULT 0,
  exercises_analyzed INTEGER NOT NULL DEFAULT 0,
  total_weeks_analyzed INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  last_extraction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One record per coach
  UNIQUE (coach_id)
);

-- 4. Methodology learning log — tracks coach confirmations/corrections for improving accuracy
CREATE TABLE IF NOT EXISTS methodology_learning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  methodology_id TEXT NOT NULL REFERENCES methodology_profiles(id),
  action TEXT NOT NULL,  -- 'confirmed', 'rejected', 'corrected', 'suggested_alternative'
  confidence_at_action REAL,  -- what confidence was when coach responded
  coach_feedback TEXT,  -- free-text coach response
  alternative_methodology_id TEXT REFERENCES methodology_profiles(id),  -- if coach said "actually it's X"
  extracted_metrics_snapshot JSONB,  -- snapshot of metrics at time of action
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add methodology-related columns to existing coach_philosophy table
ALTER TABLE coach_philosophy
  ADD COLUMN IF NOT EXISTS primary_methodology_id TEXT REFERENCES methodology_profiles(id),
  ADD COLUMN IF NOT EXISTS methodology_confidence REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS secondary_methodologies JSONB DEFAULT '[]',
  -- [{ "id": "block_periodization", "confidence": 35 }]
  ADD COLUMN IF NOT EXISTS methodology_confirmed BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extracted_metrics_id UUID REFERENCES coach_extracted_metrics(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coach_methodology_matches_coach ON coach_methodology_matches(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_methodology_matches_methodology ON coach_methodology_matches(methodology_id);
CREATE INDEX IF NOT EXISTS idx_coach_methodology_matches_confidence ON coach_methodology_matches(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_coach_extracted_metrics_coach ON coach_extracted_metrics(coach_id);
CREATE INDEX IF NOT EXISTS idx_methodology_learning_log_coach ON methodology_learning_log(coach_id);
CREATE INDEX IF NOT EXISTS idx_methodology_learning_log_methodology ON methodology_learning_log(methodology_id);

-- RLS Policies
ALTER TABLE methodology_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_methodology_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_extracted_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE methodology_learning_log ENABLE ROW LEVEL SECURITY;

-- methodology_profiles: readable by all authenticated users (reference data)
CREATE POLICY "methodology_profiles_select" ON methodology_profiles
  FOR SELECT TO authenticated USING (true);

-- coach_methodology_matches: coaches can read/write their own
CREATE POLICY "coach_methodology_matches_select" ON coach_methodology_matches
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach_methodology_matches_insert" ON coach_methodology_matches
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_methodology_matches_update" ON coach_methodology_matches
  FOR UPDATE TO authenticated USING (coach_id = auth.uid());

-- coach_extracted_metrics: coaches can read/write their own
CREATE POLICY "coach_extracted_metrics_select" ON coach_extracted_metrics
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach_extracted_metrics_insert" ON coach_extracted_metrics
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_extracted_metrics_update" ON coach_extracted_metrics
  FOR UPDATE TO authenticated USING (coach_id = auth.uid());

-- methodology_learning_log: coaches can read/insert their own
CREATE POLICY "methodology_learning_log_select" ON methodology_learning_log
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "methodology_learning_log_insert" ON methodology_learning_log
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());

-- Service role needs full access for trigger-based operations
CREATE POLICY "methodology_matches_service" ON coach_methodology_matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "extracted_metrics_service" ON coach_extracted_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "learning_log_service" ON methodology_learning_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
