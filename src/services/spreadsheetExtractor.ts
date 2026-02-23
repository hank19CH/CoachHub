/**
 * Code-only spreadsheet extraction pipeline (Smart Import v30).
 *
 * Deterministic, synchronous, zero-AI extraction of training plans from
 * structured spreadsheets. Receives the same ParsedSheet[] that aiImport.ts
 * builds after SheetJS parsing + column rename + gap-fill, and returns a
 * complete ImportResult ready for the preview UI.
 *
 * 6-pass pipeline:
 *   1. Pattern Detection — classify the spreadsheet layout
 *   2. Column Classification — identify which columns hold what data
 *   3. Phase / Block Detection — find training phases (GPP, SPP, etc.)
 *   4. Week Boundary Detection — split rows into weeks
 *   5. Exercise Extraction + Abbreviation Expansion
 *   6. ImportResult Assembly
 *
 * If confidence < 0.55 the caller should fall through to the AI path.
 */

import type {
  ImportResult,
  ImportBlock,
  ImportWeek,
  ImportWorkout,
  ImportExercise,
  PreImportContext,
  PlanType,
} from '@/types/import'

// ─── Public types ────────────────────────────────────────────────────────

/** Shape produced by SheetJS parsing in aiImport.ts (mirrored here for import) */
export interface ParsedSheet {
  name: string
  headers: string[]
  jsonRows: Record<string, string | number | null>[]
}

export type SpreadsheetPattern =
  | 'multi_row_season_grid'
  | 'compact_exercise_grid'
  | 'daily_log'
  | 'unknown'

export interface ExtractionResult {
  success: boolean
  confidence: number  // 0–1
  pattern: SpreadsheetPattern
  importResult?: ImportResult
  reason?: string
}

// ─── Built-in abbreviation maps ──────────────────────────────────────────

const SPRINT_ABBREVIATIONS: Record<string, string> = {
  'PP': 'Push-up Position Start',
  'HS': 'High Start',
  '3P': '3-Point Start',
  'B': 'Blocks',
  'BU': 'Build-Up',
  'FLY': 'Flying Start',
  'FD': 'Fly-Down',
  'LA': 'Limited Acceleration',
  '20EFE': '20m Easy-Fast-Easy',
  '20FEF': '20m Fast-Easy-Fast',
  'LA20': 'Limited Acceleration 20m',
  'LA30': 'Limited Acceleration 30m',
  'LA40': 'Limited Acceleration 40m',
  'LA50': 'Limited Acceleration 50m',
  'LA60': 'Limited Acceleration 60m',
  'EFE': 'Easy-Fast-Easy',
  'FEF': 'Fast-Easy-Fast',
  'MB': 'Medicine Ball',
  'SL': 'Sled',
  'DL': 'Deadlift',
  'SQ': 'Squat',
  'BP': 'Bench Press',
  'PC': 'Power Clean',
  'PS': 'Power Snatch',
  'RDL': 'Romanian Deadlift',
  'GHR': 'Glute-Ham Raise',
  'SLJ': 'Standing Long Jump',
  'DJ': 'Drop Jump',
  'CMJ': 'Counter-Movement Jump',
  'BJ': 'Box Jump',
  'HJ': 'Hurdle Jump',
}

const STRENGTH_ABBREVIATIONS: Record<string, string> = {
  'BS': 'Back Squat',
  'FS': 'Front Squat',
  'OHP': 'Overhead Press',
  'BP': 'Bench Press',
  'DL': 'Deadlift',
  'RDL': 'Romanian Deadlift',
  'SLDL': 'Stiff-Leg Deadlift',
  'BB': 'Barbell',
  'DB': 'Dumbbell',
  'KB': 'Kettlebell',
  'PC': 'Power Clean',
  'HPC': 'Hang Power Clean',
  'PS': 'Power Snatch',
  'HPS': 'Hang Power Snatch',
  'GHR': 'Glute-Ham Raise',
  'RNT': 'Reactive Neuromuscular Training',
  'GHD': 'Glute-Ham Developer',
  'T2B': 'Toes to Bar',
  'K2E': 'Knees to Elbows',
  'MU': 'Muscle-Up',
  'HSPU': 'Handstand Push-Up',
  'WOD': 'Workout of the Day',
  'AMRAP': 'As Many Reps As Possible',
  'EMOM': 'Every Minute on the Minute',
}

/** Merge all built-in maps into one lookup (coach glossary takes priority) */
function buildAbbreviationLookup(
  coachAbbreviations?: Record<string, string>,
  sport?: string,
): Record<string, string> {
  const lookup: Record<string, string> = {}

  // Layer 1: built-in maps (lower priority)
  Object.assign(lookup, STRENGTH_ABBREVIATIONS)
  Object.assign(lookup, SPRINT_ABBREVIATIONS)

  // If sport is known, prioritize that sport's map
  if (sport && /sprint|track/i.test(sport)) {
    Object.assign(lookup, SPRINT_ABBREVIATIONS)
  } else if (sport && /strength|power|lift/i.test(sport)) {
    Object.assign(lookup, STRENGTH_ABBREVIATIONS)
  }

  // Layer 2: coach glossary (highest priority — personalized)
  if (coachAbbreviations) {
    for (const [abbr, expansion] of Object.entries(coachAbbreviations)) {
      lookup[abbr.toUpperCase()] = expansion
    }
  }

  return lookup
}

// ─── Day names ───────────────────────────────────────────────────────────

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const DAY_MAP: Record<string, number> = {
  MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
  FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
}

// ─── Sub-header labels (ignored when scanning for session names) ─────────

const SUB_HEADER_LABELS = new Set([
  'set', 'sets', 'rep', 'reps', 'distance', 'dist',
  'note', 'notes', 'volume', 'vol', 'time', 'intensity', 'rest',
])

