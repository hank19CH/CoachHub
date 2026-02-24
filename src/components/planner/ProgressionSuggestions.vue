<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { detectVolumeSpikes, loadBlockProgressionMatrix } from '@/services/progressionEngine'
import { aiPeriodizationService } from '@/services/aiPeriodization'
import type { ExerciseSlot } from '@/types/progression'
import type { VolumeSpike } from '@/types/progression'

const props = defineProps<{
  blockId: string
  durationWeeks: number
  deloadWeek: number | null
  /** Pre-loaded slots from ProgressionMatrix (avoids double-fetch) */
  slots?: ExerciseSlot[]
}>()

const emit = defineEmits<{
  (e: 'apply-suggestion', payload: { exerciseIndex: number; weeks: import('@/types/import').ExerciseWeekEntry[] }): void
}>()

const authStore = useAuthStore()

// State
const collapsed = ref(false)
const spikes = ref<VolumeSpike[]>([])
const variationFlags = ref<{ index: number; name: string }[]>([])
const loadedSlots = ref<ExerciseSlot[]>([])

// AI suggestion state
const aiLoading = ref(false)
const aiError = ref('')
const aiSuggestions = ref<{ exerciseIndex: number; name: string; preview: string; weeks: any[] }[]>([])
const appliedIndices = ref<Set<number>>(new Set())

// Load spikes from slots
async function loadAnalysis() {
  let slots = props.slots
  if (!slots?.length) {
    slots = await loadBlockProgressionMatrix(props.blockId)
  }
  loadedSlots.value = slots

  // Tier 1: volume spikes
  spikes.value = detectVolumeSpikes(slots, 15)

  // Tier 1: variation review flags
  variationFlags.value = slots
    .map((s, i) => ({
      index: i,
      name: s.canonical_name,
      needsReview: (s as any).exercise_variation_review === true,
    }))
    .filter(s => s.needsReview)
    .map(s => ({ index: s.index, name: s.name }))
}

watch(() => [props.blockId, props.slots], () => {
  loadAnalysis()
  aiSuggestions.value = []
  appliedIndices.value = new Set()
}, { immediate: true })

const hasContent = computed(() =>
  spikes.value.length > 0 ||
  variationFlags.value.length > 0 ||
  aiSuggestions.value.length > 0
)

// Tier 2: Suggest Progression via AI
async function suggestProgression() {
  if (!authStore.user) return
  aiLoading.value = true
  aiError.value = ''
  aiSuggestions.value = []

  try {
    // Load block context for the prompt
    const { data: block } = await (supabase as any)
      .from('training_blocks')
      .select('*, plans!inner(name, sport, goal_description, periodization_model)')
      .eq('id', props.blockId)
      .single()

    if (!block) {
      aiError.value = 'Could not load block data'
      return
    }

    const plan = Array.isArray(block.plans) ? block.plans[0] : block.plans

    // Build a focused modification request for progression suggestions
    const exerciseList = loadedSlots.value
      .filter(s => !s.is_section_header)
      .map(s => `${s.canonical_name} (Week 1: ${s.weeks[0]?.sets || '?'}x${s.weeks[0]?.reps || '?'}${s.weeks[0]?.intensity_percent ? ` @${s.weeks[0].intensity_percent}%` : ''})`)
      .join('\n')

    const modRequest = `Suggest week-by-week progression for this ${props.durationWeeks}-week ${block.block_type || 'training'} block.
Block: ${block.name}
Sport: ${plan?.sport || 'General'}
Goal: ${plan?.goal_description || 'General fitness'}
${block.load_metric ? `Load metric: ${block.load_metric}` : ''}
${props.deloadWeek ? `Deload week: ${props.deloadWeek}` : ''}
Pattern: ${block.progression_pattern || 'linear'}

Exercises (Week 1 baseline):
${exerciseList}

For each exercise, suggest sets, reps, and intensity% for weeks 2 through ${props.durationWeeks}. Keep Week 1 as given. Return as JSON array: [{ "exercise_name": "...", "weeks": [{ "week": 1, "sets": "3", "reps": "8", "intensity_percent": 70 }, ...] }]`

    const result = await aiPeriodizationService.modifyPlan({
      planId: plan?.id || props.blockId,
      coachId: authStore.user.id,
      existingPlan: {
        name: plan?.name || block.name,
        blocks: [{
          name: block.name,
          block_type: block.block_type,
          duration_weeks: props.durationWeeks,
          exercises: exerciseList,
        }],
      },
      modificationRequest: modRequest,
    })

    if (!result.success || !result.rawText) {
      aiError.value = result.error || 'AI returned no suggestions'
      return
    }

    // Parse suggestions from AI response
    try {
      // Try to extract JSON from the response
      const jsonMatch = result.rawText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        aiSuggestions.value = parsed.map((item: any, idx: number) => ({
          exerciseIndex: idx,
          name: item.exercise_name || item.name || `Exercise ${idx + 1}`,
          preview: (item.weeks || []).map((w: any) =>
            `W${w.week}: ${w.sets}x${w.reps}${w.intensity_percent ? ` @${w.intensity_percent}%` : ''}`
          ).join(' → '),
          weeks: item.weeks || [],
        }))
      } else {
        // Fallback: show raw text as a single suggestion
        aiSuggestions.value = [{
          exerciseIndex: -1,
          name: 'AI Suggestion',
          preview: result.rawText.slice(0, 200),
          weeks: [],
        }]
      }
    } catch {
      aiSuggestions.value = [{
        exerciseIndex: -1,
        name: 'AI Suggestion',
        preview: result.rawText.slice(0, 200),
        weeks: [],
      }]
    }
  } catch (e) {
    console.error('AI suggestion error:', e)
    aiError.value = e instanceof Error ? e.message : 'Failed to get AI suggestions'
  } finally {
    aiLoading.value = false
  }
}

