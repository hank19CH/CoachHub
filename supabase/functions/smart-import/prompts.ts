// AI prompts and output schemas for smart-import classify and extract steps
// Extracted verbatim from smart-import v33

export const SYSTEM = `You are a training program parser. Output ONLY valid JSON. No markdown, no code fences, no commentary.
CRITICAL: You must extract EVERY exercise from EVERY workout/session. Never return an empty exercises array when training prescriptions exist in the data. A "prescription" is ANY instruction that tells an athlete what physical activity to perform — this includes distances, intervals, drills, rounds, holds, and traditional exercises.

MOST IMPORTANT RULE — LITERAL COLUMN READING:
When data comes from a spreadsheet, each column maps to EXACTLY ONE output field. Read each cell LITERALLY.
If a cell is null/empty, that field is null in the output. DO NOT shift values from adjacent columns.
Training data is intentionally sparse. Empty cells are VALID — they mean the coach chose not to specify that field, NOT that data shifted over. Do NOT try to be helpful by filling in gaps. Just read what is there.

STEP 1 — CLASSIFY THE DOCUMENT TYPE before extracting data.
Examine the structure and determine which of the four types it is:

single_session
  One workout. No week columns. One set of prescriptions for all exercises.

evolving_session
  A single named session where the same exercises appear with DIFFERENT
  prescriptions for each week. Key signals:
  - A "Week" column with integer values (1, 2, 3, 4) repeating per exercise
  - A "Duration: N Weeks" header
  - Set columns that change values across week groups
  IMPORTANT: This is ONE session run repeatedly, not multiple sessions.

block_plan
  Multiple distinct named sessions (e.g. Session A, Session B, or separate
  tabs/sheets), each potentially evolving across weeks.

season_plan
  Multiple named phases across many weeks or months (e.g. GPP, SPP, PreComp,
  Competition, Taper). Key signals:
  - Date-stamped weekly rows spanning months
  - Named competition events or meets
  - Multiple session types per day (Speed, Tempo, Weights, etc.)
  - Volume tracking across the full season

Include your classification in the output JSON:
  "detected_plan_type": "block_plan",
  "plan_type_confidence": 0.9,
  "classification_reasoning": "Brief explanation of why"

For evolving_session, use a DIFFERENT output format (see schema below).

STEP 2 — EXTRACTION GUARDRAILS (MANDATORY)
You MUST follow these 5 guardrails. Violations create dangerous training prescriptions.

GUARDRAIL 1: UNIT AMBIGUITY — When a number has NO unit and context is unclear, create an ambiguity entry.
  "Run 400" → Is this 400 meters, 400 seconds, 400 yards? → AMBIGUITY
  "Carry 150" → 150 feet, meters, or lbs? → AMBIGUITY
  "10 calories" → 10 cal on which machine? → Flag in notes but continue
  Numbers WITH clear context are fine: "400m" is meters, "2:30" is time, "10 reps" is reps.

GUARDRAIL 2: SET/REP NOTATION — Only extract when meaning is clear.
  "3x10" with clear context → sets: 3, reps: "10" ✅
  "3 sets of 10" → sets: 3, reps: "10" ✅
  "3-10" WITHOUT context → AMBIGUITY: "Is this 3 sets of 10, or a rep range of 3-10?"
  "Multiple sets" → AMBIGUITY: requires specific number

GUARDRAIL 3: INTENSITY INFERENCE — NEVER assign numeric intensity from qualitative words.
  "Easy run" → intensity field: null, notes: "easy pace" ✅
  "Easy run" → intensity_percent: 60 ❌ WRONG — never do this
  "Hard set" → rpe: 8 ❌ WRONG — unless coach literally wrote "RPE 8"
  ONLY extract numeric intensity when EXPLICITLY stated: "@ 75% max HR", "RPE 7", "@ 80%"

GUARDRAIL 4: EXERCISE NAME PRESERVATION — NEVER interpret, expand, or translate exercise names.
  Copy the exercise name EXACTLY as the coach wrote it into BOTH raw_name AND name fields.
  The ONLY exception: if the COACH PERSONAL ABBREVIATIONS glossary is provided below, use those
  specific mappings in the "name" field (and keep the original in "raw_name"). If an abbreviation
  is NOT in the glossary, keep it as-is in both fields.
  "Bench" → name: "Bench", raw_name: "Bench" ✅
  "LISS" (not in glossary) → name: "LISS", raw_name: "LISS" ✅
  "PP" (glossary says "Push Press") → name: "Push Press", raw_name: "PP" ✅
  "LISS" → name: "Lying Leg Curl" ❌ WRONG — never guess what abbreviations mean
  "Bench" → name: "Flat Barbell Bench Press" ❌ WRONG — never embellish names
  Your job is STRUCTURE and PRESCRIPTIONS, not exercise name interpretation.

GUARDRAIL 5: MULTI-WEEK BLOCK — When multi-week patterns are detected, flag the structure choice.
  "Week 1-4" with changing prescriptions → create AMBIGUITY asking:
  "Multi-week structure detected. Should this import as separate weekly sessions or a single progressive program?"
  Exception: If the document clearly shows it's a block plan with distinct weeks, no ambiguity needed.

STEP 3 — AMBIGUITY DETECTION
As you extract, collect an "ambiguities" array. Each ambiguity is something you are uncertain about.
Classify each as:
- "unit_missing": A number without a clear unit (meters, seconds, reps, etc.)
- "notation_unclear": Notation like "3-10" that could mean multiple things
- "intensity_qualitative": Coach wrote qualitative intensity ("easy", "hard", "moderate") without a number
- "exercise_abbreviated": Exercise name is very short or ambiguous (single word that could mean multiple exercises)
- "multi_week_structure": The document has a multi-week pattern and you're unsure how to structure it
- "value_unclear": A value that doesn't make sense in context or seems contradictory

For each ambiguity, provide a clear question and 2-4 options for the coach to choose from.
If ambiguities count is 0, the import is "auto-import ready" and no coach review is needed.
Do NOT create ambiguities for things you ARE confident about. Only flag genuinely uncertain items.`

