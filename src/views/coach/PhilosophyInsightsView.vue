<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getCoachPhilosophy, triggerPhilosophyAnalysis, getCoachProgramCount } from '@/services/philosophyDetection'
import {
  detectCoachMethodology,
  getCoachMethodologyMatches,
  getCoachExtractedMetrics,
} from '@/services/methodologyDetection'
import {
  getCoachAbbreviationsFull,
  upsertAbbreviation,
  deleteAbbreviation,
} from '@/services/coachAbbreviations'
import type { CoachPhilosophy } from '@/types/import'
import type { CoachAbbreviationRow } from '@/types/database'
import type { MatchingOutput, CoachMethodologyMatch, ExtractedMetrics } from '@/types/methodology'
import MethodologyConfirmationCard from '@/components/planner/MethodologyConfirmationCard.vue'
import Toast from '@/components/ui/Toast.vue'

const router = useRouter()
const authStore = useAuthStore()

// Legacy philosophy data
const philosophy = ref<CoachPhilosophy | null>(null)
const programCount = ref(0)

// New methodology detection
const methodologyMatches = ref<CoachMethodologyMatch[]>([])
const extractedMetrics = ref<ExtractedMetrics | null>(null)
const detectionOutput = ref<MatchingOutput | null>(null)

// UI state
const isLoading = ref(true)
const isAnalyzing = ref(false)
const isDetecting = ref(false)
const analysisError = ref<string | null>(null)

// Toast
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('success')

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

// Computed: top match from stored matches (already confirmed or detected)
const topMatch = computed(() => {
  if (detectionOutput.value?.top_match) return detectionOutput.value.top_match
  if (methodologyMatches.value.length > 0) {
    const m = methodologyMatches.value[0]
    return {
      methodology_id: m.methodology_id,
      methodology_name: m.methodology?.name || m.methodology_id,
      confidence: m.confidence,
      marker_scores: m.marker_scores || {},
      penalties: [],
      total_score: m.confidence,
      max_possible: 100,
      evidence: [],
    }
  }
  return null
})

const secondaryMatches = computed(() => {
  if (detectionOutput.value) {
    return detectionOutput.value.matches
      .filter(m => m.methodology_id !== detectionOutput.value!.top_match?.methodology_id && m.confidence > 25)
      .slice(0, 3)
  }
  return methodologyMatches.value
    .slice(1)
    .filter(m => m.confidence > 25)
    .slice(0, 3)
    .map(m => ({
      methodology_id: m.methodology_id,
      methodology_name: m.methodology?.name || m.methodology_id,
      confidence: m.confidence,
      marker_scores: m.marker_scores || {},
      penalties: [],
      total_score: m.confidence,
      max_possible: 100,
      evidence: [],
    }))
})

const isConfirmed = computed(() => {
  return methodologyMatches.value.some(m => m.status === 'confirmed')
})

const suggestedQuestion = computed(() => {
  return detectionOutput.value?.suggested_question || null
})

const metricsForCard = computed(() => {
  return detectionOutput.value?.extracted_metrics || extractedMetrics.value || null
})

const progressToNextAnalysis = computed(() => {
  if (!philosophy.value) return 0
  const analyzed = philosophy.value.programs_analyzed
  const threshold = philosophy.value.next_analysis_threshold
  return Math.min(100, ((programCount.value - analyzed) / threshold) * 100)
})

const programsUntilNextAnalysis = computed(() => {
  if (!philosophy.value) return 10 - programCount.value
  const analyzed = philosophy.value.programs_analyzed
  const threshold = philosophy.value.next_analysis_threshold
  const remaining = threshold - (programCount.value - analyzed)
  return Math.max(0, remaining)
})

// Minimum programs for methodology detection (lower threshold than full AI analysis)
const MIN_PROGRAMS_FOR_DETECTION = 3

const hasEnoughForDetection = computed(() => programCount.value >= MIN_PROGRAMS_FOR_DETECTION)

onMounted(async () => {
  try {
    const coachId = authStore.user?.id
    if (!coachId) return

    // Load all data in parallel
    const [phil, count, matches, metrics] = await Promise.all([
      getCoachPhilosophy(coachId).catch(() => null),
      getCoachProgramCount(coachId),
      getCoachMethodologyMatches(coachId).catch(() => []),
      getCoachExtractedMetrics(coachId).catch(() => null),
    ])

    philosophy.value = phil
    programCount.value = count
    methodologyMatches.value = matches
    extractedMetrics.value = metrics

    // Load abbreviations (non-blocking)
    loadAbbreviations()
  } catch (error) {
    console.error('Failed to load philosophy:', error)
  } finally {
    isLoading.value = false
  }
})

