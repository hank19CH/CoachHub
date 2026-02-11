<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  confirmClass?: string
  loading?: boolean
}>(), {
  title: 'Are you sure?',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmClass: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  loading: false,
})

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      @click.self="emit('cancel')"
    >
      <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-fade-in">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ title }}</h3>
        <p v-if="message" class="text-sm text-gray-600 mb-6">{{ message }}</p>
        <div class="flex gap-3">
          <button
            @click="emit('cancel')"
            class="flex-1 btn-secondary"
            :disabled="loading"
          >
            {{ cancelText }}
          </button>
          <button
            @click="emit('confirm')"
            class="flex-1 btn"
            :class="confirmClass"
            :disabled="loading"
          >
            <span v-if="loading" class="flex items-center gap-2 justify-center">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Working...
            </span>
            <span v-else>{{ confirmText }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
