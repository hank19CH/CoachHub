<script setup lang="ts">
import type { Database } from '@/types/database'

type ExerciseLibraryItem = Database['public']['Tables']['exercise_library']['Row']

const props = defineProps<{
  exercise: ExerciseLibraryItem
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', exercise: ExerciseLibraryItem): void
}>()

function getCategoryStyle(category: string | null) {
  const styles: Record<string, string> = {
    primary: 'bg-purple-100 text-purple-700',
    accessory: 'bg-blue-100 text-blue-700',
    warmup: 'bg-emerald-100 text-emerald-700',
    cooldown: 'bg-teal-100 text-teal-700',
    drill: 'bg-orange-100 text-orange-700',
    plyometric: 'bg-red-100 text-red-700',
  }
  return styles[category || ''] || 'bg-gray-100 text-gray-600'
}

function getPatternIcon(pattern: string | null): string {
  const icons: Record<string, string> = {
    squat: '🦵',
    hinge: '🔄',
    push: '💪',
    pull: '🏋️',
    carry: '🎒',
    locomotion: '🏃',
    rotation: '🌀',
    skill: '🎯',
  }
  return icons[pattern || ''] || '🏋️'
}
</script>

<template>
  <div
    @click="selectable ? emit('select', exercise) : undefined"
    :class="[
      'rounded-xl border p-3.5 transition-all',
      selectable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : '',
      selected
        ? 'border-summit-600 bg-summit-50 ring-1 ring-summit-600'
        : 'border-gray-200 bg-white hover:border-gray-300'
    ]"
  >
    <div class="flex items-start gap-3">
      <!-- Pattern icon -->
      <div class="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-lg flex-shrink-0">
        {{ getPatternIcon(exercise.movement_pattern) }}
      </div>

      <div class="flex-1 min-w-0">
        <!-- Name + category -->
        <div class="flex items-center gap-2 mb-1">
          <h4 class="font-semibold text-gray-900 text-sm truncate">{{ exercise.name }}</h4>
          <span
            v-if="exercise.category"
            :class="['text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0', getCategoryStyle(exercise.category)]"
          >
            {{ exercise.category }}
          </span>
        </div>

        <!-- Movement pattern -->
        <div class="text-xs text-gray-500 mb-1.5">
          <span v-if="exercise.movement_pattern" class="capitalize">{{ exercise.movement_pattern }}</span>
          <span v-if="exercise.coach_id" class="ml-2 text-summit-600">Custom</span>
        </div>

        <!-- Equipment tags -->
        <div v-if="exercise.equipment && exercise.equipment.length > 0" class="flex flex-wrap gap-1 mb-1.5">
          <span
            v-for="eq in exercise.equipment.slice(0, 4)"
            :key="eq"
            class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
          >
            {{ eq }}
          </span>
          <span v-if="exercise.equipment.length > 4" class="text-[10px] text-gray-400">
            +{{ exercise.equipment.length - 4 }}
          </span>
        </div>

        <!-- Muscle groups -->
        <div v-if="exercise.muscle_groups && exercise.muscle_groups.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="mg in exercise.muscle_groups.slice(0, 3)"
            :key="mg"
            class="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600"
          >
            {{ mg }}
          </span>
          <span v-if="exercise.muscle_groups.length > 3" class="text-[10px] text-gray-400">
            +{{ exercise.muscle_groups.length - 3 }}
          </span>
        </div>

        <!-- Cues preview -->
        <p v-if="exercise.cues" class="text-xs text-gray-400 mt-1.5 truncate">
          {{ exercise.cues }}
        </p>
      </div>

      <!-- Video indicator -->
      <div v-if="exercise.video_url" class="flex-shrink-0 mt-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <!-- Select indicator -->
      <div v-if="selectable" class="flex-shrink-0 mt-1">
        <div :class="[
          'w-5 h-5 rounded-full border-2 flex items-center justify-center',
          selected ? 'border-summit-600 bg-summit-600' : 'border-gray-300'
        ]">
          <svg v-if="selected" xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
