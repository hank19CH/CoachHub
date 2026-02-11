<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  postId: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', content: string): void
}>()

const authStore = useAuthStore()
const content = ref('')

function handleSubmit() {
  const trimmed = content.value.trim()
  if (!trimmed) return
  emit('submit', trimmed)
  content.value = ''
}

const initials = authStore.profile?.display_name
  ?.split(' ')
  .map((n: string) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2) ?? '?'
</script>

<template>
  <div class="flex items-start gap-3 px-4 py-3 border-t border-gray-100">
    <!-- User avatar -->
    <img
      v-if="authStore.avatarUrl"
      :src="authStore.avatarUrl"
      class="w-8 h-8 rounded-full object-cover flex-shrink-0"
      alt="You"
    />
    <div
      v-else
      class="w-8 h-8 rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0"
    >
      {{ initials }}
    </div>

    <!-- Input -->
    <form @submit.prevent="handleSubmit" class="flex-1 flex items-center gap-2">
      <input
        v-model="content"
        type="text"
        placeholder="Add a comment..."
        class="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
        :disabled="loading"
        maxlength="500"
      />
      <button
        type="submit"
        class="text-sm font-semibold text-summit-700 hover:text-summit-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        :disabled="!content.trim() || loading"
      >
        Post
      </button>
    </form>
  </div>
</template>
