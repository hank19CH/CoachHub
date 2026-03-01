/**
 * importFileParser.ts — Shared file parsing for Smart Import v34
 *
 * Extracts ALL SheetJS parsing logic from the duplicated code in
 * classifyImport() and importProgram() into one shared function.
 * Called once per file, result cached and reused for both classify and extract.
 *
 * Handles:
 * - SheetJS workbook read + sheet_to_json
 * - Header detection (first row with 2+ non-null values)
 * - Synthetic _col keys for blank headers
 * - Sub-header detection + column renaming (TUESDAY_Rep, etc.)
 * - Gap-fill inference (infer _Note between _Distance and _Volume)
 * - Multi-sheet overview detection (30% cell-to-sheet-name match)
 * - Volume column stripping
 * - Null compaction
 * - Season plan grid pre-grouping (day-prefix detection, session name extraction, week boundaries)
 * - Coach abbreviation loading
 * - PDF/image base64 encoding
 * - Truncation at 150k chars
 */

import * as XLSX from 'xlsx'
import type { ParsedSheet, PreparedContent } from '@/types/import'

/**
 * Prepare a file for the smart-import edge function.
 * Parses spreadsheets with SheetJS, encodes PDF/images as base64.
 * Loads coach abbreviations from DB.
 *
 * The returned PreparedContent can be cached and reused for both
 * the classify and extract API calls.
 */