const handleDetectMethodology = async () => {
  if (isDetecting.value) return
  isDetecting.value = true
  analysisError.value = null

  try {
    const coachId = authStore.user?.id
    if (!coachId) return

    const output = await detectCoachMethodology(coachId)
    detectionOutput.value = output

    // Refresh stored matches
    methodologyMatches.value = await getCoachMethodologyMatches(coachId)
    extractedMetrics.value = output.extracted_metrics
  } catch (error) {
    console.error('Detection failed:', error)
    analysisError.value = error instanceof Error ? error.message : 'Detection failed'
  } finally {
    isDetecting.value = false
  }
}

const handleManualAnalysis = async () => {
  if (isAnalyzing.value) return
  isAnalyzing.value = true
  analysisError.value = null
  try {
    const coachId = authStore.user?.id
    if (!coachId) return
    philosophy.value = await triggerPhilosophyAnalysis(coachId)
  } catch (error) {
    console.error('Analysis failed:', error)
    analysisError.value = error instanceof Error ? error.message : 'Analysis failed'
  } finally {
    isAnalyzing.value = false
  }
}

function handleMethodologyConfirmed(methodologyId: string) {
  showToast('Methodology confirmed! Your AI suggestions will now follow this approach.', 'success')
  // Refresh matches
  const coachId = authStore.user?.id
  if (coachId) {
    getCoachMethodologyMatches(coachId).then(m => { methodologyMatches.value = m })
  }
}

function handleMethodologyRejected(methodologyId: string) {
  showToast('Thanks for the feedback. We\'ll keep learning from your programs.', 'info')
  const coachId = authStore.user?.id
  if (coachId) {
    getCoachMethodologyMatches(coachId).then(m => { methodologyMatches.value = m })
  }
}

function handleMethodologyCorrected(fromId: string, toId: string) {
  showToast('Methodology updated! Your AI suggestions will now follow this approach.', 'success')
  const coachId = authStore.user?.id
  if (coachId) {
    getCoachMethodologyMatches(coachId).then(m => { methodologyMatches.value = m })
  }
}

// === Abbreviation Glossary ===
const abbreviations = ref<CoachAbbreviationRow[]>([])
const glossaryExpanded = ref(false)
const newAbbr = ref('')
const newExpansion = ref('')
const isSavingAbbr = ref(false)
const isDeletingAbbr = ref<string | null>(null) // id being deleted

const loadAbbreviations = async () => {
  const coachId = authStore.user?.id
  if (!coachId) return
  try {
    abbreviations.value = await getCoachAbbreviationsFull(coachId)
  } catch (e) {
    console.error('[Glossary] Failed to load:', e)
  }
}

const handleAddAbbreviation = async () => {
  const coachId = authStore.user?.id
  if (!coachId || !newAbbr.value.trim() || !newExpansion.value.trim()) return

  isSavingAbbr.value = true
  try {
    await upsertAbbreviation(coachId, newAbbr.value, newExpansion.value, 'manual')
    newAbbr.value = ''
    newExpansion.value = ''
    await loadAbbreviations()
    showToast('Abbreviation saved', 'success')
  } catch (e) {
    showToast('Failed to save abbreviation', 'error')
  } finally {
    isSavingAbbr.value = false
  }
}

