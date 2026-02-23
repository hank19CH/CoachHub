<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  message?: string
  retryLabel?: string
}>(), {
  title: 'Something went wrong',
  retryLabel: 'Try Again',
})

const emit = defineEmits<{
  (e: 'retry'): void
}>()
</script>

<template>
  <div class="p-6 text-center">
    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <p class="text-gray-900 font-medium mb-2">{{ title }}</p>
    <p v-if="message" class="text-gray-600 text-sm mb-4">{{ message }}</p>
    <button @click="emit('retry')" class="btn-primary">
      {{ retryLabel }}
    </button>
  </div>
</template>