// ─── Phase keywords → blockType mapping ──────────────────────────────────
// Comprehensive glossary of training block/phase names used across sports.
// Keys are lowercase. Values are canonical blockType enum values.

const PHASE_BLOCK_TYPES: Record<string, string> = {
  // General Preparation
  gpp: 'gpp', 'general prep': 'gpp', 'general preparation': 'gpp',
  'gen prep': 'gpp', 'general': 'gpp',

  // Specific Preparation
  spp: 'spp', 'specific prep': 'spp', 'specific preparation': 'spp',
  'spec prep': 'spp', 'specific': 'spp',
  'spp i': 'spp', 'spp ii': 'spp', 'spp iii': 'spp',
  'spp1': 'spp', 'spp2': 'spp', 'spp3': 'spp',
  'spp 1': 'spp', 'spp 2': 'spp', 'spp 3': 'spp',

  // Competition / Peaking
  competition: 'competition', comp: 'competition', cp: 'competition',
  'competition prep': 'competition', 'comp prep': 'competition',
  'competition phase': 'competition',
  taper: 'peaking', peak: 'peaking', peaking: 'peaking',
  'race prep': 'peaking', 'meet prep': 'peaking',
  realization: 'peaking', realisation: 'peaking',
  sharpening: 'peaking',

  // Accumulation / Volume
  accumulation: 'accumulation', accum: 'accumulation', acc: 'accumulation',
  'volume phase': 'accumulation', volume: 'accumulation',

  // Intensification
  intensification: 'intensification', intens: 'intensification',
  'intensity phase': 'intensification', intensity: 'intensification',

  // Hypertrophy / Strength / Power
  hypertrophy: 'hypertrophy', hyp: 'hypertrophy',
  strength: 'strength', str: 'strength',
  'max strength': 'strength', 'maximal strength': 'strength',
  power: 'power', pow: 'power',
  'speed-strength': 'power', 'strength-speed': 'power',

  // Transition / Off-Season
  transition: 'transition', 'off-season': 'transition', offseason: 'transition',
  'active rest': 'transition', 'active recovery': 'transition',

  // Deload / Recovery
  deload: 'deload', recovery: 'deload', unload: 'deload',
  'recovery week': 'deload', 'deload week': 'deload',

  // Pre/In-Season
  'pre-season': 'pre_season', preseason: 'pre_season', 'pre season': 'pre_season',
  'early pre-season': 'pre_season', 'late pre-season': 'pre_season',
  'in-season': 'in_season', inseason: 'in_season', 'in season': 'in_season',
  'post-season': 'transition', postseason: 'transition',

  // Base / Build / Endurance phases
  base: 'base', 'base phase': 'base', 'base building': 'base',
  'base 1': 'base', 'base 2': 'base', 'base 3': 'base',
  build: 'build', 'build phase': 'build', 'build 1': 'build', 'build 2': 'build',
  endurance: 'base', aerobic: 'base',

  // Track & Field / Sprint specific
  'indoor season': 'competition', 'outdoor season': 'competition',
  'indoor comp': 'competition', 'outdoor comp': 'competition',
  'all-schools': 'competition', 'all schools': 'competition', 'allschools': 'competition',
  xmas: 'spp', 'xmas training': 'spp', christmas: 'spp',
  holiday: 'transition', holidays: 'transition',
  'cross country': 'base', xc: 'base', 'xc season': 'base',
  nationals: 'competition', 'national champs': 'competition',
  championships: 'competition', champs: 'competition',
  indoors: 'competition', outdoors: 'competition',

  // Periodization terminology
  mesocycle: 'accumulation', 'meso 1': 'accumulation', 'meso 2': 'intensification',
  macrocycle: 'accumulation',
  preparatory: 'gpp', 'preparatory phase': 'gpp',
  'prep phase': 'gpp', 'prep 1': 'gpp', 'prep 2': 'spp',
}

// Subset of keywords that are high-confidence phase indicators
// (unlikely to appear as exercise names or other metadata)
const PHASE_KEYWORD_ROOTS = [
  'gpp', 'spp', 'general prep', 'specific prep', 'competition', 'comp phase',
  'accumulation', 'accum', 'intensification', 'intens', 'realization',
  'hypertrophy', 'taper', 'peaking', 'deload', 'unload', 'transition',
  'pre-season', 'preseason', 'in-season', 'inseason', 'off-season', 'offseason',
  'post-season', 'postseason', 'base phase', 'build phase', 'prep phase',
  'indoor season', 'outdoor season', 'mesocycle', 'macrocycle',
  'race prep', 'meet prep', 'sharpening', 'preparatory',
  'all schools', 'all-schools', 'nationals', 'championships', 'champs',
  'xmas', 'christmas', 'indoors', 'outdoors',
]

// ═════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════

export function extractFromSheets(
  parsedSheets: ParsedSheet[],
  options: {
    fileName: string
    preImportContext?: PreImportContext
    coachAbbreviations?: Record<string, string>
  },
): ExtractionResult {
  if (!parsedSheets || parsedSheets.length === 0) {
    return { success: false, confidence: 0, pattern: 'unknown', reason: 'No sheets provided' }
  }

  // ── Pass 1: Pattern Detection ──────────────────────────────────────────
  const detection = detectPattern(parsedSheets, options.preImportContext)
  console.log(`[Extractor] Pattern detection: ${detection.pattern} (confidence=${detection.confidence.toFixed(2)})`)

  if (detection.confidence < 0.55) {
    return {
      success: false,
      confidence: detection.confidence,
      pattern: detection.pattern,
      reason: `Pattern "${detection.pattern}" confidence ${detection.confidence.toFixed(2)} below threshold 0.55`,
    }
  }

  // Only the multi_row_season_grid pattern is fully implemented for now.
  // compact_exercise_grid and daily_log will fall through to AI.
  if (detection.pattern === 'multi_row_season_grid') {
    return extractMultiRowSeasonGrid(parsedSheets, detection, options)
  }

  if (detection.pattern === 'compact_exercise_grid') {
    return extractCompactExerciseGrid(parsedSheets, detection, options)
  }

  // daily_log and unknown → fall through
  return {
    success: false,
    confidence: detection.confidence,
    pattern: detection.pattern,
    reason: `Pattern "${detection.pattern}" not yet implemented in code-only path`,
  }
}