const handleDeleteAbbreviation = async (id: string) => {
  const coachId = authStore.user?.id
  if (!coachId) return

  isDeletingAbbr.value = id
  try {
    await deleteAbbreviation(coachId, id)
    await loadAbbreviations()
    showToast('Abbreviation deleted', 'info')
  } catch (e) {
    showToast('Failed to delete abbreviation', 'error')
  } finally {
    isDeletingAbbr.value = null
  }
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 sticky top-14 z-10">
      <div class="max-w-3xl mx-auto px-4 py-4">
        <div class="flex items-center gap-3">
          <button @click="router.back()" class="text-gray-500 hover:text-gray-700">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-gray-900">Coaching Philosophy</h1>
            <p class="text-sm text-gray-500">Insights from {{ programCount }} programs</p>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <!-- Loading -->
      <div v-if="isLoading" class="text-center py-16">
        <svg class="animate-spin h-10 w-10 text-summit-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>

      <!-- Not Enough Programs -->
      <div v-else-if="programCount < MIN_PROGRAMS_FOR_DETECTION" class="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div class="w-20 h-20 bg-summit-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Philosophy Insights Coming Soon</h2>
        <p class="text-gray-600 mb-6">
          Create {{ MIN_PROGRAMS_FOR_DETECTION - programCount }} more {{ MIN_PROGRAMS_FOR_DETECTION - programCount === 1 ? 'program' : 'programs' }} to unlock coaching methodology detection
        </p>
        <div class="max-w-sm mx-auto">
          <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full bg-summit-600 transition-all duration-500"
              :style="{ width: `${(programCount / MIN_PROGRAMS_FOR_DETECTION) * 100}%` }"
            ></div>
          </div>
          <p class="text-sm text-gray-500 mt-2">{{ programCount }} / {{ MIN_PROGRAMS_FOR_DETECTION }} programs</p>
        </div>
        <button
          @click="router.push('/coach/planner')"
          class="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-summit-600 text-white rounded-xl font-medium hover:bg-summit-700 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Plans
        </button>
      </div>

      <!-- Has programs, show methodology detection -->
      <template v-else>
        <!-- Methodology Detection Section -->
        <div v-if="!topMatch && !isDetecting" class="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div class="w-20 h-20 bg-summit-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900 mb-2">Detect Your Methodology</h2>
          <p class="text-gray-600 mb-6">
            We'll analyze your {{ programCount }} programs to identify your coaching methodology. No AI cost — pure pattern matching.
          </p>

          <div v-if="analysisError" class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-left">
            <p class="text-sm text-red-700">{{ analysisError }}</p>
          </div>

          <button
            @click="handleDetectMethodology"
            class="inline-flex items-center gap-2 px-6 py-3 bg-summit-600 text-white rounded-xl font-medium hover:bg-summit-700 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Detect Methodology
          </button>
        </div>

        <!-- Detection in progress -->
        <div v-if="isDetecting" class="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <svg class="animate-spin h-10 w-10 text-summit-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <h2 class="text-lg font-bold text-gray-900 mb-1">Analyzing Your Programs</h2>
          <p class="text-sm text-gray-500">Extracting metrics and matching against methodology profiles...</p>
        </div>

        <!-- Methodology Confirmation Card -->
        <MethodologyConfirmationCard
          v-if="topMatch && metricsForCard"
          :coach-id="authStore.user?.id || ''"
          :top-match="topMatch"
          :secondary-matches="secondaryMatches"
          :metrics="metricsForCard"
          :suggested-question="suggestedQuestion"
          :already-confirmed="isConfirmed"
          @confirmed="handleMethodologyConfirmed"
          @rejected="handleMethodologyRejected"
          @corrected="handleMethodologyCorrected"
        />

        <!-- Re-detect button -->
        <div v-if="topMatch && !isDetecting" class="flex justify-center">
          <button
            @click="handleDetectMethodology"
            class="inline-flex items-center gap-2 text-sm text-summit-600 hover:text-summit-700 font-medium"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Re-analyze programs
          </button>
        </div>

        <!-- Legacy Philosophy Display (if exists) -->
        <template v-if="philosophy">
          <!-- Divider -->
          <div class="relative py-2">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-200"></div>
            </div>
            <div class="relative flex justify-center">
              <span class="bg-gray-50 px-3 text-xs font-medium text-gray-400 uppercase tracking-wide">AI Analysis</span>
            </div>
          </div>

          <!-- Summary Card -->
          <div class="bg-gradient-to-br from-summit-600 to-summit-700 rounded-xl p-6 text-white">
            <div class="flex items-start justify-between mb-4">
              <div>
                <h2 class="text-lg font-bold mb-1">Coaching Style</h2>
                <p class="text-summit-200 text-xs">
                  Last analyzed: {{ formatDate(philosophy.last_analysis_at!) }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold">{{ philosophy.programs_analyzed }}</p>
                <p class="text-xs text-summit-200">Programs</p>
              </div>
            </div>
            <p class="text-sm leading-relaxed text-summit-50">{{ philosophy.coaching_style_summary }}</p>
          </div>

          <!-- Periodization -->
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="font-bold text-gray-900 mb-4">Periodization Approach</h3>
            <div class="flex flex-wrap gap-2 mb-5">
              <span
                v-for="style in philosophy.primary_periodization"
                :key="style"
                class="px-3 py-1.5 bg-summit-100 text-summit-700 rounded-full text-sm font-semibold capitalize"
              >
                {{ style }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div v-if="philosophy.avg_mesocycle_length_weeks">
                <p class="text-xs text-gray-500 mb-1">Average Mesocycle</p>
                <p class="text-xl font-bold text-gray-900">{{ philosophy.avg_mesocycle_length_weeks }} <span class="text-sm font-normal text-gray-500">weeks</span></p>
              </div>
              <div v-if="philosophy.typical_deload_frequency">
                <p class="text-xs text-gray-500 mb-1">Deload Frequency</p>
                <p class="text-xl font-bold text-gray-900">Every {{ philosophy.typical_deload_frequency }} <span class="text-sm font-normal text-gray-500">weeks</span></p>
              </div>
              <div v-if="philosophy.volume_progression_pattern">
                <p class="text-xs text-gray-500 mb-1">Volume Progression</p>
                <p class="text-lg font-semibold text-gray-900 capitalize">{{ philosophy.volume_progression_pattern }}</p>
              </div>
              <div v-if="philosophy.intensity_distribution">
                <p class="text-xs text-gray-500 mb-2">Intensity Distribution</p>
                <div class="flex gap-2">
                  <div class="flex-1">
                    <div class="h-2 bg-emerald-100 rounded-full overflow-hidden">
                      <div class="h-full bg-emerald-500" :style="{ width: `${philosophy.intensity_distribution.low * 100}%` }"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">Low {{ (philosophy.intensity_distribution.low * 100).toFixed(0) }}%</p>
                  </div>
                  <div class="flex-1">
                    <div class="h-2 bg-amber-100 rounded-full overflow-hidden">
                      <div class="h-full bg-amber-500" :style="{ width: `${philosophy.intensity_distribution.medium * 100}%` }"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">Med {{ (philosophy.intensity_distribution.medium * 100).toFixed(0) }}%</p>
                  </div>
                  <div class="flex-1">
                    <div class="h-2 bg-red-100 rounded-full overflow-hidden">
                      <div class="h-full bg-red-500" :style="{ width: `${philosophy.intensity_distribution.high * 100}%` }"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">High {{ (philosophy.intensity_distribution.high * 100).toFixed(0) }}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Exercises -->
          <div v-if="philosophy.top_exercises && philosophy.top_exercises.length > 0" class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="font-bold text-gray-900 mb-4">Your Go-To Exercises</h3>
            <div class="space-y-3">
              <div
                v-for="(ex, idx) in philosophy.top_exercises.slice(0, 8)"
                :key="ex.name"
                class="flex items-center gap-3"
              >
                <div class="w-6 h-6 rounded-full bg-valencia-100 text-valencia-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {{ idx + 1 }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-gray-900 truncate">{{ ex.name }}</span>
                    <span class="text-xs text-gray-500 shrink-0 ml-2">{{ (ex.frequency * 100).toFixed(0) }}%</span>
                  </div>
                  <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-valencia-500 transition-all duration-500"
                      :style="{ width: `${ex.frequency * 100}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Movement Patterns -->
          <div v-if="philosophy.movement_patterns" class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="font-bold text-gray-900 mb-4">Movement Pattern Distribution</h3>
            <div class="grid grid-cols-3 sm:grid-cols-5 gap-3">
              <div v-for="(value, pattern) in philosophy.movement_patterns" :key="pattern" class="text-center">
                <div class="w-14 h-14 mx-auto mb-1.5 rounded-full bg-summit-100 flex items-center justify-center">
                  <span class="text-lg font-bold text-summit-700">{{ ((value as number) * 100).toFixed(0) }}</span>
                </div>
                <p class="text-xs font-medium text-gray-700 capitalize">{{ pattern }}</p>
              </div>
            </div>
          </div>

          <!-- Recommendations -->
          <div v-if="philosophy.recommendations && philosophy.recommendations.length > 0"
               class="bg-gradient-to-br from-valencia-50 to-amber-50 rounded-xl border border-valencia-200 p-5">
            <h3 class="font-bold text-valencia-900 mb-3">AI Recommendations</h3>
            <ul class="space-y-2.5">
              <li
                v-for="(rec, idx) in philosophy.recommendations"
                :key="idx"
                class="flex items-start gap-2.5"
              >
                <svg class="w-4 h-4 text-valencia-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span class="text-sm text-gray-700">{{ rec }}</span>
              </li>
            </ul>
          </div>

          <!-- Next Analysis Progress -->
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-gray-900 text-sm">Next AI Analysis</h3>
              <button
                @click="handleManualAnalysis"
                :disabled="isAnalyzing"
                class="text-sm text-summit-600 hover:text-summit-700 font-medium disabled:opacity-50"
              >
                {{ isAnalyzing ? 'Analyzing...' : 'Run Now' }}
              </button>
            </div>

            <div v-if="analysisError" class="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              <p class="text-sm text-red-700">{{ analysisError }}</p>
            </div>

            <div class="h-2.5 bg-gray-200 rounded-full overflow-hidden mb-2">
              <div
                class="h-full bg-summit-600 transition-all duration-500"
                :style="{ width: `${progressToNextAnalysis}%` }"
              ></div>
            </div>
            <p class="text-xs text-gray-500">
              {{ programsUntilNextAnalysis === 0 ? 'Ready for analysis!' :
                 `${programsUntilNextAnalysis} more ${programsUntilNextAnalysis === 1 ? 'program' : 'programs'} until next analysis` }}
            </p>
          </div>
        </template>
      </template>

      <!-- Abbreviation Glossary Card (always visible, even without enough programs) -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <!-- Glossary Header (clickable to expand) -->
        <button
          @click="glossaryExpanded = !glossaryExpanded"
          class="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg class="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div class="text-left">
              <h3 class="font-bold text-gray-900 text-sm">Abbreviation Glossary</h3>
              <p class="text-xs text-gray-500">{{ abbreviations.length }} shorthand{{ abbreviations.length !== 1 ? 's' : '' }} saved</p>
            </div>
          </div>
          <svg
            class="w-5 h-5 text-gray-400 transition-transform"
            :class="glossaryExpanded ? 'rotate-180' : ''"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Glossary Content -->
        <div v-if="glossaryExpanded" class="border-t border-gray-200">
          <!-- Empty State -->
          <div v-if="abbreviations.length === 0 && !isSavingAbbr" class="px-5 py-8 text-center">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p class="text-sm text-gray-600 mb-1">No abbreviations yet</p>
            <p class="text-xs text-gray-500">Correct exercise names during import and they'll appear here automatically. Or add them manually below.</p>
          </div>

          <!-- Abbreviation Table -->
          <div v-if="abbreviations.length > 0" class="divide-y divide-gray-100">
            <div
              v-for="abbr in abbreviations"
              :key="abbr.id"
              class="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50"
            >
              <div class="flex items-center gap-3 min-w-0">
                <code class="bg-summit-100 text-summit-700 px-2 py-0.5 rounded text-xs font-mono font-semibold shrink-0">
                  {{ abbr.abbreviation }}
                </code>
                <span class="text-sm text-gray-700 truncate">{{ abbr.expansion }}</span>
              </div>
              <div class="flex items-center gap-3 shrink-0 ml-3">
                <span class="text-xs text-gray-400">{{ abbr.usage_count }}x</span>
                <button
                  @click="handleDeleteAbbreviation(abbr.id)"
                  :disabled="isDeletingAbbr === abbr.id"
                  class="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Add New Abbreviation Form -->
          <div class="px-5 py-3 bg-gray-50 border-t border-gray-200">
            <div class="flex items-center gap-2">
              <input
                v-model="newAbbr"
                placeholder="Abbr"
                maxlength="10"
                class="w-20 text-xs px-2 py-1.5 border border-gray-300 rounded-md font-mono uppercase focus:outline-none focus:ring-1 focus:ring-summit-400"
                @keydown.enter="handleAddAbbreviation"
              />
              <span class="text-gray-400 text-xs">=</span>
              <input
                v-model="newExpansion"
                placeholder="Full exercise name"
                class="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-summit-400"
                @keydown.enter="handleAddAbbreviation"
              />
              <button
                @click="handleAddAbbreviation"
                :disabled="!newAbbr.trim() || !newExpansion.trim() || isSavingAbbr"
                class="px-3 py-1.5 bg-summit-600 text-white text-xs font-medium rounded-md hover:bg-summit-700 disabled:opacity-50 transition-colors shrink-0"
              >
                {{ isSavingAbbr ? '...' : 'Add' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @close="toastVisible = false"
    />
  </div>
</template>
