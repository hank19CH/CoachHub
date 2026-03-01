/**
 * aiImport.ts — Smart Import v34
 *
 * Two-step AI pipeline:
 *   1. classifyImport() → detect mesocycle structure, flag questions for coach
 *   2. importProgram()  → full extraction using coach's answers from review
 *
 * All file parsing is handled by importFileParser.ts.
 * Both functions accept optional PreparedContent to avoid re-parsing.
 * importProgram() accepts optional CoachResolutions from the classify review step.
 *
 * Code-only extraction (spreadsheetExtractor) removed — deferred to post-beta.
 */

import { supabase } from '@/lib/supabase'
import { AI_CONFIG } from '@/config/ai'
import type {
  ImportResult, ImportBlock, ImportWeek, ImportWorkout, ImportExercise,
  ImportHistoryRecord, EvolvingExercise, PreImportContext,
  ImportClassification, PreparedContent, CoachResolutions,
} from '@/types/import'
import { plansService } from '@/services/plans'
import { prepareFileContent } from '@/services/importFileParser'

/** Max time (ms) to wait for AI processing before aborting.
 *  PDF extraction with Sonnet can take 100-120s server-side; 300s gives headroom. */
const IMPORT_TIMEOUT_MS = 300_000 // 5 minutes

/**
 * Parse a weight string from AI into database-compatible fields.
 * "100kg" → { weight_kg: 100 }
 * "225lbs" → { weight_kg: ~102 }
 * "80%" → handled via intensity_percent, skip here
 * Anything else → append to notes
 */
function parseWeight(weight: string): Record<string, any> {
  if (!weight) return {}
  const trimmed = weight.trim().toLowerCase()

  // Skip percentages — already mapped to intensity_percent by AI
  if (trimmed.endsWith('%')) return {}

  // kg value
  const kgMatch = trimmed.match(/^([\d.]+)\s*kg$/i)
  if (kgMatch) return { weight_kg: parseFloat(kgMatch[1]) }

  // lbs → convert to kg
  const lbMatch = trimmed.match(/^([\d.]+)\s*(lbs?|pounds?)$/i)
  if (lbMatch) return { weight_kg: Math.round(parseFloat(lbMatch[1]) * 0.4536 * 10) / 10 }

  // Unrecognized format — don't lose it
  return { intensity_prescription: weight }
}

/** Active abort controller - allows cancellation from outside */
let activeAbortController: AbortController | null = null

/**
 * Cancel any in-flight import request.
 * Safe to call even if nothing is processing.
 */
