<script setup lang="ts">
import { computed } from 'vue'
import type { ImportClassification, ImportAmbiguity } from '@/types/import'
import { formatPrescription } from '@/services/progressionEngine'

const props = defineProps<{
  classification: ImportClassification
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'fallback'): void
  (e: 'cancel'): void
  (e: 'editBlockName', name: string): void
  (e: 'resolveAmbiguity', index: number, value: string): void
  (e: 'unresolveAmbiguity', index: number): void
}>()

const c = computed(() => props.classification)

const confidenceColor = computed(() => {
  const conf = c.value.confidence
  if (conf >= 0.8) return 'emerald'
  if (conf >= 0.6) return 'summit'
  if (conf >= 0.4) return 'amber'
  return 'red'
})

const confidenceLabel = computed(() => {
  const conf = c.value.confidence
  if (conf >= 0.8) return 'High confidence'
  if (conf >= 0.6) return 'Good confidence'
  if (conf >= 0.4) return 'Moderate confidence'
  return 'Low confidence'
})

const patternLabel = computed(() => {
  const labels: Record<string, string> = {
    linear: 'Linear',
    wave: 'Wave',
    descending_sets: 'Descending Sets',
    step: 'Step Loading',
    custom: 'Custom',
  }
  return labels[c.value.progression_pattern] ?? c.value.progression_pattern
})

const loadMetricLabel = computed(() => {
  const labels: Record<string, string> = {
    tonnage: 'Tonnage',
    relative_intensity: '% 1RM',
    rpe: 'RPE',
    volume_load: 'Volume Load',
    reps_only: 'Reps Only',
  }
  return labels[c.value.load_metric] ?? c.value.load_metric
})

const isMesocycle = computed(() => c.value.detected_type === 'mesocycle_program')

const totalExercises = computed(() =>
  c.value.canonical_workouts.reduce((sum, w) => sum + w.exercise_count, 0)
)

const hasVariations = computed(() =>
  c.value.canonical_workouts.some(w => w.exercises.some(e => e.has_variation))
)

const unresolvedAmbiguities = computed(() =>
  (c.value.ambiguities ?? []).filter(a => !a.resolved)
)

const hasHighPriority = computed(() =>
  unresolvedAmbiguities.value.some(a => a.priority >= 7)
)
</script>

