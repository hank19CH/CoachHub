-- ==========================================
-- SPRINT 10: SMART IMPORT + PHILOSOPHY DETECTION
-- ==========================================

-- Table 1: Coach Philosophy Tracking
-- Stores AI-analyzed coaching patterns that evolve over time
CREATE TABLE coach_philosophy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Analysis tracking
  programs_analyzed INT NOT NULL DEFAULT 0,
  last_analysis_at TIMESTAMPTZ,
  next_analysis_threshold INT NOT NULL DEFAULT 10,

  -- Detected periodization patterns
  primary_periodization TEXT[],
  avg_mesocycle_length_weeks NUMERIC(5,2),
  typical_deload_frequency INT,
  volume_progression_pattern TEXT,
  intensity_distribution JSONB,

  -- Exercise preferences
  top_exercises JSONB,
  movement_patterns JSONB,

  -- AI-generated insights
  coaching_style_summary TEXT,
  recommendations TEXT[],

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(coach_id)
);

CREATE INDEX idx_coach_philosophy_coach ON coach_philosophy(coach_id);

-- Table 2: Import History
-- Logs every Smart Import with metadata and cost tracking
CREATE TABLE import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Source file metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INT,
  storage_path TEXT,

  -- AI processing metadata
  ai_model_used TEXT,
  processing_cost_usd NUMERIC(10, 6),
  processing_time_ms INT,

  -- Import results
  programs_imported INT DEFAULT 0,
  workouts_imported INT DEFAULT 0,
  exercises_imported INT DEFAULT 0,

  -- Detected metadata from AI
  detected_periodization TEXT,
  detected_duration_weeks INT,
  detected_sport TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_import_history_coach ON import_history(coach_id, created_at DESC);
CREATE INDEX idx_import_history_status ON import_history(status);

-- RLS Policies for coach_philosophy
ALTER TABLE coach_philosophy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own philosophy"
  ON coach_philosophy FOR SELECT
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can insert own philosophy"
  ON coach_philosophy FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update own philosophy"
  ON coach_philosophy FOR UPDATE
  USING (auth.uid() = coach_id);

-- RLS Policies for import_history
ALTER TABLE import_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own import history"
  ON import_history FOR SELECT
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can create import records"
  ON import_history FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update own import records"
  ON import_history FOR UPDATE
  USING (auth.uid() = coach_id);

-- Create Supabase Storage bucket for program imports
INSERT INTO storage.buckets (id, name, public)
VALUES ('program-imports', 'program-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: coaches can upload their own files
CREATE POLICY "Coaches can upload import files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'program-imports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Coaches can read own import files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'program-imports' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Function: Check if philosophy analysis should be triggered
-- Inserts a notification when program count crosses thresholds
CREATE OR REPLACE FUNCTION check_philosophy_trigger()
RETURNS TRIGGER AS $$
DECLARE
  current_philosophy RECORD;
  program_count INT;
BEGIN
  -- Get current philosophy record
  SELECT * INTO current_philosophy
  FROM coach_philosophy
  WHERE coach_id = NEW.coach_id;

  -- Count total programs for this coach
  SELECT COUNT(*) INTO program_count
  FROM programs
  WHERE coach_id = NEW.coach_id;

  -- Check if we should trigger analysis
  IF current_philosophy IS NULL AND program_count >= 10 THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.coach_id,
      'philosophy_ready',
      'Your Coaching Philosophy is Ready!',
      'We''ve analyzed your first 10 programs. Check out your insights.',
      '/coach/philosophy'
    );
  ELSIF current_philosophy IS NOT NULL THEN
    IF program_count - current_philosophy.programs_analyzed >= current_philosophy.next_analysis_threshold THEN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (
        NEW.coach_id,
        'philosophy_update',
        'Philosophy Analysis Updated',
        format('We''ve re-analyzed your %s programs with new insights.', program_count),
        '/coach/philosophy'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auto-check for philosophy analysis after program creation
CREATE TRIGGER trigger_philosophy_check
  AFTER INSERT ON programs
  FOR EACH ROW
  EXECUTE FUNCTION check_philosophy_trigger();

COMMENT ON TABLE coach_philosophy IS 'AI-analyzed coaching patterns that evolve as coach creates more programs';
COMMENT ON TABLE import_history IS 'Logs all Smart Import operations with AI model usage and costs';
