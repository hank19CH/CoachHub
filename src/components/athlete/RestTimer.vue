<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  duration: number // seconds
}>()

const emit = defineEmits<{
  (e: 'complete'): void
  (e: 'skip'): void
}>()

const remainingSeconds = ref(props.duration)
const isPaused = ref(false)
let intervalId: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  intervalId = setInterval(() => {
    if (!isPaused.value && remainingSeconds.value > 0) {
      remainingSeconds.value--
      if (remainingSeconds.value === 0) {
        if (intervalId) clearInterval(intervalId)
        emit('complete')
      }
    }
  }, 1000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

function togglePause() {
  isPaused.value = !isPaused.value
}

function skip() {
  if (intervalId) clearInterval(intervalId)
  emit('skip')
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl p-8 max-w-sm w-full text-center">
      <!-- Title -->
      <h3 class="text-xl font-bold text-gray-900 mb-6">Rest Time</h3>

      <!-- Circular timer -->
      <div class="relative w-48 h-48 mx-auto mb-6">
        <svg class="w-full h-full transform -rotate-90">
          <circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke="#E5E7EB"
            stroke-width="12"
          />
          <circle
            cx="96"
            cy="96"
            r="88"
            fill="none"
            stroke="#F97316"
            stroke-width="12"
            stroke-linecap="round"
            :stroke-dasharray="`${2 * Math.PI * 88}`"
            :stroke-dashoffset="`${2 * Math.PI * 88 * (1 - remainingSeconds / duration)}`"
            class="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-5xl font-bold text-gray-900">
            {{ formatTime(remainingSeconds) }}
          </span>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex gap-3">
        <button
          @click="togglePause"
          class="flex-1 py-3 px-6 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
        >
          {{ isPaused ? 'Resume' : 'Pause' }}
        </button>
        <button
          @click="skip"
          class="flex-1 py-3 px-6 bg-valencia-500 text-white rounded-lg hover:bg-valencia-600 font-medium"
        >
          Skip Rest
        </button>
      </div>
    </div>
  </div>
</template>