// ═════════════════════════════════════════════════════════════════════════
// PASS 1: PATTERN DETECTION
// ═════════════════════════════════════════════════════════════════════════

interface PatternDetection {
  pattern: SpreadsheetPattern
  confidence: number
  sheetIndex: number          // which sheet matched
  dayPrefixes?: Map<string, string[]>  // for multi_row_season_grid
  weekColumns?: string[]      // for compact_exercise_grid
}

function detectPattern(
  sheets: ParsedSheet[],
  context?: PreImportContext,
): PatternDetection {
  let bestPattern: SpreadsheetPattern = 'unknown'
  let bestScore = 0
  let bestSheet = 0
  let bestDayPrefixes: Map<string, string[]> | undefined
  let bestWeekColumns: string[] | undefined

  for (let si = 0; si < sheets.length; si++) {
    const ps = sheets[si]
    if (ps.jsonRows.length < 3) continue

    // ── Score: multi_row_season_grid ──
    const gridScore = scoreMultiRowSeasonGrid(ps)
    if (gridScore.score > bestScore) {
      bestScore = gridScore.score
      bestPattern = 'multi_row_season_grid'
      bestSheet = si
      bestDayPrefixes = gridScore.dayPrefixes
    }

    // ── Score: compact_exercise_grid ──
    const compactScore = scoreCompactExerciseGrid(ps)
    if (compactScore.score > bestScore) {
      bestScore = compactScore.score
      bestPattern = 'compact_exercise_grid'
      bestSheet = si
      bestWeekColumns = compactScore.weekColumns
    }

    // ── Score: daily_log ──
    const logScore = scoreDailyLog(ps)
    if (logScore > bestScore) {
      bestScore = logScore
      bestPattern = 'daily_log'
      bestSheet = si
    }
  }

  // Context boost: if coach selected a plan type that matches, bump confidence
  if (context?.coachPlanType) {
    const typePatternMap: Record<string, SpreadsheetPattern> = {
      season_plan: 'multi_row_season_grid',
      block_plan: 'compact_exercise_grid',
    }
    if (typePatternMap[context.coachPlanType] === bestPattern) {
      bestScore = Math.min(1, bestScore + 0.15)
    }
  }

  return {
    pattern: bestPattern,
    confidence: bestScore,
    sheetIndex: bestSheet,
    dayPrefixes: bestDayPrefixes,
    weekColumns: bestWeekColumns,
  }
}

function scoreMultiRowSeasonGrid(ps: ParsedSheet): { score: number; dayPrefixes: Map<string, string[]> } {
  const dayPrefixes = new Map<string, string[]>()

  // Signal 1: Day-prefixed columns exist (TUESDAY_Rep, SATURDAY_Distance, etc.)
  for (const h of ps.headers) {
    for (const dn of DAY_NAMES) {
      if (h.startsWith(dn + '_')) {
        const suffix = h.substring(dn.length + 1)
        if (!dayPrefixes.has(dn)) dayPrefixes.set(dn, [])
        dayPrefixes.get(dn)!.push(suffix)
      }
    }
  }

  const dayGroupCount = dayPrefixes.size
  const groupsWithPrescription = [...dayPrefixes.values()].filter(
    suffixes => suffixes.some(s => /^(rep|reps|distance|set|sets)$/i.test(s))
  ).length

  let score = 0

  // Signal 1: ≥2 day groups with prescription columns → strong signal
  if (groupsWithPrescription >= 2) score += 0.35
  else if (groupsWithPrescription === 1 && dayGroupCount >= 1) score += 0.15

  // Signal 2: Has session name rows (text values in *_Set columns that aren't sub-headers)
  let sessionNameCount = 0
  for (const row of ps.jsonRows.slice(0, Math.min(ps.jsonRows.length, 50))) {
    for (const [dn] of dayPrefixes) {
      const setCol = `${dn}_Set`
      const val = row[setCol]
      if (val != null && typeof val === 'string') {
        const lower = val.trim().toLowerCase()
        if (!SUB_HEADER_LABELS.has(lower) && val.trim().length > 0 && isNaN(Number(val))) {
          sessionNameCount++
        }
      }
    }
  }
  if (sessionNameCount >= 3) score += 0.25
  else if (sessionNameCount >= 1) score += 0.1

  // Signal 3: Repeating block structure (10+ rows with data in day columns)
  const rowsWithDayData = ps.jsonRows.filter(row => {
    for (const [dn] of dayPrefixes) {
      for (const suffix of dayPrefixes.get(dn) || []) {
        const col = `${dn}_${suffix}`
        if (row[col] != null && row[col] !== '') return true
      }
    }
    return false
  }).length

  if (rowsWithDayData >= 30) score += 0.25
  else if (rowsWithDayData >= 10) score += 0.15
  else if (rowsWithDayData >= 5) score += 0.05

  // Signal 4: Has metadata columns (phase labels in first few columns)
  const metaCols = ps.headers.filter(
    h => !DAY_NAMES.some(dn => h.startsWith(dn + '_')) && !h.startsWith('_col')
  )
  if (metaCols.length >= 1) score += 0.05

  return { score: Math.min(1, score), dayPrefixes }
}

