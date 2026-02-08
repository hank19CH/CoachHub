<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { addWorkoutFeedback } from '@/services/coaching'

const props = defineProps<{
  completion: {
    id: string
    coach_feedback: string | null
    athlete?: { display_name: string } | null
    assignment?: { workout?: { name: string } | null } | null
  }
}>()

const emit = defineEmits<{
  close: []
  'feedback-added': []
}>()

const authStore = useAuthStore()
const feedback = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const MAX_LENGTH = 500

onMounted(() => {
  if (props.completion.coach_feedback) {
    feedback.value = props.completion.coach_feedback
  }
})

async function saveFeedback() {
  if (!feedback.value.trim()) {
    error.value = 'Feedback cannot be empty'
    return
  }

  saving.value = true
  error.value = null

  try {
    await addWorkoutFeedback(
      props.completion.id,
      feedback.value.trim(),
      authStore.user!.id
    )
    emit('feedback-added')
  } catch (err: any) {
    console.error('Error saving feedback:', err)
    error.value = err.message || 'Failed to save feedback'
  } finally {
    saving.value = false
  }
}

function handleClose() {
  if (!saving.value) {
    emit('close')
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click="handleClose">
    <div class="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" @click.stop>
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-200">
        <h2 class="text-xl font-bold text-gray-900">Provide Feedback</h2>
        <button
          @click="handleClose"
          class="text-gray-400 hover:text-gray-600"
          :disabled="saving"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Workout Info -->
      <div class="px-6 py-4 bg-gray-50 space-y-1">
        <p class="text-sm text-gray-600">
          <span class="font-semibold">Workout:</span>
          {{ completion.assignment?.workout?.name || 'Workout' }}
        </p>
        <p class="text-sm text-gray-600">
          <span class="font-semibold">Athlete:</span>
          {{ completion.athlete?.display_name || 'Athlete' }}
        </p>
      </div>

      <!-- Feedback Textarea -->
      <div class="p-6">
        <textarea
          v-model="feedback"
          :maxlength="MAX_LENGTH"
          rows="6"
          placeholder="Great work today! Here's what I noticed..."
          class="input resize-none"
          :disabled="saving"
        />
        <div class="text-right text-sm text-gray-500 mt-1">
          {{ feedback.length }} / {{ MAX_LENGTH }}
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
        {{ error }}
      </div>

      <!-- Actions -->
      <div class="flex gap-3 p-6 border-t border-gray-200">
        <button
          @click="handleClose"
          class="btn-secondary flex-1"
          :disabled="saving"
        >
          Cancel
        </button>
        <button
          @click="saveFeedback"
          class="btn-primary flex-1"
          :disabled="saving || !feedback.trim()"
        >
          {{ saving ? 'Saving...' : (completion.coach_feedback ? 'Update' : 'Save') + ' Feedback' }}
        </button>
      </div>
    </div>
  </div>
</template>
