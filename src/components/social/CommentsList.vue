<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export interface CommentWithAuthor {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  author: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
}

const props = defineProps<{
  comments: CommentWithAuthor[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'delete', commentId: string): void
}>()

const authStore = useAuthStore()
const router = useRouter()

function timeAgo(dateStr: string) {
  const now = new Date()
  const posted = new Date(dateStr)
  const diffMs = now.getTime() - posted.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return posted.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function goToProfile(username: string) {
  router.push(`/profile/${username}`)
}
</script>

<template>
  <div class="space-y-1">
    <!-- Loading -->
    <div v-if="loading" class="px-4 py-6 text-center">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-summit-600 mx-auto"></div>
    </div>

    <!-- Empty -->
    <div v-else-if="comments.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
      No comments yet. Be the first to comment!
    </div>

    <!-- Comments list -->
    <div
      v-else
      v-for="comment in comments"
      :key="comment.id"
      class="flex items-start gap-3 px-4 py-2.5"
    >
      <!-- Avatar -->
      <button @click="goToProfile(comment.author.username)" class="flex-shrink-0">
        <img
          v-if="comment.author.avatar_url"
          :src="comment.author.avatar_url"
          :alt="comment.author.display_name"
          class="w-8 h-8 rounded-full object-cover"
        />
        <div
          v-else
          class="w-8 h-8 rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-semibold text-xs"
        >
          {{ getInitials(comment.author.display_name) }}
        </div>
      </button>

      <!-- Comment body -->
      <div class="flex-1 min-w-0">
        <p class="text-sm">
          <button
            @click="goToProfile(comment.author.username)"
            class="font-semibold text-gray-900 hover:underline"
          >
            {{ comment.author.username }}
          </button>
          <span class="ml-1 text-gray-700">{{ comment.content }}</span>
        </p>
        <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
          <span>{{ timeAgo(comment.created_at) }}</span>
          <button
            v-if="comment.author_id === authStore.user?.id"
            @click="emit('delete', comment.id)"
            class="text-red-400 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
