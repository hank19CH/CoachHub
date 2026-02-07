<script setup lang="ts">
import type { Assignment } from '@/services/assignments'
import { computed } from 'vue'

const props = defineProps<{
  assignment: Assignment
}>()

const emit = defineEmits<{
  'view-details': []
  'start-workout': []
}>()

const statusConfig = computed(() => {
  switch (props.assignment.status) {
    case 'completed':
      return { text: 'Completed', class: 'bg-green-100 text-green-800' }
    case 'skipped':
      return { text: 'Skipped', class: 'bg-gray-100 text-gray-800' }
    default:
      return { text: 'Pending', class: 'bg-blue-100 text-blue-800' }
  }
})

const exerciseCount = computed(() => {
  return props.assignment.exercises?.length || 0
})

const exercisePreview = computed(() => {
  return props.assignment.exercises?.slice(0, 3) || []
})

const hasMoreExercises = computed(() => {
  return exerciseCount.value > 3
})

function formatExerciseDetails(exercise: any): string {
  const parts = []
  if (exercise.sets) parts.push(`${exercise.sets} sets`)
  if (exercise.reps) parts.push(`${exercise.reps} reps`)
  if (exercise.weight_kg) parts.push(`${exercise.weight_kg}kg`)
  if (exercise.duration_seconds) {
    const mins = Math.floor(exercise.duration_seconds / 60)
    parts.push(`${mins} min`)
  }
  return parts.join(' \u00d7 ') || 'Details in workout'
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
    <!-- Header: Coach + Status -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3">
        <img
          v-if="assignment.coach?.avatar_url"
          :src="assignment.coach.avatar_url"
          :alt="assignment.coach.display_name"
          class="w-10 h-10 rounded-full object-cover"
        />
        <div
          v-else
          class="w-10 h-10 rounded-full bg-summit-100 flex items-center justify-center"
        >
          <span class="text-summit-600 font-semibold text-sm">
            {{ assignment.coach?.display_name?.charAt(0) || '?' }}
          </span>
        </div>
        <div>
          <p class="text-sm font-medium text-gray-900">
            {{ assignment.coach?.display_name || 'Coach' }}
          </p>
          <p class="text-xs text-gray-500">@{{ assignment.coach?.username || 'unknown' }}</p>
        </div>
      </div>
      <span
        :class="statusConfig.class"
        class="px-3 py-1 rounded-full text-xs font-semibold"
      >
        {{ statusConfig.text }}
      </span>
    </div>

    <!-- Workout Name -->
    <h3 class="text-xl font-bold text-gray-900 mb-2">
      {{ assignment.workout?.name || 'Unnamed Workout' }}
    </h3>

    <!-- Description -->
    <p v-if="assignment.workout?.description" class="text-sm text-gray-600 mb-4 line-clamp-2">
      {{ assignment.workout.description }}
    </p>

    <!-- Meta Info -->
    <div class="flex items-center gap-4 text-sm text-gray-600 mb-4">
      <span v-if="assignment.workout?.estimated_duration_min" class="flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ assignment.workout.estimated_duration_min }} min
      </span>
      <span v-if="assignment.workout?.workout_type" class="flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        {{ assignment.workout.workout_type }}
      </span>
      <span class="flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {{ exerciseCount }} exercises
      </span>
    </div>

    <!-- Coach Notes -->
    <div v-if="assignment.notes" class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
      <p class="text-sm text-blue-900">
        <span class="font-semibold">Coach's Note:</span> {{ assignment.notes }}
      </p>
    </div>

    <!-- Exercise Preview -->
    <div v-if="exercisePreview.length > 0" class="space-y-2 mb-4">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exercise Preview</p>
      <div
        v-for="(exercise, index) in exercisePreview"
        :key="exercise.id"
        class="flex items-start gap-2 text-sm"
      >
        <span class="flex-shrink-0 w-5 h-5 rounded-full bg-summit-100 text-summit-600 text-xs font-semibold flex items-center justify-center">
          {{ index + 1 }}
        </span>
        <div class="flex-1">
          <p class="font-medium text-gray-900">{{ exercise.name }}</p>
          <p class="text-xs text-gray-600">{{ formatExerciseDetails(exercise) }}</p>
        </div>
      </div>
      <p v-if="hasMoreExercises" class="text-xs text-gray-500 italic">
        + {{ exerciseCount - 3 }} more exercises
      </p>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 mt-4">
      <button
        @click="emit('view-details')"
        class="flex-1 px-4 py-2 border border-summit-600 text-summit-600 rounded-lg font-medium hover:bg-summit-50 transition-colors"
      >
        View Details
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
</template>