export function cancelActiveImport() {
  if (activeAbortController) {
    activeAbortController.abort()
    activeAbortController = null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFY — Step 1 of 2
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify a file for mesocycle structure (step 1 of 2).
 * Returns classification with detected exercises, progression pattern,
 * and week samples — but writes nothing to the database.
 * The coach reviews the classification before confirming extraction.
 *
 * Accepts optional PreparedContent to avoid re-parsing.
 * Returns BOTH classification AND preparedContent so extract can reuse it.
 */
export async function classifyImport(
  file: File,
  signal?: AbortSignal,
  preImportContext?: PreImportContext,
  prepared?: PreparedContent,
): Promise<{ classification: ImportClassification; preparedContent: PreparedContent; authData: { accessToken: string; coachId: string } }> {
  // Validate file
  console.log(`[SmartImport] Starting CLASSIFY: name=${file.name}, type=${file.type}, size=${file.size}`)

  if (file.size > AI_CONFIG.import.maxFileSize) {
    throw new Error(`File too large. Max size: ${AI_CONFIG.import.maxFileSize / 1024 / 1024}MB`)
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  const typeOk = AI_CONFIG.import.supportedTypes.includes(file.type)
  const extOk = AI_CONFIG.import.supportedExtensions.includes(ext)
  if (!typeOk && !extOk) {
    throw new Error(`Unsupported file type: ${file.type} (${ext})`)
  }

  // Single auth call — getSession gives us both user identity and access token
  // Avoids triple-lock (refreshSession → getUser → getSession) which deadlocks
  console.log('[SmartImport] Getting auth session...')
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw new Error(`Auth error: ${sessionError.message}`)
  const accessToken = sessionData.session?.access_token
  const coachId = sessionData.session?.user?.id
  if (!accessToken || !coachId) throw new Error('Not authenticated')
  console.log(`[SmartImport] Auth OK, coach=${coachId}`)

  // Prepare file content (reuse if already prepared)
  const preparedContent = prepared ?? await prepareFileContent(file, coachId)
  console.log(`[SmartImport] File prepared: preParsed=${preparedContent.preParsed}, contentLen=${preparedContent.fileContent.length}, abbrs=${Object.keys(preparedContent.coachAbbreviations).length}`)

  // Call edge function with step: 'classify'
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  // Build a race-free abort signal: timeout OR external cancellation
  // Uses AbortSignal.any() to avoid the addEventListener race condition
  // (adding an abort listener to an already-aborted signal fires synchronously)
  const timeoutSignal = AbortSignal.timeout(IMPORT_TIMEOUT_MS)
  const fetchSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal

  // NOTE: No auth keepalive here. Sessions last 1 hour; classify/extract take 1-2 min.
  // The old keepalive called refreshSession() every 20s which acquired navigator.locks,
  // causing deadlocks when importProgram()'s supabase client calls tried getSession().

  const hasAbbreviations = Object.keys(preparedContent.coachAbbreviations).length > 0

  console.log(`[SmartImport] Sending classify request to Edge Function... (signal.aborted=${fetchSignal.aborted})`)
  const response = await fetch(`${supabaseUrl}/functions/v1/smart-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({
      fileContent: preparedContent.fileContent,
      fileType: preparedContent.fileType,
      fileName: file.name,
      preParsed: preparedContent.preParsed,
      step: 'classify',
      ...(hasAbbreviations ? { coachAbbreviations: preparedContent.coachAbbreviations } : {}),
      ...(preImportContext?.coachSport ? { coachSport: preImportContext.coachSport } : {}),
      ...(preImportContext?.coachPlanType ? { coachPlanType: preImportContext.coachPlanType } : {}),
      ...(preImportContext?.coachTrainingFocus ? { coachTrainingFocus: preImportContext.coachTrainingFocus } : {}),
    }),
    signal: fetchSignal,
  })

  console.log(`[SmartImport] Classify response: status=${response.status}`)
  const responseText = await response.text()
  let data: any
  try { data = JSON.parse(responseText) }
  catch { throw new Error(`Edge Function returned ${response.status}: ${responseText.substring(0, 200)}`) }

  if (!response.ok) throw new Error(data?.error || `Edge Function returned ${response.status}`)
  if (!data?.success) throw new Error(data?.error || 'Classification failed')

  console.log(`[SmartImport] Classification result: type=${data.classification?.detected_type}, confidence=${data.classification?.confidence}`)
  return {
    classification: data.classification as ImportClassification,
    preparedContent,
    authData: { accessToken: accessToken!, coachId: coachId! },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT — Step 2 of 2
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload file and process with AI via Edge Function.
 *
 * v34 changes:
 * - Accepts optional PreparedContent (reuses classify parse — no duplicate SheetJS work)
 * - Accepts optional CoachResolutions (threaded from classify review into extract prompt)
 * - Code-only extraction removed (deferred to post-beta)
 * - Sends explicit `step: 'extract'` to edge function
 */
export async function importProgram(
  file: File,
  signal?: AbortSignal,
  preImportContext?: PreImportContext,
  coachResolutions?: CoachResolutions,
  prepared?: PreparedContent,
  cachedAuth?: { accessToken: string; coachId: string },
): Promise<{
  importResult: ImportResult
  historyRecord: ImportHistoryRecord
  expandedAbbreviations?: string[]
}> {
  const startTime = Date.now()

  // Validate file
  console.log(`[SmartImport] Starting EXTRACT: name=${file.name}, type=${file.type}, size=${file.size}`)

  if (file.size > AI_CONFIG.import.maxFileSize) {
    throw new Error(`File too large. Max size: ${AI_CONFIG.import.maxFileSize / 1024 / 1024}MB`)
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  const typeOk = AI_CONFIG.import.supportedTypes.includes(file.type)
  const extOk = AI_CONFIG.import.supportedExtensions.includes(ext)
  if (!typeOk && !extOk) {
    throw new Error(`Unsupported file type: ${file.type} (${ext})`)
  }
  if (!typeOk && extOk) {
    console.warn(`[SmartImport] MIME type "${file.type}" not in allowlist, but extension "${ext}" is valid — proceeding`)
  }

  // Use cached auth from classify step if available (avoids navigator.locks contention
  // from getSession() which can deadlock after the classify→review→extract flow).
  // Falls back to getSession() for standalone extract calls.
  let coachId: string
  let sessionData: any = null
  if (cachedAuth) {
    coachId = cachedAuth.coachId
    console.log(`[SmartImport] Using cached auth, coach=${coachId}`)
  } else {
    console.log('[SmartImport] Getting auth session...')
    const { data: sd, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      console.warn('[SmartImport] Session error:', sessionError.message)
    }
    sessionData = sd
    coachId = sd.session?.user?.id
    if (!coachId) throw new Error('Not authenticated')
    console.log(`[SmartImport] Auth OK, coach=${coachId}`)
  }

  // Check for duplicate: same file already processing
  console.log('[SmartImport] Checking for duplicate processing record...')
  const { data: existing, error: dupError } = await (supabase as any)
    .from('import_history')
    .select('id, created_at')
    .eq('coach_id', coachId)
    .eq('file_name', file.name)
    .eq('file_size_bytes', file.size)
    .eq('status', 'processing')
    .limit(1)

  if (dupError) console.warn('[SmartImport] Duplicate check error (non-fatal):', dupError.message)
  console.log(`[SmartImport] Duplicate check done, found=${existing?.length ?? 0}`)

  if (existing && existing.length > 0) {
    const staleThreshold = 5 * 60 * 1000 // 5 minutes
    const recordAge = Date.now() - new Date(existing[0].created_at).getTime()

    if (recordAge > staleThreshold) {
      console.warn(`[SmartImport] Clearing stale processing record ${existing[0].id} (${Math.round(recordAge / 60000)}m old)`)
      await (supabase as any)
        .from('import_history')
        .update({ status: 'failed', error_message: 'Timed out (stale processing record cleared)' })
        .eq('id', existing[0].id)
    } else {
      throw new Error('This file is already being processed. Please wait for it to finish.')
    }
  }

  // 1. Create import history record (status: processing)
  console.log('[SmartImport] Creating import history record...')
  const { data: historyRecord, error: historyError } = await (supabase as any)
    .from('import_history')
    .insert({
      coach_id: coachId,
      file_name: file.name,
      file_type: file.type,
      file_size_bytes: file.size,
      status: 'processing'
    })
    .select()
    .single()

  if (historyError) throw new Error(historyError.message)
  console.log(`[SmartImport] History record created: ${historyRecord.id}`)

  // Build a race-free abort signal: timeout OR external cancellation
  cancelActiveImport() // cancel any prior request
  const timeoutSignal = AbortSignal.timeout(IMPORT_TIMEOUT_MS)
  const fetchSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal

  try {
    // 2. Upload to Supabase Storage
    console.log('[SmartImport] Uploading file to storage...')
    const storagePath = `${coachId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('program-imports')
      .upload(storagePath, file)

    if (uploadError) throw new Error(uploadError.message)
    console.log(`[SmartImport] File uploaded: ${storagePath}`)

    await (supabase as any)
      .from('import_history')
      .update({ storage_path: storagePath })
      .eq('id', historyRecord.id)

    if (fetchSignal.aborted) {
      throw new Error('Import cancelled')
    }

    // 3. Prepare file content (reuse if already prepared from classify step)
    const preparedContent = prepared ?? await prepareFileContent(file, coachId)
    const hasAbbreviations = Object.keys(preparedContent.coachAbbreviations).length > 0

    console.log(`[SmartImport] Sending to Edge Function: step=extract, preParsed=${preparedContent.preParsed}, contentLength=${preparedContent.fileContent.length}${coachResolutions ? ', with coach resolutions' : ''}`)

    // 4. Process with AI via Edge Function
    // Use cached token from classify step, or from the getSession() call above
    const accessToken = cachedAuth?.accessToken ?? sessionData?.session?.access_token
    if (!accessToken) throw new Error('No active session')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    // NOTE: No auth keepalive here. Sessions last 1 hour; extraction takes 1-2 min.
    // The old keepalive called refreshSession() every 20s which acquired navigator.locks,
    // causing deadlocks when supabase client calls tried getSession() internally.
    // The access token is cached from the classify step (or fetched fresh above).

    console.log(`[SmartImport] Sending extract request... (signal.aborted=${fetchSignal.aborted})`)
    const response = await fetch(`${supabaseUrl}/functions/v1/smart-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({
        fileContent: preparedContent.fileContent,
        fileType: preparedContent.fileType,
        fileName: file.name,
        preParsed: preparedContent.preParsed,
        step: 'extract',
        ...(hasAbbreviations ? { coachAbbreviations: preparedContent.coachAbbreviations } : {}),
        ...(preImportContext?.coachSport ? { coachSport: preImportContext.coachSport } : {}),
        ...(preImportContext?.coachPlanType ? { coachPlanType: preImportContext.coachPlanType } : {}),
        ...(preImportContext?.coachTrainingFocus ? { coachTrainingFocus: preImportContext.coachTrainingFocus } : {}),
        // v34: Thread classify result + coach resolutions into extract
        ...(coachResolutions?.classifyResult ? { classifyResult: coachResolutions.classifyResult } : {}),
        ...(coachResolutions ? {
          coachResolutions: {
            resolvedAmbiguities: coachResolutions.resolvedAmbiguities?.filter(a => a.resolved) ?? [],
            confirmedBlockName: coachResolutions.confirmedBlockName,
          }
        } : {}),
      }),
      signal: fetchSignal,
    })

    // Read response body regardless of status code
    console.log(`[SmartImport] Edge Function responded: status=${response.status}`)
    let data: any
    const responseText = await response.text()
    console.log(`[SmartImport] Response body: ${responseText.length} chars`)
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error('[SmartImport] Non-JSON response:', responseText.substring(0, 500))
      throw new Error(`Edge Function returned ${response.status}: ${responseText.substring(0, 200)}`)
    }

    if (!response.ok) {
      console.error('[SmartImport] Edge Function error response:', data)
      throw new Error(data?.error || `Edge Function returned ${response.status}`)
    }

    if (!data?.success) throw new Error(data?.error || 'AI processing returned no result')

    const importResult: ImportResult = data.importResult
    // Attach ambiguities from edge function response
    if (Array.isArray(data.ambiguities) && data.ambiguities.length > 0) {
      importResult.ambiguities = data.ambiguities
      console.log(`[SmartImport] ${data.ambiguities.length} ambiguities flagged for coach review`)
    }
    console.log(`[SmartImport] AI result: planType=${importResult.detectedPlanType}, blocks=${importResult.blocks?.length ?? 0}, weeks=${importResult.weeks?.length ?? 0}`)

    // Normalize evolving_session format → standard blocks[] format
    if (importResult.detectedPlanType === 'evolving_session' && (importResult as any).exercises) {
      normalizeEvolvingSession(importResult)
    }

    // 5. Calculate processing metrics
    const processingTime = Date.now() - startTime
    const estimatedCost = AI_CONFIG.import.estimatedCostPerImport

    // Count imported items
    const allWeeks = importResult.blocks
      ? importResult.blocks.flatMap(b => b.weeks ?? [])
      : (importResult.weeks ?? [])
    const workoutsCount = allWeeks.reduce(
      (sum, week) => sum + (week.workouts ?? []).length,
      0
    )
    const exercisesCount = allWeeks.reduce(
      (sum, week) => sum + (week.workouts ?? []).reduce(
        (wsum, workout) => wsum + (workout.exercises ?? []).length,
        0
      ),
      0
    )

    console.log(`[SmartImport] Parsed: ${workoutsCount} workouts, ${exercisesCount} exercises in ${processingTime}ms`)

    // 6. Update import history
    // 6a. Update metadata + status
    try {
      const { error: updateError } = await (supabase as any)
        .from('import_history')
        .update({
          ai_model_used: data.model || 'claude-sonnet-4-5',
          processing_cost_usd: estimatedCost,
          processing_time_ms: processingTime,
          programs_imported: 1,
          workouts_imported: workoutsCount,
          exercises_imported: exercisesCount,
          detected_periodization: importResult.periodization,
          detected_duration_weeks: importResult.durationWeeks,
          detected_sport: importResult.sport,
          detected_plan_type: importResult.detectedPlanType ?? null,
          plan_type_confidence: importResult.planTypeConfidence ?? null,
          status: 'success',
        })
        .eq('id', historyRecord.id)

      if (updateError) {
        console.warn('[SmartImport] DB metadata update failed (non-fatal):', updateError)
      } else {
        console.log(`[SmartImport] Import complete — record ${historyRecord.id} updated`)
      }
    } catch (dbErr) {
      console.warn('[SmartImport] DB metadata update threw (non-fatal):', dbErr)
    }

    // 6b. Cache AI result separately (large payload, non-blocking)
    ;(supabase as any)
      .from('import_history')
      .update({ ai_result: importResult })
      .eq('id', historyRecord.id)
      .then(({ error: cacheErr }: any) => {
        if (cacheErr) console.warn('[SmartImport] Failed to cache ai_result (non-critical):', cacheErr)
        else console.log('[SmartImport] AI result cached for resume')
      })

    const updatedHistory: ImportHistoryRecord = {
      ...historyRecord,
      ai_model_used: data.model || 'claude-sonnet-4-5',
      processing_cost_usd: estimatedCost,
      processing_time_ms: processingTime,
      programs_imported: 1,
      workouts_imported: workoutsCount,
      exercises_imported: exercisesCount,
      detected_periodization: importResult.periodization,
      detected_duration_weeks: importResult.durationWeeks,
      detected_sport: importResult.sport,
      detected_plan_type: importResult.detectedPlanType ?? null,
      plan_type_confidence: importResult.planTypeConfidence ?? null,
      status: 'success',
    }

    return {
      importResult,
      historyRecord: updatedHistory,
      expandedAbbreviations: (data.expandedAbbreviations as string[]) || [],
    }

  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError'
    const message = isAbort
      ? 'Import timed out or was cancelled'
      : error instanceof Error ? error.message : 'Unknown error'

    console.error(`[SmartImport] Import failed: ${message}`, error)

    try {
      await supabase.auth.refreshSession()
      await (supabase as any)
        .from('import_history')
        .update({
          status: 'failed',
          error_message: message.substring(0, 500)
        })
        .eq('id', historyRecord.id)
    } catch (updateErr) {
      console.error('[SmartImport] Failed to update import_history to failed status:', updateErr)
    }

    throw isAbort ? new Error(message) : error
  } finally {
    // AbortSignal.timeout() manages its own timer — no clearTimeout needed.
    // Cancellation is handled by the external signal from SmartImportView.
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Normalization helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert evolving_session format (exercises[] with weeks[] per exercise)
 * into standard blocks[] format so the preview UI and save logic work unchanged.
 */
function normalizeEvolvingSession(importData: any): void {
  const exercises = importData.exercises as EvolvingExercise[] | undefined
  if (!exercises || exercises.length === 0) return

  const sessionName = importData.session_name || importData.programName || 'Session'
  const weekCount = importData.evolution_weeks || importData.durationWeeks || 1

  const weekNumbers = new Set<number>()
  for (const ex of exercises) {
    for (const w of ex.weeks ?? []) {
      weekNumbers.add(w.week_number)
    }
  }
  const sortedWeeks = Array.from(weekNumbers).sort((a, b) => a - b)
  if (sortedWeeks.length === 0) {
    sortedWeeks.push(1)
  }

  const weeks: ImportWeek[] = sortedWeeks.map(weekNum => {
    const weekExercises: ImportExercise[] = exercises.map(ex => {
      const weekData = (ex.weeks ?? []).find(w => w.week_number === weekNum)
      return {
        name: ex.name,
        sets: weekData?.sets,
        reps: weekData?.reps,
        weight: weekData?.weight,
        intensity_percent: weekData?.load_percent,
        rest_seconds: ex.rest_seconds,
        notes: ex.notes,
      }
    })

    return {
      weekNumber: weekNum,
      name: `Week ${weekNum}`,
      workouts: [{
        name: sessionName,
        dayOfWeek: 1,
        sessionType: undefined,
        exercises: weekExercises,
      }],
    }
  })

  importData.blocks = [{
    name: importData.programName || sessionName,
    blockType: undefined,
    weeks,
  }]

  if (!importData.durationWeeks || importData.durationWeeks < sortedWeeks.length) {
    importData.durationWeeks = sortedWeeks.length
  }

  delete importData.exercises
  delete importData.session_name
  delete importData.evolution_weeks
}

/**
 * Normalize import data: ensure blocks[] exists (backward compat for cached old results)
 */
function normalizeImportBlocks(importData: ImportResult): ImportBlock[] {
  if (importData.blocks && importData.blocks.length > 0) {
    return importData.blocks
  }
  if (importData.weeks && importData.weeks.length > 0) {
    return [{
      name: importData.programName,
      blockType: undefined,
      weeks: importData.weeks,
    }]
  }
  throw new Error('Import data has no blocks or weeks')
}

// ═══════════════════════════════════════════════════════════════════════════
// Save functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Save imported program to database using Sprint 9 Planner tables.
 *
 * Sprint 12 architecture: sessions are self-contained by default.
 * Exercise data is stored in plan_sessions.session_data JSONB.
 * Workouts records are NOT auto-created (they flood the coach's library).
 *
 * Sessions flagged for library promotion (via libraryFlags) get a linked
 * workouts record with is_library = true + exercises copied to the exercises table.
 *
 * Creates: plan → training_blocks → block_weeks → plan_sessions (with session_data)
 * Optionally: workouts + exercises (only for library-flagged sessions)
 *
 * Returns the plan ID for navigation to /coach/planner/:planId
 */
export async function saveImportedProgram(
  importData: ImportResult,
  historyId?: string,
  libraryFlags?: Set<string>,
): Promise<string> {
  const user = await supabase.auth.getUser()
  const coachId = user.data.user?.id
  if (!coachId) throw new Error('Not authenticated')

  const blocks = normalizeImportBlocks(importData)
  const planType = importData.detectedPlanType ?? 'block_plan'

  const totalWorkouts = blocks.reduce((s, b) => s + (b.weeks ?? []).reduce((ws, w) => ws + (w.workouts ?? []).length, 0), 0)
  console.log(`[SmartImport Save] Starting: ${blocks.length} blocks, ${totalWorkouts} sessions, planType=${planType}`)

  // 1. Create plan
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + (importData.durationWeeks || 1) * 7)

  let plan: any
  try {
    plan = await plansService.createPlan({
      coach_id: coachId,
      name: importData.programName,
      periodization_model: importData.periodization || null,
      status: 'draft',
      start_date: today.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      goal_description: `Imported via Smart Import — ${importData.periodization} periodization`,
      ai_generated: false,
      plan_type: planType,
    } as any)
    console.log(`[SmartImport Save] Plan created: ${plan.id}`)
  } catch (err) {
    console.error('[SmartImport Save] Failed to create plan:', err)
    throw err
  }

  // 2. For each block: create training_block, then self-contained plan_sessions
  let savedSessions = 0
  let savedExercises = 0
  let libraryWorkouts = 0

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const blockData = blocks[blockIndex]

    let trainingBlock: any
    try {
      trainingBlock = await plansService.createBlock({
        plan_id: plan.id,
        name: blockData.name || `Block ${blockIndex + 1}`,
        block_type: blockData.blockType ?? null,
        duration_weeks: blockData.weeks.length,
        order_index: blockIndex,
        ai_generated: false,
      })
      console.log(`[SmartImport Save] Block ${blockIndex + 1}/${blocks.length}: "${blockData.name}" (${blockData.weeks.length} weeks)`)
    } catch (err) {
      console.error(`[SmartImport Save] Failed to create block ${blockIndex + 1}:`, err)
      throw err
    }

    const blockWeeks = await plansService.getBlockWeeks(trainingBlock.id)

    for (let weekIndex = 0; weekIndex < (blockData.weeks ?? []).length; weekIndex++) {
      const weekData = blockData.weeks[weekIndex]
      const blockWeek = blockWeeks.find(bw => bw.week_number === weekData.weekNumber)
      if (!blockWeek) {
        console.warn(`[SmartImport Save] No block_week for week ${weekData.weekNumber} in "${blockData.name}"`)
        continue
      }

      const weekWorkouts = weekData.workouts ?? []
      if (weekWorkouts.length === 0) continue

      const daySessionCounts: Record<number, number> = {}
      const sessionRows: any[] = []

      for (let woi = 0; woi < weekWorkouts.length; woi++) {
        const w = weekWorkouts[woi]
        const dayKey = w.dayOfWeek - 1
        const orderIndex = daySessionCounts[dayKey] || 0
        daySessionCounts[dayKey] = orderIndex + 1

        const sessionExercises = (w.exercises ?? []).map((ex, ei) => ({
          order: ei,
          name: ex.name,
          raw_name: (ex.raw_name && ex.raw_name !== ex.name) ? ex.raw_name : undefined,
          sets: ex.sets != null ? String(ex.sets) : null,
          reps: ex.reps ?? undefined,
          distance_meters: ex.distance_meters ?? undefined,
          duration_seconds: ex.duration_seconds ?? undefined,
          rest_seconds: ex.rest_seconds ?? undefined,
          load_percent: ex.intensity_percent ?? undefined,
          intensity_percent: ex.intensity_percent ?? undefined,
          target_time_seconds: ex.target_time_seconds ?? undefined,
          weight: ex.weight ?? undefined,
          rpe: ex.rpe ?? undefined,
          tempo: ex.tempo ?? undefined,
          category: ex.category ?? undefined,
          notes: ex.notes ?? undefined,
          is_section_header: ex.is_section_header || undefined,
        }))

        savedExercises += sessionExercises.length

        const flagKey = `${blockIndex}-${weekIndex}-${woi}`
        const shouldPromote = libraryFlags?.has(flagKey) ?? false

        if (shouldPromote) {
          const { data: workout, error: wErr } = await (supabase as any)
            .from('workouts')
            .insert({
              coach_id: coachId,
              name: w.name,
              description: w.description || null,
              session_type: w.sessionType || null,
              is_library: true,
              is_template: true,
            })
            .select('id')
            .single()

          if (wErr) throw new Error(wErr.message)

          if (w.exercises?.length) {
            const exerciseRows = w.exercises.map((ex, ei) => ({
              workout_id: workout.id,
              name: ex.name,
              order_index: ei,
              sets: ex.sets ?? null,
              reps: ex.reps ?? null,
              notes: ex.notes ?? null,
              duration_seconds: ex.duration_seconds ?? null,
              distance_meters: ex.distance_meters ?? null,
              rpe: ex.rpe ?? null,
              intensity_percent: ex.intensity_percent ?? null,
              rest_seconds: ex.rest_seconds ?? null,
              target_time_seconds: ex.target_time_seconds ?? null,
              tempo: ex.tempo ?? null,
              category: ex.category ?? null,
              is_section_header: ex.is_section_header || false,
              ...(ex.weight ? parseWeight(ex.weight) : {}),
            }))

            await (supabase as any).from('exercises').insert(exerciseRows)
          }

          sessionRows.push({
            block_week_id: blockWeek.id,
            day_of_week: dayKey,
            order_index: orderIndex,
            session_name: w.name,
            session_data: sessionExercises,
            workout_id: workout.id,
          })
          libraryWorkouts++
        } else {
          sessionRows.push({
            block_week_id: blockWeek.id,
            day_of_week: dayKey,
            order_index: orderIndex,
            session_name: w.name,
            session_data: sessionExercises,
          })
        }
      }

      if (sessionRows.length > 0) {
        const { error: sessErr } = await (supabase as any)
          .from('plan_sessions')
          .insert(sessionRows)

        if (sessErr) {
          console.error(`[SmartImport Save] Session batch insert failed (block ${blockIndex + 1}, week ${weekData.weekNumber}):`, sessErr)
          throw new Error(sessErr.message)
        }

        savedSessions += sessionRows.length
      }
    }
  }

  console.log(`[SmartImport Save] Complete: ${savedSessions} sessions (${libraryWorkouts} promoted), ${savedExercises} exercises saved to plan ${plan.id}`)

  if (historyId) {
    await (supabase as any)
      .from('import_history')
      .update({
        ai_result: null,
        detected_plan_type: importData.detectedPlanType ?? null,
        plan_type_confidence: importData.planTypeConfidence ?? null,
      })
      .eq('id', historyId)
  }

  return plan.id
}

/**
 * Save an imported single session directly as a workout (no plan structure).
 * Used when detectedPlanType === 'single_session'.
 */
export async function saveImportedWorkout(
  importData: ImportResult,
  historyId?: string,
): Promise<{ id: string; type: 'workout' }> {
  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error('Not authenticated')
  const coachId = user.data.user.id

  const blocks = importData.blocks ?? []
  const firstWeek = blocks[0]?.weeks?.[0] ?? importData.weeks?.[0]
  const firstWorkout = firstWeek?.workouts?.[0]

  if (!firstWorkout) throw new Error('No workout found in import data')

  const { data: workout, error: wErr } = await (supabase as any)
    .from('workouts')
    .insert({
      coach_id: coachId,
      name: firstWorkout.name || importData.programName || 'Imported Workout',
      description: firstWorkout.description || null,
      session_type: firstWorkout.sessionType || null,
      is_library: true,
      is_template: true,
    })
    .select('id')
    .single()

  if (wErr) throw new Error(wErr.message)

  if (firstWorkout.exercises?.length) {
    const exerciseRows = firstWorkout.exercises.map((ex, ei) => ({
      workout_id: workout.id,
      name: ex.name,
      order_index: ei,
      sets: ex.sets ?? null,
      reps: ex.reps ?? null,
      notes: ex.notes ?? null,
      duration_seconds: ex.duration_seconds ?? null,
      distance_meters: ex.distance_meters ?? null,
      rpe: ex.rpe ?? null,
      intensity_percent: ex.intensity_percent ?? null,
      rest_seconds: ex.rest_seconds ?? null,
      target_time_seconds: ex.target_time_seconds ?? null,
      tempo: ex.tempo ?? null,
      category: ex.category ?? null,
      is_section_header: ex.is_section_header || false,
      ...(ex.weight ? parseWeight(ex.weight) : {}),
    }))

    const { error: exErr } = await (supabase as any)
      .from('exercises')
      .insert(exerciseRows)

    if (exErr) throw new Error(exErr.message)
  }

  console.log(`[SmartImport] Saved single session as workout ${workout.id} with ${firstWorkout.exercises?.length ?? 0} exercises`)

  if (historyId) {
    await (supabase as any)
      .from('import_history')
      .update({
        ai_result: null,
        detected_plan_type: 'single_session',
        plan_type_confidence: importData.planTypeConfidence ?? null,
        workouts_imported: 1,
        exercises_imported: firstWorkout.exercises?.length ?? 0,
        programs_imported: 0,
      })
      .eq('id', historyId)
  }

  return { id: workout.id, type: 'workout' }
}

/**
 * Get a cached (unsaved) AI import result from a previous successful extraction.
 * Returns null if no cached result exists or it's older than 24h.
 */
export async function getCachedImportResult(historyId: string): Promise<ImportResult | null> {
  const { data, error } = await (supabase as any)
    .from('import_history')
    .select('ai_result, created_at')
    .eq('id', historyId)
    .single()

  if (error || !data?.ai_result) return null

  // Expire after 24 hours
  const age = Date.now() - new Date(data.created_at).getTime()
  if (age > 24 * 60 * 60 * 1000) return null

  const result = data.ai_result as ImportResult

  // Normalize evolving_session cached results into blocks[] format
  if (result.detectedPlanType === 'evolving_session' && (result as any).exercises) {
    normalizeEvolvingSession(result)
  }

  return result
}

/**
 * Get import history for current coach
 */
export async function getImportHistory(limit = 20): Promise<ImportHistoryRecord[]> {
  // Use getSession instead of getUser to avoid auth lock contention
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { data, error } = await (supabase as any)
    .from('import_history')
    .select('*')
    .eq('coach_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  return (data || []).map((r: any) => ({
    ...r,
    has_cached_result: r.ai_result != null,
    ai_result: undefined,
  }))
}