<template>
  <div class="space-y-5">
    <!-- Header with confidence -->
    <div class="flex items-center gap-3 pb-4 border-b border-gray-200">
      <div
        class="w-12 h-12 rounded-full flex items-center justify-center"
        :class="{
          'bg-emerald-100': confidenceColor === 'emerald',
          'bg-summit-100': confidenceColor === 'summit',
          'bg-amber-100': confidenceColor === 'amber',
          'bg-red-100': confidenceColor === 'red',
        }"
      >
        <svg
          v-if="isMesocycle"
          class="w-6 h-6"
          :class="{
            'text-emerald-600': confidenceColor === 'emerald',
            'text-summit-600': confidenceColor === 'summit',
            'text-amber-600': confidenceColor === 'amber',
            'text-red-600': confidenceColor === 'red',
          }"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <svg v-else class="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-lg font-bold text-gray-900">
            {{ isMesocycle ? 'Mesocycle Detected' : 'Standalone Sessions' }}
          </h2>
          <span
            class="text-xs font-semibold px-2 py-0.5 rounded-full"
            :class="{
              'bg-emerald-100 text-emerald-700': confidenceColor === 'emerald',
              'bg-summit-100 text-summit-700': confidenceColor === 'summit',
              'bg-amber-100 text-amber-700': confidenceColor === 'amber',
              'bg-red-100 text-red-700': confidenceColor === 'red',
            }"
          >
            {{ Math.round(c.confidence * 100) }}% &middot; {{ confidenceLabel }}
          </span>
        </div>
        <p class="text-sm text-gray-500 mt-0.5">
          <template v-if="isMesocycle">
            {{ c.duration_weeks }}-week block with {{ patternLabel }} progression
          </template>
          <template v-else>
            No multi-week progression detected — will import as individual sessions
          </template>
        </p>
      </div>
    </div>

    <!-- Block Config Summary -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-gray-50 rounded-lg p-3">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Block</p>
        <p class="font-semibold text-gray-900 text-sm truncate">{{ c.block_config.name }}</p>
      </div>
      <div class="bg-gray-50 rounded-lg p-3">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Duration</p>
        <p class="font-semibold text-gray-900 text-sm">{{ c.duration_weeks }} weeks</p>
      </div>
      <div class="bg-gray-50 rounded-lg p-3">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Load Metric</p>
        <p class="font-semibold text-gray-900 text-sm">{{ loadMetricLabel }}</p>
      </div>
      <div class="bg-gray-50 rounded-lg p-3">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Exercises</p>
        <p class="font-semibold text-gray-900 text-sm">{{ totalExercises }}</p>
      </div>
    </div>

    <!-- Intensity Range (if detected) -->
    <div
      v-if="c.intensity_start != null && c.intensity_end != null"
      class="bg-summit-50 border border-summit-200 rounded-xl p-4"
    >
      <div class="flex items-center gap-3 mb-2">
        <svg class="w-4 h-4 text-summit-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <span class="text-sm font-semibold text-summit-700">Intensity Progression</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-summit-800">{{ c.intensity_start }}%</span>
        <div class="flex-1 h-2 bg-summit-200 rounded-full relative overflow-hidden">
          <div
            class="absolute top-0 left-0 h-full bg-gradient-to-r from-summit-400 to-summit-600 rounded-full"
            :style="{ width: `${((c.intensity_end! - c.intensity_start!) / (100 - c.intensity_start!)) * 100}%` }"
          ></div>
        </div>
        <span class="text-sm font-medium text-summit-800">{{ c.intensity_end }}%</span>
      </div>
      <p v-if="c.deload_week" class="text-xs text-summit-600 mt-1.5">
        Deload in Week {{ c.deload_week }}
      </p>
    </div>

    <!-- Canonical Workouts (Session Days) -->
    <div class="space-y-3">
      <h3 class="font-semibold text-gray-900 text-sm">
        Session Roster ({{ c.canonical_workouts.length }} {{ c.canonical_workouts.length === 1 ? 'session' : 'sessions' }}/week)
      </h3>
      <div class="space-y-2">
        <div
          v-for="(workout, wi) in c.canonical_workouts"
          :key="wi"
          class="border border-gray-200 rounded-lg overflow-hidden"
        >
          <!-- Workout header -->
          <div class="px-3 py-2 bg-gray-50 flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-6 h-6 rounded-full bg-summit-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {{ wi + 1 }}
              </div>
              <span class="text-sm font-semibold text-gray-900 truncate">{{ workout.name }}</span>
              <span v-if="workout.session_type" class="text-[10px] font-medium text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full capitalize">
                {{ workout.session_type }}
              </span>
            </div>
            <span class="text-xs text-gray-500 shrink-0">{{ workout.exercise_count }} exercises</span>
          </div>

          <!-- Exercise list -->
          <div class="divide-y divide-gray-50">
            <div
              v-for="(exercise, ei) in workout.exercises"
              :key="ei"
              class="px-3 py-1.5 flex items-center gap-2"
              :class="exercise.is_section_header ? 'bg-gray-50' : 'hover:bg-gray-50/50'"
            >
              <template v-if="exercise.is_section_header">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">{{ exercise.canonical_name }}</span>
              </template>
              <template v-else>
                <span class="text-[10px] text-gray-400 w-5 text-right shrink-0">{{ exercise.order_index + 1 }}</span>
                <span class="text-xs text-gray-800 flex-1 truncate">
                  {{ exercise.canonical_name }}
                  <span v-if="exercise.raw_name && exercise.raw_name !== exercise.canonical_name" class="text-gray-400 ml-1">
                    ({{ exercise.raw_name }})
                  </span>
                </span>
                <!-- Week 1 prescription -->
                <span v-if="exercise.weeks.length > 0" class="text-[10px] text-gray-500 whitespace-nowrap shrink-0">
                  {{ formatPrescription(exercise.weeks[0]) }}
                </span>
                <!-- Variation badge -->
                <span
                  v-if="exercise.has_variation"
                  class="text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full shrink-0"
                  :title="exercise.variation_summary ?? 'Exercise varies across weeks'"
                >
                  varies
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Week 1 vs Week 2 Comparison -->
    <div v-if="c.week_samples.length >= 2" class="space-y-3">
      <h3 class="font-semibold text-gray-900 text-sm">Week Comparison Sample</h3>
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="bg-gray-50">
              <tr>
                <th class="text-left px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-gray-50 min-w-[140px]">Exercise</th>
                <th
                  v-for="sample in c.week_samples"
                  :key="sample.week_number"
                  class="text-center px-3 py-2 font-semibold text-gray-700 min-w-[80px]"
                >
                  Week {{ sample.week_number }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="(ex, idx) in c.week_samples[0].exercises"
                :key="idx"
                class="hover:bg-gray-50/50"
              >
                <td class="px-3 py-1.5 sticky left-0 bg-white text-gray-800 font-medium">
                  {{ ex.name }}
                  <span
                    v-if="ex.variation_name"
                    class="text-purple-600 text-[10px] ml-1"
                  >({{ ex.variation_name }})</span>
                </td>
                <td
                  v-for="sample in c.week_samples"
                  :key="sample.week_number"
                  class="text-center px-3 py-1.5 text-gray-600"
                >
                  {{ sample.exercises[idx]?.prescription ?? '—' }}
                  <span
                    v-if="sample.exercises[idx]?.variation_name"
                    class="block text-[10px] text-purple-500"
                  >{{ sample.exercises[idx].variation_name }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Variation Warning -->
    <div
      v-if="hasVariations"
      class="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2"
    >
      <svg class="w-4 h-4 text-purple-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
      <p class="text-xs text-purple-800">
        <span class="font-semibold">Mid-block exercise swaps detected.</span>
        Some exercise slots change names across weeks (e.g. Back Squat in weeks 1-2, then Half Squat in weeks 3-4).
        These are tracked as <span class="font-medium">variations</span> of the same exercise slot.
      </p>
    </div>

    <!-- Ambiguity Resolution -->
    <div v-if="c.ambiguities?.length > 0" class="bg-white border border-amber-200 rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-amber-100 bg-amber-50/50">
        <div class="flex items-center gap-2 flex-wrap">
          <svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 class="font-semibold text-gray-900 text-sm">Review Ambiguities</h3>
          <span class="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {{ unresolvedAmbiguities.length }} remaining
          </span>
        </div>
      </div>

      <div class="divide-y divide-gray-100">
        <div
          v-for="(amb, idx) in c.ambiguities"
          :key="idx"
          class="px-4 py-3 transition-colors"
          :class="amb.resolved ? 'bg-emerald-50/30' : amb.priority >= 7 ? 'bg-amber-50/50 border-l-3 border-amber-400' : ''"
        >
          <div class="flex items-start gap-2">
            <span
              class="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5"
              :class="amb.priority >= 7 ? 'bg-red-100 text-red-700' : amb.priority >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'"
            >
              P{{ amb.priority }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-800 font-medium">{{ amb.question }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">
                <code class="bg-gray-100 px-1 rounded font-mono text-gray-600">{{ amb.originalValue }}</code>
                <span v-if="amb.location" class="ml-1">in {{ amb.location }}</span>
              </p>

              <div v-if="amb.resolved" class="mt-2 flex items-center gap-2">
                <span class="text-xs text-emerald-700 font-medium bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {{ amb.resolvedValue }}
                </span>
                <button
                  @click="emit('unresolveAmbiguity', idx)"
                  class="text-[10px] text-gray-400 hover:text-gray-600 underline"
                >undo</button>
              </div>

              <div v-else class="mt-2 flex flex-wrap gap-1.5">
                <button
                  v-for="opt in amb.options"
                  :key="opt"
                  @click="emit('resolveAmbiguity', idx, opt)"
                  class="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-summit-50 hover:border-summit-300 transition-colors"
                >{{ opt }}</button>
                <input
                  @keydown.enter="emit('resolveAmbiguity', idx, ($event.target as HTMLInputElement).value); ($event.target as HTMLInputElement).value = ''"
                  placeholder="Custom..."
                  class="text-xs px-2 py-1 border border-gray-200 rounded-lg w-24 focus:outline-none focus:ring-1 focus:ring-summit-400"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- High priority warning -->
    <div v-if="hasHighPriority" class="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
      <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <p class="text-xs text-amber-800">
        <span class="font-semibold">{{ unresolvedAmbiguities.filter(a => a.priority >= 7).length }} high-priority ambiguities</span>
        remain. You can still proceed, but the AI's best guess will be used.
      </p>
    </div>

    <!-- Actions -->
    <div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
      <button
        v-if="isMesocycle"
        @click="emit('confirm')"
        :disabled="disabled"
        class="flex-1 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :class="disabled ? 'bg-summit-600' : hasHighPriority ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'"
      >
        {{ disabled ? 'Extracting...' : 'Confirm &amp; Extract Full Program' }}
      </button>
      <button
        v-else
        @click="emit('fallback')"
        :disabled="disabled"
        class="flex-1 bg-summit-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-summit-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ disabled ? 'Extracting...' : 'Import as Standalone Sessions' }}
      </button>
      <button
        v-if="isMesocycle"
        @click="emit('fallback')"
        :disabled="disabled"
        class="px-6 py-3 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Skip Mesocycle &mdash; Import as Sessions
      </button>
      <button
        @click="emit('cancel')"
        class="px-6 py-3 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
      >
        {{ disabled ? 'Cancel Extraction' : 'Cancel' }}
      </button>
    </div>
  </div>
</template>
