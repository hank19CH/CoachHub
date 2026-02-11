<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { checkPersonalBest } from '@/services/assignments'
import type { Exercise } from '@/services/assignments'

const props = defineProps<{
  exercise: Exercise
  athleteId: string
}>()

const emit = defineEmits<{
  (e: 'logged', result: any): void
}>()

// State
const setsCompleted = ref<number | null>(null)
const repsCompleted = ref<string>('')
const weightUsed = ref<number | null>(null)
const durationSeconds = ref<number | null>(null)
const distanceMeters = ref<number | null>(null)
const rpe = ref<number | null>(null)
const notes = ref('')
const isPb = ref(false)
const pbChecking = ref(false)
const isLogged = ref(false)

// Reset when exercise changes
watch(() => props.exercise.id, () => {
  setsCompleted.value = props.exercise.sets || null
  repsCompleted.value = props.exercise.reps || ''
  weightUsed.value = props.exercise.weight_kg || null
  durationSeconds.value = props.exercise.duration_seconds || null
  distanceMeters.value = props.exercise.distance_meters || null
  rpe.value = props.exercise.rpe || null
  notes.value = ''
  isPb.value = false
  isLogged.value = false
}, { immediate: false })

// Initialize with prescribed values
onMounted(() => {
  setsCompleted.value = props.exercise.sets || null
  repsCompleted.value = props.exercise.reps || ''
  weightUsed.value = props.exercise.weight_kg || null
  durationSeconds.value = props.exercise.duration_seconds || null
  distanceMeters.value = props.exercise.distance_meters || null
  rpe.value = props.exercise.rpe || null
})

// Computed
const hasRequiredData = computed(() => {
  return setsCompleted.value !== null ||
         durationSeconds.value !== null ||
         distanceMeters.value !== null
})

// Debounced PB check
let pbTimeout: ReturnType<typeof setTimeout> | null = null
watch([weightUsed, repsCompleted, durationSeconds, distanceMeters], () => {
  if (!hasRequiredData.value) return
  if (pbTimeout) clearTimeout(pbTimeout)

  pbTimeout = setTimeout(async () => {
    pbChecking.value = true
    try {
      if (weightUsed.value && weightUsed.value > 0) {
        isPb.value = await checkPersonalBest(props.athleteId, props.exercise.name, 'weight', weightUsed.value)
        if (isPb.value) { pbChecking.value = false; return }
      }
      if (durationSeconds.value && durationSeconds.value > 0) {
        isPb.value = await checkPersonalBest(props.athleteId, props.exercise.name, 'time', durationSeconds.value)
        if (isPb.value) { pbChecking.value = false; return }
      }
      if (distanceMeters.value && distanceMeters.value > 0) {
        isPb.value = await checkPersonalBest(props.athleteId, props.exercise.name, 'distance', distanceMeters.value)
        if (isPb.value) { pbChecking.value = false; return }
      }
      isPb.value = false
    } finally {
      pbChecking.value = false
    }
  }, 500)
})

// Log exercise
function logExercise() {
  if (!hasRequiredData.value) return

  isLogged.value = true

  emit('logged', {
    exercise_id: props.exercise.id,
    sets_completed: setsCompleted.value,
    reps_completed: repsCompleted.value || null,
    weight_used_kg: weightUsed.value,
    duration_seconds: durationSeconds.value,
    distance_meters: distanceMeters.value,
    rpe: rpe.value,
    is_pb: isPb.value,
    notes: notes.value || null
  })
}

