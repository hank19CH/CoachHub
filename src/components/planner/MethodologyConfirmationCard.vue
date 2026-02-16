<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MethodologyMatchResult, ExtractedMetrics } from '@/types/methodology'
import { getFingerprint, METHODOLOGY_FINGERPRINTS, getConfidenceLevel } from '@/data/methodologyFingerprints'
import {
  confirmMethodology,
  rejectMethodology,
  correctMethodology,
} from '@/services/methodologyDetection'

const props = defineProps<{
  coachId: string
  topMatch: MethodologyMatchResult
  secondaryMatches: MethodologyMatchResult[]
  metrics: ExtractedMetrics
  suggestedQuestion: string | null
  alreadyConfirmed?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirmed', methodologyId: string): void
  (e: 'rejected', methodologyId: string): void
  (e: 'corrected', fromId: string, toId: string): void
}>()

const isSubmitting = ref(false)
const showCorrectionPicker = ref(false)
const feedbackNotes = ref('')
const selectedAlternativeId = ref<string | null>(null)

const fingerprint = computed(() => getFingerprint(props.topMatch.methodology_id))
const confidenceLevel = computed(() => getConfidenceLevel(props.topMatch.confidence))

const confidenceColor = computed(() => {
  switch (confidenceLevel.value) {
    case 'definitive':
    case 'confident': return 'text-emerald-600 bg-emerald-100'
    case 'likely': return 'text-summit-600 bg-summit-100'
    case 'possible': return 'text-amber-600 bg-amber-100'
    default: return 'text-gray-600 bg-gray-100'
  }
})

const confidenceLabel = computed(() => {
  switch (confidenceLevel.value) {
    case 'definitive': return 'Strong Match'
    case 'confident': return 'Confident Match'
    case 'likely': return 'Likely Match'
    case 'possible': return 'Possible Match'
    default: return 'Low Confidence'
  }
})

// Top evidence statements (up to 4)
const topEvidence = computed(() => props.topMatch.evidence.slice(0, 4))

// Methodology alternatives for correction (exclude current)
const alternatives = computed(() =>
  METHODOLOGY_FINGERPRINTS
    .filter(f => f.id !== props.topMatch.methodology_id)
    .map(f => ({ id: f.id, name: f.name, shortName: f.shortName }))
)

// Formatted intensity distribution from extracted metrics
const intensityBars = computed(() => {
  const d = props.metrics.intensity_distribution
  return [
    { label: 'High', value: d.high, color: 'bg-red-500', bgColor: 'bg-red-100' },
    { label: 'Medium', value: d.medium, color: 'bg-amber-500', bgColor: 'bg-amber-100' },
    { label: 'Low', value: d.low, color: 'bg-emerald-500', bgColor: 'bg-emerald-100' },
  ]
})

async function handleConfirm() {
  isSubmitting.value = true
  try {
    await confirmMethodology(props.coachId, props.topMatch.methodology_id, feedbackNotes.value || undefined)
    emit('confirmed', props.topMatch.methodology_id)
  } catch (e) {
    console.error('Failed to confirm:', e)
  } finally {
    isSubmitting.value = false
  }
}

async function handleReject() {
  isSubmitting.value = true
  try {
    await rejectMethodology(props.coachId, props.topMatch.methodology_id, feedbackNotes.value || undefined)
    emit('rejected', props.topMatch.methodology_id)
  } catch (e) {
    console.error('Failed to reject:', e)
  } finally {
    isSubmitting.value = false
  }
}

