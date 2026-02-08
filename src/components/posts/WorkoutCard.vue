<script setup lang="ts">
import { computed } from 'vue'

export interface WorkoutCardExercise {
  name: string
  sets?: number | null
  reps?: string | null
  weight?: number | null
  duration?: number | null
  distance?: number | null
  isPb: boolean
}

const props = defineProps<{
  workoutName: string
  duration: number | null // minutes
  completedAt?: string
  exercises: WorkoutCardExercise[]
  shareSettings: {
    show_duration: boolean
    show_rpe: boolean
    show_workout_name: boolean
    show_exercise_details: boolean
    highlight_pbs_only: boolean
  }
  overallRpe?: number | null
  pbCount: number
}>()

const visibleExercises = computed(() => {
  if (props.shareSettings.highlight_pbs_only) {
    return props.exercises.filter((e) => e.isPb)
  }
  return props.exercises
})

const formattedDate = computed(() => {
  if (!props.completedAt) return ''
  return new Date(props.completedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
})

function formatExerciseDetail(ex: WorkoutCardExercise): string {
  const parts: string[] = []
  if (ex.sets) parts.push(`${ex.sets}`)
  if (ex.reps) parts.push(`x ${ex.reps}`)
  if (ex.weight) parts.push(`@ ${ex.weight}kg`)
  if (ex.duration) {
    const mins = Math.floor(ex.duration / 60)
    const secs = ex.duration % 60
    parts.push(mins > 0 ? `${mins}m${secs > 0 ? ` ${secs}s` : ''}` : `${secs}s`)
  }
  if (ex.distance) {
    parts.push(ex.distance >= 1000 ? `${(ex.distance / 1000).toFixed(1)}km` : `${ex.distance}m`)
  }
  return parts.join(' ')
}
</script>

<template>
  <div class="w-full h-full bg-gradient-to-br from-violet-700 via-purple-700 to-summit-800 flex flex-col justify-between p-6 text-white">
    <!-- Header -->
    <div>
      <!-- Logo -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span class="font-bold text-sm tracking-wide opacity-80">CoachHub</span>
        </div>
        <span v-if="formattedDate" class="text-xs opacity-60">{{ formattedDate }}</span>
      </div>

      <!-- Workout name -->
      <h2
        v-if="shareSettings.show_workout_name"
        class="font-bold text-2xl leading-tight mb-1"
      >
        {{ workoutName }}
      </h2>

      <!-- Duration -->
      <p
        v-if="shareSettings.show_duration && duration"
        class="text-white/70 text-sm"
      >
        {{ duration }} minutes
      </p>
    </div>

    <!-- Exercises -->
    <div
      v-if="shareSettings.show_exercise_details && visibleExercises.length > 0"
      class="flex-1 my-4 space-y-2 overflow-hidden"
    >
      <div
        v-for="(ex, i) in visibleExercises.slice(0, 6)"
        :key="i"
        class="flex items-center gap-2"
      >
        <div class="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
          :class="ex.isPb ? 'bg-amber-400 text-amber-900' : 'bg-white/20'"
        >
          <svg v-if="ex.isPb" class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="font-medium text-sm truncate">{{ ex.name }}</span>
            <span v-if="ex.isPb" class="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex-shrink-0">PR!</span>
          </div>
          <p class="text-xs text-white/60">{{ formatExerciseDetail(ex) }}</p>
        </div>
      </div>

      <!-- More exercises indicator -->
      <p
        v-if="visibleExercises.length > 6"
        class="text-xs text-white/50 pl-7"
      >
        +{{ visibleExercises.length - 6 }} more exercises
      </p>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between">
      <!-- PB count -->
      <div v-if="pbCount > 0" class="flex items-center gap-1.5">
        <div class="px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          {{ pbCount }} PR{{ pbCount !== 1 ? 's' : '' }}
        </div>
      </div>
      <div v-else></div>

      <!-- RPE -->
      <div
        v-if="shareSettings.show_rpe && overallRpe"
        class="text-xs text-white/60"
      >
        RPE {{ overallRpe }}/10
      </div>
    </div>
  </div>
</template>