function applySuggestion(suggestion: typeof aiSuggestions.value[0]) {
  if (suggestion.exerciseIndex < 0 || !suggestion.weeks.length) return
  appliedIndices.value.add(suggestion.exerciseIndex)
  emit('apply-suggestion', {
    exerciseIndex: suggestion.exerciseIndex,
    weeks: suggestion.weeks,
  })
}

function dismissSpike(index: number) {
  spikes.value.splice(index, 1)
}
</script>

<template>
  <div v-if="hasContent || true" class="border border-gray-100 rounded-xl bg-white overflow-hidden">
    <!-- Header -->
    <button
      @click="collapsed = !collapsed"
      class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
    >
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span class="text-xs font-bold uppercase tracking-wider text-gray-500">Suggestions</span>
        <span
          v-if="spikes.length > 0"
          class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-amber-800 bg-amber-100 rounded-full"
        >
          {{ spikes.length }}
        </span>
      </div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-4 h-4 text-gray-400 transition-transform"
        :class="{ 'rotate-180': !collapsed }"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="!collapsed" class="px-4 pb-4 space-y-3">
      <!-- Tier 1: Volume Spike Warnings -->
      <div
        v-for="(spike, idx) in spikes"
        :key="`spike-${idx}`"
        class="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-xs text-amber-900 font-medium">{{ spike.message }}</p>
          <p class="text-[10px] text-amber-700 mt-0.5">Review or adjust to avoid injury risk.</p>
        </div>
        <button
          @click="dismissSpike(idx)"
          class="text-amber-400 hover:text-amber-600 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Tier 1: Variation Review Flags -->
      <div
        v-for="flag in variationFlags"
        :key="`var-${flag.index}`"
        class="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-xs text-blue-900 font-medium">Multiple names detected for "{{ flag.name }}"</p>
          <p class="text-[10px] text-blue-700 mt-0.5">Confirm which are the same movement in the matrix.</p>
        </div>
      </div>

      <!-- Tier 2: AI Suggestions -->
      <div v-if="aiSuggestions.length > 0" class="space-y-2">
        <h4 class="text-[10px] font-bold uppercase tracking-wider text-summit-500">AI Suggestions</h4>
        <div
          v-for="(sug, idx) in aiSuggestions"
          :key="`ai-${idx}`"
          class="p-2.5 rounded-lg bg-summit-50 border border-summit-200"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-summit-900">{{ sug.name }}</p>
              <p class="text-[10px] text-summit-700 mt-0.5 truncate">{{ sug.preview }}</p>
            </div>
            <button
              v-if="sug.weeks.length > 0 && !appliedIndices.has(sug.exerciseIndex)"
              @click="applySuggestion(sug)"
              class="flex-shrink-0 text-[10px] font-semibold text-white bg-summit-600 hover:bg-summit-700 px-2.5 py-1 rounded-lg transition-colors"
            >
              Apply
            </button>
            <span
              v-else-if="appliedIndices.has(sug.exerciseIndex)"
              class="flex-shrink-0 text-[10px] font-semibold text-emerald-600"
            >
              Applied
            </span>
          </div>
        </div>
      </div>

      <!-- AI Error -->
      <div v-if="aiError" class="p-2.5 rounded-lg bg-red-50 border border-red-200">
        <p class="text-xs text-red-700">{{ aiError }}</p>
      </div>

      <!-- Suggest Progression Button (Tier 2) -->
      <button
        @click="suggestProgression"
        :disabled="aiLoading || loadedSlots.length === 0"
        class="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-summit-300 text-summit-600 hover:bg-summit-50 hover:border-summit-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <template v-if="aiLoading">
          <div class="w-3.5 h-3.5 border-2 border-summit-600 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs font-semibold">Generating suggestions...</span>
        </template>
        <template v-else>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span class="text-xs font-semibold">Suggest Progression</span>
          <span class="text-[10px] text-summit-400">(~500 tokens)</span>
        </template>
      </button>
    </div>
  </div>
</template>
