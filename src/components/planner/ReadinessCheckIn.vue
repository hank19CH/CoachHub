<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { readinessService } from '@/services/readiness'
import type { Database } from '@/types/database'

type ReadinessLog = Database['public']['Tables']['readiness_logs']['Row']

const authStore = useAuthStore()

const emit = defineEmits<{
  (e: 'submitted', log: ReadinessLog): void
  (e: 'close'): void
}>()

const loading = ref(true)
const saving = ref(false)
const existingLog = ref<ReadinessLog | null>(null)

const form = ref({
  subjective_score: 7,
  sleep_quality: 3,
  sleep_hours: 7.5,
  muscle_soreness: 2,
  energy_level: 3,
  stress_level: 2,
})

const readinessColor = computed(() => {
  const score = form.value.subjective_score
  if (score >= 8) return 'text-emerald-600'
  if (score >= 6) return 'text-green-500'
  if (score >= 4) return 'text-amber-500'
  return 'text-red-500'
})

const readinessLabel = computed(() => {
  const score = form.value.subjective_score
  if (score >= 9) return 'Excellent'
  if (score >= 7) return 'Good'
  if (score >= 5) return 'Moderate'
  if (score >= 3) return 'Low'
  return 'Very Low'
})

onMounted(async () => {
  if (!authStore.user) return
  try {
    const today = await readinessService.getTodayLog(authStore.user.id)
    if (today) {
      existingLog.value = today
      form.value = {
        subjective_score: today.subjective_score || 7,
        sleep_quality: today.sleep_quality || 3,
        sleep_hours: today.sleep_hours || 7.5,
        muscle_soreness: today.muscle_soreness || 2,
        energy_level: today.energy_level || 3,
        stress_level: today.stress_level || 2,
      }
    }
  } catch (e) {
    console.error('Error loading today log:', e)
  } finally {
    loading.value = false
  }
})

async function handleSubmit() {
  if (!authStore.user) return
  saving.value = true

  try {
    const log = await readinessService.submitReadinessLog({
      athlete_id: authStore.user.id,
      log_date: new Date().toISOString().split('T')[0],
      subjective_score: form.value.subjective_score,
      sleep_quality: form.value.sleep_quality,
      sleep_hours: form.value.sleep_hours,
      muscle_soreness: form.value.muscle_soreness,
      energy_level: form.value.energy_level,
      stress_level: form.value.stress_level,
      source: 'manual',
    })
    emit('submitted', log)
  } catch (e) {
    console.error('Error submitting readiness:', e)
  } finally {
    saving.value = false
  }
}

function getSliderColor(value: number, inverted = false): string {
  const v = inverted ? 6 - value : value
  if (v >= 4) return 'accent-emerald-600'
  if (v >= 3) return 'accent-green-500'
  if (v >= 2) return 'accent-amber-500'
  return 'accent-red-500'
}
</script>

<template>
  <div class="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
    <!-- Header -->
    <div class="bg-gradient-to-r from-summit-600 to-summit-800 px-5 py-4 text-white">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-bold text-base">Morning Readiness</h3>
          <p class="text-summit-200 text-xs mt-0.5">
            {{ existingLog ? 'Update your check-in' : 'How are you feeling today?' }}
          </p>
        </div>
        <button @click="emit('close')" class="text-white/60 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="loading" class="p-6">
      <div class="animate-pulse space-y-4">
        <div class="bg-gray-100 rounded-lg h-12"></div>
        <div class="bg-gray-100 rounded-lg h-8"></div>
        <div class="bg-gray-100 rounded-lg h-8"></div>
      </div>
    </div>

    <form v-else @submit.prevent="handleSubmit" class="p-5 space-y-5">
      <!-- Overall readiness score -->
      <div class="text-center pb-3 border-b border-gray-100">
        <div :class="['text-4xl font-bold mb-1', readinessColor]">
          {{ form.subjective_score }}
        </div>
        <div :class="['text-sm font-semibold', readinessColor]">{{ readinessLabel }}</div>
        <input
          v-model.number="form.subjective_score"
          type="range"
          min="1"
          max="10"
          class="w-full mt-3 accent-summit-600"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>Very Low</span>
          <span>Excellent</span>
        </div>
      </div>

      <!-- Sleep quality -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-sm font-semibold text-gray-700">Sleep Quality</label>
          <span class="text-sm font-bold text-gray-900">{{ form.sleep_quality }}/5</span>
        </div>
        <input
          v-model.number="form.sleep_quality"
          type="range"
          min="1"
          max="5"
          :class="['w-full', getSliderColor(form.sleep_quality)]"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>Terrible</span>
          <span>Excellent</span>
        </div>
      </div>

      <!-- Sleep hours -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-sm font-semibold text-gray-700">Sleep Hours</label>
          <span class="text-sm font-bold text-gray-900">{{ form.sleep_hours }}h</span>
        </div>
        <input
          v-model.number="form.sleep_hours"
          type="range"
          min="3"
          max="12"
          step="0.5"
          class="w-full accent-summit-600"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>3h</span>
          <span>12h</span>
        </div>
      </div>

      <!-- Muscle soreness -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-sm font-semibold text-gray-700">Muscle Soreness</label>
          <span class="text-sm font-bold text-gray-900">{{ form.muscle_soreness }}/5</span>
        </div>
        <input
          v-model.number="form.muscle_soreness"
          type="range"
          min="1"
          max="5"
          :class="['w-full', getSliderColor(form.muscle_soreness, true)]"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>None</span>
          <span>Severe</span>
        </div>
      </div>

      <!-- Energy level -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-sm font-semibold text-gray-700">Energy Level</label>
          <span class="text-sm font-bold text-gray-900">{{ form.energy_level }}/5</span>
        </div>
        <input
          v-model.number="form.energy_level"
          type="range"
          min="1"
          max="5"
          :class="['w-full', getSliderColor(form.energy_level)]"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>Exhausted</span>
          <span>Energized</span>
        </div>
      </div>

      <!-- Stress level -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-sm font-semibold text-gray-700">Stress Level</label>
          <span class="text-sm font-bold text-gray-900">{{ form.stress_level }}/5</span>
        </div>
        <input
          v-model.number="form.stress_level"
          type="range"
          min="1"
          max="5"
          :class="['w-full', getSliderColor(form.stress_level, true)]"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>Relaxed</span>
          <span>Very High</span>
        </div>
      </div>

      <!-- Submit -->
      <button
        type="submit"
        class="btn-primary w-full"
        :disabled="saving"
      >
        <span v-if="saving" class="flex items-center justify-center gap-2">
          <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          Saving...
        </span>
        <span v-else>{{ existingLog ? 'Update Check-in' : 'Submit Check-in' }}</span>
      </button>
    </form>
  </div>
</template>