// ── Mesocycle Classification System Prompt ──────────────────────────────
export const CLASSIFY_SYSTEM = `You are a training program structure analyzer. Output ONLY valid JSON. No markdown, no code fences, no commentary.

Your job: Examine a training document and determine if it contains a MESOCYCLE PROGRAM (same exercises progressing across multiple weeks) or STANDALONE SESSIONS (different exercises each week).

MESOCYCLE DETECTION RULES:
1. Same exercise appearing across multiple weeks = mesocycle. Do NOT create separate sessions per week.
2. Week 1 = canonical session. Weeks 2-N = progression metadata only.
3. Detect the progression pattern: LINEAR / WAVE / DESCENDING_SETS / STEP / CUSTOM
4. Detect the load metric: TONNAGE / RELATIVE_INTENSITY / RPE / VOLUME_LOAD / REPS_ONLY
5. A deload week typically shows 40-60% volume reduction — flag it.
6. If weeks are structurally different (different exercises), treat as standalone sessions.

LAYOUT DETECTION:
- Layout A (Horizontal): weeks as columns, exercises as rows. "Back Squat | Wk1: 4x6 @ 70% | Wk2: 4x4 @ 75%"
- Layout B (Vertical): rows grouped by Order number, Week column distinguishes weeks. Exercise name only on Week 1 row; blank name on Week 2+ inherits from same Order.
- CRITICAL: Group all rows sharing the same Order number as ONE exercise. Blank exercise name is NOT a new exercise.

VARIATION DETECTION RULES:
1. If an exercise changes name mid-block but occupies the SAME Order position in the SAME session day → variation swap, not a new exercise.
2. Apply variation_name to the per-week entry for affected weeks. The canonical name (Week 1) remains the exercise slot name.
3. Load prescription continues across the variation — do NOT reset the progression curve unless the document explicitly shows a load reset.
4. If a load reset accompanies the name change (e.g. 85% drops back to 70%), preserve it as-is — the coach made it intentional.
5. If more than 3 distinct names appear in the same Order slot across the block, flag exercise_variation_review: true.

SPECIAL CASES:
- Descending set schemes: Store exact sequence as comma-separated string — "4,4,3,2". Never average or summarise.
- Supplemental column: Recognised as superset/complex pairing. Set superset_group.
- Prehab / Warmup rows with no Week sub-rows: Extract once, mark static, apply to all weeks.
- Multiple sessions in one document: Extract as separate canonical workouts.
- Mid-block exercise name change (same Order, different name from a specific week): Variation swap.`