async function handleCorrect() {
  if (!selectedAlternativeId.value) return
  isSubmitting.value = true
  try {
    await correctMethodology(
      props.coachId,
      props.topMatch.methodology_id,
      selectedAlternativeId.value,
      feedbackNotes.value || undefined
    )
    emit('corrected', props.topMatch.methodology_id, selectedAlternativeId.value)
  } catch (e) {
    console.error('Failed to correct:', e)
  } finally {
    isSubmitting.value = false
    showCorrectionPicker.value = false
  }
}
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-summit-600 to-summit-700 p-5 text-white">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-summit-200 text-xs font-medium uppercase tracking-wide mb-1">
            {{ alreadyConfirmed ? 'Confirmed Methodology' : 'Detected Methodology' }}
          </p>
          <h3 class="text-lg font-bold">
            {{ fingerprint?.name || topMatch.methodology_name }}
          </h3>
          <p v-if="fingerprint?.creator" class="text-sm text-summit-200 mt-0.5">
            by {{ fingerprint.creator }}
          </p>
        </div>
        <div class="text-right">
          <span :class="confidenceColor" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold">
            {{ topMatch.confidence }}%
          </span>
          <p class="text-xs text-summit-200 mt-1">{{ confidenceLabel }}</p>
        </div>
      </div>
    </div>

    <div class="p-5 space-y-5">
      <!-- Diagnostic Question -->
      <div v-if="suggestedQuestion && !alreadyConfirmed" class="bg-summit-50 border border-summit-200 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-summit-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-sm text-summit-800">{{ suggestedQuestion }}</p>
        </div>
      </div>

      <!-- Evidence Section -->
      <div v-if="topEvidence.length > 0">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">What we found</h4>
        <ul class="space-y-2">
          <li v-for="(ev, idx) in topEvidence" :key="idx" class="flex items-start gap-2.5">
            <svg class="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-sm text-gray-600">{{ ev }}</span>
          </li>
        </ul>
      </div>

      <!-- Intensity Distribution -->
      <div>
        <h4 class="text-sm font-semibold text-gray-700 mb-3">Your Intensity Distribution</h4>
        <div class="space-y-2">
          <div v-for="bar in intensityBars" :key="bar.label" class="flex items-center gap-3">
            <span class="text-xs font-medium text-gray-500 w-14">{{ bar.label }}</span>
            <div class="flex-1 h-3 rounded-full overflow-hidden" :class="bar.bgColor">
              <div class="h-full rounded-full transition-all duration-500" :class="bar.color" :style="{ width: `${Math.round(bar.value * 100)}%` }"></div>
            </div>
            <span class="text-xs font-bold text-gray-700 w-10 text-right">{{ Math.round(bar.value * 100) }}%</span>
          </div>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-gray-50 rounded-lg p-3">
          <p class="text-xs text-gray-500 mb-0.5">Sessions/Week</p>
          <p class="text-lg font-bold text-gray-900">{{ metrics.sessions_per_week_avg.toFixed(1) }}</p>
        </div>
        <div v-if="metrics.deload_frequency_weeks" class="bg-gray-50 rounded-lg p-3">
          <p class="text-xs text-gray-500 mb-0.5">Deload Every</p>
          <p class="text-lg font-bold text-gray-900">{{ metrics.deload_frequency_weeks }} <span class="text-sm font-normal text-gray-500">wks</span></p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <p class="text-xs text-gray-500 mb-0.5">Programs Analyzed</p>
          <p class="text-lg font-bold text-gray-900">{{ metrics.programs_analyzed }}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          <p class="text-xs text-gray-500 mb-0.5">Total Workouts</p>
          <p class="text-lg font-bold text-gray-900">{{ metrics.workouts_analyzed }}</p>
        </div>
      </div>

      <!-- Secondary Matches -->
      <div v-if="secondaryMatches.length > 0">
        <h4 class="text-sm font-semibold text-gray-700 mb-2">Other Influences</h4>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="match in secondaryMatches"
            :key="match.methodology_id"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700"
          >
            {{ match.methodology_name }}
            <span class="text-gray-400">{{ match.confidence }}%</span>
          </span>
        </div>
      </div>

      <!-- Feedback Notes (optional) -->
      <div v-if="!alreadyConfirmed">
        <label class="text-xs font-medium text-gray-500 block mb-1.5">Notes (optional)</label>
        <input
          v-model="feedbackNotes"
          type="text"
          placeholder="Any adjustments or context..."
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-summit-500 focus:border-summit-500"
        />
      </div>

      <!-- Correction Picker -->
      <div v-if="showCorrectionPicker" class="bg-gray-50 rounded-lg p-4 space-y-3">
        <h4 class="text-sm font-semibold text-gray-700">Which methodology best describes your approach?</h4>
        <div class="max-h-48 overflow-y-auto space-y-1.5">
          <button
            v-for="alt in alternatives"
            :key="alt.id"
            @click="selectedAlternativeId = alt.id"
            :class="[
              'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
              selectedAlternativeId === alt.id
                ? 'bg-summit-100 border border-summit-300 text-summit-800 font-medium'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-summit-200'
            ]"
          >
            {{ alt.name }}
          </button>
        </div>
        <div class="flex gap-2 pt-1">
          <button
            @click="handleCorrect"
            :disabled="!selectedAlternativeId || isSubmitting"
            class="flex-1 px-4 py-2 bg-summit-600 text-white text-sm font-medium rounded-lg hover:bg-summit-700 disabled:opacity-50 transition-colors"
          >
            {{ isSubmitting ? 'Saving...' : 'Confirm Selection' }}
          </button>
          <button
            @click="showCorrectionPicker = false; selectedAlternativeId = null"
            class="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-if="!alreadyConfirmed && !showCorrectionPicker" class="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          @click="handleConfirm"
          :disabled="isSubmitting"
          class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {{ isSubmitting ? 'Saving...' : "Yes, that's right" }}
        </button>
        <button
          @click="showCorrectionPicker = true"
          :disabled="isSubmitting"
          class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          No, it's actually...
        </button>
        <button
          @click="handleReject"
          :disabled="isSubmitting"
          class="sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-gray-500 text-sm font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Not sure
        </button>
      </div>

      <!-- Already Confirmed Badge -->
      <div v-if="alreadyConfirmed" class="flex items-center gap-2 pt-1">
        <svg class="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-sm font-medium text-emerald-700">Confirmed by you</span>
      </div>
    </div>
  </div>
</template>