export async function prepareFileContent(
  file: File,
  coachId: string,
): Promise<PreparedContent> {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  const isSpreadsheet = file.type.includes('excel') || file.type.includes('spreadsheet') || file.type === 'text/csv'
    || ['.xlsx', '.xls', '.csv'].includes(ext)

  let coachAbbreviations: Record<string, string> = {}

  if (isSpreadsheet) {
    const { fileContent, abbreviations } = await parseSpreadsheet(file, coachId)
    coachAbbreviations = abbreviations
    return {
      fileContent,
      preParsed: true,
      fileType: file.type,
      coachAbbreviations,
    }
  }

  // PDF/Images: base64 encode
  const fileContent = await fileToBase64(file)

  // Load abbreviations for non-spreadsheet files
  try {
    const { getAbbreviationMap } = await import('@/services/coachAbbreviations')
    coachAbbreviations = await getAbbreviationMap(coachId)
    if (Object.keys(coachAbbreviations).length > 0) {
      console.log(`[importFileParser] Loaded ${Object.keys(coachAbbreviations).length} coach abbreviations`)
    }
  } catch {
    // non-critical
  }

  return {
    fileContent,
    preParsed: false,
    fileType: file.type,
    coachAbbreviations,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Internal: Spreadsheet parsing (extracted verbatim from aiImport.ts v33)
// ────────────────────────────────────────────────────────────────────────

async function parseSpreadsheet(
  file: File,
  coachId: string,
): Promise<{ fileContent: string; abbreviations: Record<string, string> }> {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  console.log(`[importFileParser] Local parsing with SheetJS JSON (extension=${ext}, mime=${file.type})`)

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetCount = workbook.SheetNames.length
  console.log(`[importFileParser] SheetJS workbook: ${sheetCount} sheet(s):`, workbook.SheetNames)

  const parsedSheets: ParsedSheet[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as (string | number | null)[][]
    console.log(`[importFileParser] Sheet "${sheetName}": ${rows.length} rows`)
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
        usedHeaders.forEach((h, i) => { obj[h] = row[i] ?? null })
        return obj
      })

    // ── Sub-header detection & column renaming ──
    const subHeaderLabels = new Set(['set', 'rep', 'reps', 'distance', 'dist', 'note', 'notes', 'volume', 'vol', 'time', 'intensity', 'rest'])

    let subHeaderRowIdx = -1
    for (let ri = 0; ri < Math.min(jsonRows.length, 10); ri++) {
      const row = jsonRows[ri]
      let subHeaderCount = 0
      for (const [key, val] of Object.entries(row)) {
        if (key.startsWith('_col') && typeof val === 'string' && subHeaderLabels.has(val.toLowerCase().trim())) {
          subHeaderCount++
        }
      }
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
      console.log(`[importFileParser] Detected sub-header row at data index ${subHeaderRowIdx}:`,
        Object.entries(subRow).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${v}`).join(', '))

      const renameMap: Record<string, string> = {}
      let currentDayCol: string | null = null

      for (const h of usedHeaders) {
        const subVal = subRow[h]
        const subStr = subVal != null ? String(subVal).trim() : ''

        if (!h.startsWith('_col')) {
          if (subHeaderLabels.has(subStr.toLowerCase())) {
            currentDayCol = h
            renameMap[h] = `${h}_${subStr}`
          } else {
            currentDayCol = h
          }
        } else {
          if (subStr && subHeaderLabels.has(subStr.toLowerCase()) && currentDayCol) {
            renameMap[h] = `${currentDayCol}_${subStr}`
          }
        }
      }

      // ── Gap-fill pass: infer unlabeled columns between renamed siblings ──
      const renamedCols = new Map<number, string>()
      for (let hi = 0; hi < usedHeaders.length; hi++) {
        if (renameMap[usedHeaders[hi]]) renamedCols.set(hi, renameMap[usedHeaders[hi]])
      }

      for (let hi = 0; hi < usedHeaders.length; hi++) {
        const h = usedHeaders[hi]
        if (renameMap[h] || !h.startsWith('_col')) continue

        const hasData = jsonRows.some((row, ri) =>
          ri !== subHeaderRowIdx && row[h] != null && row[h] !== ''
        )
        if (!hasData) continue

        let prevRenamed: string | null = null
        for (let pi = hi - 1; pi >= 0; pi--) {
          if (renamedCols.has(pi)) { prevRenamed = renamedCols.get(pi)!; break }
        }
        let nextRenamed: string | null = null
        for (let ni = hi + 1; ni < usedHeaders.length; ni++) {
          if (renamedCols.has(ni)) { nextRenamed = renamedCols.get(ni)!; break }
        }

        if (prevRenamed && nextRenamed) {
          const prevMatch = prevRenamed.match(/^(.+)_Distance$/i)
          const nextMatch = nextRenamed.match(/^(.+)_Volume$/i)
          if (prevMatch && nextMatch && prevMatch[1] === nextMatch[1]) {
            const dayName = prevMatch[1]
            renameMap[h] = `${dayName}_Note`
            renamedCols.set(hi, `${dayName}_Note`)
            console.log(`[importFileParser] Inferred gap column: ${h} → ${dayName}_Note (between ${prevRenamed} and ${nextRenamed})`)
          }
        }
      }

      if (Object.keys(renameMap).length > 0) {
        console.log(`[importFileParser] Renaming ${Object.keys(renameMap).length} columns:`, renameMap)

        for (let hi = 0; hi < usedHeaders.length; hi++) {
          if (renameMap[usedHeaders[hi]]) {
            usedHeaders[hi] = renameMap[usedHeaders[hi]]
          }
        }

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

    // Drop nulls for compaction
    for (let ri = 0; ri < jsonRows.length; ri++) {
      const compact: Record<string, string | number | null> = {}
      for (const [k, v] of Object.entries(jsonRows[ri])) {
        if (v !== null && v !== '') compact[k] = v
      }
      jsonRows[ri] = compact
    }

    parsedSheets.push({ name: sheetName, headers: usedHeaders, jsonRows })
  }

  // ── Multi-sheet overview detection (3+ sheets) ──
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
        console.log(`[importFileParser] Detected overview sheet: "${ps.name}" (${matchCount}/${cellValues.size} values match sheet names, ratio=${matchRatio.toFixed(2)})`)

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
  // Strip *_Volume columns and drop nulls
  const volumePattern = /_Volume$/i
  for (const ps of parsedSheets) {
    const volumeCols = ps.headers.filter(h => volumePattern.test(h))
    if (volumeCols.length > 0) {
      ps.headers = ps.headers.filter(h => !volumePattern.test(h))
      for (const row of ps.jsonRows) {
        for (const vc of volumeCols) {
          delete row[vc]
        }
      }
      console.log(`[importFileParser] Stripped ${volumeCols.length} Volume columns from sheet "${ps.name}"`)
    }
  }

  // ── Load coach abbreviation glossary ──
  let coachAbbreviations: Record<string, string> = {}
  try {
    const { getAbbreviationMap } = await import('@/services/coachAbbreviations')
    coachAbbreviations = await getAbbreviationMap(coachId)
    const abbrCount = Object.keys(coachAbbreviations).length
    if (abbrCount > 0) {
      console.log(`[importFileParser] Loaded ${abbrCount} coach abbreviations`)
    }
  } catch (e) {
    console.warn('[importFileParser] Failed to load abbreviations (non-critical):', e)
  }

  // ── Season plan grid pre-grouping ──
  const sheetTexts: string[] = []
  for (let i = 0; i < parsedSheets.length; i++) {
    if (i === overviewIdx) continue
    const ps = parsedSheets[i]

    // Detect day-prefixed column groups (e.g. TUESDAY_Set, TUESDAY_Rep, ...)
    const dayPrefixes = new Map<string, string[]>()
    const dayNames = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
    for (const h of ps.headers) {
      for (const dn of dayNames) {
        if (h.startsWith(dn + '_')) {
          const suffix = h.substring(dn.length + 1)
          if (!dayPrefixes.has(dn)) dayPrefixes.set(dn, [])
          dayPrefixes.get(dn)!.push(suffix)
        }
      }
    }

    // Only pre-group if we have 2+ day groups with Set/Rep/Distance columns
    const hasDayGroups = dayPrefixes.size >= 2 &&
      [...dayPrefixes.values()].filter(suffixes =>
        suffixes.some(s => /^(rep|distance|set)$/i.test(s))
      ).length >= 2

    if (hasDayGroups) {
      console.log(`[importFileParser] Season plan grid detected: ${dayPrefixes.size} day groups: ${[...dayPrefixes.keys()].join(', ')}`)

      const subLabelsLower = new Set(['set', 'rep', 'reps', 'distance', 'dist', 'note', 'notes', 'volume', 'vol', 'time', 'intensity', 'rest'])

      // Find session names
      const sessionNameMap = new Map<string, string>()
      for (const row of ps.jsonRows) {
        for (const [dn] of dayPrefixes) {
          const setCol = `${dn}_Set`
          const val = row[setCol]
          if (val != null && typeof val === 'string' && val.trim().length > 0) {
            const lower = val.trim().toLowerCase()
            if (!subLabelsLower.has(lower) && isNaN(Number(val))) {
              if (!sessionNameMap.has(dn)) {
                sessionNameMap.set(dn, val.trim())
              }
            }
          }
        }
      }

      console.log(`[importFileParser] Session names:`, Object.fromEntries(sessionNameMap))

      // Find metadata columns
      const metaCols = ps.headers.filter(h => !dayNames.some(dn => h.startsWith(dn + '_')) && !h.startsWith('_col'))

      // Identify week boundaries
      interface WeekBoundary { startRow: number; weekMeta: Record<string, any> }
      const weekBoundaries: WeekBoundary[] = []

      for (let ri = 0; ri < ps.jsonRows.length; ri++) {
        const row = ps.jsonRows[ri]
        let isSessionNameRow = false
        for (const [dn] of dayPrefixes) {
          const setCol = `${dn}_Set`
          const val = row[setCol]
          if (val != null && typeof val === 'string') {
            const lower = val.trim().toLowerCase()
            if (!subLabelsLower.has(lower) && val.trim().length > 0 && isNaN(Number(val))) {
              isSessionNameRow = true
              break
            }
          }
        }
        if (isSessionNameRow) {
          const metaRow = ps.jsonRows[ri + 1]
          const meta: Record<string, any> = {}
          if (metaRow) {
            for (const mc of metaCols) {
              if (metaRow[mc] != null) meta[mc] = metaRow[mc]
            }
          }
          weekBoundaries.push({ startRow: ri + 2, weekMeta: meta })
        }
      }

      if (weekBoundaries.length === 0) {
        weekBoundaries.push({ startRow: 1, weekMeta: {} })
      }

      console.log(`[importFileParser] Found ${weekBoundaries.length} week boundaries`)

      // Build pre-grouped output
      const lines: string[] = []
      lines.push('PRE-GROUPED SEASON PLAN DATA')
      lines.push('Each week\'s sessions are pre-separated. Extract exercises from each session group independently.')
      lines.push('Fields: Set (if present), Rep, Distance (meters), Note (exercise abbreviation/drill type).')
      lines.push('If Note is present, it is the raw_name. If Note is absent, it is a plain sprint/run.')
      lines.push('')

      for (let wi = 0; wi < weekBoundaries.length; wi++) {
        const wb = weekBoundaries[wi]
        const endRow = wi + 1 < weekBoundaries.length ? weekBoundaries[wi + 1].startRow - 2 : ps.jsonRows.length

        const phase = wb.weekMeta['_col1'] || wb.weekMeta[metaCols[0]] || ''
        const weekNum = wi + 1

        lines.push(`=== WEEK ${weekNum}${phase ? ` (${phase})` : ''} ===`)

        for (const [dn, suffixes] of dayPrefixes) {
          const sessionName = sessionNameMap.get(dn) || dn
          const exercises: Record<string, any>[] = []

          for (let ri = wb.startRow; ri < endRow; ri++) {
            const row = ps.jsonRows[ri]
            if (!row) continue

            const exData: Record<string, any> = {}
            let hasData = false
            for (const suffix of suffixes) {
              const col = `${dn}_${suffix}`
              const val = row[col]
              if (val != null && val !== '') {
                exData[suffix] = val
                hasData = true
              }
            }

            if (hasData) {
              exercises.push(exData)
            }
          }

          if (exercises.length > 0) {
            lines.push(`  SESSION: "${sessionName}" (${dn}) — ${exercises.length} exercises`)
            for (let ei = 0; ei < exercises.length; ei++) {
              lines.push(`    ${ei + 1}. ${JSON.stringify(exercises[ei])}`)
            }
          }
        }
        lines.push('')
      }

      sheetTexts.push(lines.join('\n'))
      console.log(`[importFileParser] Pre-grouped ${weekBoundaries.length} weeks across ${dayPrefixes.size} sessions`)
    } else {
      // Non-grid sheet — send as raw JSON
      const hdrs = ps.headers.join(', ')
      if (parsedSheets.length > 1) {
        sheetTexts.push(`=== Sheet: ${ps.name} ===\nColumns: ${hdrs}\n${JSON.stringify(ps.jsonRows, null, 0)}`)
      } else {
        sheetTexts.push(`Columns: ${hdrs}\n${JSON.stringify(ps.jsonRows, null, 0)}`)
      }
    }
  }

  let fileContent = scheduleHeader + sheetTexts.join('\n\n')
  console.log(`[importFileParser] Final content: ${parsedSheets.length} sheet(s), ${fileContent.length} chars`)

  // Truncate if extremely long
  const TRUNCATION_LIMIT = 150_000
  if (fileContent.length > TRUNCATION_LIMIT) {
    console.warn(`[importFileParser] Content exceeds ${TRUNCATION_LIMIT} chars (${fileContent.length}). Truncating.`)
    fileContent = fileContent.substring(0, TRUNCATION_LIMIT) + '\n\n[TRUNCATED - file too large. Some later training blocks may be missing. Extract everything visible above.]'
  }

  return { fileContent, abbreviations: coachAbbreviations }
}

// ────────────────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
