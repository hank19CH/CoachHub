<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { Assignment } from '@/services/assignments'

const props = defineProps<{
  isOpen: boolean
  assignment: Assignment | null
}>()

const emit = defineEmits<{
  close: []
  'start-workout': []
}>()

function formatExerciseDetails(exercise: any): string {
  const parts = []
  if (exercise.sets && exercise.reps) {
    parts.push(`${exercise.sets} sets \u00d7 ${exercise.reps} reps`)
  } else if (exercise.sets) {
    parts.push(`${exercise.sets} sets`)
  } else if (exercise.reps) {
    parts.push(`${exercise.reps} reps`)
  }

  if (exercise.weight_kg) parts.push(`${exercise.weight_kg}kg`)
  if (exercise.duration_seconds) {
    const mins = Math.floor(exercise.duration_seconds / 60)
    const secs = exercise.duration_seconds % 60
    parts.push(secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins} min`)
  }
  if (exercise.distance_meters) {
    parts.push(
      exercise.distance_meters >= 1000
        ? `${(exercise.distance_meters / 1000).toFixed(1)}km`
        : `${exercise.distance_meters}m`
    )
  }
  if (exercise.rpe) parts.push(`RPE ${exercise.rpe}`)
  if (exercise.rest_seconds) parts.push(`Rest: ${exercise.rest_seconds}s`)

  return parts.join(' \u2022 ')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen && assignment"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="emit('close')"></div>

        <!-- Modal -->
        <div class="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="px-6 py-5 border-b border-gray-200 flex items-start justify-between">
            <div class="flex-1 pr-4">
              <h2 class="text-2xl font-bold text-gray-900 mb-2">
                {{ assignment.workout?.name || 'Workout Details' }}
              </h2>
              <div class="flex items-center gap-2">
                <img
                  v-if="assignment.coach?.avatar_url"
                  :src="assignment.coach.avatar_url"
                  :alt="assignment.coach.display_name"
                  class="w-6 h-6 rounded-full object-cover"
                />
                <span class="text-sm text-gray-600">
                  {{ assignment.coach?.display_name || 'Coach' }}
                </span>
              </div>
            </div>
            <button
              @click="emit('close')"
              class="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-6 py-5">
            <!-- Meta Info -->
            <div class="flex flex-wrap gap-4 text-sm text-gray-600 mb-5">
              <span v-if="assignment.workout?.estimated_duration_min" class="flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ assignment.workout.estimated_duration_min }} min
              </span>
              <span v-if="assignment.workout?.workout_type">
                <span class="text-summit-600 font-semibold">{{ assignment.workout.workout_type }}</span>
              </span>
              <span class="flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {{ assignment.exercises?.length || 0 }} exercises
              </span>
            </div>

            <!-- Description -->
            <div v-if="assignment.workout?.description" class="mb-5">
              <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Description</h3>
              <p class="text-gray-700 leading-relaxed">{{ assignment.workout.description }}</p>
            </div>

            <!-- Coach Notes -->
            <div v-if="assignment.notes" class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
              <h3 class="text-sm font-semibold text-blue-900 mb-1">Coach's Note</h3>
              <p class="text-sm text-blue-900">{{ assignment.notes }}</p>
            </div>

            <!-- Exercises -->
            <div>
              <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Exercises ({{ assignment.exercises?.length || 0 }})
              </h3>
              <div class="space-y-4">
                <div
                  v-for="(exercise, index) in assignment.exercises"
                  :key="exercise.id"
                  class="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-8 h-8 rounded-full bg-summit-600 text-white text-sm font-bold flex items-center justify-center">
                      {{ index + 1 }}
                    </span>
                    <div class="flex-1">
                      <h4 class="font-semibold text-gray-900 mb-1">{{ exercise.name }}</h4>
                      <p class="text-sm text-gray-600 mb-2">{{ formatExerciseDetails(exercise) }}</p>
                      <p v-if="exercise.notes" class="text-xs text-gray-500 italic">
                        Note: {{ exercise.notes }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-200 flex gap-3">
            <button
              @click="emit('close')"
              class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              v-if="assignment.status === 'pending'"
              @click="emit('start-workout')"
              class="flex-1 px-4 py-2 bg-summit-600 text-white rounded-lg font-medium hover:bg-summit-700 transition-colors"
            >
              Start Workout
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
