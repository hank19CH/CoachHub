import { supabase } from '@/lib/supabase'
import { AI_CONFIG } from '@/config/ai'
import type { ImportResult, ImportBlock, ImportHistoryRecord } from '@/types/import'
import { plansService } from '@/services/plans'
import { planSessionsService } from '@/services/planSessions'
import * as XLSX from 'xlsx'

/** Max time (ms) to wait for AI processing before aborting */
const IMPORT_TIMEOUT_MS = 120_000 // 2 minutes

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

/**
 * Upload file and process with AI via Edge Function
 */
export async function importProgram(file: File, signal?: AbortSignal): Promise<{
  importResult: ImportResult
  historyRecord: ImportHistoryRecord
}> {
  const startTime = Date.now()

  // Validate file
  if (file.size > AI_CONFIG.import.maxFileSize) {
    throw new Error(`File too large. Max size: ${AI_CONFIG.import.maxFileSize / 1024 / 1024}MB`)
  }

  if (!AI_CONFIG.import.supportedTypes.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`)
  }

  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error('Not authenticated')

  const coachId = user.data.user.id

  // Check for duplicate: same file already processing
  const { data: existing } = await (supabase as any)
    .from('import_history')
    .select('id, created_at')
    .eq('coach_id', coachId)
    .eq('file_name', file.name)
    .eq('file_size_bytes', file.size)
    .eq('status', 'processing')
    .limit(1)

  if (existing && existing.length > 0) {
    throw new Error('This file is already being processed. Please wait for it to finish.')
  }

  // 1. Create import history record (status: processing)
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

  // Set up abort controller with timeout
  cancelActiveImport() // cancel any prior request
  const abortController = new AbortController()
  activeAbortController = abortController

  // Wire external signal (from component) into our controller
  if (signal) {
    signal.addEventListener('abort', () => abortController.abort())
  }

  // Auto-timeout
  const timeoutId = setTimeout(() => abortController.abort(), IMPORT_TIMEOUT_MS)

  try {
    // 2. Upload to Supabase Storage
    const storagePath = `${coachId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('program-imports')
      .upload(storagePath, file)

    if (uploadError) throw new Error(uploadError.message)

    // Update storage path in history
    await (supabase as any)
      .from('import_history')
      .update({ storage_path: storagePath })
      .eq('id', historyRecord.id)

    // Check if already aborted
    if (abortController.signal.aborted) {
      throw new Error('Import cancelled')
    }

    // 3. Prepare file content for the Edge Function
    // Excel/CSV: pre-parse on the frontend with SheetJS -> send plain text (fast, cheap Haiku)
    // PDF/Images: send base64 for Sonnet vision/document parsing
    const isSpreadsheet = file.type.includes('excel') || file.type.includes('spreadsheet') || file.type === 'text/csv'

    let fileContent: string
    let sendAsText = false

    if (isSpreadsheet) {
      // Parse Excel/CSV in the browser with SheetJS
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetTexts: string[] = []

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        sheetTexts.push(`=== Sheet: ${sheetName} ===\n${csv}`)
      }

      fileContent = sheetTexts.join('\n\n')
      sendAsText = true

      // Truncate if extremely long (> 50k chars) to keep costs down
      if (fileContent.length > 50_000) {
        fileContent = fileContent.substring(0, 50_000) + '\n\n[TRUNCATED - file too large]'
      }
    } else {
      // PDF/Images: send as base64 for vision/document parsing
      fileContent = await fileToBase64(file)
    }

    // 4. Fetch coach abbreviation glossary (for pre-expansion + prompt injection)
    let coachAbbreviations: Record<string, string> = {}
    try {
      const { getAbbreviationMap } = await import('@/services/coachAbbreviations')
      coachAbbreviations = await getAbbreviationMap(coachId)
      const abbrCount = Object.keys(coachAbbreviations).length
      if (abbrCount > 0) {
        console.log(`[SmartImport] Loaded ${abbrCount} coach abbreviations`)
      }
    } catch (e) {
      console.warn('[SmartImport] Failed to load abbreviations (non-critical):', e)
    }

    // 5. Process with AI via Edge Function
    console.log(`[SmartImport] Sending to Edge Function: preParsed=${sendAsText}, contentLength=${fileContent.length}`)

    // Use raw fetch() instead of supabase.functions.invoke() so we can read
    // error response bodies (invoke() swallows them on non-2xx)
    const session = await supabase.auth.getSession()
    const accessToken = session.data.session?.access_token
    if (!accessToken) throw new Error('No active session')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const hasAbbreviations = Object.keys(coachAbbreviations).length > 0

    const response = await fetch(`${supabaseUrl}/functions/v1/smart-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({
        fileContent,
        fileType: file.type,
        fileName: file.name,
        preParsed: sendAsText,
        ...(hasAbbreviations ? { coachAbbreviations } : {}),
      }),
      signal: abortController.signal,
    })

    // Read response body regardless of status code
    let data: any
    const responseText = await response.text()
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

    // 5. Calculate processing metrics
    const processingTime = Date.now() - startTime
    const estimatedCost = AI_CONFIG.import.estimatedCostPerImport

    // Count imported items (null-safe — AI may omit empty arrays)
    // Support both blocks[] (new) and weeks[] (legacy cached) formats
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

    // 6. Update import history (status: success) + cache AI result
    const { data: updatedHistory, error: updateError } = await (supabase as any)
      .from('import_history')
      .update({
        ai_model_used: data.model || 'claude-haiku-4-5',
        processing_cost_usd: estimatedCost,
        processing_time_ms: processingTime,
        programs_imported: 1,
        workouts_imported: workoutsCount,
        exercises_imported: exercisesCount,
        detected_periodization: importResult.periodization,
        detected_duration_weeks: importResult.durationWeeks,
        detected_sport: importResult.sport,
        status: 'success',
        ai_result: importResult,
      })
      .eq('id', historyRecord.id)
      .select()
      .single()

    if (updateError) throw new Error(updateError.message)

    return {
      importResult,
      historyRecord: updatedHistory,
      expandedAbbreviations: (data.expandedAbbreviations as string[]) || [],
    }

  } catch (error) {
    // Determine user-friendly message
    const isAbort = error instanceof DOMException && error.name === 'AbortError'
    const message = isAbort
      ? 'Import timed out or was cancelled'
      : error instanceof Error ? error.message : 'Unknown error'

    // Update import history (status: failed)
    await (supabase as any)
      .from('import_history')
      .update({
        status: 'failed',
        error_message: message
      })
      .eq('id', historyRecord.id)

    throw isAbort ? new Error(message) : error
  } finally {
    clearTimeout(timeoutId)
    if (activeAbortController === abortController) {
      activeAbortController = null
    }
  }
}

/**
 * Normalize import data: ensure blocks[] exists (backward compat for cached old results)
 */
function normalizeImportBlocks(importData: ImportResult): ImportBlock[] {
  if (importData.blocks && importData.blocks.length > 0) {
    return importData.blocks
  }
  // Legacy cached result with flat weeks[] — wrap in single block
  if (importData.weeks && importData.weeks.length > 0) {
    return [{
      name: importData.programName,
      blockType: undefined,
      weeks: importData.weeks,
    }]
  }
  throw new Error('Import data has no blocks or weeks')
}

/**
 * Save imported program to database using Sprint 9 Planner tables.
 * Creates: plan → training_blocks → block_weeks → workouts → exercises + plan_sessions
 *
 * Optimized for large programs: batches workout/exercise/session inserts per-week
 * to minimize round-trips (~3 per week instead of ~3 per workout).
 *
 * Returns the plan ID for navigation to /coach/planner/:planId
 */
export async function saveImportedProgram(
  importData: ImportResult,
  historyId?: string
): Promise<string> {
  const user = await supabase.auth.getUser()
  const coachId = user.data.user?.id
  if (!coachId) throw new Error('Not authenticated')

  const blocks = normalizeImportBlocks(importData)

  const totalWorkouts = blocks.reduce((s, b) => s + (b.weeks ?? []).reduce((ws, w) => ws + (w.workouts ?? []).length, 0), 0)
  console.log(`[SmartImport Save] Starting: ${blocks.length} blocks, ${totalWorkouts} workouts`)

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
    })
    console.log(`[SmartImport Save] Plan created: ${plan.id}`)
  } catch (err) {
    console.error('[SmartImport Save] Failed to create plan:', err)
    throw err
  }

  // 2. For each block: create training_block (auto-creates block_weeks), then workouts + sessions
  let savedWorkouts = 0
  let savedExercises = 0

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

    // Fetch the auto-created block_weeks
    const blockWeeks = await plansService.getBlockWeeks(trainingBlock.id)

    // 3. For each week in this block — batch all workouts for the week
    for (const weekData of blockData.weeks ?? []) {
      const blockWeek = blockWeeks.find(bw => bw.week_number === weekData.weekNumber)
      if (!blockWeek) {
        console.warn(`[SmartImport Save] No block_week for week ${weekData.weekNumber} in "${blockData.name}"`)
        continue
      }

      const weekWorkouts = weekData.workouts ?? []
      if (weekWorkouts.length === 0) continue

      // --- Batch insert all workouts for this week in one call ---
      const workoutRows = weekWorkouts.map(w => ({
        coach_id: coachId,
        name: w.name,
        description: w.description || null,
        day_of_week: w.dayOfWeek,
        session_type: w.sessionType || null,
        is_template: false,
      }))

      const { data: createdWorkouts, error: wErr } = await (supabase as any)
        .from('workouts')
        .insert(workoutRows)
        .select('id')

      if (wErr) {
        console.error(`[SmartImport Save] Workout batch insert failed (block ${blockIndex + 1}, week ${weekData.weekNumber}):`, wErr)
        throw new Error(wErr.message)
      }

      if (!createdWorkouts || createdWorkouts.length !== weekWorkouts.length) {
        console.error(`[SmartImport Save] Workout count mismatch: expected ${weekWorkouts.length}, got ${createdWorkouts?.length ?? 0}`)
        throw new Error('Workout batch insert returned wrong count')
      }

      savedWorkouts += createdWorkouts.length

      // --- Batch insert all exercises for this week in one call ---
      const allExercises: any[] = []
      for (let wi = 0; wi < weekWorkouts.length; wi++) {
        const workoutData = weekWorkouts[wi]
        const workoutId = createdWorkouts[wi].id

        for (let ei = 0; ei < (workoutData.exercises ?? []).length; ei++) {
          const ex = workoutData.exercises[ei]
          allExercises.push({
            workout_id: workoutId,
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
            ...(ex.weight ? parseWeight(ex.weight) : {}),
          })
        }
      }

      if (allExercises.length > 0) {
        const { error: exErr } = await (supabase as any)
          .from('exercises')
          .insert(allExercises)

        if (exErr) {
          console.error(`[SmartImport Save] Exercise batch insert failed (block ${blockIndex + 1}, week ${weekData.weekNumber}):`, exErr)
          throw new Error(exErr.message)
        }

        savedExercises += allExercises.length
      }

      // --- Batch insert all plan_sessions for this week in one call ---
      const daySessionCounts: Record<number, number> = {}
      const sessionRows = weekWorkouts.map((w, wi) => {
        const dayKey = w.dayOfWeek - 1
        const orderIndex = daySessionCounts[dayKey] || 0
        daySessionCounts[dayKey] = orderIndex + 1
        return {
          block_week_id: blockWeek.id,
          day_of_week: dayKey,
          workout_id: createdWorkouts[wi].id,
          order_index: orderIndex,
        }
      })

      const { error: sessErr } = await (supabase as any)
        .from('plan_sessions')
        .insert(sessionRows)

      if (sessErr) {
        console.error(`[SmartImport Save] Session batch insert failed (block ${blockIndex + 1}, week ${weekData.weekNumber}):`, sessErr)
        throw new Error(sessErr.message)
      }
    }
  }

  console.log(`[SmartImport Save] Complete: ${savedWorkouts} workouts, ${savedExercises} exercises saved to plan ${plan.id}`)

  // Clear cached AI result now that plan is saved
  if (historyId) {
    await (supabase as any)
      .from('import_history')
      .update({ ai_result: null })
      .eq('id', historyId)
  }

  return plan.id
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

  return data.ai_result as ImportResult
}

/**
 * Get import history for current coach
 */
export async function getImportHistory(limit = 20): Promise<ImportHistoryRecord[]> {
  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error('Not authenticated')

  // Select all columns except ai_result (which can be huge),
  // but include a boolean flag for whether it exists
  const { data, error } = await (supabase as any)
    .from('import_history')
    .select('*')
    .eq('coach_id', user.data.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  // Add has_cached_result flag and strip the large ai_result payload
  return (data || []).map((r: any) => ({
    ...r,
    has_cached_result: r.ai_result != null,
    ai_result: undefined, // don't keep the full payload in memory
  }))
}

/**
 * Convert File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data:...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