function scoreCompactExerciseGrid(ps: ParsedSheet): { score: number; weekColumns: string[] } {
  // Week columns: headers matching week/w1/wk1 patterns
  const weekPattern = /^(week\s*\d+|w\s*\d+|wk\s*\d+)$/i
  const weekColumns = ps.headers.filter(h => weekPattern.test(h.trim()))

  let score = 0

  // Signal 1: Multiple week-labeled columns
  if (weekColumns.length >= 4) score += 0.35
  else if (weekColumns.length >= 2) score += 0.2

  // Signal 2: First column has text values (exercise names)
  const firstCol = ps.headers[0]
  if (firstCol) {
    const textCount = ps.jsonRows.filter(r => {
      const v = r[firstCol]
      return v != null && typeof v === 'string' && v.trim().length > 0 && isNaN(Number(v))
    }).length
    if (textCount >= 5) score += 0.25
    else if (textCount >= 2) score += 0.1
  }

  // Signal 3: Week column cells have prescription-like values (3x8, 80%, etc.)
  let prescriptionCount = 0
  for (const wc of weekColumns) {
    for (const row of ps.jsonRows.slice(0, 20)) {
      const val = row[wc]
      if (val != null) {
        const s = String(val).trim()
        if (/\d+\s*[x×]\s*\d+/i.test(s) || /\d+%/.test(s) || /^\d+$/.test(s)) {
          prescriptionCount++
        }
      }
    }
  }
  if (prescriptionCount >= 5) score += 0.25
  else if (prescriptionCount >= 2) score += 0.1

  // Signal 4: No day-prefixed columns (not a season grid)
  const hasDayPrefixes = ps.headers.some(h => DAY_NAMES.some(dn => h.startsWith(dn + '_')))
  if (!hasDayPrefixes && weekColumns.length > 0) score += 0.1

  return { score: Math.min(1, score), weekColumns }
}

function scoreDailyLog(ps: ParsedSheet): number {
  let score = 0

  // Signal 1: First column looks like dates
  const firstCol = ps.headers[0]
  if (firstCol) {
    let dateCount = 0
    for (const row of ps.jsonRows.slice(0, 20)) {
      const val = row[firstCol]
      if (val != null) {
        const s = String(val).trim()
        // Detect date patterns: "2018-01-15", "Mon 3 Jan", "1/15/2018", serial numbers > 40000
        if (/^\d{4}-\d{2}-\d{2}$/.test(s) ||
            /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s) ||
            /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(s) ||
            (typeof val === 'number' && val > 40000 && val < 50000)) {
          dateCount++
        }
      }
    }
    if (dateCount >= 10) score += 0.4
    else if (dateCount >= 5) score += 0.2
  }

  // Signal 2: Has activity/session column with text
  if (ps.headers.length >= 2) {
    const secondCol = ps.headers[1]
    const textCount = ps.jsonRows.filter(r => {
      const v = r[secondCol]
      return v != null && typeof v === 'string' && v.trim().length > 0
    }).length
    if (textCount >= 10) score += 0.3
    else if (textCount >= 5) score += 0.15
  }

  // Signal 3: Many rows (daily logs tend to have 50+ rows)
  if (ps.jsonRows.length >= 50) score += 0.2
  else if (ps.jsonRows.length >= 20) score += 0.1

  return Math.min(1, score)
}

// ═════════════════════════════════════════════════════════════════════════
// MULTI-ROW SEASON GRID EXTRACTION
// ═════════════════════════════════════════════════════════════════════════

