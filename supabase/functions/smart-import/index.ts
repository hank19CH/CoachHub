// smart-import Edge Function v34 — Clean rebuild
// Two-step AI pipeline:
//   step: "classify" → Detect structure, flag questions for coach review
//   step: "extract"  → Full extraction using coach's answers from review
// ALL requests use Claude Sonnet 4.5

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, corsPreflightResponse } from '../_shared/cors.ts'
import { detectSport, SPORT_RULES, GENERAL_SPORT_RULES, SPORT_SIGNATURES } from './sport-detection.ts'
import { SYSTEM, CLASSIFY_SYSTEM, buildClassifySchema, buildSchema } from './prompts.ts'
import { callClaude, extractJSON } from './claude.ts'
import type { SportSignal } from './sport-detection.ts'

const SONNET = 'claude-sonnet-4-5'

// ── Content Block Builder ─────────────────────────────────────────────
// Shared by classify and extract — builds the Claude message content
// from either pre-parsed spreadsheet text or PDF/image base64.

function buildContentBlocks(
  fileContent: string,
  fileType: string,
  fileName: string,
  preParsed: boolean,
  instructionText: string,
): Array<{ role: string; content: any }> {
  if (preParsed) {
    // Spreadsheet JSON from SheetJS
    return [{
      role: 'user',
      content: `${instructionText}

DATA:
${fileContent}`,
    }]
  }

  // PDF or image — use vision/document blocks
  const contentBlocks: any[] = []

  if (fileType === 'application/pdf') {
    contentBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileContent },
    })
  } else if (fileType.startsWith('image/')) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: fileType, data: fileContent },
    })
  } else {
    contentBlocks.push({
      type: 'text',
      text: `File "${fileName}" (${fileType}), base64 preview:\n${fileContent.substring(0, 3000)}`,
    })
  }

  contentBlocks.push({
    type: 'text',
    text: instructionText,
  })

  return [{ role: 'user', content: contentBlocks }]
}

// ── Abbreviation Pre-Expansion ────────────────────────────────────────
// Replace known coach shorthand in text BEFORE sending to AI.
// Sort by length descending to prevent partial matches (e.g., "FEF60" before "FE").

function expandAbbreviations(
  content: string,
  abbreviations: Record<string, string>,
): { expanded: string; expandedList: string[] } {
  const expandedList: string[] = []
  let expanded = content

  const sorted = Object.entries(abbreviations)
    .sort((a, b) => b[0].length - a[0].length)

  for (const [abbr, expansion] of sorted) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    if (regex.test(expanded)) {
      expanded = expanded.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), expansion)
      expandedList.push(abbr)
    }
  }

  if (expandedList.length > 0) {
    console.log(`[smart-import] Pre-expanded ${expandedList.length} abbreviations: ${expandedList.join(', ')}`)
  }

  return { expanded, expandedList }
}

// ── Build Glossary Prompt Section ─────────────────────────────────────

function buildGlossaryPrompt(abbreviations?: Record<string, string>): string {
  if (!abbreviations || Object.keys(abbreviations).length === 0) return ''
  const entries = Object.entries(abbreviations)
    .map(([a, e]) => `${a} = ${e}`)
    .join(', ')
  return `\n\nCOACH PERSONAL ABBREVIATIONS (these are the ONLY abbreviations you may expand — use the expansion in "name", preserve the original in "raw_name". Any abbreviation NOT listed here must be kept as-is in both fields):\n${entries}\n`
}

// ── Build Coach Context Hints ─────────────────────────────────────────

function buildCoachHints(coachPlanType?: string, coachTrainingFocus?: string): string {
  let hints = ''
  if (coachPlanType && coachPlanType !== 'auto') {
    hints += `\nCOACH INDICATED PLAN TYPE: "${coachPlanType}". Give this classification confidence >= 0.85 unless the document structure clearly contradicts it.\n`
  }
  if (coachTrainingFocus && coachTrainingFocus !== 'auto') {
    hints += `\nCOACH INDICATED TRAINING FOCUS: "${coachTrainingFocus}". Use this to guide sessionType classification for workouts.\n`
  }
  return hints
}

// ── Build Coach Resolutions Prompt ────────────────────────────────────
// Injected into extract step when coach reviewed classify and resolved ambiguities.

