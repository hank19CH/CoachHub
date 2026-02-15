<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { readinessService } from '@/services/readiness'
import type { Database } from '@/types/database'

type SessionFeedback = Database['public']['Tables']['session_feedback']['Row']

const authStore = useAuthStore()

const props = defineProps<{
  completionId: string
  workoutName?: string
}>()

const emit = defineEmits<{
  (e: 'submitted', feedback: SessionFeedback): void
  (e: 'skip'): void
}>()

const saving = ref(false)

const form = ref({
  session_rpe: 7,
  soreness_post: 2,
  energy_post: 3,
  notes: '',
})

const rpeLabel = computed(() => {
  const rpe = form.value.session_rpe
  if (rpe >= 10) return 'Max Effort'
  if (rpe >= 9) return 'Very Hard'
  if (rpe >= 7) return 'Hard'
  if (rpe >= 5) return 'Moderate'
  if (rpe >= 3) return 'Easy'
  return 'Very Easy'
})

const rpeColor = computed(() => {
  const rpe = form.value.session_rpe
  if (rpe >= 9) return 'text-red-600'
  if (rpe >= 7) return 'text-orange-500'
  if (rpe >= 5) return 'text-amber-500'
  if (rpe >= 3) return 'text-green-500'
  return 'text-emerald-600'
})

const sorenessLabels = ['None', 'Mild', 'Moderate', 'Sore', 'Very Sore']
const energyLabels = ['Exhausted', 'Low', 'Normal', 'Good', 'Energized']

async function handleSubmit() {
  saving.value = true
  try {
    const feedback = await readinessService.submitSessionFeedback({
      completion_id: props.completionId,
      session_rpe: form.value.session_rpe,
      soreness_post: form.value.soreness_post,
      energy_post: form.value.energy_post,
      notes: form.value.notes || null,
    })
    emit('submitted', feedback)
  } catch (e) {
    console.error('Error submitting session feedback:', e)
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
    <div class="bg-gradient-to-r from-peak-500 to-peak-700 px-5 py-4 text-white">
      <h3 class="font-bold text-base">Session Feedback</h3>
      <p class="text-peak-100 text-xs mt-0.5">
        {{ workoutName ? `How was "${workoutName}"?` : 'How did that session feel?' }}
      </p>
    </div>

    <form @submit.prevent="handleSubmit" class="p-5 space-y-5">
      <!-- Session RPE -->
      <div class="text-center pb-3 border-b border-gray-100">
        <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Session RPE</div>
        <div :class="['text-4xl font-bold mb-1', rpeColor]">
          {{ form.session_rpe }}
        </div>
        <div :class="['text-sm font-semibold', rpeColor]">{{ rpeLabel }}</div>
        <input
          v-model.number="form.session_rpe"
          type="range"
          min="1"
          max="10"
          class="w-full mt-3 accent-peak-600"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>Very Easy</span>
          <span>Max Effort</span>
        </div>
      </div>

      <!-- Post-session soreness -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-sm font-semibold text-gray-700">Post-Session Soreness</label>
          <span class="text-sm font-bold text-gray-900">
            {{ sorenessLabels[form.soreness_post - 1] || '' }}
          </span>
        </div>
        <input
          v-model.number="form.soreness_post"
          type="range"
          min="1"
          max="5"
          :class="['w-full', getSliderColor(form.soreness_post, true)]"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>None</span>
          <span>Very Sore</span>
        </div>
      </div>

      <!-- Post-session energy -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <label class="text-sm font-semibold text-gray-700">Energy After Session</label>
          <span class="text-sm font-bold text-gray-900">
            {{ energyLabels[form.energy_post - 1] || '' }}
          </span>
        </div>
        <input
          v-model.number="form.energy_post"
          type="range"
          min="1"
          max="5"
          :class="['w-full', getSliderColor(form.energy_post)]"
        />
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>Exhausted</span>
          <span>Energized</span>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <label class="text-sm font-semibold text-gray-700 mb-1 block">Notes (optional)</label>
        <textarea
          v-model="form.notes"
          rows="2"
          class="input resize-none text-sm"
          placeholder="Anything else to note about this session..."
        ></textarea>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          type="button"
          @click="emit('skip')"
          class="btn-secondary flex-1"
        >
          Skip
        </button>
        <button
          type="submit"
          class="btn-primary flex-1"
          :disabled="saving"
        >
          <span v-if="saving" class="flex items-center justify-center gap-2">
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Saving...
          </span>
          <span v-else>Submit Feedback</span>
        </button>
      </div>
    </form>
  </div>
</template>