function extractMultiRowSeasonGrid(
  sheets: ParsedSheet[],
  detection: PatternDetection,
  options: {
    fileName: string
    preImportContext?: PreImportContext
    coachAbbreviations?: Record<string, string>
  },
): ExtractionResult {
  const ps = sheets[detection.sheetIndex]
  const dayPrefixes = detection.dayPrefixes!

  if (!dayPrefixes || dayPrefixes.size === 0) {
    return { success: false, confidence: 0, pattern: 'multi_row_season_grid', reason: 'No day groups found' }
  }

  const abbrLookup = buildAbbreviationLookup(
    options.coachAbbreviations,
    options.preImportContext?.coachSport,
  )

  // ── Pass 2: Column Classification (reuse day-prefixed headers) ──
  const metaCols = ps.headers.filter(
    h => !DAY_NAMES.some(dn => h.startsWith(dn + '_')) && !h.startsWith('_col')
  )

  // ── Pass 3: Phase / Block Detection ──
  const blockBoundaries = detectPhases(ps, metaCols)
  console.log(`[Extractor] Phase detection: ${blockBoundaries.length} blocks:`, blockBoundaries.map(b => b.name))

  // ── Pass 4: Week Boundary Detection ──
  const weekBoundaries = detectWeekBoundaries(ps, dayPrefixes)
  console.log(`[Extractor] Week boundaries: ${weekBoundaries.length} weeks`)
  console.log(`[Extractor] Total sheet rows: ${ps.jsonRows.length}`)
  if (weekBoundaries.length > 0) {
    console.log(`[Extractor] Week row ranges:`, weekBoundaries.map((wb, i) => `W${i + 1}=[${wb.startRow}-${wb.endRow}]`).join(', '))
    console.log(`[Extractor] Block row ranges:`, blockBoundaries.map((bb, i) => `B${i + 1}="${bb.name}"@row${bb.startRow}`).join(', '))
  }

  if (weekBoundaries.length === 0) {
    return {
      success: false,
      confidence: detection.confidence * 0.5,
      pattern: 'multi_row_season_grid',
      reason: 'No week boundaries detected',
    }
  }

  // ── Pass 5: Exercise Extraction ──
  // Build session name map (which session name appears for each day)
  // Session names can CHANGE per week (e.g., week 1 has "Speed 1" on Tuesday,
  // week 15 has "Tempo/MB" on Tuesday). Extract per-week session names.
  const allBlocks: ImportBlock[] = []
  let totalExercises = 0
  let totalWorkouts = 0

  // Assign weeks to blocks based on block boundaries
  const weekBlockAssignment = assignWeeksToBlocks(weekBoundaries, blockBoundaries, ps)
  console.log(`[Extractor] Week→Block assignment:`, weekBlockAssignment.map((bi, wi) => `W${wi + 1}→B${bi + 1}(${blockBoundaries[bi]?.name || '?'})`).join(', '))

  // Group weeks by block
  const blockWeekMap = new Map<number, typeof weekBoundaries>()
  for (let wi = 0; wi < weekBoundaries.length; wi++) {
    const blockIdx = weekBlockAssignment[wi]
    if (!blockWeekMap.has(blockIdx)) blockWeekMap.set(blockIdx, [])
    blockWeekMap.get(blockIdx)!.push(weekBoundaries[wi])
  }

  // Build blocks
  const blockIndices = [...blockWeekMap.keys()].sort((a, b) => a - b)
  for (const bi of blockIndices) {
    const blockInfo = blockBoundaries[bi] || { name: `Block ${bi + 1}`, blockType: undefined }
    const weeks = blockWeekMap.get(bi)!

    const importWeeks: ImportWeek[] = []
    let weekCounter = 1

    for (const wb of weeks) {
      const workouts: ImportWorkout[] = []

      // Extract exercises for each day group
      for (const [dayName, suffixes] of dayPrefixes) {
        // Get session name for this week+day
        const sessionName = getSessionName(ps, wb, dayName) || dayName

        const exercises: ImportExercise[] = []

        for (let ri = wb.startRow; ri < wb.endRow; ri++) {
          const row = ps.jsonRows[ri]
          if (!row) continue

          // Collect all field values for this day
          const exData: Record<string, any> = {}
          let hasData = false
          for (const suffix of suffixes) {
            const col = `${dayName}_${suffix}`
            const val = row[col]
            if (val != null && val !== '') {
              exData[suffix.toLowerCase()] = val
              hasData = true
            }
          }

          if (!hasData) continue

          // Map extracted fields to ImportExercise
          const exercise = mapToImportExercise(exData, abbrLookup)
          if (exercise) {
            exercises.push(exercise)
          }
        }

        if (exercises.length > 0) {
          const dayOfWeek = DAY_MAP[dayName] || 1
          workouts.push({
            name: sessionName,
            dayOfWeek,
            sessionType: inferSessionType(sessionName),
            exercises,
          })
          totalExercises += exercises.length
          totalWorkouts++
        }
      }

      // Always include the week — even if empty — so the coach sees
      // the full season structure and can fill in sessions later.
      importWeeks.push({
        weekNumber: weekCounter,
        name: `Week ${weekCounter}`,
        workouts,
      })
      weekCounter++
    }

    // Always include the block — even if all weeks are empty — so the
    // full phase structure (GPP → SPP → Competition etc.) is preserved.
    allBlocks.push({
      name: blockInfo.name,
      blockType: blockInfo.blockType,
      weeks: importWeeks,
    })
  }

  if (allBlocks.length === 0) {
    return {
      success: false,
      confidence: detection.confidence * 0.3,
      pattern: 'multi_row_season_grid',
      reason: 'No blocks extracted from grid',
    }
  }

  // Season plans may have empty future blocks — that's fine as long as
  // we extracted at least some content overall.
  if (totalExercises === 0 && totalWorkouts === 0) {
    return {
      success: false,
      confidence: detection.confidence * 0.3,
      pattern: 'multi_row_season_grid',
      reason: 'No exercises extracted from grid',
    }
  }

  // ── Pass 6: ImportResult Assembly ──
  const totalWeeks = allBlocks.reduce((s, b) => s + b.weeks.length, 0)
  const programName = cleanFileName(options.fileName)

  const importResult: ImportResult = {
    programName,
    durationWeeks: totalWeeks,
    periodization: inferPeriodization(allBlocks),
    sport: options.preImportContext?.coachSport !== 'auto'
      ? options.preImportContext?.coachSport
      : inferSport(allBlocks, abbrLookup),
    blocks: allBlocks,
    detectedPlanType: inferPlanType(totalWeeks, totalWorkouts),
    planTypeConfidence: detection.confidence,
  }

  console.log(`[Extractor] Assembly complete: ${allBlocks.length} blocks, ${totalWeeks} weeks, ${totalWorkouts} workouts, ${totalExercises} exercises`)

  return {
    success: true,
    confidence: detection.confidence,
    pattern: 'multi_row_season_grid',
    importResult,
  }
}

// ═════════════════════════════════════════════════════════════════════════
// COMPACT EXERCISE GRID EXTRACTION
// ═════════════════════════════════════════════════════════════════════════

