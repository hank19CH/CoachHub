import { supabase } from '@/lib/supabase'
import { AI_CONFIG } from '@/config/ai'
import type { ImportResult, ImportBlock, ImportWeek, ImportWorkout, ImportExercise, ImportHistoryRecord, EvolvingExercise, PreImportContext } from '@/types/import'
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
export async function importProgram(file: File, signal?: AbortSignal, preImportContext?: PreImportContext): Promise<{
  importResult: ImportResult
  historyRecord: ImportHistoryRecord
}> {
  const startTime = Date.now()

  // Validate file
  console.log(`[SmartImport] Starting import: name=${file.name}, type=${file.type}, size=${file.size}`)

  if (file.size > AI_CONFIG.import.maxFileSize) {
    throw new Error(`File too large. Max size: ${AI_CONFIG.import.maxFileSize / 1024 / 1024}MB`)
  }

  // Check MIME type, with extension fallback (some browsers report .xlsx as application/octet-stream)
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  const typeOk = AI_CONFIG.import.supportedTypes.includes(file.type)
  const extOk = AI_CONFIG.import.supportedExtensions.includes(ext)
  if (!typeOk && !extOk) {
    throw new Error(`Unsupported file type: ${file.type} (${ext})`)
  }
  if (!typeOk && extOk) {
    console.warn(`[SmartImport] MIME type "${file.type}" not in allowlist, but extension "${ext}" is valid — proceeding`)
  }

  // Refresh session proactively (prevents stale-token hangs after idle navigation)
  console.log('[SmartImport] Refreshing auth session...')
  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    console.warn('[SmartImport] Session refresh failed:', refreshError.message)
  }

  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error('Not authenticated')

  const coachId = user.data.user.id
  console.log(`[SmartImport] Auth OK, coach=${coachId}`)

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
    const staleThreshold = 5 * 60 * 1000 // 5 minutes
    const recordAge = Date.now() - new Date(existing[0].created_at).getTime()

    if (recordAge > staleThreshold) {
      // Stale — mark as failed so the coach can retry
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
      || ['.xlsx', '.xls', '.csv'].includes(ext)

    let fileContent: string
    let sendAsText = false

    if (isSpreadsheet) {
      // Parse Excel/CSV with SheetJS → JSON objects keyed by column headers.
      // JSON format preserves column-to-value mapping perfectly (no empty-cell
      // column shift like CSV). Columns without headers get synthetic keys
      // like _col3, _col4 so no data is ever silently dropped.
      console.log(`[SmartImport] Local parsing with SheetJS JSON (extension=${ext}, mime=${file.type})`)
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetCount = workbook.SheetNames.length
      console.log(`[SmartImport] SheetJS workbook: ${sheetCount} sheet(s):`, workbook.SheetNames)

      interface ParsedSheet {
        name: string
        headers: string[]
        jsonRows: Record<string, string | number | null>[]
      }
      const parsedSheets: ParsedSheet[] = []

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as (string | number | null)[][]
        console.log(`[SmartImport] Sheet "${sheetName}": ${rows.length} rows`)
        if (rows.length === 0) continue

        // Find header row (first row with at least 2 non-null values)
        let headerRowIdx = 0
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const nonNull = rows[i].filter(v => v !== null && v !== '').length
          if (nonNull >= 2) { headerRowIdx = i; break }
        }

        // Build headers — blank headers get synthetic names (_col3, _col4)
        // so their data is never silently dropped
        const rawHeaders = rows[headerRowIdx]
        const headers = rawHeaders.map((h, i) => {
          const trimmed = h != null ? String(h).trim() : ''
          return trimmed || `_col${i + 1}`
        })
        const dataRows = rows.slice(headerRowIdx + 1)

        // Strip trailing all-null columns to reduce noise
        let lastUsedCol = headers.length - 1
        while (lastUsedCol > 0) {
          const colHasData = dataRows.some(row => row[lastUsedCol] !== null && row[lastUsedCol] !== '')
          const isRealHeader = !headers[lastUsedCol].startsWith('_col')
          if (colHasData || isRealHeader) break
          lastUsedCol--
        }
        const usedHeaders = headers.slice(0, lastUsedCol + 1)

        const jsonRows = dataRows
          .filter(row => row.some(v => v !== null && v !== '')) // skip fully empty rows
          .map(row => {
            const obj: Record<string, string | number | null> = {}
            usedHeaders.forEach((h, i) => {
              obj[h] = row[i] ?? null
            })
            return obj
          })

        // ── Sub-header detection & column renaming ──
        // Season plan spreadsheets have repeating sub-headers (Set, Rep, Distance, Note, Volume)
        // within the data rows. Detect these and rename _col keys to be descriptive:
        //   _col8 → "TUESDAY_Rep", _col9 → "TUESDAY_Distance", etc.
        // This eliminates ambiguity for the AI — it won't need to guess what _col8 means.
        const subHeaderLabels = new Set(['set', 'rep', 'reps', 'distance', 'dist', 'note', 'notes', 'volume', 'vol', 'time', 'intensity', 'rest'])

        // Find a sub-header row (within first 10 data rows) — it has text like "Set", "Rep", "Distance" in _col positions
        let subHeaderRowIdx = -1
        for (let ri = 0; ri < Math.min(jsonRows.length, 10); ri++) {
          const row = jsonRows[ri]
          let subHeaderCount = 0
          for (const [key, val] of Object.entries(row)) {
            if (key.startsWith('_col') && typeof val === 'string' && subHeaderLabels.has(val.toLowerCase().trim())) {
              subHeaderCount++
            }
          }
          // Also check named columns (day names) that might hold "Set"
          for (const [key, val] of Object.entries(row)) {
            if (!key.startsWith('_col') && typeof val === 'string' && subHeaderLabels.has(val.toLowerCase().trim())) {
              subHeaderCount++
            }
          }
          if (subHeaderCount >= 3) {
            subHeaderRowIdx = ri
            break
          }
        }

        if (subHeaderRowIdx >= 0) {
          const subRow = jsonRows[subHeaderRowIdx]
          console.log(`[SmartImport] Detected sub-header row at data index ${subHeaderRowIdx}:`,
            Object.entries(subRow).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`).join(', '))

          // Build column rename map: for each day column group, prefix _col keys with the day name + sub-header label
          // e.g., TUESDAY column group: TUESDAY=Set, _col8=Rep, _col9=Distance, _col10=Note, _col11=Volume
          // → rename _col8 to "TUESDAY_Rep", _col9 to "TUESDAY_Distance", etc.
          // Also rename the day column itself if it holds a sub-header: TUESDAY → "TUESDAY_Set"
          const renameMap: Record<string, string> = {}
          let currentDayCol: string | null = null

          for (const h of usedHeaders) {
            const subVal = subRow[h]
            const subStr = subVal != null ? String(subVal).trim() : ''

            if (!h.startsWith('_col')) {
              // Named column — could be a day name holding a sub-header label
              if (subHeaderLabels.has(subStr.toLowerCase())) {
                currentDayCol = h
                renameMap[h] = `${h}_${subStr}`
              } else {
                currentDayCol = h // session type name or day header
              }
            } else {
              // _col column — rename with current day context
              if (subStr && subHeaderLabels.has(subStr.toLowerCase()) && currentDayCol) {
                renameMap[h] = `${currentDayCol}_${subStr}`
              }
            }
          }

          if (Object.keys(renameMap).length > 0) {
            console.log(`[SmartImport] Renaming ${Object.keys(renameMap).length} columns:`, renameMap)

            // Update headers
            for (let hi = 0; hi < usedHeaders.length; hi++) {
              if (renameMap[usedHeaders[hi]]) {
                usedHeaders[hi] = renameMap[usedHeaders[hi]]
              }
            }

            // Update all data rows
            for (const row of jsonRows) {
              for (const [oldKey, newKey] of Object.entries(renameMap)) {
                if (oldKey in row) {
                  row[newKey] = row[oldKey]
                  delete row[oldKey]
                }
              }
            }
          }
        }

        parsedSheets.push({ name: sheetName, headers: usedHeaders, jsonRows })
      }

      // ── Multi-sheet overview detection (3+ sheets) ──
      // For season plans: one sheet is often an "overview/schedule" where cell values
      // are session-type names that reference other sheets. Detect this and convert it
      // to a compact schedule header so the AI doesn't mistake session names for exercises.
      let scheduleHeader = ''
      let overviewIdx = -1

      if (parsedSheets.length > 2) {
        const sheetNamesNorm = parsedSheets.map(s => s.name.toLowerCase().replace(/\s+/g, ''))

        for (let si = 0; si < parsedSheets.length; si++) {
          const ps = parsedSheets[si]
          if (ps.jsonRows.length === 0) continue

          const cellValues = new Set<string>()
          for (const row of ps.jsonRows) {
            for (const val of Object.values(row)) {
              if (val != null && typeof val === 'string' && val.trim().length > 0) {
                cellValues.add(val.trim())
              }
            }
          }

          if (cellValues.size < 2) continue

          let matchCount = 0
          for (const cv of cellValues) {
            const cvNorm = cv.toLowerCase().replace(/\s+/g, '')
            if (sheetNamesNorm.some((sn, idx) => idx !== si && sn === cvNorm)) {
              matchCount++
            }
          }

          const matchRatio = matchCount / cellValues.size
          if (matchRatio >= 0.3 && matchCount >= 2) {
            overviewIdx = si
            console.log(`[SmartImport] Detected overview sheet: "${ps.name}" (${matchCount}/${cellValues.size} values match sheet names, ratio=${matchRatio.toFixed(2)})`)

            const lines: string[] = []
            lines.push('DOCUMENT STRUCTURE: Multi-sheet season plan.')
            lines.push('The schedule below maps weeks to session types. Each session type has its own detail sheet with exercise prescriptions.')
            lines.push('Extract exercises ONLY from the detail sheets below, NOT from session type names.')
            lines.push('')
            lines.push('WEEKLY SCHEDULE:')

            const firstHeader = ps.headers[0]?.toLowerCase() || ''
            const dayKeywords = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'day']
            const isRowsAreDays = dayKeywords.some(d => firstHeader.includes(d))

            if (isRowsAreDays) {
              const weekHeaders = ps.headers.slice(1).filter(h => !h.startsWith('_col'))
              for (let wi = 0; wi < weekHeaders.length; wi++) {
                const weekName = weekHeaders[wi]
                const daySessions: string[] = []
                for (const row of ps.jsonRows) {
                  const dayName = String(Object.values(row)[0] || '').trim()
                  const session = row[weekName] ? String(row[weekName]).trim() : ''
                  if (dayName && session) {
                    daySessions.push(`${dayName}=${session}`)
                  }
                }
                if (daySessions.length > 0) {
                  lines.push(`  ${weekName}: ${daySessions.join(', ')}`)
                }
              }
            } else {
              for (const row of ps.jsonRows) {
                const vals = Object.entries(row)
                const weekLabel = String(vals[0]?.[1] || '').trim()
                if (!weekLabel) continue
                const sessions: string[] = []
                for (let ci = 1; ci < vals.length; ci++) {
                  const colName = vals[ci][0]
                  if (colName.startsWith('_col')) continue
                  const val = String(vals[ci][1] || '').trim()
                  if (val) {
                    sessions.push(`${colName}=${val}`)
                  }
                }
                if (sessions.length > 0) {
                  lines.push(`  ${weekLabel}: ${sessions.join(', ')}`)
                }
              }
            }

            lines.push('')
            lines.push('--- DETAIL SHEETS (extract exercises from these) ---')
            lines.push('')
            scheduleHeader = lines.join('\n')
            break
          }
        }
      }

      // ── Compact & build final output ──
      // Optimization: strip *_Volume columns (AI ignores them) and drop null
      // values from JSON rows to significantly reduce payload size for dense
      // season-plan grids. This prevents late blocks from being truncated.
      const volumePattern = /_Volume$/i
      for (const ps of parsedSheets) {
        // Remove Volume headers
        const volumeCols = ps.headers.filter(h => volumePattern.test(h))
        if (volumeCols.length > 0) {
          ps.headers = ps.headers.filter(h => !volumePattern.test(h))
          for (const row of ps.jsonRows) {
            for (const vc of volumeCols) {
              delete row[vc]
            }
          }
          console.log(`[SmartImport] Stripped ${volumeCols.length} Volume columns from sheet "${ps.name}"`)
        }

        // Drop null values from each row — AI already knows missing = null
        for (let ri = 0; ri < ps.jsonRows.length; ri++) {
          const compact: Record<string, string | number | null> = {}
          for (const [k, v] of Object.entries(ps.jsonRows[ri])) {
            if (v !== null && v !== '') compact[k] = v
          }
          ps.jsonRows[ri] = compact
        }
      }

      const sheetTexts: string[] = []
      for (let i = 0; i < parsedSheets.length; i++) {
        if (i === overviewIdx) continue
        const ps = parsedSheets[i]
        const hdrs = ps.headers.join(', ')
        if (parsedSheets.length > 1) {
          sheetTexts.push(`=== Sheet: ${ps.name} ===\nColumns: ${hdrs}\n${JSON.stringify(ps.jsonRows, null, 0)}`)
        } else {
          sheetTexts.push(`Columns: ${hdrs}\n${JSON.stringify(ps.jsonRows, null, 0)}`)
        }
      }

      fileContent = scheduleHeader + sheetTexts.join('\n\n')
      sendAsText = true
      console.log(`[SmartImport] JSON format: ${parsedSheets.length} sheet(s), overview=${overviewIdx >= 0 ? parsedSheets[overviewIdx].name : 'none'}, ${fileContent.length} chars (after compaction)`)
      // DEBUG: dump headers and first 3 rows to understand column structure
      for (const ps of parsedSheets) {
        console.log(`[SmartImport DEBUG] Sheet "${ps.name}" headers:`, ps.headers)
        console.log(`[SmartImport DEBUG] Sheet "${ps.name}" row 0:`, ps.jsonRows[0])
        console.log(`[SmartImport DEBUG] Sheet "${ps.name}" row 1:`, ps.jsonRows[1])
        console.log(`[SmartImport DEBUG] Sheet "${ps.name}" row 2:`, ps.jsonRows[2])
        // Also find a row that has exercise data (look for PP or HS)
        const exRow = ps.jsonRows.find(r => Object.values(r).some(v => v === 'PP' || v === 'HS' || v === '20EFE'))
        if (exRow) console.log(`[SmartImport DEBUG] Sheet "${ps.name}" exercise row:`, exRow)
      }

      // Truncate if extremely long to keep costs reasonable.
      // 150k is ~37k tokens — Haiku 4.5 handles up to 200k context.
      // The compaction above (null-stripping + Volume removal) typically
      // saves 30-50% for dense season-plan grids.
      const TRUNCATION_LIMIT = 150_000
      if (fileContent.length > TRUNCATION_LIMIT) {
        console.warn(`[SmartImport] ⚠️ Content exceeds ${TRUNCATION_LIMIT} chars (${fileContent.length}). Truncating — some training blocks may be lost!`)
        fileContent = fileContent.substring(0, TRUNCATION_LIMIT) + '\n\n[TRUNCATED - file too large. Some later training blocks may be missing. Extract everything visible above.]'
      }
    } else {
      // PDF/Images: send as base64 for vision/document parsing
      console.log(`[SmartImport] Encoding as base64 for vision (extension=${ext}, mime=${file.type})`)
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
        ...(preImportContext?.coachSport ? { coachSport: preImportContext.coachSport } : {}),
        ...(preImportContext?.coachPlanType ? { coachPlanType: preImportContext.coachPlanType } : {}),
        ...(preImportContext?.coachTrainingFocus ? { coachTrainingFocus: preImportContext.coachTrainingFocus } : {}),
      }),
      signal: abortController.signal,
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
    console.log(`[SmartImport] AI result: planType=${importResult.detectedPlanType}, blocks=${importResult.blocks?.length ?? 0}, weeks=${importResult.weeks?.length ?? 0}`)

    // 4b. Normalize evolving_session format → standard blocks[] format
    // The AI returns { exercises: [...], session_name, evolution_weeks } for evolving sessions.
    // We convert that into blocks[].weeks[].workouts[].exercises[] so the preview UI and
    // save logic work without any special casing.
    if (importResult.detectedPlanType === 'evolving_session' && (importResult as any).exercises) {
      normalizeEvolvingSession(importResult)
    }

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

    console.log(`[SmartImport] Parsed: ${workoutsCount} workouts, ${exercisesCount} exercises in ${processingTime}ms`)

    // 6. Update import history — refresh session first (token may be stale after long AI wait)
    // DB update is non-fatal: if AI returned good data, show it to the user regardless
    console.log('[SmartImport] Refreshing auth session before DB update...')
    try {
      await supabase.auth.refreshSession()
    } catch (refreshErr) {
      console.warn('[SmartImport] Session refresh failed (will attempt DB write anyway):', refreshErr)
    }

    // 6a. Update metadata + status (small payload, nice-to-have)
    try {
      const { error: updateError } = await (supabase as any)
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
    // This enables "Resume Save" from history but is not required for the import to succeed
    ;(supabase as any)
      .from('import_history')
      .update({ ai_result: importResult })
      .eq('id', historyRecord.id)
      .then(({ error: cacheErr }: any) => {
        if (cacheErr) console.warn('[SmartImport] Failed to cache ai_result (non-critical):', cacheErr)
        else console.log('[SmartImport] AI result cached for resume')
      })

    // Build historyRecord for the view from what we already know (avoids re-fetching the massive row)
    const updatedHistory: ImportHistoryRecord = {
      ...historyRecord,
      ai_model_used: data.model || 'claude-haiku-4-5',
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
    // Determine user-friendly message
    const isAbort = error instanceof DOMException && error.name === 'AbortError'
    const message = isAbort
      ? 'Import timed out or was cancelled'
      : error instanceof Error ? error.message : 'Unknown error'

    console.error(`[SmartImport] Import failed: ${message}`, error)

    // Update import history (status: failed) — wrapped in its own try/catch
    // so a network failure here doesn't mask the original error
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
    clearTimeout(timeoutId)
    if (activeAbortController === abortController) {
      activeAbortController = null
    }
  }
}

/**
 * Convert evolving_session format (exercises[] with weeks[] per exercise)
 * into standard blocks[] format so the preview UI and save logic work unchanged.
 *
 * Input:  { exercises: [{ name, weeks: [{ week_number, sets, reps, ... }] }] }
 * Output: { blocks: [{ weeks: [{ workouts: [{ exercises: [...] }] }] }] }
 *
 * Each week gets ONE workout containing all exercises with that week's prescription.
 */
function normalizeEvolvingSession(importData: any): void {
  const exercises = importData.exercises as EvolvingExercise[] | undefined
  if (!exercises || exercises.length === 0) return

  const sessionName = importData.session_name || importData.programName || 'Session'
  const weekCount = importData.evolution_weeks || importData.durationWeeks || 1

  // Collect all unique week numbers
  const weekNumbers = new Set<number>()
  for (const ex of exercises) {
    for (const w of ex.weeks ?? []) {
      weekNumbers.add(w.week_number)
    }
  }
  const sortedWeeks = Array.from(weekNumbers).sort((a, b) => a - b)
  // Fallback: if exercises have no weeks, create a single week
  if (sortedWeeks.length === 0) {
    sortedWeeks.push(1)
  }

  // Build weeks with one workout each
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

  // Set blocks on the importData (mutates in place)
  importData.blocks = [{
    name: importData.programName || sessionName,
    blockType: undefined,
    weeks,
  }]

  // Update duration if not set
  if (!importData.durationWeeks || importData.durationWeeks < sortedWeeks.length) {
    importData.durationWeeks = sortedWeeks.length
  }

  // Clean up evolving-specific fields
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
  libraryFlags?: Set<string>, // Set of "blockIdx-weekIdx-workoutIdx" keys to auto-promote
): Promise<string> {
  const user = await supabase.auth.getUser()
  const coachId = user.data.user?.id
  if (!coachId) throw new Error('Not authenticated')

  const blocks = normalizeImportBlocks(importData)
  const planType = importData.detectedPlanType ?? 'block_plan'

  const totalWorkouts = blocks.reduce((s, b) => s + (b.weeks ?? []).reduce((ws, w) => ws + (w.workouts ?? []).length, 0), 0)
  console.log(`[SmartImport Save] Starting: ${blocks.length} blocks, ${totalWorkouts} sessions, planType=${planType}`)

  // 1. Create plan (with plan_type)
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

    // Fetch the auto-created block_weeks
    const blockWeeks = await plansService.getBlockWeeks(trainingBlock.id)

    // 3. For each week: create self-contained plan_sessions with session_data
    for (let weekIndex = 0; weekIndex < (blockData.weeks ?? []).length; weekIndex++) {
      const weekData = blockData.weeks[weekIndex]
      const blockWeek = blockWeeks.find(bw => bw.week_number === weekData.weekNumber)
      if (!blockWeek) {
        console.warn(`[SmartImport Save] No block_week for week ${weekData.weekNumber} in "${blockData.name}"`)
        continue
      }

      const weekWorkouts = weekData.workouts ?? []
      if (weekWorkouts.length === 0) continue

      // Build session rows with exercise data in session_data JSONB
      const daySessionCounts: Record<number, number> = {}
      const sessionRows: any[] = []

      for (let woi = 0; woi < weekWorkouts.length; woi++) {
        const w = weekWorkouts[woi]
        const dayKey = w.dayOfWeek - 1
        const orderIndex = daySessionCounts[dayKey] || 0
        daySessionCounts[dayKey] = orderIndex + 1

        // Convert ImportExercise[] → SessionExercise[] for session_data JSONB
        const sessionExercises = (w.exercises ?? []).map((ex, ei) => ({
          order: ei,
          name: ex.name,
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

        // Check if this session should be auto-promoted to library
        const flagKey = `${blockIndex}-${weekIndex}-${woi}`
        const shouldPromote = libraryFlags?.has(flagKey) ?? false

        if (shouldPromote) {
          // Create a workouts record + exercises + linked plan_session
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

          // Insert exercises for the library workout
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
            workout_id: workout.id, // linked to library
          })
          libraryWorkouts++
        } else {
          // Self-contained session — no workouts record
          sessionRows.push({
            block_week_id: blockWeek.id,
            day_of_week: dayKey,
            order_index: orderIndex,
            session_name: w.name,
            session_data: sessionExercises,
            // workout_id omitted — self-contained
          })
        }
      }

      // Batch insert all plan_sessions for this week
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

  // Update import_history with plan type + clear cached AI result
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
 * Save an imported single session directly as a workout (no plan/block/week/session structure).
 * Used when detectedPlanType === 'single_session'.
 *
 * Creates: workouts (is_library: true) + exercises rows
 * Returns: { id: workoutId, type: 'workout' }
 */
export async function saveImportedWorkout(
  importData: ImportResult,
  historyId?: string,
): Promise<{ id: string; type: 'workout' }> {
  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error('Not authenticated')
  const coachId = user.data.user.id

  // Find the first workout from the import data
  const blocks = importData.blocks ?? []
  const firstWeek = blocks[0]?.weeks?.[0] ?? importData.weeks?.[0]
  const firstWorkout = firstWeek?.workouts?.[0]

  if (!firstWorkout) throw new Error('No workout found in import data')

  // 1. Create the workout record
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

  // 2. Insert exercises
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

  // 3. Update import_history
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
