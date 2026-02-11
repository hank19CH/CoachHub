<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  visible: boolean
}>(), {
  type: 'success',
  duration: 3000,
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

watch(() => props.visible, (val) => {
  if (val && props.duration > 0) {
    setTimeout(() => emit('close'), props.duration)
  }
})

const iconColor = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
}

const bgColor = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  info: 'bg-blue-50 border-blue-200',
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition ease-out duration-300"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="visible"
        class="fixed bottom-24 left-4 right-4 z-50 flex justify-center pointer-events-none"
      >
        <div
          class="pointer-events-auto px-4 py-3 rounded-xl border shadow-lg flex items-center gap-3 max-w-sm w-full"
          :class="bgColor[type]"
        >
          <!-- Success icon -->
          <svg v-if="type === 'success'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" :class="iconColor[type]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <!-- Error icon -->
          <svg v-else-if="type === 'error'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" :class="iconColor[type]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <!-- Info icon -->
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" :class="iconColor[type]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-sm font-medium text-gray-900">{{ message }}</p>
          <button @click="emit('close')" class="ml-auto text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