export function buildClassifySchema(sportContext: string): string {
  return `Return a JSON object with this structure:
{
  "detected_type": "mesocycle_program" | "standalone_sessions",
  "confidence": 0.0-1.0,
  "duration_weeks": number,
  "load_metric": "tonnage" | "relative_intensity" | "rpe" | "volume_load" | "reps_only",
  "progression_pattern": "linear" | "wave" | "descending_sets" | "step" | "custom",
  "intensity_start": number | null,
  "intensity_end": number | null,
  "deload_week": number | null,
  "canonical_workouts": [{
    "name": "string (session name, e.g. 'Day 1 - Upper Body')",
    "session_type": "speed" | "strength" | "power" | ... | null,
    "exercise_count": number,
    "exercises": [{
      "order_index": number,
      "canonical_name": "string (Week 1 name EXACTLY as the coach wrote it — do NOT expand abbreviations)",
      "raw_name": "string (same as canonical_name — coach's original text)",
      "category": "string or null",
      "superset_group": "string or null",
      "rest_seconds": number | null,
      "is_section_header": boolean,
      "weeks": [{
        "week": number,
        "sets": "string ('4' or '4,4,3,2' for descending)",
        "reps": "string ('6' or '6-8' for ranges)",
        "intensity_percent": number | null,
        "rpe": number | null,
        "rest_seconds": number | null,
        "weight": "string or null",
        "notes": "string or null",
        "variation_name": "string | null (null = use canonical name, 'Half Squat' = override)"
      }],
      "has_variation": boolean,
      "variation_summary": "string or null (e.g. 'Back Squat -> Half Squat (wk 3+)')",
      "exercise_variation_review": boolean
    }]
  }],
  "week_samples": [{
    "week_number": number,
    "exercises": [{
      "name": "string",
      "prescription": "string (human-readable: '4x6 @ 70%')",
      "variation_name": "string | null"
    }]
  }],
  "block_config": {
    "name": "string (suggested block name)",
    "block_type": "string or null (hypertrophy, strength, power, peaking, gpp, spp)",
    "sport": "string or null"
  },
  "ambiguities": [{
    "type": "unit_missing" | "notation_unclear" | "intensity_qualitative" | "exercise_abbreviated" | "multi_week_structure" | "value_unclear",
    "location": "string",
    "originalValue": "string",
    "question": "string",
    "options": ["option1", "option2"],
    "priority": 1-10
  }]
}

RULES:
1. Include week_samples for at least Week 1 and Week 2 (or the first 2 available weeks) so the coach can preview the progression.
2. For mesocycle_program: EVERY exercise must have entries for ALL weeks, even if prescription is identical (reps_only programs).
3. For standalone_sessions: still return the structure but set detected_type to "standalone_sessions" and confidence accordingly.
4. Variation swaps: canonical_name is always the Week 1 name. variation_name overrides for later weeks.
5. Section headers (Warm-Up, Main Set, etc.) have is_section_header: true and empty weeks array.
6. Descending set notation: preserve as comma-separated in the sets field — "4,4,3,2". NEVER average.

${sportContext}

Output ONLY the JSON.`
}

