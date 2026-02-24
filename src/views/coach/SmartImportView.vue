<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, onUnmounted } from 'vue'
import type { ImportBlock, ImportWeek, PlanType, ImportSportCategory, ImportTrainingFocus, PreImportContext, ImportClassification } from '@/types/import'
import { PLAN_TYPE_LABELS, PLAN_TYPE_DESCRIPTIONS, IMPORT_SPORT_OPTIONS, IMPORT_FOCUS_OPTIONS, IMPORT_PLAN_TYPE_OPTIONS } from '@/types/import'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { importProgram, classifyImport, saveImportedProgram, saveImportedWorkout, getImportHistory, cancelActiveImport, getCachedImportResult } from '@/services/aiImport'
import type { ImportResult, ImportHistoryRecord, ImportAmbiguity } from '@/types/import'
import { detectAbbreviationsFromCorrections, batchSaveAbbreviations } from '@/services/coachAbbreviations'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { AI_CONFIG } from '@/config/ai'
import Toast from '@/components/ui/Toast.vue'
import ImportClassificationPreview from '@/components/planner/ImportClassificationPreview.vue'

const router = useRouter()
const authStore = useAuthStore()

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('success')

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

const file = ref<File | null>(null)
const isProcessing = ref(false)
const isSaving = ref(false)
const processingStage = ref<'uploading' | 'classifying' | 'parsing' | 'validating' | 'complete'>('uploading')
const importResult = ref<ImportResult | null>(null)
const historyRecord = ref<ImportHistoryRecord | null>(null)
const error = ref<string | null>(null)
const importHistory = ref<ImportHistoryRecord[]>([])

// Two-step flow: classify → preview → extract
const importStep = ref<'upload' | 'classify_preview' | 'extract_preview'>('upload')
const classificationResult = ref<ImportClassification | null>(null)

// ── Session keepalive (keeps Supabase auth alive during review) ──
let reviewKeepaliveId: ReturnType<typeof setInterval> | null = null

function startReviewKeepalive() {
  stopReviewKeepalive()
  reviewKeepaliveId = setInterval(async () => {
    try { await supabase.auth.refreshSession() }
    catch { /* ignore */ }
  }, 30_000) // every 30s during review
}

function stopReviewKeepalive() {
  if (reviewKeepaliveId) {
    clearInterval(reviewKeepaliveId)
    reviewKeepaliveId = null
  }
}

onUnmounted(() => stopReviewKeepalive())

// Start keepalive whenever we enter a review step
watch(importStep, (step) => {
  if (step === 'classify_preview' || step === 'extract_preview') {
    startReviewKeepalive()
  } else {
    stopReviewKeepalive()
  }
})

// ── Simulated progress bar ──
const PROGRESS_MESSAGES = [
  { at: 0, text: 'Preparing your file...' },
  { at: 5, text: 'Uploading to AI...' },
  { at: 10, text: 'AI is reading your program...' },
  { at: 18, text: 'Detecting sport & structure...' },
  { at: 25, text: 'Identifying exercises...' },
  { at: 32, text: 'Parsing sets, reps & intensities...' },
  { at: 40, text: 'Mapping weekly progressions...' },
  { at: 48, text: 'Checking for abbreviations...' },
  { at: 55, text: 'Cross-referencing your glossary...' },
  { at: 62, text: 'Validating exercise prescriptions...' },
  { at: 70, text: 'Organizing into blocks & sessions...' },
  { at: 78, text: 'Almost there...' },
  { at: 85, text: 'Applying final polish...' },
  { at: 90, text: 'Wrapping up... hang tight!' },
]

const simulatedProgress = ref(0)
const progressMessage = ref('Preparing your file...')
let progressTimerId: ReturnType<typeof setInterval> | null = null
const progressComplete = ref(false)

function startProgressSimulation() {
  simulatedProgress.value = 0
  progressComplete.value = false
  progressMessage.value = PROGRESS_MESSAGES[0].text

  const TOTAL_DURATION = 65_000 // 65 seconds to reach ~92%
  const TICK_MS = 300
  const MAX_SIMULATED = 92 // never exceed this until API returns
  let elapsed = 0

  progressTimerId = setInterval(() => {
    elapsed += TICK_MS
    // Ease-out curve: fast start, slows down near end
    const t = Math.min(elapsed / TOTAL_DURATION, 1)
    const eased = 1 - Math.pow(1 - t, 2.5) // quadratic ease-out
    simulatedProgress.value = Math.min(Math.round(eased * MAX_SIMULATED), MAX_SIMULATED)

    // Update message based on progress
    for (let i = PROGRESS_MESSAGES.length - 1; i >= 0; i--) {
      if (simulatedProgress.value >= PROGRESS_MESSAGES[i].at) {
        progressMessage.value = PROGRESS_MESSAGES[i].text
        break
      }
    }
  }, TICK_MS)
}

function completeProgress() {
  if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null }
  simulatedProgress.value = 100
  progressMessage.value = 'Complete!'
  progressComplete.value = true
}

function stopProgressSimulation() {
  if (progressTimerId) { clearInterval(progressTimerId); progressTimerId = null }
  simulatedProgress.value = 0
  progressComplete.value = false
}

onUnmounted(() => stopProgressSimulation())

// Exercise review & abbreviation learning
const expandedWorkouts = ref<Set<string>>(new Set())
const originalExerciseNames = ref<Map<string, string>>(new Map()) // key: "blockIdx-weekIdx-workoutIdx-exerciseIdx" → original name
const expandedAbbreviations = ref<string[]>([]) // abbreviations that were auto-expanded by Edge Function

// Bulk exercise name review
interface UniqueExerciseEntry {
  rawName: string         // exercise name/abbreviation as coach wrote it (e.g. "PP", "HS", "BB RDL")
  aiName: string          // AI's human-readable interpretation (e.g. "Push Press", "High Start")
  coachOverride: string   // coach's manual correction (empty = accept AI)
  useRawName: boolean     // "keep original" — use coach's abbreviation in plan instead of AI name
  count: number           // how many times this exercise appears across the plan
  isFlagged: boolean      // heuristic thinks rawName is abbreviated/shorthand
}

const showAllExerciseNames = ref(false)
const showFormatTips = ref(false)
// Reactive map: rawName → { coachOverride, useRawName }
const bulkOverrides = ref<Map<string, { coachOverride: string; useRawName: boolean }>>(new Map())

// v31: Ambiguity resolution
const ambiguities = computed<ImportAmbiguity[]>(() => importResult.value?.ambiguities ?? [])
const unresolvedAmbiguities = computed(() => ambiguities.value.filter(a => !a.resolved))
const hasUnresolvedHighPriority = computed(() => unresolvedAmbiguities.value.some(a => a.priority >= 7))

function resolveAmbiguity(index: number, value: string) {
  if (!importResult.value?.ambiguities?.[index]) return
  importResult.value.ambiguities[index].resolved = true
  importResult.value.ambiguities[index].resolvedValue = value
}

function unresolveAmbiguity(index: number) {
  if (!importResult.value?.ambiguities?.[index]) return
  importResult.value.ambiguities[index].resolved = false
  importResult.value.ambiguities[index].resolvedValue = undefined
}