function extractCompactExerciseGrid(
  sheets: ParsedSheet[],
  detection: PatternDetection,
  options: {
    fileName: string
    preImportContext?: PreImportContext
    coachAbbreviations?: Record<string, string>
  },
): ExtractionResult {
  const ps = sheets[detection.sheetIndex]
  const weekColumns = detection.weekColumns || []

  if (weekColumns.length === 0) {
    return { success: false, confidence: 0, pattern: 'compact_exercise_grid', reason: 'No week columns found' }
  }

  const abbrLookup = buildAbbreviationLookup(
    options.coachAbbreviations,
    options.preImportContext?.coachSport,
  )

  const exerciseNameCol = ps.headers[0]
  const weeks: ImportWeek[] = []
  let totalExercises = 0

  for (let wi = 0; wi < weekColumns.length; wi++) {
    const weekCol = weekColumns[wi]
    const exercises: ImportExercise[] = []

    for (const row of ps.jsonRows) {
      const exerciseName = row[exerciseNameCol]
      const prescription = row[weekCol]

      if (exerciseName == null || prescription == null) continue
      const name = String(exerciseName).trim()
      const prescStr = String(prescription).trim()
      if (!name || !prescStr) continue

      // Skip header-like rows
      if (/^(exercise|name|movement)$/i.test(name)) continue

      const parsed = parsePrescription(prescStr)
      const expandedName = abbrLookup[name.toUpperCase()] || name

      exercises.push({
        name: expandedName,
        raw_name: name !== expandedName ? name : undefined,
        sets: parsed.sets,
        reps: parsed.reps,
        weight: parsed.weight,
        intensity_percent: parsed.intensity,
        notes: parsed.notes,
      })
      totalExercises++
    }

    if (exercises.length > 0) {
      weeks.push({
        weekNumber: wi + 1,
        name: `Week ${wi + 1}`,
        workouts: [{
          name: cleanFileName(options.fileName),
          dayOfWeek: 1,
          exercises,
        }],
      })
    }
  }

  if (weeks.length === 0 || totalExercises === 0) {
    return {
      success: false,
      confidence: detection.confidence * 0.3,
      pattern: 'compact_exercise_grid',
      reason: 'No exercises extracted from compact grid',
    }
  }

  const programName = cleanFileName(options.fileName)
  const importResult: ImportResult = {
    programName,
    durationWeeks: weeks.length,
    periodization: 'linear',
    sport: options.preImportContext?.coachSport !== 'auto'
      ? options.preImportContext?.coachSport
      : undefined,
    blocks: [{
      name: programName,
      blockType: undefined,
      weeks,
    }],
    detectedPlanType: weeks.length > 1 ? 'block_plan' : 'single_session',
    planTypeConfidence: detection.confidence,
  }

  console.log(`[Extractor] Compact grid: ${weeks.length} weeks, ${totalExercises} exercises`)

  return {
    success: true,
    confidence: detection.confidence,
    pattern: 'compact_exercise_grid',
    importResult,
  }
}

// ═════════════════════════════════════════════════════════════════════════
// HELPER: Phase / Block Detection (Pass 3)
// ═════════════════════════════════════════════════════════════════════════

interface BlockBoundary {
  name: string
  blockType?: string
  startRow: number  // first row index in jsonRows
}

/**
 * Check if a label matches a known phase keyword (exact match or contains a root keyword).
 * Returns the matched blockType or null.
 */
function matchPhaseKeyword(label: string): string | null {
  const lower = label.toLowerCase().trim()

  // Exact match in glossary
  if (PHASE_BLOCK_TYPES[lower]) return PHASE_BLOCK_TYPES[lower]

  // Check if label contains a known phase root keyword
  // e.g., "GPP Phase 1" contains "gpp", "Late Pre-Season" contains "pre-season"
  for (const root of PHASE_KEYWORD_ROOTS) {
    if (lower.includes(root)) return PHASE_BLOCK_TYPES[root] || root
  }

  // Check with trailing numbers stripped: "SPP 4" → "spp"
  const stripped = lower.replace(/\s*[ivx\d]+$/i, '').trim()
  if (stripped !== lower && PHASE_BLOCK_TYPES[stripped]) return PHASE_BLOCK_TYPES[stripped]

  return null
}