// Time formatting helpers
function formatTime(seconds: number | null): string {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function parseTime(timeStr: string): number | null {
  if (!timeStr) return null
  const parts = timeStr.split(':')
  if (parts.length !== 2) return null
  const mins = parseInt(parts[0] ?? '0') || 0
  const secs = parseInt(parts[1] ?? '0') || 0
  return (mins * 60) + secs
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm p-6">
    <!-- Exercise header -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-2xl font-bold text-gray-900">{{ exercise.name }}</h2>
        <span v-if="isLogged" class="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          Logged
        </span>
      </div>

      <!-- Prescribed values as tags -->
      <div class="flex flex-wrap gap-2 text-sm">
        <span v-if="exercise.sets" class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
          {{ exercise.sets }} sets
        </span>
        <span v-if="exercise.reps" class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
          {{ exercise.reps }} reps
        </span>
        <span v-if="exercise.weight_kg" class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
          {{ exercise.weight_kg }} kg
        </span>
        <span v-if="exercise.duration_seconds" class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
          {{ formatTime(exercise.duration_seconds) }}
        </span>
        <span v-if="exercise.distance_meters" class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
          {{ exercise.distance_meters }}m
        </span>
        <span v-if="exercise.rpe" class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
          RPE {{ exercise.rpe }}
        </span>
        <span v-if="exercise.rest_seconds" class="px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
          {{ exercise.rest_seconds }}s rest
        </span>
      </div>

      <!-- Coach notes -->
      <div v-if="exercise.notes" class="mt-4 p-3 bg-blue-50 rounded-lg">
        <p class="text-sm text-blue-900">
          <strong>Coach's note:</strong> {{ exercise.notes }}
        </p>
      </div>
    </div>

    <!-- Input fields -->
    <div class="space-y-4">
      <!-- Sets -->
      <div v-if="exercise.sets !== null && exercise.sets !== undefined">
        <label class="block text-sm font-medium text-gray-700 mb-1">Sets Completed</label>
        <input
          v-model.number="setsCompleted"
          type="number"
          min="0"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-valencia-500 focus:border-transparent text-lg"
          :placeholder="`Prescribed: ${exercise.sets}`"
        />
      </div>

      <!-- Reps -->
      <div v-if="exercise.reps !== null && exercise.reps !== undefined">
        <label class="block text-sm font-medium text-gray-700 mb-1">Reps Completed</label>
        <input
          v-model="repsCompleted"
          type="text"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-valencia-500 focus:border-transparent text-lg"
          :placeholder="`Prescribed: ${exercise.reps}`"
        />
      </div>

      <!-- Weight -->
      <div v-if="exercise.weight_kg !== null && exercise.weight_kg !== undefined">
        <label class="block text-sm font-medium text-gray-700 mb-1">Weight Used (kg)</label>
        <input
          v-model.number="weightUsed"
          type="number"
          step="0.5"
          min="0"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-valencia-500 focus:border-transparent text-lg"
          :placeholder="`Prescribed: ${exercise.weight_kg} kg`"
        />
      </div>

      <!-- Duration -->
      <div v-if="exercise.duration_seconds !== null && exercise.duration_seconds !== undefined">
        <label class="block text-sm font-medium text-gray-700 mb-1">Duration (MM:SS)</label>
        <input
          :value="formatTime(durationSeconds)"
          @input="durationSeconds = parseTime(($event.target as HTMLInputElement).value)"
          type="text"
          placeholder="00:00"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-valencia-500 focus:border-transparent text-lg"
        />
      </div>

      <!-- Distance -->
      <div v-if="exercise.distance_meters !== null && exercise.distance_meters !== undefined">
        <label class="block text-sm font-medium text-gray-700 mb-1">Distance (meters)</label>
        <input
          v-model.number="distanceMeters"
          type="number"
          min="0"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-valencia-500 focus:border-transparent text-lg"
          :placeholder="`Prescribed: ${exercise.distance_meters}m`"
        />
      </div>

      <!-- RPE -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">
          RPE (Rate of Perceived Exertion)
          <span class="text-gray-400 font-normal">- Optional</span>
        </label>
        <div class="grid grid-cols-10 gap-1">
          <button
            v-for="n in 10"
            :key="n"
            @click="rpe = rpe === n ? null : n"
            class="py-2 rounded-lg font-medium text-sm transition-colors"
            :class="rpe === n
              ? 'bg-valencia-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            "
          >
            {{ n }}
          </button>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Notes
          <span class="text-gray-400 font-normal">- Optional</span>
        </label>
        <textarea
          v-model="notes"
          rows="2"
          placeholder="How did this feel?"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-valencia-500 focus:border-transparent"
        />
      </div>
    </div>

    <!-- PB Badge -->
    <div v-if="isPb && !pbChecking" class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
      <svg class="w-6 h-6 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <div>
        <p class="font-semibold text-amber-900">Personal Best!</p>
        <p class="text-sm text-amber-700">You're crushing it!</p>
      </div>
    </div>

    <!-- Log button -->
    <button
      @click="logExercise"
      :disabled="!hasRequiredData"
      class="mt-6 w-full py-3 px-6 rounded-lg font-medium transition-colors"
      :class="[
        hasRequiredData
          ? isLogged
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-summit-600 text-white hover:bg-summit-700'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
      ]"
    >
      {{ isLogged ? 'Update Log' : 'Log Exercise' }}
    </button>
  </div>
</template>
