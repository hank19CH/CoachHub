<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { completeWorkout } from '@/services/assignments'
import { assignmentsService } from '@/services/assignments'
import type { Assignment, Exercise, ExerciseResultData } from '@/services/assignments'
import ExerciseLogger from '@/components/athlete/ExerciseLogger.vue'
import RestTimer from '@/components/athlete/RestTimer.vue'
import WorkoutCompleteModal from '@/components/athlete/WorkoutCompleteModal.vue'

// Router & auth
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// State
const assignmentId = route.params.id as string
const assignment = ref<Assignment | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const currentExerciseIndex = ref(0)
const exerciseResults = ref<(ExerciseResultData | null)[]>([])
const startTime = ref<Date | null>(null)
const showRestTimer = ref(false)
const restDuration = ref(0)
const showCompleteModal = ref(false)
const completionId = ref<string | null>(null)
const isSubmitting = ref(false)

// Computed
const exercises = computed<Exercise[]>(() => {
  return assignment.value?.exercises || []
})

const currentExercise = computed<Exercise | null>(() => {
  if (exercises.value.length === 0) return null
  return exercises.value[currentExerciseIndex.value] || null
})

const progress = computed(() => {
  if (exercises.value.length === 0) return 0
  // Progress based on logged exercises
  const logged = exerciseResults.value.filter(r => r !== null).length
  return Math.round((logged / exercises.value.length) * 100)
})

const isLastExercise = computed(() => {
  return currentExerciseIndex.value === exercises.value.length - 1
})

const canGoNext = computed(() => {
  return exerciseResults.value[currentExerciseIndex.value] !== null
})

const totalLogged = computed(() => {
  return exerciseResults.value.filter(r => r !== null).length
})

const elapsedMinutes = computed(() => {
  if (!startTime.value) return 0
  return Math.round((Date.now() - startTime.value.getTime()) / 1000 / 60)
})

// Load assignment data
onMounted(async () => {
  if (!authStore.user?.id) {
    router.push('/login')
    return
  }

  try {
    // Fetch today's assignments and find the matching one
    const today = new Date().toISOString().split('T')[0]
    const assignments = await assignmentsService.fetchAssignmentsForDate(authStore.user.id, today)

    const found = assignments.find((a: Assignment) => a.id === assignmentId)
    if (!found) {
      // Also check yesterday and tomorrow in case of timezone edge cases
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const [yesterdayAssignments, tomorrowAssignments] = await Promise.all([
        assignmentsService.fetchAssignmentsForDate(authStore.user.id, yesterday.toISOString().split('T')[0]),
        assignmentsService.fetchAssignmentsForDate(authStore.user.id, tomorrow.toISOString().split('T')[0])
      ])

      const foundAlt = [...yesterdayAssignments, ...tomorrowAssignments]
        .find((a: Assignment) => a.id === assignmentId)

      if (!foundAlt) {
        error.value = 'Workout assignment not found'
        return
      }
      assignment.value = foundAlt
    } else {
      assignment.value = found
    }

    // Initialize results array
    exerciseResults.value = new Array(assignment.value.exercises?.length || 0).fill(null)
    startTime.value = new Date()
  } catch (err: any) {
    error.value = err.message || 'Failed to load workout'
  } finally {
    loading.value = false
  }
})

// Handle exercise logged
function handleExerciseLogged(result: ExerciseResultData) {
  exerciseResults.value[currentExerciseIndex.value] = result
}

// Navigate to next exercise
function goToNextExercise() {
  if (!canGoNext.value) return

  // Show rest timer if current exercise has a rest period and it's not the last exercise
  if (currentExercise.value?.rest_seconds && !isLastExercise.value) {
    restDuration.value = currentExercise.value.rest_seconds
    showRestTimer.value = true
  } else if (isLastExercise.value) {
    finishWorkout()
  } else {
    currentExerciseIndex.value++
  }
}

// Rest timer complete
function handleRestComplete() {
  showRestTimer.value = false
  if (isLastExercise.value) {
    finishWorkout()
  } else {
    currentExerciseIndex.value++
  }
}

// Skip rest
function skipRest() {
  showRestTimer.value = false
  if (isLastExercise.value) {
    finishWorkout()
  } else {
    currentExerciseIndex.value++
  }
}

// Go to previous exercise
function goToPreviousExercise() {
  if (currentExerciseIndex.value > 0) {
    currentExerciseIndex.value--
  }
}

// Jump to specific exercise
function jumpToExercise(index: number) {
  currentExerciseIndex.value = index
}