function buildResolutionsPrompt(
  classifyResult?: any,
  coachResolutions?: any,
): string {
  if (!classifyResult) return ''

  const lines: string[] = []
  lines.push('\nPRIOR CLASSIFICATION (confirmed by coach — do NOT re-detect structure):')
  lines.push(`- Document type: ${classifyResult.detected_type}`)
  if (classifyResult.duration_weeks) lines.push(`- Duration: ${classifyResult.duration_weeks} weeks`)
  if (classifyResult.progression_pattern) lines.push(`- Progression pattern: ${classifyResult.progression_pattern}`)
  if (classifyResult.load_metric) lines.push(`- Load metric: ${classifyResult.load_metric}`)
  if (classifyResult.deload_week) lines.push(`- Deload week: ${classifyResult.deload_week}`)

  if (classifyResult.canonical_workouts?.length) {
    const roster = classifyResult.canonical_workouts
      .map((w: any) => `${w.name} (${w.exercise_count} exercises)`)
      .join(', ')
    lines.push(`- Canonical workouts: ${roster}`)
  }

  if (classifyResult.block_config?.name) {
    lines.push(`- Block name: "${classifyResult.block_config.name}"`)
  }

  // Coach resolutions (resolved ambiguities)
  if (coachResolutions?.resolvedAmbiguities?.length) {
    lines.push('\nCOACH RESOLUTIONS (treat these as ground truth):')
    for (const amb of coachResolutions.resolvedAmbiguities) {
      lines.push(`- "${amb.originalValue}" at ${amb.location} → ${amb.resolvedValue}`)
    }
  }

  if (coachResolutions?.confirmedBlockName) {
    lines.push(`- Confirmed block name: "${coachResolutions.confirmedBlockName}"`)
  }

  lines.push('\nExtract according to this structure. Focus on accurate prescription parsing.')
  lines.push('')

  return lines.join('\n')
}

