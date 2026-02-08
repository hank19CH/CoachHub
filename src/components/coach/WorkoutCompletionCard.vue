<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import FeedbackModal from './FeedbackModal.vue'

const props = defineProps<{
  completion: any
}>()

const emit = defineEmits<{
  'feedback-added': []
}>()

const showFeedbackModal = ref(false)

const workoutName = computed(() => {
  return props.completion.assignment?.workout?.name || 'Workout'
})

const athleteName = computed(() => {
  return props.completion.athlete?.display_name || 'Unknown Athlete'
})

const relativeTime = computed(() => {
  return formatDistanceToNow(new Date(props.completion.completed_at), {
    addSuffix: true
  })
})

const exerciseCount = computed(() => {
  return props.completion.exercise_results?.length || 0
})

const pbCount = computed(() => {
  return props.completion.exercise_results?.filter((e: any) => e.is_pb).length || 0
})

function handleFeedbackAdded() {
  showFeedbackModal.value = false
  emit('feedback-added')
}
</script>

<template>
  <div class="card p-4 space-y-4">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-3">
        <img
          :src="completion.athlete?.avatar_url || '/default-avatar.png'"
          :alt="athleteName"
          class="avatar-md ring-2 ring-white shadow-sm"
        />
        <div>
          <h3 class="font-semibold text-gray-900">{{ athleteName }}</h3>
          <p class="text-sm text-gray-600">{{ workoutName }}</p>
        </div>
      </div>
      <span class="text-xs text-gray-500 whitespace-nowrap ml-2">{{ relativeTime }}</span>
    </div>

    <!-- Metrics -->
    <div class="flex gap-4 flex-wrap">
      <div v-if="completion.duration_minutes" class="flex flex-col">
        <span class="text-xs text-gray-500 uppercase">Duration</span>
        <span class="text-sm font-semibold text-gray-900">{{ completion.duration_minutes }} min</span>
      </div>
      <div class="flex flex-col">
        <span class="text-xs text-gray-500 uppercase">Exercises</span>
        <span class="text-sm font-semibold text-gray-900">{{ exerciseCount }}</span>
      </div>
      <div v-if="pbCount > 0" class="flex flex-col">
        <span class="text-xs text-gray-500 uppercase">PRs</span>
        <span class="text-sm font-semibold text-peak-600">🏆 {{ pbCount }}</span>
      </div>
      <div v-if="completion.overall_rpe" class="flex flex-col">
        <span class="text-xs text-gray-500 uppercase">RPE</span>
        <span class="text-sm font-semibold text-gray-900">{{ completion.overall_rpe }}/10</span>
      </div>
    </div>

    <!-- Existing Feedback -->
    <div v-if="completion.coach_feedback" class="bg-summit-50 rounded-xl p-3">
      <div class="flex items-start gap-2">
        <span class="text-summit-700 text-sm">💬</span>
        <div class="flex-1">
          <p class="text-sm text-gray-700">{{ completion.coach_feedback }}</p>
          <p v-if="completion.feedback_at" class="text-xs text-gray-500 mt-1">
            {{ formatDistanceToNow(new Date(completion.feedback_at), { addSuffix: true }) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2 pt-2 border-t border-gray-100">
      <router-link
        :to="`/coach/athletes/${completion.athlete_id}`"
        class="btn-secondary btn-sm flex-1 text-center"
      >
        View Details
      </router-link>
      <button
        @click="showFeedbackModal = true"
        class="btn-primary btn-sm flex-1"
      >
        {{ completion.coach_feedback ? 'Edit Feedback' : 'Add Feedback' }}
      </button>
    </div>

    <!-- Feedback Modal -->
    <FeedbackModal
      v-if="showFeedbackModal"
      :completion="completion"
      @close="showFeedbackModal = false"
      @feedback-added="handleFeedbackAdded"
    />
  </div>
</template>
