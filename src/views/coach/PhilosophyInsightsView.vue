<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getCoachPhilosophy, triggerPhilosophyAnalysis, getCoachProgramCount } from '@/services/philosophyDetection'
import type { CoachPhilosophy } from '@/types/import'

const router = useRouter()
const authStore = useAuthStore()
const philosophy = ref<CoachPhilosophy | null>(null)
const programCount = ref(0)
const isLoading = ref(true)
const isAnalyzing = ref(false)
const analysisError = ref<string | null>(null)

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

onMounted(async () => {
  try {
    const coachId = authStore.user?.id
    if (!coachId) return

    philosophy.value = await getCoachPhilosophy(coachId)
    programCount.value = await getCoachProgramCount(coachId)
  } catch (error) {
    console.error('Failed to load philosophy:', error)
  } finally {
    isLoading.value = false
  }
})

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
            <p class="text-sm text-gray-500">AI-powered insights from {{ programCount }} programs</p>
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
      <div v-else-if="!philosophy && programCount < 10" class="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div class="w-20 h-20 bg-summit-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Philosophy Insights Coming Soon</h2>
        <p class="text-gray-600 mb-6">
          Create {{ 10 - programCount }} more {{ programCount === 9 ? 'program' : 'programs' }} to unlock AI-powered coaching insights
        </p>
        <div class="max-w-sm mx-auto">
          <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full bg-summit-600 transition-all duration-500"
              :style="{ width: `${(programCount / 10) * 100}%` }"
            ></div>
          </div>
          <p class="text-sm text-gray-500 mt-2">{{ programCount }} / 10 programs</p>
        </div>
        <button
          @click="router.push('/coach/programs')"
          class="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-summit-600 text-white rounded-xl font-medium hover:bg-summit-700 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Programs
        </button>
      </div>

      <!-- No philosophy yet but enough programs -->
      <div v-else-if="!philosophy && programCount >= 10" class="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div class="w-20 h-20 bg-summit-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 mb-2">Ready to Analyze!</h2>
        <p class="text-gray-600 mb-6">
          You have {{ programCount }} programs. Run your first philosophy analysis to get AI-powered coaching insights.
        </p>

        <!-- Analysis Error -->
        <div v-if="analysisError" class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-left">
          <p class="text-sm text-red-700">{{ analysisError }}</p>
        </div>

        <button
          @click="handleManualAnalysis"
          :disabled="isAnalyzing"
          class="inline-flex items-center gap-2 px-6 py-3 bg-summit-600 text-white rounded-xl font-medium hover:bg-summit-700 disabled:opacity-50 transition-colors"
        >
          <svg v-if="isAnalyzing" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {{ isAnalyzing ? 'Analyzing...' : 'Run Analysis' }}
        </button>
      </div>

      <!-- Philosophy Display -->
      <template v-else-if="philosophy">
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
            <h3 class="font-semibold text-gray-900 text-sm">Next Analysis</h3>
            <button
              @click="handleManualAnalysis"
              :disabled="isAnalyzing"
              class="text-sm text-summit-600 hover:text-summit-700 font-medium disabled:opacity-50"
            >
              {{ isAnalyzing ? 'Analyzing...' : 'Run Now' }}
            </button>
          </div>

          <!-- Analysis Error -->
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
    </div>
  </div>
</template>