// ── Main Handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse()

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await sb.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ── Parse Request ──
    const body = await req.json()
    const {
      fileContent: rawContent,
      fileType,
      fileName,
      preParsed,
      coachAbbreviations,
      coachSport,
      coachPlanType,
      coachTrainingFocus,
      step,
      classifyResult,
      coachResolutions,
    } = body

    if (!step || !['classify', 'extract'].includes(step)) {
      return json({ error: 'Missing or invalid step parameter. Must be "classify" or "extract".' }, 400)
    }
    if (!rawContent || !fileType || !fileName) {
      return json({ error: 'Missing fileContent, fileType, or fileName' }, 400)
    }

    console.log(`[smart-import] file=${fileName} type=${fileType} preParsed=${preParsed} step=${step} len=${rawContent.length}`)

    // ── Abbreviation Pre-Expansion ──
    let fileContent = rawContent
    let expandedAbbrs: string[] = []

    if (coachAbbreviations && typeof coachAbbreviations === 'object' && preParsed) {
      const result = expandAbbreviations(fileContent, coachAbbreviations)
      fileContent = result.expanded
      expandedAbbrs = result.expandedList
    }

    // ── Sport Detection (coach override wins) ──
    let sportSignal: SportSignal | null = null
    if (coachSport && coachSport !== 'auto' && SPORT_RULES[coachSport]) {
      const sportLabel = SPORT_SIGNATURES.find(s => s.category === coachSport)?.sport ?? coachSport
      sportSignal = { sport: sportLabel, category: coachSport, confidence: 100 }
      console.log(`[sport-detect] Coach override: ${coachSport} → ${sportLabel}`)
    } else {
      sportSignal = preParsed ? detectSport(fileContent) : detectSport(fileName)
    }

    const sportRules = sportSignal
      ? (SPORT_RULES[sportSignal.category] || GENERAL_SPORT_RULES)
      : GENERAL_SPORT_RULES

    // ── Shared prompt fragments ──
    const glossaryPrompt = buildGlossaryPrompt(coachAbbreviations)
    const coachHints = buildCoachHints(coachPlanType, coachTrainingFocus)

    if (coachHints) {
      console.log(`[smart-import] Coach context: sport=${coachSport ?? 'auto'} planType=${coachPlanType ?? 'auto'} focus=${coachTrainingFocus ?? 'auto'}`)
    }

    // ═══════════════════════════════════════════════════════════════════
    // CLASSIFY STEP
    // ═══════════════════════════════════════════════════════════════════
    if (step === 'classify') {
      console.log(`[smart-import] CLASSIFY step — detecting mesocycle structure`)

      const classifySchema = buildClassifySchema(sportRules)
      const instruction = preParsed
        ? `Analyze this training program for mesocycle structure: "${fileName}"

HOW TO READ THIS DATA:
The spreadsheet has been pre-parsed into JSON. Each row is a JSON object where keys are column headers and values are cell contents.

CRITICAL: Look for multi-week patterns:
- Layout A (Horizontal): Week columns across the top, exercises down the left
- Layout B (Vertical): Order column groups rows. Week column distinguishes weeks. Blank exercise name = inherits from same Order number.
- Group ALL rows sharing the same Order number as ONE exercise across weeks.

${classifySchema}${glossaryPrompt}${coachHints}`
        : `Analyze this training program for mesocycle structure: "${fileName}".\n\n${classifySchema}${glossaryPrompt}${coachHints}`

      const messages = buildContentBlocks(fileContent, fileType, fileName, preParsed, instruction)
      const result = await callClaude(SONNET, 30000, messages, CLASSIFY_SYSTEM)

      // Parse classification
      let classification: any
      try {
        classification = extractJSON(result.text)
      } catch {
        console.error('[smart-import] Classify JSON parse failed:', result.text.substring(0, 500))
        return json({ error: 'Failed to parse classification response', raw: result.text.substring(0, 500) }, 500)
      }

      // Log (non-blocking)
      const classifyTokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
      try {
        await sb.from('ai_plan_logs').insert({
          coach_id: user.id,
          tier: 'import',
          action: 'smart_import_classify',
          prompt: `${fileName} (${fileType}) [Sonnet classify] type=${classification.detected_type}`,
          response: JSON.stringify(classification).substring(0, 5000),
          model: SONNET,
          tokens_used: classifyTokens,
        } as any)
      } catch (e) {
        console.warn('[smart-import] ai_plan_logs insert failed (non-fatal):', e)
      }

      return json({
        success: true,
        step: 'classify',
        classification,
        model: SONNET,
        usage: result.usage,
        detectedSport: sportSignal?.sport ?? classification.block_config?.sport ?? null,
        sportCategory: sportSignal?.category ?? null,
        sportConfidence: sportSignal?.confidence ?? 0,
      })
    }

    // ═══════════════════════════════════════════════════════════════════
    // EXTRACT STEP
    // ═══════════════════════════════════════════════════════════════════
    console.log(`[smart-import] EXTRACT step${classifyResult ? ' (with coach resolutions)' : ' (direct)'}`)

    const schema = buildSchema(sportRules)
    const resolutionsPrompt = buildResolutionsPrompt(classifyResult, coachResolutions)

    const extractInstruction = preParsed
      ? `Parse this training program spreadsheet: "${fileName}"

HOW TO READ THIS DATA:
The spreadsheet has been pre-parsed into JSON. Each row is a JSON object where keys are column headers and values are cell contents. A "Columns:" line lists all column headers in order.

CRITICAL RULES FOR READING THE JSON:
1. null = empty cell. It is INTENTIONALLY empty. DO NOT shift, borrow, or infer data from adjacent columns to fill it.
   {"Sets": null, "Reps": 4, "Distance": 10, "Note": "PP"} means: sets=null, reps=4, distance=10, note=PP.
   WRONG: moving Reps→Sets, Distance→Reps, Note→Distance. That destroys the data.
2. Each column has ONE fixed meaning. Read LITERALLY what is there. If a cell is null, output null for that field. Training data is intentionally sparse — coaches leave fields blank on purpose (e.g. no sets needed, or no modifier note for a plain sprint). Empty is valid, not an error.
3. Keys like "_col3", "_col5" are columns the coach left unlabeled. These often contain IMPORTANT exercise data (reps, distances, intensities, rest periods). You MUST figure out what each _col means by examining the data patterns.
4. The same column can serve different purposes in different rows. A column that holds a session type name in one row might hold an exercise prescription number in the next.

ANTI-SHIFTING RULE (THIS IS THE MOST IMPORTANT RULE):
NEVER move a value from one column into a different output field. The column-to-field mapping is FIXED:
- Set column → "sets" field ONLY
- Rep column → "reps" field ONLY
- Distance column → "distance_meters" field ONLY
- Note column → "raw_name" field ONLY
If Set is null, output sets as null. Do NOT put the Rep value into sets.
If Rep is null, output reps as null. Do NOT put the Distance value into reps.
If Note is null, output raw_name as null and name as the activity type (e.g. "Sprint" for <=400m, "Run" for >400m). Do NOT put the distance in the name — it belongs in distance_meters.
EVERY column maps to EXACTLY ONE output field. No exceptions. No "smart" inference.

PRE-GROUPED SEASON PLAN DATA:
If the data begins with "PRE-GROUPED SEASON PLAN DATA", exercises are ALREADY separated by week and session.
Each session lists its exercises with fields: Set, Rep, Distance, Note.
Map these fields EXACTLY:
- "Set" → output "sets". If absent, OMIT (do NOT guess or default to 1).
- "Rep" → output "reps". DO NOT put this into "sets".
- "Distance" → output "distance_meters". DO NOT put this into "reps".
- "Note" → output "raw_name". This is the drill/start type abbreviation. If absent, it's a plain sprint.
- The session name (e.g. "Speed 1") → output as the workout "name".
- The day in parentheses (e.g. "TUESDAY") → use for dayOfWeek mapping.

MULTI-SHEET SEASON PLANS: If the data begins with "DOCUMENT STRUCTURE: Multi-sheet season plan", the WEEKLY SCHEDULE maps weeks to session types, and each detail sheet contains exercises for one session type. Extract exercises ONLY from detail sheets. Never treat session type names as exercises.
${resolutionsPrompt}
${schema}${glossaryPrompt}${coachHints}`
      : `Extract the training program from "${fileName}".\n\n${resolutionsPrompt}${schema}${glossaryPrompt}${coachHints}`

    const messages = buildContentBlocks(fileContent, fileType, fileName, preParsed, extractInstruction)
    const result = await callClaude(SONNET, 50000, messages, SYSTEM)

    // ── Parse the JSON ──
    let importResult: any
    try {
      importResult = extractJSON(result.text)
    } catch {
      console.error('[smart-import] JSON parse failed. Raw (first 1000):', result.text.substring(0, 1000))
      return json({ error: 'Failed to parse AI response as JSON', raw: result.text.substring(0, 500) }, 500)
    }

    // Extract plan type classification
    const detectedPlanType = importResult.detected_plan_type || 'block_plan'
    const planTypeConfidence = importResult.plan_type_confidence ?? 0.5
    console.log(`[smart-import] Plan type: ${detectedPlanType} (confidence: ${planTypeConfidence})`)

    // Validate required fields
    if (!importResult.programName) {
      return json({ error: 'AI response missing programName' }, 500)
    }

    // Evolving session uses a different structure
    const isEvolving = detectedPlanType === 'evolving_session'
      && Array.isArray(importResult.exercises)
      && importResult.exercises.length > 0

    if (!isEvolving) {
      if (!Array.isArray(importResult.blocks) || importResult.blocks.length === 0) {
        // Backward compat: wrap flat weeks[] in a single block
        if (Array.isArray(importResult.weeks) && importResult.weeks.length > 0) {
          importResult.blocks = [{
            name: importResult.programName,
            blockType: null,
            weeks: importResult.weeks,
          }]
          delete importResult.weeks
        } else {
          return json({ error: 'AI response missing blocks[] or weeks[]' }, 500)
        }
      }
    }

    // Extract ambiguities separately
    const ambiguities = Array.isArray(importResult.ambiguities) ? importResult.ambiguities : []
    if (ambiguities.length > 0) {
      console.log(`[smart-import] ${ambiguities.length} ambiguities flagged by AI`)
    }
    delete importResult.ambiguities

    // Attach plan type info
    importResult.detectedPlanType = detectedPlanType
    importResult.planTypeConfidence = planTypeConfidence

    // ── Log (non-blocking) ──
    const tokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
    try {
      await sb.from('ai_plan_logs').insert({
        coach_id: user.id,
        tier: 'import',
        action: 'smart_import',
        prompt: `${fileName} (${fileType}) [Sonnet] type=${detectedPlanType}${coachSport ? ' sport=' + coachSport : ''}${classifyResult ? ' with_resolutions' : ''}`,
        response: JSON.stringify(importResult).substring(0, 5000),
        model: SONNET,
        tokens_used: tokens,
      } as any)
    } catch (e) {
      console.warn('[smart-import] ai_plan_logs insert failed (non-fatal):', e)
    }

    return json({
      success: true,
      step: 'extract',
      importResult,
      ambiguities,
      model: SONNET,
      usage: result.usage,
      detectedSport: sportSignal?.sport ?? importResult.sport ?? null,
      sportCategory: sportSignal?.category ?? null,
      sportConfidence: sportSignal?.confidence ?? 0,
      expandedAbbreviations: expandedAbbrs,
      detectedPlanType,
      planTypeConfidence,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[smart-import] ERROR:', msg)
    if (err instanceof Error && err.stack) console.error(err.stack)
    return json({ error: msg || 'Internal server error' }, 500)
  }
})