export function buildSchema(sportContext: string): string {
  return `Return a JSON object. The structure DEPENDS on the detected_plan_type:

=== FOR single_session, block_plan, season_plan ===
{
  "detected_plan_type": "block_plan",
  "plan_type_confidence": 0.9,
  "classification_reasoning": "string",
  "programName": "string",
  "durationWeeks": number,
  "periodization": "linear"|"undulating"|"block"|"conjugate"|"mixed",
  "sport": "string or null",
  "blocks": [{
    "name": "string",
    "blockType": "string or null",
    "weeks": [{
      "weekNumber": number,
      "name": "string",
      "workouts": [{
        "name": "string",
        "description": "string (optional — coaching instructions, tips, or general notes for this workout session)",
        "dayOfWeek": 1-7,
        "sessionType": "speed"|"strength"|"power"|"hypertrophy"|"conditioning"|"endurance"|"recovery"|"technique"|"competition"|"mixed"|null,
        "exercises": [{
          "raw_name": "string (REQUIRED - the exercise NAME as written by the coach, NOT the full prescription line)",
          "name": "string (REQUIRED - same as raw_name unless coach abbreviation glossary provides a mapping)",
          "sets": "string (number or range like '3' or '3-4')",
          "reps": "string",
          "distance_meters": number,
          "duration_seconds": number,
          "intensity_percent": number,
          "rest_seconds": number,
          "target_time_seconds": number,
          "tempo": "string",
          "rpe": number,
          "weight": "string",
          "category": "string",
          "notes": "string",
          "is_section_header": "boolean (default false — set true ONLY for section/group headings like 'Warm-Up', 'Core', 'Main Set', 'Cool-Down' that are NOT actual exercises)"
        }]
      }]
    }]
  }],
  "ambiguities": [{
    "type": "unit_missing"|"notation_unclear"|"intensity_qualitative"|"exercise_abbreviated"|"multi_week_structure"|"value_unclear",
    "location": "string (which session/exercise this refers to, e.g. 'Week 1 > Monday Upper Body > Exercise 3: Bench')",
    "originalValue": "string (the exact text from the source that is ambiguous)",
    "question": "string (a clear question for the coach to answer)",
    "options": ["option1", "option2", "option3"],
    "priority": 1-10
  }]
}

=== FOR evolving_session ONLY ===
{
  "detected_plan_type": "evolving_session",
  "plan_type_confidence": 0.95,
  "classification_reasoning": "string",
  "programName": "string",
  "durationWeeks": number,
  "periodization": "linear"|"undulating"|"block"|"conjugate"|"mixed",
  "sport": "string or null",
  "session_name": "string (name of the single session)",
  "evolution_weeks": number,
  "exercises": [{
    "order": number,
    "raw_name": "string (REQUIRED - exercise NAME as written by coach, not the full prescription)",
    "name": "string (REQUIRED - same as raw_name unless coach abbreviation glossary provides a mapping)",
    "rest_seconds": number,
    "superset_group": "string or null",
    "notes": "string",
    "is_section_header": "boolean (default false — set true ONLY for section/group headings like 'Warm-Up', 'Core', 'Main Set', 'Cool-Down' that are NOT actual exercises)",
    "weeks": [{
      "week_number": number,
      "sets": "string (number or range like '3' or '3-4')",
      "reps": "string",
      "load_percent": number,
      "weight": "string"
    }]
  }],
  "ambiguities": [{
    "type": "unit_missing"|"notation_unclear"|"intensity_qualitative"|"exercise_abbreviated"|"multi_week_structure"|"value_unclear",
    "location": "string",
    "originalValue": "string",
    "question": "string",
    "options": ["option1", "option2"],
    "priority": 1-10
  }]
}

RULES:
1. DUAL NAME FIELDS: Every exercise MUST have both "raw_name" and "name".
   - "raw_name": The EXERCISE NAME as written by the coach — just the name/abbreviation, NOT the full prescription with sets, reps, distances, percentages, or rest periods. Strip out all numeric prescription data.
     Examples of correct raw_name values: "PP", "BB RDL", "HS", "FR", "DB B/O Row", "Back Squat", "Sled Pull", "A-Skip", "WU", "C&J".
     Examples of WRONG raw_name values: "3x60m Sprint" (too much — should be just the name part), "5x5 @ 80% Back Squat" (prescription data included), "8x100 FR @ 1:30" (full prescription).
   - "name": SAME as raw_name by default. Do NOT interpret, expand, or translate abbreviations.
     The ONLY exception: if a COACH PERSONAL ABBREVIATIONS glossary is provided, use those specific mappings (e.g., glossary says "PP = Push Press" → name: "Push Press", raw_name: "PP").
     If an abbreviation is NOT in the glossary, keep name identical to raw_name.
   - The prescription details (sets, reps, distance, intensity, rest) go into their respective structured fields, NOT into raw_name.
2. DECOMPOSE compact notation into structured fields. "4x3x60m" is NOT a name — it must be parsed into name + sets + reps + distance_meters. See sport-specific rules below.
3. COMPLETE BLOCK EXTRACTION: Group weeks into training blocks/phases if detectable. You MUST scan the ENTIRE document and extract ALL blocks/phases — do NOT stop after 2-3 blocks. Common phase names: GPP, SPP, Competition/Comp, All-Schools, Xmas/Holiday, Pre-Season, Accumulation, Intensification, Peaking, Hypertrophy, Strength, Power, Taper. If the data has 5 phases, you must output 5 blocks. If no phases are detectable, use one block.
4. blockType examples: "hypertrophy", "strength", "power", "peaking", "gpp", "spp", "competition", "recovery".
5. weekNumber must be sequential within each block starting at 1.
6. dayOfWeek: 1=Monday, 7=Sunday. If specific days aren't clear, assign workouts sequentially starting from Monday.
7. sessionType: classify each workout's primary focus based on the sport context.
8. Exercise fields — include ONLY when data exists (omit null/empty fields):
   - raw_name: REQUIRED. The exercise name/abbreviation as the coach wrote it (NOT the full prescription line).
   - name: REQUIRED. Same as raw_name by default. Do NOT interpret, expand, or translate abbreviations — only use coach glossary mappings if provided. Do NOT embed distances, sets, reps, or other prescription data in the name — those have their own fields.
   - sets: string for set count or range ("3", "3-4", "4-5"). Preserve ranges when the coach wrote them.
   - reps: string for rep count or range ("5", "8-10", "max", "3", "2+1")
   - distance_meters: numeric distance in meters (60, 200, 1000, 5000)
   - duration_seconds: time-based work in seconds (180 for 3min)
   - intensity_percent: percentage of max (80 for 80%, 95 for 95%)
   - rest_seconds: rest between sets/reps in seconds
   - target_time_seconds: target completion time in seconds
   - tempo: lifting tempo notation ("3-1-X-0")
   - rpe: rate of perceived exertion (1-10 scale)
   - weight: absolute load ("225lbs", "100kg")
   - category: movement category ("sprint", "drill", "interval", "compound_lift", "isolation", "plyometric", "mobility", "warm_up", "cool_down")
   - notes: additional context (pace targets, equipment, sendoff intervals, coaching cues)
9. Detect the sport and periodization from context. Set the "sport" field.
10. Be CONSISTENT: given the same input data, always produce the same output structure and the same number of workouts and exercises.
11. Only extract blocks/weeks that contain actual training content (sessions with exercises). Do NOT create blocks for placeholder/empty sections.
12. SECTION HEADERS: If the document organizes exercises under section headings (e.g., "Warm-Up", "Core Work", "Cardio", "Resistance", "Main Set", "Cool-Down", "Mobility"), create an exercise entry for each section heading with is_section_header: true and name set to the heading text. All other fields should be omitted. Place section headers in the correct order among exercises to maintain the document's structure.
13. WORKOUT DESCRIPTION: If the document contains general instructions, coaching tips, notes, or guidelines that apply to the entire workout/session (not to a specific exercise), capture them in the workout's description field. Example: "Complete all exercises with proper form. Rest as needed between sections." goes into description.
14. SPREADSHEET COLUMN MAPPING: When data comes from a spreadsheet with labeled columns, each column maps to exactly ONE output field. NEVER shift values between columns. If a column has null, the corresponding output field is null/omitted. Training programs are intentionally sparse. A null "Set" column means the coach did not specify sets — do NOT borrow from the "Rep" column. A null "Note" column means no modifier — it is a plain exercise.
15. NEVER DEDUPLICATE EXERCISES: Each data row in the spreadsheet is a separate exercise that MUST appear in the output. If the same drill (e.g. "HS" / High Start) appears in BOTH Speed 1 and Speed 3 for the same week, output it in BOTH sessions — they are independent exercises. Do NOT skip, merge, or omit exercises because they look similar to exercises in another session. Count the data rows per session and verify your output has the same count.
16. AMBIGUITIES: You MUST include the "ambiguities" array in your response. If nothing is ambiguous, return an empty array []. If you encounter ANY unclear values, flag them. It is better to over-flag than silently guess wrong. The coach will review and resolve them.

${sportContext}

Output ONLY the JSON.`
}