function isLikelyAbbreviation(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  // All uppercase and short (e.g. "PP", "BS", "RDL", "BB RDL")
  if (trimmed === trimmed.toUpperCase() && trimmed.replace(/\s+/g, '').length <= 8 && /[A-Z]/.test(trimmed)) return true
  // Single word 3 chars or less (e.g. "SL", "DB")
  if (!/\s/.test(trimmed) && trimmed.length <= 3 && /^[A-Za-z]+$/.test(trimmed)) return true
  // Contains "/" separator common in shorthand (e.g. "DB B/O Row")
  if (/\//.test(trimmed) && trimmed.length <= 20) return true
  // Matches "A1", "B2" style circuit markers
  if (/^[A-Z]\d+$/i.test(trimmed)) return true
  // No vowels and has at least 2 consonants (e.g. "RFSS", "SLR")
  const letters = trimmed.replace(/[^a-zA-Z]/g, '')
  if (letters.length >= 2 && !/[aeiouAEIOU]/.test(letters)) return true
  return false
}

/** Resolve what the display name should be for a given entry */
function resolvedName(entry: UniqueExerciseEntry): string {
  const override = bulkOverrides.value.get(entry.rawName)
  // Always return the full exercise name — never the raw abbreviation.
  // "Keep" now means "preserve shorthand as coach alias", not "use it as display name".
  // Athletes always see the full name; coach views show raw_name when present.
  if (override?.coachOverride?.trim()) return override.coachOverride.trim()
  return entry.aiName
}

const uniqueExerciseEntries = computed<UniqueExerciseEntry[]>(() => {
  if (!importResult.value) return []
  const blocks = previewBlocks.value

  // Group by raw_name (or name if raw_name not available from older imports)
  const entryMap = new Map<string, { rawName: string; aiName: string; count: number }>()
  for (let bi = 0; bi < blocks.length; bi++) {
    for (let wi = 0; wi < (blocks[bi].weeks ?? []).length; wi++) {
      const week = blocks[bi].weeks[wi]
      for (let woi = 0; woi < (week.workouts ?? []).length; woi++) {
        const workout = week.workouts[woi]
        for (let ei = 0; ei < (workout.exercises ?? []).length; ei++) {
          const ex = workout.exercises[ei]
          const rawName = ex.raw_name || ex.name
          const aiName = ex.name
          const existing = entryMap.get(rawName)
          if (existing) {
            existing.count++
          } else {
            entryMap.set(rawName, { rawName, aiName, count: 1 })
          }
        }
      }
    }
  }

  const entries: UniqueExerciseEntry[] = []
  for (const [, { rawName, aiName, count }] of entryMap) {
    const override = bulkOverrides.value.get(rawName)
    entries.push({
      rawName,
      aiName,
      coachOverride: override?.coachOverride ?? '',
      useRawName: override?.useRawName ?? false,
      count,
      isFlagged: isLikelyAbbreviation(rawName),
    })
  }

  // Sort: flagged first, then by count descending
  entries.sort((a, b) => {
    if (a.isFlagged !== b.isFlagged) return a.isFlagged ? -1 : 1
    return b.count - a.count
  })

  return entries
})

const flaggedEntries = computed(() => uniqueExerciseEntries.value.filter(e => e.isFlagged))
const unflaggedEntries = computed(() => uniqueExerciseEntries.value.filter(e => !e.isFlagged))
const bulkCorrectionCount = computed(() => {
  let count = 0
  for (const entry of uniqueExerciseEntries.value) {
    const override = bulkOverrides.value.get(entry.rawName)
    if (override?.coachOverride?.trim() || override?.useRawName) count++
  }
  return count
})

/** Set the coach override text for a raw_name and apply to all matching exercises */
function setCoachOverride(rawName: string, text: string) {
  const existing = bulkOverrides.value.get(rawName) ?? { coachOverride: '', useRawName: false }
  existing.coachOverride = text
  bulkOverrides.value = new Map(bulkOverrides.value.set(rawName, existing))
  applyBulkToExercises(rawName)
}

/** Toggle "keep original" for a raw_name and apply to all matching exercises */
function toggleUseRawName(rawName: string) {
  const existing = bulkOverrides.value.get(rawName) ?? { coachOverride: '', useRawName: false }
  existing.useRawName = !existing.useRawName
  bulkOverrides.value = new Map(bulkOverrides.value.set(rawName, existing))
  applyBulkToExercises(rawName)
}

/** Apply the resolved display name to all exercises matching this raw_name */
function applyBulkToExercises(rawName: string) {
  if (!importResult.value) return
  const blocks = previewBlocks.value
  // Find the entry to get resolved name
  const entry = uniqueExerciseEntries.value.find(e => e.rawName === rawName)
  if (!entry) return
  const displayName = resolvedName(entry)

  for (let bi = 0; bi < blocks.length; bi++) {
    for (let wi = 0; wi < (blocks[bi].weeks ?? []).length; wi++) {
      const week = blocks[bi].weeks[wi]
      for (let woi = 0; woi < (week.workouts ?? []).length; woi++) {
        const workout = week.workouts[woi]
        for (let ei = 0; ei < (workout.exercises ?? []).length; ei++) {
          const ex = workout.exercises[ei]
          const exRawName = ex.raw_name || ex.name
          if (exRawName === rawName) {
            ex.name = displayName
          }
        }
      }
    }
  }
}

// Plan type selector
const selectedPlanType = ref<PlanType>('block_plan')
const planTypeOverridden = ref(false) // true when coach manually picks a type

// Per-session library flags: "blockIdx-weekIdx-workoutIdx" keys
const libraryFlags = ref<Set<string>>(new Set())

const selectPlanType = (type: PlanType) => {
  selectedPlanType.value = type
  planTypeOverridden.value = true

  // Reset library defaults when type changes
  applyDefaultLibraryFlags()
}

// Set default library flags based on plan type
const applyDefaultLibraryFlags = () => {
  const flags = new Set<string>()
  if (!importResult.value) {
    libraryFlags.value = flags
    return
  }
  const blocks = previewBlocks.value
  // single_session: default ON (only 1 session, user likely wants it in library)
  // others: default OFF
  if (selectedPlanType.value === 'single_session') {
    for (let bi = 0; bi < blocks.length; bi++) {
      for (let wi = 0; wi < (blocks[bi].weeks ?? []).length; wi++) {
        for (let woi = 0; woi < (blocks[bi].weeks[wi].workouts ?? []).length; woi++) {
          flags.add(`${bi}-${wi}-${woi}`)
        }
      }
    }
  }
  libraryFlags.value = flags
}

const toggleLibraryFlag = (key: string) => {
  const flags = new Set(libraryFlags.value)
  if (flags.has(key)) flags.delete(key)
  else flags.add(key)
  libraryFlags.value = flags
}

const libraryFlagCount = computed(() => libraryFlags.value.size)

// Toggle a workout's exercise list expanded/collapsed
const toggleWorkout = (key: string) => {
  const s = new Set(expandedWorkouts.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expandedWorkouts.value = s
}

// Count how many exercise names were edited
const editCount = computed(() => {
  let count = 0
  for (const [key, original] of originalExerciseNames.value) {
    const [bi, wi, woi, ei] = key.split('-').map(Number)
    const block = previewBlocks.value[bi]
    const week = block?.weeks?.[wi]
    const workout = week?.workouts?.[woi]
    const exercise = workout?.exercises?.[ei]
    if (exercise && exercise.name !== original) count++
  }
  return count
})

// Snapshot all exercise names when importResult changes (for tracking edits)
// Also auto-select plan type from AI detection
watch(() => importResult.value, (result) => {
  if (!result) {
    originalExerciseNames.value = new Map()
    expandedWorkouts.value = new Set()
    expandedAbbreviations.value = []
    planTypeOverridden.value = false
    selectedPlanType.value = 'block_plan'
    libraryFlags.value = new Set()
    bulkOverrides.value = new Map()
    showAllExerciseNames.value = false
    return
  }

  // Auto-select plan type: coach pre-selection takes priority over AI detection
  if (!planTypeOverridden.value) {
    if (preImportPlanType.value !== 'auto') {
      selectedPlanType.value = preImportPlanType.value
    } else if (result.detectedPlanType) {
      selectedPlanType.value = result.detectedPlanType
    }
  }

  const map = new Map<string, string>()
  const blocks = result.blocks?.length ? result.blocks :
    result.weeks?.length ? [{ name: result.programName, weeks: result.weeks }] : []
  for (let bi = 0; bi < blocks.length; bi++) {
    for (let wi = 0; wi < (blocks[bi].weeks ?? []).length; wi++) {
      const week = blocks[bi].weeks[wi]
      for (let woi = 0; woi < (week.workouts ?? []).length; woi++) {
        const workout = week.workouts[woi]
        for (let ei = 0; ei < (workout.exercises ?? []).length; ei++) {
          map.set(`${bi}-${wi}-${woi}-${ei}`, workout.exercises[ei].name)
        }
      }
    }
  }
  originalExerciseNames.value = map

  // Apply default library flags after plan type is set
  applyDefaultLibraryFlags()
}, { immediate: true })

// Collect corrections and save as abbreviations (non-blocking, after plan save)
// Glossary learns rawName → interpretation regardless of "keep original" display choice.
// If coach typed an override, that's the interpretation. Otherwise AI's name is confirmed.
const saveCorrectionsAsAbbreviations = async () => {
  const coachId = authStore.user?.id
  if (!coachId) return

  const corrections: Array<{ original: string; corrected: string }> = []

  for (const entry of uniqueExerciseEntries.value) {
    // Only learn when raw and AI differ (abbreviation exists)
    if (entry.rawName === entry.aiName && !entry.coachOverride?.trim()) continue

    // Determine the "correct" full name for the glossary
    const interpretation = entry.coachOverride?.trim() || entry.aiName
    if (interpretation === entry.rawName) continue // nothing to learn

    corrections.push({ original: entry.rawName, corrected: interpretation })
  }

  if (corrections.length === 0) {
    console.log('[SmartImport] No abbreviation patterns to save')
    return
  }

  const detected = detectAbbreviationsFromCorrections(corrections)
  if (detected.length === 0) {
    console.log('[SmartImport] No abbreviation patterns detected from corrections')
    return
  }

  try {
    const saved = await batchSaveAbbreviations(coachId, detected)
    console.log(`[SmartImport] Auto-saved ${saved} abbreviations from corrections`)
  } catch (err) {
    // Non-critical — log but don't block save
    console.warn('[SmartImport] Failed to save abbreviation corrections:', err)
  }
}

// Abort controller for the current import
let importAbortController: AbortController | null = null

// Load import history on mount
const loadHistory = async () => {
  try {
    importHistory.value = await getImportHistory(10)
  } catch (err) {
    console.error('Failed to load history:', err)
  }
}

loadHistory()

// Warn user before navigating away during processing
onBeforeRouteLeave((_to, _from, next) => {
  if (isProcessing.value) {
    const leave = window.confirm(
      'An import is still processing. Leaving will cancel it. Continue?'
    )
    if (leave) {
      cancelActiveImport()
      importAbortController?.abort()
    }
    next(leave)
  } else {
    next()
  }
})

// Also cancel on component destroy (e.g. browser refresh)
onBeforeUnmount(() => {
  if (isProcessing.value) {
    cancelActiveImport()
    importAbortController?.abort()
    stopProgressSimulation()
  }
  stopReviewKeepalive()
})

const fileTypeLabel = computed(() => {
  if (!file.value) return ''
  const type = file.value.type
  if (type.includes('excel') || type.includes('spreadsheet')) return 'Excel'
  if (type.includes('csv')) return 'CSV'
  if (type.includes('pdf')) return 'PDF'
  if (type.includes('image')) return 'Image'
  return 'File'
})

// Normalize import blocks for preview (handles both new blocks[] and legacy weeks[] format)
const previewBlocks = computed<ImportBlock[]>(() => {
  if (!importResult.value) return []
  if (importResult.value.blocks && importResult.value.blocks.length > 0) {
    return importResult.value.blocks
  }
  if (importResult.value.weeks && importResult.value.weeks.length > 0) {
    return [{ name: importResult.value.programName, weeks: importResult.value.weeks }]
  }
  return []
})

const totalPreviewWeeks = computed(() =>
  previewBlocks.value.reduce((sum, b) => sum + (b.weeks?.length ?? 0), 0)
)

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    file.value = target.files[0]
    error.value = null
    importResult.value = null
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false
  const droppedFile = event.dataTransfer?.files[0]
  if (droppedFile) {
    file.value = droppedFile
    error.value = null
    importResult.value = null
  }
}

const isDragging = ref(false)

// Pre-import context dropdowns (all default to 'auto' = current behavior)
const preImportSport = ref<ImportSportCategory | 'auto'>('auto')
const preImportPlanType = ref<PlanType | 'auto'>('auto')
const preImportFocus = ref<ImportTrainingFocus | 'auto'>('auto')

/** Build the pre-import context from dropdown selections */
const buildPreImportContext = (): PreImportContext => {
  const context: PreImportContext = {}
  if (preImportSport.value !== 'auto') context.coachSport = preImportSport.value
  if (preImportPlanType.value !== 'auto') context.coachPlanType = preImportPlanType.value
  if (preImportFocus.value !== 'auto') context.coachTrainingFocus = preImportFocus.value
  return context
}

/**
 * Step 1: Classify the file to detect mesocycle structure.
 * If mesocycle detected → show classification preview.
 * If standalone sessions or classify fails → fall through to direct extract.
 */
const handleImport = async () => {
  if (!file.value || isProcessing.value) return

  isProcessing.value = true
  error.value = null
  importAbortController = new AbortController()
  startProgressSimulation()

  try {
    const context = buildPreImportContext()

    try {
      const classification = await classifyImport(file.value, importAbortController.signal, context)

      if (classification.detected_type === 'mesocycle_program' && classification.confidence >= 0.4) {
        // Show classification preview for coach confirmation
        completeProgress()
        classificationResult.value = classification
        importStep.value = 'classify_preview'
        isProcessing.value = false
        importAbortController = null
        showToast('Mesocycle structure detected — review below', 'info')
        return
      }
    } catch (classifyErr) {
      // Classify failed — fall through to direct extract (non-blocking)
      console.warn('[SmartImport] Classify step failed, falling through to extract:', classifyErr)
    }

    // Direct extract (no mesocycle or classify failed)
    await runDirectExtract(context)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Import failed'
    showToast(error.value, 'error')
    console.error('Import error:', err)
  } finally {
    isProcessing.value = false
    stopProgressSimulation()
    importAbortController = null
  }
}

/**
 * Step 2a: Coach confirmed mesocycle classification → run full extract.
 */
const handleClassifyConfirm = async () => {
  if (!file.value || isProcessing.value) return

  stopReviewKeepalive() // Stop keepalive before extract to prevent auth lock contention
  isProcessing.value = true
  error.value = null
  importAbortController = new AbortController()
  startProgressSimulation()

  try {
    const context = buildPreImportContext()
    await runDirectExtract(context)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Import failed'
    showToast(error.value, 'error')
    console.error('Import error:', err)
  } finally {
    isProcessing.value = false
    stopProgressSimulation()
    importAbortController = null
  }
}

/**
 * Step 2b: Coach chose "skip mesocycle" → run standard extract.
 */
const handleClassifyFallback = async () => {
  if (!file.value || isProcessing.value) return

  stopReviewKeepalive() // Stop keepalive before extract to prevent auth lock contention
  classificationResult.value = null
  isProcessing.value = true
  error.value = null
  importAbortController = new AbortController()
  startProgressSimulation()

  try {
    const context = buildPreImportContext()
    await runDirectExtract(context)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Import failed'
    showToast(error.value, 'error')
    console.error('Import error:', err)
  } finally {
    isProcessing.value = false
    stopProgressSimulation()
    importAbortController = null
  }
}

/** Resolve an ambiguity on the classification result */
const handleClassifyResolveAmbiguity = (index: number, value: string) => {
  if (!classificationResult.value?.ambiguities?.[index]) return
  classificationResult.value.ambiguities[index].resolved = true
  classificationResult.value.ambiguities[index].resolvedValue = value
}

const handleClassifyUnresolveAmbiguity = (index: number) => {
  if (!classificationResult.value?.ambiguities?.[index]) return
  classificationResult.value.ambiguities[index].resolved = false
  classificationResult.value.ambiguities[index].resolvedValue = undefined
}

/**
 * Run the direct extract (old importProgram flow).
 * Shared by both "no mesocycle" and "confirm mesocycle" paths.
 */
const runDirectExtract = async (context: PreImportContext) => {
  if (!file.value) return

  if (!importAbortController) importAbortController = new AbortController()

  const result = await importProgram(file.value, importAbortController.signal, context)

  completeProgress()
  await new Promise(resolve => setTimeout(resolve, 400))

  importResult.value = result.importResult
  historyRecord.value = result.historyRecord
  importStep.value = 'extract_preview'
  classificationResult.value = null
  if (result.expandedAbbreviations?.length) {
    expandedAbbreviations.value = result.expandedAbbreviations
  }

  const workouts = result.historyRecord?.workouts_imported ?? 0
  const exercises = result.historyRecord?.exercises_imported ?? 0
  showToast(`Imported ${workouts} workouts & ${exercises} exercises — review below`)

  await loadHistory()
}

const handleConfirmImport = async () => {
  if (!importResult.value) return

  isSaving.value = true
  error.value = null
  try {
    // Refresh session before save to prevent token expiry during long review
    await supabase.auth.refreshSession()

    // Override the plan type in the import result with the user's selection
    importResult.value.detectedPlanType = selectedPlanType.value

    // Non-blocking: save exercise name corrections as abbreviations
    // Learns from bulk review card (rawName → interpretation) + any inline edits
    saveCorrectionsAsAbbreviations().catch(() => {})

    if (selectedPlanType.value === 'single_session') {
      // Single session → save directly as a workout (no plan structure)
      const { id: workoutId } = await saveImportedWorkout(
        importResult.value,
        historyRecord.value?.id,
      )
      router.push(`/coach/workouts/${workoutId}/edit`)
    } else {
      // All other plan types → save as plan with blocks/weeks/sessions
      const planId = await saveImportedProgram(
        importResult.value,
        historyRecord.value?.id,
        libraryFlags.value.size > 0 ? libraryFlags.value : undefined,
      )
      router.push(`/coach/planner/${planId}`)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save program'
    console.error('Save error:', err)
  } finally {
    isSaving.value = false
  }
}

const handleResumeSave = async (record: ImportHistoryRecord) => {
  isSaving.value = true
  error.value = null
  try {
    const cached = await getCachedImportResult(record.id)
    if (!cached) {
      error.value = 'Cached result expired or not found. Please re-import the file.'
      return
    }
    importResult.value = cached
    historyRecord.value = record
    importStep.value = 'extract_preview'
    classificationResult.value = null
    // Show the preview — user can then hit "Confirm & Save"
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load cached result'
    console.error('Resume error:', err)
  } finally {
    isSaving.value = false
  }
}

const handleCancel = () => {
  // If processing, abort the in-flight request
  if (isProcessing.value) {
    cancelActiveImport()
    importAbortController?.abort()
    isProcessing.value = false
    stopProgressSimulation()
  }
  stopReviewKeepalive()
  file.value = null
  importResult.value = null
  historyRecord.value = null
  classificationResult.value = null
  importStep.value = 'upload'
  error.value = null
  processingStage.value = 'uploading'
  selectedPlanType.value = 'block_plan'
  planTypeOverridden.value = false
  libraryFlags.value = new Set()
  bulkOverrides.value = new Map()
  showAllExerciseNames.value = false
  preImportSport.value = 'auto'
  preImportPlanType.value = 'auto'
  preImportFocus.value = 'auto'
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const statusColor = (status: string) => {
  switch (status) {
    case 'success': return 'text-emerald-600'
    case 'failed': return 'text-red-600'
    case 'partial': return 'text-amber-600'
    default: return 'text-gray-600'
  }
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'success': return 'M5 13l4 4L19 7'
    case 'failed': return 'M6 18L18 6M6 6l12 12'
    default: return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 sticky top-14 z-10">
      <div class="max-w-5xl mx-auto px-4 py-4">
        <div class="flex items-center gap-3">
          <button @click="router.back()" class="text-gray-500 hover:text-gray-700">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-gray-900">Smart Import</h1>
            <p class="text-sm text-gray-500">Upload training programs for AI extraction</p>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <!-- Import Card -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <!-- Classification Preview (step 2: coach reviews mesocycle detection) -->
        <div v-if="classificationResult && importStep === 'classify_preview'" class="p-6">
          <ImportClassificationPreview
            :classification="classificationResult"
            @confirm="handleClassifyConfirm"
            @fallback="handleClassifyFallback"
            @cancel="handleCancel"
            @resolve-ambiguity="handleClassifyResolveAmbiguity"
            @unresolve-ambiguity="handleClassifyUnresolveAmbiguity"
          />
        </div>

        <!-- File Upload (pre-import state) -->
        <div v-else-if="!importResult" class="p-6 space-y-5">
          <!-- Drop Zone -->
          <div
            v-if="!file"
            class="border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer"
            :class="isDragging ? 'border-summit-500 bg-summit-50' : 'border-gray-300 hover:border-summit-400 hover:bg-gray-50'"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop="handleDrop"
            @click="($refs.fileInput as HTMLInputElement)?.click()"
          >
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-summit-100 flex items-center justify-center">
              <svg class="w-8 h-8 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p class="text-lg font-medium text-gray-700 mb-1">Drop your file here or click to browse</p>
            <p class="text-sm text-gray-500 mb-3">
              Well-structured Excel, CSV, PDF &amp; images (max {{ AI_CONFIG.import.maxFileSize / 1024 / 1024 }}MB)
            </p>

            <!-- How Smart Import Works (collapsible) -->
            <div class="text-left max-w-md mx-auto">
              <button
                @click.stop="showFormatTips = !showFormatTips"
                class="flex items-center gap-1.5 text-xs font-medium text-summit-600 hover:text-summit-700 mx-auto transition-colors"
              >
                <svg class="w-3.5 h-3.5 transition-transform" :class="showFormatTips ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                How Smart Import works
              </button>
              <div v-if="showFormatTips" class="mt-3 text-left text-xs text-gray-600 space-y-3 bg-gray-50 rounded-lg p-4" @click.stop>
                <!-- What imports well -->
                <div>
                  <p class="font-semibold text-gray-700 mb-1.5">What imports well</p>
                  <ul class="list-disc list-inside space-y-1 text-gray-500">
                    <li>Well-labeled spreadsheets with clear <strong>week</strong>, <strong>day</strong>, and <strong>session</strong> headers</li>
                    <li>Clean PDFs or images of training plans with readable text</li>
                    <li>Block plans, season plans, and single session formats</li>
                  </ul>
                </div>

                <!-- Abbreviation & Glossary -->
                <div>
                  <p class="font-semibold text-gray-700 mb-1.5">Abbreviations &amp; Glossary</p>
                  <ul class="list-disc list-inside space-y-1 text-gray-500">
                    <li>Write programs in shorthand &mdash; Smart Import auto-detects abbreviations</li>
                    <li>Review AI interpretations after import and correct any mistakes</li>
                    <li>Check <strong>"Keep"</strong> to preserve your shorthand as a coach alias &mdash; athletes always see the full exercise name</li>
                    <li>Your corrections are saved to a <strong>personal glossary</strong> that improves every future import</li>
                  </ul>
                </div>

                <!-- Actions -->
                <div class="pt-1 flex items-center gap-3 flex-wrap">
                  <a
                    href="/templates/import-template.xlsx"
                    download="CoachHub-Import-Template.xlsx"
                    class="inline-flex items-center gap-1.5 text-xs font-medium text-summit-600 hover:text-summit-700 bg-summit-50 px-3 py-1.5 rounded-lg hover:bg-summit-100 transition-colors"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download template
                  </a>
                  <router-link to="/coach/philosophy" class="text-xs text-gray-500 hover:text-summit-600 font-medium transition-colors">
                    Manage glossary &rarr;
                  </router-link>
                </div>
              </div>
            </div>
            <input
              ref="fileInput"
              type="file"
              :accept="AI_CONFIG.import.supportedExtensions.join(',')"
              @change="handleFileChange"
              class="hidden"
            />
          </div>

          <!-- File Preview -->
          <div v-if="file" class="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-summit-100 rounded-lg flex items-center justify-center">
                  <svg class="w-6 h-6 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p class="font-medium text-gray-900">{{ file.name }}</p>
                  <p class="text-sm text-gray-500">
                    {{ fileTypeLabel }} &middot; {{ formatFileSize(file.size) }}
                  </p>
                </div>
              </div>
              <button
                @click="file = null"
                class="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Pre-Import Context Dropdowns -->
          <div v-if="file && !isProcessing && !importResult" class="space-y-3">
            <p class="text-xs text-gray-500">Optional: tell us about this file to improve AI accuracy</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Sport</label>
                <select
                  v-model="preImportSport"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-summit-400 focus:border-summit-400"
                >
                  <option v-for="opt in IMPORT_SPORT_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Plan Type</label>
                <select
                  v-model="preImportPlanType"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-summit-400 focus:border-summit-400"
                >
                  <option v-for="opt in IMPORT_PLAN_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-700 mb-1">Training Focus</label>
                <select
                  v-model="preImportFocus"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-summit-400 focus:border-summit-400"
                >
                  <option v-for="opt in IMPORT_FOCUS_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Processing Stages -->
          <div v-if="isProcessing" class="space-y-4">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700">{{ progressMessage }}</span>
                <span class="text-xs font-mono text-gray-400">{{ simulatedProgress }}%</span>
              </div>
              <div class="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300 ease-out"
                  :class="progressComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-summit-500 to-summit-600 animate-pulse'"
                  :style="{ width: simulatedProgress + '%' }"
                ></div>
              </div>
            </div>

            <div class="flex items-center gap-2 text-xs text-gray-500">
              <svg class="animate-spin h-3.5 w-3.5 text-summit-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>PDFs typically take 60-90 seconds &mdash; spreadsheets are faster</span>
            </div>
          </div>

          <!-- Error -->
          <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p class="font-medium text-red-800">Import Failed</p>
                <p class="text-sm text-red-700 mt-1">{{ error }}</p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              @click="handleImport"
              :disabled="!file || isProcessing"
              class="flex-1 bg-summit-600 text-white px-6 py-3 rounded-xl font-medium
                hover:bg-summit-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isProcessing ? 'Processing...' : 'Import Program' }}
            </button>
            <button
              v-if="file"
              @click="handleCancel"
              class="px-6 py-3 border border-gray-300 rounded-xl font-medium
                hover:bg-gray-50 transition-colors"
              :class="isProcessing ? 'border-red-300 text-red-600 hover:bg-red-50' : ''"
            >
              {{ isProcessing ? 'Cancel Import' : 'Cancel' }}
            </button>
          </div>
        </div>

        <!-- Import Preview -->
        <div v-else class="p-6">
        <div class="md:grid md:grid-cols-[1fr_340px] md:gap-6">
          <!-- Left: Preview Content -->
          <div class="space-y-5">
          <!-- Success Header -->
          <div class="flex items-center gap-3 pb-5 border-b border-gray-200">
            <div class="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
              <svg class="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-bold text-gray-900">Import Successful</h2>
              <p class="text-sm text-gray-600">Review the extracted program before saving</p>
            </div>
          </div>

          <!-- Program Summary -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Program Name</p>
              <p class="font-semibold text-gray-900 text-sm">{{ importResult.programName }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Duration</p>
              <p class="font-semibold text-gray-900 text-sm">{{ importResult.durationWeeks }} weeks</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Periodization</p>
              <p class="font-semibold text-gray-900 text-sm capitalize">{{ importResult.periodization }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Sport</p>
              <p class="font-semibold text-gray-900 text-sm">{{ importResult.sport || 'Not detected' }}</p>
            </div>
          </div>

          <!-- Plan Type Selector -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 text-sm">Plan Type</h3>
              <div v-if="importResult.detectedPlanType && importResult.planTypeConfidence !== undefined">
                <span
                  v-if="importResult.planTypeConfidence >= 0.6"
                  class="text-xs font-medium text-summit-700 bg-summit-100 px-2 py-0.5 rounded-full"
                >
                  AI detected {{ Math.round(importResult.planTypeConfidence * 100) }}%
                </span>
                <span
                  v-else
                  class="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"
                >
                  Couldn't determine type, please select
                </span>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                v-for="ptype in (['single_session', 'evolving_session', 'block_plan', 'season_plan'] as PlanType[])"
                :key="ptype"
                @click="selectPlanType(ptype)"
                class="text-left p-3 rounded-lg border-2 transition-all"
                :class="selectedPlanType === ptype
                  ? 'border-summit-500 bg-summit-50 ring-1 ring-summit-500/30'
                  : 'border-gray-200 hover:border-gray-300 bg-white'"
              >
                <p class="text-sm font-semibold" :class="selectedPlanType === ptype ? 'text-summit-700' : 'text-gray-900'">
                  {{ PLAN_TYPE_LABELS[ptype] }}
                </p>
                <p class="text-xs mt-0.5" :class="selectedPlanType === ptype ? 'text-summit-600' : 'text-gray-500'">
                  {{ PLAN_TYPE_DESCRIPTIONS[ptype] }}
                </p>
              </button>
            </div>
          </div>

          <!-- Import Stats -->
          <div v-if="historyRecord" class="bg-summit-50 rounded-xl p-4">
            <div class="grid grid-cols-3 gap-4 text-center">
              <div>
                <p class="text-xl font-bold text-summit-700">{{ historyRecord.workouts_imported }}</p>
                <p class="text-xs text-gray-600">Workouts</p>
              </div>
              <div>
                <p class="text-xl font-bold text-summit-700">{{ historyRecord.exercises_imported }}</p>
                <p class="text-xs text-gray-600">Exercises</p>
              </div>
              <div>
                <p class="text-xl font-bold text-summit-700">{{ (historyRecord.processing_time_ms / 1000).toFixed(1) }}s</p>
                <p class="text-xs text-gray-600">Processing</p>
              </div>
            </div>
          </div>

          <!-- Bulk Exercise Name Review -->
          <div v-if="uniqueExerciseEntries.length > 0" class="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <!-- Header -->
            <div class="px-4 py-3 border-b border-gray-200">
              <div class="flex items-center gap-2 flex-wrap">
                <svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <h3 class="font-semibold text-gray-900 text-sm">Review Exercise Names</h3>
                <span class="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {{ uniqueExerciseEntries.length }} unique
                </span>
                <span v-if="bulkCorrectionCount > 0" class="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  {{ bulkCorrectionCount }} reviewed
                </span>
              </div>
              <p class="text-[11px] text-gray-500 mt-1.5 leading-tight">
                Coach Name = your shorthand. AI Interpretation = the full exercise name. Type a correction if AI got it wrong. Check "Keep" to preserve your shorthand as an alias — athletes always see the full name.
              </p>
            </div>

            <!-- Column headers (visible on sm+) -->
            <div class="hidden sm:grid sm:grid-cols-[minmax(80px,1fr)_minmax(100px,1.5fr)_minmax(100px,1.5fr)_36px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <span>Coach Name</span>
              <span>AI Interpretation</span>
              <span>Your Correction</span>
              <span class="text-center" title="Keep shorthand as alias (athletes see full name)">Keep</span>
            </div>

            <!-- Flagged exercises (likely abbreviations) — always visible -->
            <div v-if="flaggedEntries.length > 0" class="border-b border-gray-100">
              <div class="px-4 py-2 bg-amber-50/50">
                <p class="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  Likely abbreviations ({{ flaggedEntries.length }})
                </p>
              </div>
              <div class="divide-y divide-gray-50">
                <div
                  v-for="entry in flaggedEntries"
                  :key="'flag-' + entry.rawName"
                  class="px-4 py-2 sm:grid sm:grid-cols-[minmax(80px,1fr)_minmax(100px,1.5fr)_minmax(100px,1.5fr)_36px] sm:gap-2 sm:items-center space-y-1.5 sm:space-y-0 border-l-3 border-amber-400"
                >
                  <!-- As Written -->
                  <div class="flex items-center gap-1.5">
                    <code class="text-xs font-mono text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded truncate">{{ entry.rawName }}</code>
                    <span class="text-[10px] text-gray-400 shrink-0">&times;{{ entry.count }}</span>
                  </div>
                  <!-- AI Interpretation -->
                  <div class="text-xs text-gray-600 truncate" :class="entry.rawName !== entry.aiName ? 'text-summit-700 font-medium' : 'text-gray-400 italic'">
                    {{ entry.rawName !== entry.aiName ? entry.aiName : '(same)' }}
                  </div>
                  <!-- Coach Override -->
                  <input
                    :value="entry.coachOverride"
                    @input="setCoachOverride(entry.rawName, ($event.target as HTMLInputElement).value)"
                    :placeholder="entry.aiName"
                    class="w-full text-xs px-2 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-summit-400 transition-colors"
                    :class="entry.coachOverride?.trim()
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'border-gray-200 bg-white text-gray-500'"
                  />
                  <!-- Keep Original toggle -->
                  <div class="flex items-center justify-center">
                    <button
                      @click="toggleUseRawName(entry.rawName)"
                      class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0"
                      :class="entry.useRawName
                        ? 'bg-summit-600 border-summit-600 text-white'
                        : 'border-gray-300 hover:border-summit-400'"
                      :title="entry.useRawName ? 'Alias saved — coach sees shorthand, athlete sees full name' : 'Keep shorthand as alias'"
                    >
                      <svg v-if="entry.useRawName" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- All other exercises (collapsed by default) -->
            <div class="px-4 py-2.5">
              <button
                @click="showAllExerciseNames = !showAllExerciseNames"
                class="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors w-full"
              >
                <svg
                  class="w-4 h-4 transition-transform shrink-0"
                  :class="showAllExerciseNames ? 'rotate-180' : ''"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <span>All exercise names ({{ unflaggedEntries.length }})</span>
              </button>
              <div v-if="showAllExerciseNames" class="mt-2 divide-y divide-gray-50">
                <div
                  v-for="entry in unflaggedEntries"
                  :key="'all-' + entry.rawName"
                  class="py-2 sm:grid sm:grid-cols-[minmax(80px,1fr)_minmax(100px,1.5fr)_minmax(100px,1.5fr)_36px] sm:gap-2 sm:items-center space-y-1.5 sm:space-y-0"
                >
                  <!-- As Written -->
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs text-gray-700 truncate">{{ entry.rawName }}</span>
                    <span class="text-[10px] text-gray-400 shrink-0">&times;{{ entry.count }}</span>
                  </div>
                  <!-- AI Interpretation -->
                  <div class="text-xs truncate" :class="entry.rawName !== entry.aiName ? 'text-summit-700 font-medium' : 'text-gray-400 italic'">
                    {{ entry.rawName !== entry.aiName ? entry.aiName : '(same)' }}
                  </div>
                  <!-- Coach Override -->
                  <input
                    :value="entry.coachOverride"
                    @input="setCoachOverride(entry.rawName, ($event.target as HTMLInputElement).value)"
                    :placeholder="entry.aiName"
                    class="w-full text-xs px-2 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-summit-400 transition-colors"
                    :class="entry.coachOverride?.trim()
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'border-gray-200 bg-white text-gray-500'"
                  />
                  <!-- Keep Original toggle -->
                  <div class="flex items-center justify-center">
                    <button
                      @click="toggleUseRawName(entry.rawName)"
                      class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0"
                      :class="entry.useRawName
                        ? 'bg-summit-600 border-summit-600 text-white'
                        : 'border-gray-300 hover:border-summit-400'"
                      :title="entry.useRawName ? 'Alias saved — coach sees shorthand, athlete sees full name' : 'Keep shorthand as alias'"
                    >
                      <svg v-if="entry.useRawName" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Expanded Abbreviations Banner -->
          <div v-if="expandedAbbreviations.length > 0" class="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p class="font-medium text-blue-800 text-sm">Auto-expanded {{ expandedAbbreviations.length }} abbreviation{{ expandedAbbreviations.length > 1 ? 's' : '' }}</p>
                <p class="text-xs text-blue-700 mt-1">
                  <span v-for="(abbr, idx) in expandedAbbreviations" :key="abbr">
                    <code class="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-blue-800">{{ abbr }}</code>
                    <span v-if="idx < expandedAbbreviations.length - 1">, </span>
                  </span>
                </p>
              </div>
            </div>
          </div>

          <!-- Edit Count Banner -->
          <div v-if="editCount > 0" class="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <p class="text-sm text-amber-800">
                <span class="font-semibold">{{ editCount }} exercise name{{ editCount > 1 ? 's' : '' }} corrected</span>
                — will be saved to your glossary for future imports
              </p>
            </div>
          </div>

          <!-- Adaptive Preview -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 text-sm">
                <template v-if="selectedPlanType === 'single_session'">Session Preview</template>
                <template v-else-if="selectedPlanType === 'evolving_session'">Week-by-Week Progression</template>
                <template v-else>
                  Preview — {{ previewBlocks.length }} {{ previewBlocks.length === 1 ? 'block' : 'blocks' }}, {{ totalPreviewWeeks }} weeks
                </template>
              </h3>
              <p class="text-xs text-gray-500">Click workouts to review & edit exercise names</p>
            </div>

            <!-- ===== SINGLE SESSION PREVIEW ===== -->
            <template v-if="selectedPlanType === 'single_session'">
              <div v-for="(block, bi) in previewBlocks" :key="bi">
                <div v-for="(week, wi) in (block.weeks ?? []).slice(0, 1)" :key="`${bi}-${wi}`">
                  <div v-for="(workout, woi) in (week.workouts ?? [])" :key="`${bi}-${wi}-${woi}`"
                    class="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div class="flex items-center justify-between">
                      <p class="text-sm font-semibold text-gray-900">{{ workout.name }}</p>
                      <!-- Single sessions always go to library — show badge instead of toggle -->
                      <span class="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg bg-summit-100 text-summit-700">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                        </svg>
                        Workout Library
                      </span>
                    </div>
                    <div class="space-y-1">
                      <div
                        v-for="(exercise, ei) in (workout.exercises ?? [])"
                        :key="`${bi}-${wi}-${woi}-${ei}`"
                        class="flex items-center gap-2"
                      >
                        <span class="text-[10px] text-gray-400 w-4 text-right shrink-0">{{ ei + 1 }}</span>
                        <input
                          v-model="exercise.name"
                          class="flex-1 text-xs px-2 py-1 border rounded-md focus:outline-none focus:ring-1 focus:ring-summit-400 transition-colors"
                          :class="originalExerciseNames.get(`${bi}-${wi}-${woi}-${ei}`) !== exercise.name
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'border-gray-200 bg-white text-gray-700'"
                        />
                        <span v-if="exercise.sets || exercise.reps" class="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                          {{ exercise.sets ? exercise.sets + '×' : '' }}{{ exercise.reps || '' }}
                        </span>
                        <span v-if="exercise.weight" class="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                          {{ exercise.weight }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- ===== EVOLVING SESSION PREVIEW (week-comparison table) ===== -->
            <template v-else-if="selectedPlanType === 'evolving_session'">
              <div class="border border-gray-200 rounded-lg overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead class="bg-gray-50">
                      <tr>
                        <th class="text-left px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-gray-50 min-w-[140px]">Exercise</th>
                        <th
                          v-for="(week, wi) in (previewBlocks[0]?.weeks ?? [])"
                          :key="wi"
                          class="text-center px-2 py-2 font-semibold text-gray-700 min-w-[64px]"
                        >
                          Wk {{ week.weekNumber }}
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                      <!-- Build rows from first workout of each week -->
                      <tr
                        v-for="(exercise, ei) in (previewBlocks[0]?.weeks?.[0]?.workouts?.[0]?.exercises ?? [])"
                        :key="ei"
                        class="hover:bg-gray-50"
                      >
                        <td class="px-3 py-1.5 sticky left-0 bg-white">
                          <input
                            v-model="exercise.name"
                            class="w-full text-xs px-1.5 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-summit-400"
                            :class="originalExerciseNames.get(`0-0-0-${ei}`) !== exercise.name
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'border-gray-200 text-gray-700'"
                          />
                        </td>
                        <td
                          v-for="(week, wi) in (previewBlocks[0]?.weeks ?? [])"
                          :key="wi"
                          class="text-center px-2 py-1.5 text-gray-600"
                        >
                          <template v-if="week.workouts?.[0]?.exercises?.[ei]">
                            <span class="whitespace-nowrap">
                              {{ week.workouts[0].exercises[ei].sets ? week.workouts[0].exercises[ei].sets + '×' : '' }}{{ week.workouts[0].exercises[ei].reps || '--' }}
                            </span>
                          </template>
                          <template v-else>
                            <span class="text-gray-300">--</span>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <!-- Library toggle for the evolving session -->
              <div class="flex justify-end">
                <button
                  @click="toggleLibraryFlag('0-0-0')"
                  class="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                  :class="libraryFlags.has('0-0-0')
                    ? 'bg-summit-100 text-summit-700 hover:bg-summit-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
                >
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                  </svg>
                  Add to Library
                </button>
              </div>
            </template>

            <!-- ===== BLOCK / SEASON PLAN PREVIEW (existing style) ===== -->
            <template v-else>
              <div v-for="(block, bi) in previewBlocks" :key="bi" class="space-y-2">
                <!-- Block header (only show if multiple blocks) -->
                <div v-if="previewBlocks.length > 1" class="flex items-center gap-2 mt-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-summit-600"></div>
                  <p class="text-sm font-semibold text-summit-700">{{ block.name }}</p>
                  <span class="text-xs text-gray-400">{{ (block.weeks ?? []).length }} weeks</span>
                </div>
                <!-- Show first 2 weeks of each block -->
                <div v-for="(week, wi) in (block.weeks ?? []).slice(0, 2)" :key="`${bi}-${week.weekNumber}`" class="border border-gray-200 rounded-lg p-3">
                  <p class="font-medium text-gray-900 text-sm mb-2">
                    Week {{ week.weekNumber }}{{ week.name ? ': ' + week.name : '' }}
                  </p>
                  <div class="space-y-1.5">
                    <div v-for="(workout, woi) in (week.workouts ?? [])" :key="`${bi}-${wi}-${woi}`">
                      <!-- Workout row: clickable to expand -->
                      <div
                        @click="toggleWorkout(`${bi}-${wi}-${woi}`)"
                        class="pl-3 border-l-2 border-summit-300 cursor-pointer hover:bg-gray-50 rounded-r-md py-1 pr-2 flex items-center justify-between group"
                      >
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-gray-700">{{ workout.name }}</p>
                          <p class="text-xs text-gray-500">{{ (workout.exercises ?? []).length }} exercises</p>
                        </div>
                        <!-- Library toggle -->
                        <button
                          @click.stop="toggleLibraryFlag(`${bi}-${wi}-${woi}`)"
                          class="mr-2 p-1 rounded transition-colors shrink-0"
                          :class="libraryFlags.has(`${bi}-${wi}-${woi}`)
                            ? 'text-summit-600 hover:text-summit-700'
                            : 'text-gray-300 hover:text-gray-400'"
                          :title="libraryFlags.has(`${bi}-${wi}-${woi}`) ? 'Remove from Library' : 'Add to Library'"
                        >
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                          </svg>
                        </button>
                        <svg
                          class="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-transform shrink-0"
                          :class="expandedWorkouts.has(`${bi}-${wi}-${woi}`) ? 'rotate-180' : ''"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <!-- Expanded exercise list with inline editing -->
                      <div
                        v-if="expandedWorkouts.has(`${bi}-${wi}-${woi}`)"
                        class="ml-5 mt-1 mb-2 space-y-1"
                      >
                        <div
                          v-for="(exercise, ei) in (workout.exercises ?? [])"
                          :key="`${bi}-${wi}-${woi}-${ei}`"
                          class="flex items-center gap-2"
                        >
                          <span class="text-[10px] text-gray-400 w-4 text-right shrink-0">{{ ei + 1 }}</span>
                          <input
                            v-model="exercise.name"
                            class="flex-1 text-xs px-2 py-1 border rounded-md focus:outline-none focus:ring-1 focus:ring-summit-400 transition-colors"
                            :class="originalExerciseNames.get(`${bi}-${wi}-${woi}-${ei}`) !== exercise.name
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'border-gray-200 bg-white text-gray-700'"
                          />
                          <span v-if="exercise.sets || exercise.reps" class="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                            {{ exercise.sets ? exercise.sets + '×' : '' }}{{ exercise.reps || '' }}
                          </span>
                          <span v-if="exercise.distance_meters" class="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                            {{ exercise.distance_meters }}m
                          </span>
                          <span v-if="exercise.duration_seconds" class="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                            {{ exercise.duration_seconds }}s
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <p v-if="(block.weeks ?? []).length > 2" class="text-xs text-gray-500 text-center">
                  + {{ (block.weeks ?? []).length - 2 }} more weeks in this block
                </p>
              </div>
            </template>
          </div>
          </div><!-- /Left column -->

          <!-- Right: Sidebar (sticky at md:) -->
          <div class="space-y-4 md:sticky md:top-4 md:self-start">
          <!-- Library Summary (not shown for single_session — always goes to library) -->
          <div v-if="libraryFlagCount > 0 && selectedPlanType !== 'single_session'" class="bg-summit-50 border border-summit-200 rounded-xl p-3">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-summit-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
              </svg>
              <p class="text-xs text-summit-700">
                <span class="font-semibold">{{ libraryFlagCount }} session{{ libraryFlagCount > 1 ? 's' : '' }}</span>
                will be added to your Workout Library on save
              </p>
            </div>
          </div>

          <!-- Ambiguity Resolution (v31) -->
          <div v-if="ambiguities.length > 0" class="bg-white border border-amber-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-amber-100 bg-amber-50/50">
              <div class="flex items-center gap-2 flex-wrap">
                <svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 class="font-semibold text-gray-900 text-sm">Review Ambiguities</h3>
                <span class="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  {{ unresolvedAmbiguities.length }} remaining
                </span>
                <span v-if="ambiguities.length - unresolvedAmbiguities.length > 0" class="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {{ ambiguities.length - unresolvedAmbiguities.length }} resolved
                </span>
              </div>
              <p class="text-[11px] text-gray-500 mt-1.5 leading-tight">
                The AI flagged some values it wasn't sure about. Pick the correct interpretation or type your own.
                <span v-if="hasUnresolvedHighPriority" class="text-amber-700 font-medium"> High-priority items should be resolved before saving.</span>
              </p>
            </div>

            <div class="divide-y divide-gray-100">
              <div
                v-for="(amb, idx) in ambiguities"
                :key="idx"
                class="px-4 py-3 transition-colors"
                :class="amb.resolved ? 'bg-emerald-50/30' : amb.priority >= 7 ? 'bg-amber-50/50 border-l-3 border-amber-400' : ''"
              >
                <div class="flex items-start gap-2">
                  <!-- Priority badge -->
                  <span
                    class="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                    :class="amb.priority >= 7 ? 'bg-red-100 text-red-700' : amb.priority >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'"
                  >
                    P{{ amb.priority }}
                  </span>

                  <div class="flex-1 min-w-0">
                    <!-- Question -->
                    <p class="text-sm text-gray-800 font-medium">{{ amb.question }}</p>
                    <!-- Location & original value -->
                    <p class="text-[11px] text-gray-500 mt-0.5">
                      <span class="font-mono bg-gray-100 px-1 rounded">{{ amb.originalValue }}</span>
                      <span v-if="amb.location" class="ml-1">in {{ amb.location }}</span>
                    </p>

                    <!-- Resolved indicator -->
                    <div v-if="amb.resolved" class="mt-2 flex items-center gap-2">
                      <span class="text-xs text-emerald-700 font-medium bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {{ amb.resolvedValue }}
                      </span>
                      <button
                        @click="unresolveAmbiguity(idx)"
                        class="text-[10px] text-gray-400 hover:text-gray-600 underline"
                      >undo</button>
                    </div>

                    <!-- Options (when unresolved) -->
                    <div v-else class="mt-2 flex flex-wrap gap-1.5">
                      <button
                        v-for="opt in amb.options"
                        :key="opt"
                        @click="resolveAmbiguity(idx, opt)"
                        class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-summit-50 hover:border-summit-300 transition-colors"
                      >{{ opt }}</button>
                      <input
                        @keydown.enter="resolveAmbiguity(idx, ($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = ''"
                        placeholder="Custom..."
                        class="text-xs px-2 py-1 border border-gray-200 rounded-lg w-24 focus:outline-none focus:ring-1 focus:ring-summit-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Save Error -->
          <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p class="font-medium text-red-800">Save Failed</p>
                <p class="text-sm text-red-700 mt-1">{{ error }}</p>
              </div>
            </div>
          </div>

          <!-- Unresolved ambiguity warning -->
          <div v-if="hasUnresolvedHighPriority" class="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p class="text-xs text-amber-800">
              <span class="font-semibold">{{ unresolvedAmbiguities.filter(a => a.priority >= 7).length }} high-priority ambiguities</span> remain unresolved. You can still save, but the AI's best guess will be used for unresolved items.
            </p>
          </div>

          <!-- Actions -->
          <div class="flex md:flex-col gap-3 pt-4 border-t border-gray-200 md:border-t-0 md:pt-0">
            <button
              @click="handleConfirmImport"
              :disabled="isSaving"
              class="flex-1 md:flex-none text-white px-6 py-3 rounded-xl font-medium text-sm
                disabled:opacity-50 transition-colors"
              :class="hasUnresolvedHighPriority ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'"
            >
              {{ isSaving ? 'Saving...' :
                 selectedPlanType === 'single_session'
                   ? (editCount + bulkCorrectionCount) > 0
                     ? `Save to Workout Library (${editCount + bulkCorrectionCount} corrections)`
                     : 'Save to Workout Library'
                   : (editCount + bulkCorrectionCount) > 0
                     ? `Save to Planner (${editCount + bulkCorrectionCount} corrections)`
                     : libraryFlagCount > 0
                       ? `Save to Planner (+${libraryFlagCount} to Library)`
                       : 'Save to Planner' }}
            </button>
            <button
              @click="handleCancel"
              :disabled="isSaving"
              class="px-6 py-3 border border-gray-300 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          </div><!-- /Right sidebar -->
        </div><!-- /md:grid -->
        </div><!-- /Import Preview (v-else p-6) -->
      </div>

      <!-- Import History -->
      <div v-if="importHistory.length > 0" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="font-bold text-gray-900">Recent Imports</h2>
        </div>
        <div class="divide-y divide-gray-100">
          <div
            v-for="record in importHistory"
            :key="record.id"
            class="flex items-center justify-between px-6 py-3 hover:bg-gray-50"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                :class="record.status === 'success' ? 'bg-emerald-100' : record.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'">
                <svg class="w-4 h-4" :class="statusColor(record.status)" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" :d="statusIcon(record.status)" />
                </svg>
              </div>
              <div class="min-w-0">
                <p class="font-medium text-gray-900 text-sm truncate">{{ record.file_name }}</p>
                <p class="text-xs text-gray-500">
                  {{ formatDate(record.created_at) }}
                  <span v-if="record.status === 'success'">
                    &middot; {{ record.workouts_imported }} workouts, {{ record.exercises_imported }} exercises
                  </span>
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0 ml-3">
              <button
                v-if="record.has_cached_result && record.status === 'success'"
                @click.stop="handleResumeSave(record)"
                class="px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
              >
                Save
              </button>
              <div class="text-right">
                <p class="text-xs font-medium capitalize" :class="statusColor(record.status)">
                  {{ record.status }}
                </p>
                <p v-if="record.processing_time_ms" class="text-xs text-gray-400">{{ (record.processing_time_ms / 1000).toFixed(1) }}s</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Toast :message="toastMessage" :type="toastType" :visible="toastVisible" @close="toastVisible = false" />
  </div>
</template>