// Finish workout
async function finishWorkout() {
  if (!authStore.user?.id || !startTime.value || isSubmitting.value) return

  isSubmitting.value = true
  const duration = Math.round((Date.now() - startTime.value.getTime()) / 1000 / 60)

  try {
    const validResults = exerciseResults.value.filter((r): r is ExerciseResultData => r !== null)

    const result = await completeWorkout(
      assignmentId,
      authStore.user.id,
      {
        durationMinutes: duration,
        athleteNotes: null,
        overallRpe: null,
        exerciseResults: validResults
      }
    )

    if (result.success) {
      completionId.value = result.completionId || null
      showCompleteModal.value = true
    } else {
      error.value = result.error || 'Failed to complete workout'
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    isSubmitting.value = false
  }
}

// Exit workout
function exitWorkout() {
  if (totalLogged.value > 0) {
    if (!confirm('Are you sure you want to exit? Your logged exercises will not be saved.')) {
      return
    }
  }
  router.push('/athlete/dashboard')
}

// Handle modal close
function handleModalClose() {
  showCompleteModal.value = false
  router.push('/athlete/dashboard')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Sticky header -->
    <div class="bg-white border-b sticky top-0 z-10">
      <div class="max-w-4xl mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <!-- Exit button -->
          <button
            @click="exitWorkout"
            class="p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Workout title -->
          <div class="text-center flex-1 min-w-0 px-4">
            <h1 class="font-semibold text-lg truncate">{{ assignment?.workout?.name || 'Workout' }}</h1>
            <p class="text-sm text-gray-500">
              Exercise {{ currentExerciseIndex + 1 }} of {{ exercises.length }}
            </p>
          </div>

          <!-- Timer display -->
          <div class="text-right text-sm text-gray-500">
            {{ elapsedMinutes }}m
          </div>
        </div>

        <!-- Progress bar -->
        <div class="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            class="bg-valencia-500 h-full transition-all duration-500 ease-out"
            :style="{ width: `${progress}%` }"
          />
        </div>

        <!-- Exercise dots navigation -->
        <div v-if="exercises.length > 1" class="mt-3 flex justify-center gap-2 overflow-x-auto pb-1">
          <button
            v-for="(ex, i) in exercises"
            :key="ex.id"
            @click="jumpToExercise(i)"
            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors flex-shrink-0"
            :class="[
              i === currentExerciseIndex
                ? 'bg-valencia-500 text-white'
                : exerciseResults[i] !== null
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            ]"
          >
            {{ i + 1 }}
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-summit-600"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-4xl mx-auto px-4 py-8">
      <div class="bg-red-50 text-red-800 rounded-lg p-4 mb-4">
        <p class="font-medium">Something went wrong</p>
        <p class="text-sm mt-1">{{ error }}</p>
      </div>
      <button
        @click="router.push('/athlete/dashboard')"
        class="text-summit-600 hover:underline font-medium"
      >
        Back to Dashboard
      </button>
    </div>

    <!-- Workout content -->
    <div v-else class="max-w-4xl mx-auto px-4 py-6 pb-32">
      <!-- Current exercise logger -->
      <ExerciseLogger
        v-if="currentExercise"
        :key="currentExercise.id"
        :exercise="currentExercise"
        :athlete-id="authStore.user?.id || ''"
        @logged="handleExerciseLogged"
      />

      <!-- Navigation buttons -->
      <div class="mt-6 flex gap-3">
        <!-- Previous button -->
        <button
          v-if="currentExerciseIndex > 0"
          @click="goToPreviousExercise"
          class="flex-1 py-3 px-6 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
        >
          Previous
        </button>

        <!-- Next/Finish button -->
        <button
          @click="goToNextExercise"
          :disabled="!canGoNext || isSubmitting"
          class="flex-1 py-3 px-6 rounded-lg font-medium transition-colors"
          :class="[
            canGoNext && !isSubmitting
              ? isLastExercise
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-valencia-500 text-white hover:bg-valencia-600'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          ]"
        >
          <span v-if="isSubmitting" class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving...
          </span>
          <span v-else>
            {{ isLastExercise ? 'Finish Workout' : 'Next Exercise' }}
          </span>
        </button>
      </div>

      <!-- Summary strip -->
      <div class="mt-6 bg-white rounded-lg p-4 flex items-center justify-between text-sm text-gray-600">
        <span>{{ totalLogged }} of {{ exercises.length }} exercises logged</span>
        <span>{{ elapsedMinutes }} min elapsed</span>
      </div>
    </div>

    <!-- Rest timer modal -->
    <RestTimer
      v-if="showRestTimer"
      :duration="restDuration"
      @complete="handleRestComplete"
      @skip="skipRest"
    />

    <!-- Completion modal -->
    <WorkoutCompleteModal
      v-if="showCompleteModal"
      :workout-name="assignment?.workout?.name || 'Workout'"
      :duration-minutes="elapsedMinutes"
      :exercises-completed="totalLogged"
      :has-pbs="exerciseResults.some(r => r?.is_pb)"
      @close="handleModalClose"
    />
  </div>
</template>
