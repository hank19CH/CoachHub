<script setup lang="ts">
defineProps<{
  workoutName: string
  durationMinutes: number
  exercisesCompleted: number
  hasPbs: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'share'): void
}>()
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl p-8 max-w-md w-full text-center">
      <!-- Success icon -->
      <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg class="w-10 h-10 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
      </div>

      <!-- Title -->
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Workout Complete!</h2>
      <p class="text-gray-600 mb-6">Great job crushing that session</p>

      <!-- Stats -->
      <div class="bg-gray-50 rounded-xl p-6 mb-6 space-y-3">
        <div class="flex justify-between">
          <span class="text-gray-600">Workout</span>
          <span class="font-semibold text-gray-900">{{ workoutName }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Duration</span>
          <span class="font-semibold text-gray-900">{{ durationMinutes }} minutes</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">Exercises</span>
          <span class="font-semibold text-gray-900">{{ exercisesCompleted }}</span>
        </div>
      </div>

      <!-- PB badge -->
      <div v-if="hasPbs" class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div class="flex items-center justify-center gap-2 mb-1">
          <svg class="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span class="font-bold text-amber-900">New Personal Best!</span>
        </div>
        <p class="text-sm text-amber-700">You set a new PR today!</p>
      </div>

      <!-- Actions -->
      <div class="space-y-3">
        <button
          @click="emit('share')"
          class="w-full py-3 px-6 bg-summit-600 text-white rounded-lg hover:bg-summit-700 font-medium flex items-center justify-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share Workout
        </button>
        <button
          @click="emit('close')"
          class="w-full py-3 px-6 bg-white text-gray-700 rounded-lg hover:bg-gray-50 font-medium border border-gray-300"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  </div>
</template>