function detectPhases(ps: ParsedSheet, metaCols: string[]): BlockBoundary[] {
  // Look for phase labels in the first few metadata columns.
  // Phase labels are text values that repeat across multiple rows, then change.
  // e.g., rows 0-30 have "GPP", rows 31-60 have "SPP I", etc.
  //
  // KEY IMPROVEMENT (v31): Prefer columns where values match known training phase
  // vocabulary. A column of "GPP, SPP, Competition" is far more likely to be
  // the phase column than a column of "Speed, Tempo, Recovery" (session types).

  // Also check _col1, _col2 which often hold phase data
  const candidateCols = [
    ...metaCols.slice(0, 3),
    ...ps.headers.filter(h => /^_col[12]$/.test(h)),
  ]
  const uniqueCandidates = [...new Set(candidateCols)]

  interface PhaseCandidate {
    col: string
    phases: { label: string; startRow: number }[]
    knownCount: number    // how many distinct labels match the phase glossary
    totalCount: number    // total distinct labels
    score: number         // ranking score
  }

  const candidates: PhaseCandidate[] = []

  for (const col of uniqueCandidates) {
    const phases: { label: string; startRow: number }[] = []
    let currentLabel = ''

    for (let ri = 0; ri < ps.jsonRows.length; ri++) {
      const val = ps.jsonRows[ri][col]
      if (val == null || String(val).trim() === '') continue

      const label = String(val).trim()

      // Skip numeric values, dates, and very long strings (they're not phase labels)
      if (!isNaN(Number(label))) continue
      if (label.length > 40) continue

      if (label !== currentLabel) {
        phases.push({ label, startRow: ri })
        currentLabel = label
      }
    }

    // Must have 2-20 distinct values to be a phase column
    if (phases.length < 2 || phases.length > 20) continue

    // Count how many distinct labels match known phase keywords
    const distinctLabels = new Set(phases.map(p => p.label))
    let knownCount = 0
    for (const label of distinctLabels) {
      if (matchPhaseKeyword(label)) knownCount++
    }

    // Score: heavily prefer columns with known phase keywords
    // - knownCount / totalCount gives percentage of recognized phases (0-1)
    // - Bonus for having at least 2 known phases (very strong signal)
    const knownRatio = knownCount / distinctLabels.size
    let score = knownRatio * 10  // 0-10 for keyword match quality
    if (knownCount >= 2) score += 5  // big bonus for multiple known phases
    if (knownCount >= 1) score += 2  // small bonus for at least one match
    // Tiebreaker: prefer more distinct phases (but much lower weight)
    score += phases.length * 0.1

    candidates.push({
      col,
      phases,
      knownCount,
      totalCount: distinctLabels.size,
      score,
    })
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  const best = candidates[0]

  if (!best) {
    // No valid phase column found — single block
    return [{ name: cleanFileName('Training Plan'), startRow: 0 }]
  }

  // GATE: If the best candidate has ZERO known phase keywords, reject phase detection.
  // Random text columns (session types, exercise categories) should not be treated as blocks.
  if (best.knownCount === 0) {
    console.log(`[Extractor] Phase detection REJECTED — best column "${best.col}" has ${best.totalCount} labels but none match known phase keywords:`,
      best.phases.map(p => p.label))
    return [{ name: cleanFileName('Training Plan'), startRow: 0 }]
  }

  console.log(`[Extractor] Phase column: "${best.col}" (score=${best.score.toFixed(1)}, ${best.knownCount}/${best.totalCount} known) with ${best.phases.length} phases:`,
    best.phases.map(p => p.label))

  return best.phases.map(p => ({
    name: p.label,
    blockType: matchPhaseKeyword(p.label) || undefined,
    startRow: p.startRow,
  }))
}

// ═════════════════════════════════════════════════════════════════════════
// HELPER: Week Boundary Detection (Pass 4)
// ═════════════════════════════════════════════════════════════════════════

interface WeekBound {
  startRow: number
  endRow: number
  sessionNames: Map<string, string>  // dayName → session name for this week
}

function detectWeekBoundaries(
  ps: ParsedSheet,
  dayPrefixes: Map<string, string[]>,
): WeekBound[] {
  // Session name rows: rows where any day's _Set column has a text value
  // (not a number, not a sub-header label like "Set"/"Rep")
  const sessionNameRows: number[] = []

  for (let ri = 0; ri < ps.jsonRows.length; ri++) {
    const row = ps.jsonRows[ri]
    let isSessionNameRow = false

    for (const [dn] of dayPrefixes) {
      const setCol = `${dn}_Set`
      const val = row[setCol]
      if (val != null && typeof val === 'string') {
        const lower = val.trim().toLowerCase()
        if (!SUB_HEADER_LABELS.has(lower) && val.trim().length > 0 && isNaN(Number(val))) {
          isSessionNameRow = true
          break
        }
      }
    }

    if (isSessionNameRow) {
      sessionNameRows.push(ri)
    }
  }

  if (sessionNameRows.length === 0) {
    // Fallback: treat entire sheet as one week
    return [{
      startRow: 0,
      endRow: ps.jsonRows.length,
      sessionNames: new Map(),
    }]
  }

  // Build week boundaries: exercises start 2 rows after session name row
  // (skip the sub-header row that repeats Set/Rep/Distance/Note)
  const bounds: WeekBound[] = []

  for (let i = 0; i < sessionNameRows.length; i++) {
    const snRow = sessionNameRows[i]
    const startRow = snRow + 2  // skip session name row + sub-header row
    const endRow = i + 1 < sessionNameRows.length
      ? sessionNameRows[i + 1]
      : ps.jsonRows.length

    // Extract session names from this row
    const sessionNames = new Map<string, string>()
    const row = ps.jsonRows[snRow]
    for (const [dn] of dayPrefixes) {
      const setCol = `${dn}_Set`
      const val = row[setCol]
      if (val != null && typeof val === 'string') {
        const trimmed = val.trim()
        if (trimmed && !SUB_HEADER_LABELS.has(trimmed.toLowerCase()) && isNaN(Number(trimmed))) {
          sessionNames.set(dn, trimmed)
        }
      }
    }

    // Only add if there are actual exercise rows
    if (startRow < endRow) {
      bounds.push({ startRow, endRow, sessionNames })
    }
  }

  return bounds
}

// ═════════════════════════════════════════════════════════════════════════
// HELPER: Assign weeks to blocks
// ═════════════════════════════════════════════════════════════════════════

function assignWeeksToBlocks(
  weekBounds: WeekBound[],
  blockBounds: BlockBoundary[],
  ps: ParsedSheet,
): number[] {
  if (blockBounds.length <= 1) {
    // Single block — all weeks belong to it
    return weekBounds.map(() => 0)
  }

  // For each week, find which block's row range it falls into
  return weekBounds.map(wb => {
    // Find the block whose startRow is ≤ this week's startRow
    let bestBlock = 0
    for (let bi = 0; bi < blockBounds.length; bi++) {
      if (blockBounds[bi].startRow <= wb.startRow) {
        bestBlock = bi
      }
    }
    return bestBlock
  })
}

// ═════════════════════════════════════════════════════════════════════════
// HELPER: Get session name for a specific week+day
// ═════════════════════════════════════════════════════════════════════════

function getSessionName(ps: ParsedSheet, wb: WeekBound, dayName: string): string | null {
  return wb.sessionNames.get(dayName) || null
}

// ═════════════════════════════════════════════════════════════════════════
// HELPER: Map raw extracted fields to ImportExercise (Pass 5)
// ═════════════════════════════════════════════════════════════════════════

function mapToImportExercise(
  exData: Record<string, any>,
  abbrLookup: Record<string, string>,
): ImportExercise | null {
  // Fields we expect: set, rep, distance, note
  const setVal = exData['set'] ?? exData['sets']
  const repVal = exData['rep'] ?? exData['reps']
  const distVal = exData['distance'] ?? exData['dist']
  const noteVal = exData['note'] ?? exData['notes']
  const timeVal = exData['time']
  const intensityVal = exData['intensity']
  const restVal = exData['rest']

  // Determine exercise name from Note field (drill abbreviation) or generic name
  let rawName: string | undefined
  let name: string

  if (noteVal != null && String(noteVal).trim().length > 0) {
    rawName = String(noteVal).trim()
    const upper = rawName.toUpperCase()

    // Try abbreviation expansion
    if (abbrLookup[upper]) {
      name = abbrLookup[upper]
    } else {
      // Check if the note contains a compound like "LA20" → split and expand
      const laMatch = upper.match(/^(LA)(\d+)$/)
      if (laMatch && abbrLookup['LA']) {
        name = `${abbrLookup['LA']} ${laMatch[2]}m`
      } else {
        // Check for compound like "20EFE" → "20m Easy-Fast-Easy"
        const numPrefixMatch = upper.match(/^(\d+)([A-Z]+)$/)
        if (numPrefixMatch && abbrLookup[numPrefixMatch[2]]) {
          name = `${numPrefixMatch[1]}m ${abbrLookup[numPrefixMatch[2]]}`
        } else {
          // No expansion found — use as-is
          name = rawName
        }
      }
    }
  } else {
    // No note → generic name based on distance or rep
    const dist = parseNumber(distVal)
    if (dist != null) {
      name = dist <= 400 ? 'Sprint' : 'Run'
    } else {
      name = 'Drill'
    }
    rawName = undefined
  }

  // Parse numeric fields
  const sets = parseNumberOrString(setVal)
  const reps = parseNumberOrString(repVal)
  const distance = parseNumber(distVal)
  const duration = parseNumber(timeVal)
  const intensity = parseNumber(intensityVal)
  const rest = parseNumber(restVal)

  // Determine category
  let category: string | undefined
  if (distance != null) {
    category = distance <= 400 ? 'sprint' : 'run'
  } else if (sets || reps) {
    category = 'drill'
  }

  return {
    name,
    raw_name: rawName !== name ? rawName : undefined,
    sets: sets ?? undefined,
    reps: reps != null ? String(reps) : undefined,
    distance_meters: distance ?? undefined,
    duration_seconds: duration ?? undefined,
    intensity_percent: intensity ?? undefined,
    rest_seconds: rest ?? undefined,
    category,
  }
}

// ═════════════════════════════════════════════════════════════════════════
// HELPER: Parse prescription string (for compact grid)
// ═════════════════════════════════════════════════════════════════════════

interface ParsedPrescription {
  sets?: string
  reps?: string
  weight?: string
  intensity?: number
  notes?: string
}

function parsePrescription(str: string): ParsedPrescription {
  const result: ParsedPrescription = {}

  // Match "3x8", "3×8", "3 x 8"
  const setsReps = str.match(/(\d+)\s*[x×]\s*(\d+[-–]?\d*)/i)
  if (setsReps) {
    result.sets = setsReps[1]
    result.reps = setsReps[2]
  }

  // Match "@ 80%" or "@80%"
  const pctMatch = str.match(/@?\s*(\d+(?:\.\d+)?)\s*%/)
  if (pctMatch) {
    result.intensity = parseFloat(pctMatch[1])
  }

  // Match "@ 135lbs" or "@ 60kg"
  const weightMatch = str.match(/@?\s*(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)/i)
  if (weightMatch) {
    result.weight = `${weightMatch[1]} ${weightMatch[2]}`
  }

  // If no sets×reps found, check for single number (reps only)
  if (!setsReps) {
    const singleNum = str.match(/^(\d+)$/)
    if (singleNum) {
      result.reps = singleNum[1]
    }
  }

  // Remaining text as notes
  let remaining = str
    .replace(/\d+\s*[x×]\s*\d+[-–]?\d*/i, '')
    .replace(/@?\s*\d+(?:\.\d+)?\s*%/, '')
    .replace(/@?\s*\d+(?:\.\d+)?\s*(kg|lbs?|pounds?)/i, '')
    .trim()
  if (remaining.length > 0) {
    result.notes = remaining
  }

  return result
}

// ═════════════════════════════════════════════════════════════════════════
// HELPER: Inference functions (Pass 6)
// ═════════════════════════════════════════════════════════════════════════

function inferSessionType(sessionName: string): string | undefined {
  const lower = sessionName.toLowerCase()
  if (/speed|sprint|fly|accel/i.test(lower)) return 'speed'
  if (/tempo|jog|easy/i.test(lower)) return 'conditioning'
  if (/strength|weights|gym|lift/i.test(lower)) return 'strength'
  if (/power|plyo|jump|bound/i.test(lower)) return 'power'
  if (/endurance|distance|long/i.test(lower)) return 'endurance'
  if (/circuit|metcon|cond/i.test(lower)) return 'conditioning'
  if (/recovery|regen/i.test(lower)) return 'conditioning'
  if (/mb|medicine/i.test(lower)) return 'power'
  return undefined
}

function inferPeriodization(blocks: ImportBlock[]): ImportResult['periodization'] {
  if (blocks.length === 1) return 'linear'
  if (blocks.length >= 3) return 'block'

  // Check if block types vary
  const types = blocks.map(b => b.blockType).filter(Boolean)
  const uniqueTypes = new Set(types)
  if (uniqueTypes.size >= 2) return 'block'

  return 'linear'
}

function inferPlanType(totalWeeks: number, totalWorkouts: number): PlanType {
  if (totalWeeks >= 4) return 'season_plan'
  if (totalWeeks >= 2) return 'block_plan'
  if (totalWorkouts > 1) return 'block_plan'
  return 'single_session'
}

function inferSport(blocks: ImportBlock[], abbrLookup: Record<string, string>): string | undefined {
  // Check if sprint abbreviations dominate
  let sprintCount = 0
  let totalCount = 0
  for (const block of blocks) {
    for (const week of block.weeks) {
      for (const workout of week.workouts) {
        for (const ex of workout.exercises) {
          totalCount++
          if (ex.raw_name) {
            const upper = ex.raw_name.toUpperCase()
            if (SPRINT_ABBREVIATIONS[upper] || /sprint|fly|accel|block/i.test(upper)) {
              sprintCount++
            }
          }
          if (ex.category === 'sprint') sprintCount++
        }
      }
    }
  }
  if (totalCount > 0 && sprintCount / totalCount > 0.3) return 'sprint_track'
  return undefined
}

// ═════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═════════════════════════════════════════════════════════════════════════

function parseNumber(val: any): number | null {
  if (val == null) return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function parseNumberOrString(val: any): string | null {
  if (val == null) return null
  const s = String(val).trim()
  if (s === '') return null
  return s
}

function cleanFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')        // strip extension
    .replace(/[_-]+/g, ' ')         // underscores/hyphens → spaces
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim()
}
