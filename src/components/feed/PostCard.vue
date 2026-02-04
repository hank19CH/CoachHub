<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { PostWithAuthor } from '@/types/database'
import MediaCarousel from './MediaCarousel.vue'

const props = defineProps<{
  post: PostWithAuthor
}>()

const router = useRouter()
const authStore = useAuthStore()

const isLiked = ref(false)
const likesCount = ref(props.post.likes_count)
const isLiking = ref(false)

// Format relative time
const timeAgo = computed(() => {
  const now = new Date()
  const posted = new Date(props.post.created_at)
  const diffMs = now.getTime() - posted.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return posted.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})

// Check if post has media
const hasMedia = computed(() => {
  return props.post.media && props.post.media.length > 0
})

// Get author initials for avatar fallback
const authorInitials = computed(() => {
  return props.post.author.display_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

// Handle like toggle
async function toggleLike() {
  if (isLiking.value || !authStore.user) return

  isLiking.value = true
  const wasLiked = isLiked.value

  // Optimistic update
  isLiked.value = !wasLiked
  likesCount.value += wasLiked ? -1 : 1

  try {
    if (wasLiked) {
      // Unlike
      await supabase
        .from('likes')
        .delete()
        .eq('user_id', authStore.user.id)
        .eq('post_id', props.post.id)
    } else {
      // Like
      await supabase
        .from('likes')
        .insert({
          user_id: authStore.user.id,
          post_id: props.post.id
        })
    }
  } catch (e) {
    // Revert on error
    isLiked.value = wasLiked
    likesCount.value += wasLiked ? 1 : -1
    console.error('Error toggling like:', e)
  } finally {
    isLiking.value = false
  }
}

// Navigate to profile
function goToProfile() {
  router.push(`/profile/${props.post.author.username}`)
}

// Navigate to post detail
function goToPost() {
  router.push(`/post/${props.post.id}`)
}
</script>

<template>
  <article class="post-card animate-fade-in">
    <!-- Post Header -->
    <header class="post-header">
      <!-- Avatar -->
      <button @click="goToProfile" class="flex-shrink-0">
        <img
          v-if="post.author.avatar_url"
          :src="post.author.avatar_url"
          :alt="post.author.display_name"
          class="post-avatar"
        />
        <div 
          v-else 
          class="w-10 h-10 rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-semibold text-sm"
        >
          {{ authorInitials }}
        </div>
      </button>

      <!-- Author info -->
      <div class="flex-1 min-w-0">
        <button @click="goToProfile" class="block text-left">
          <p class="font-semibold text-gray-900 truncate hover:underline">
            {{ post.author.display_name }}
          </p>
          <p class="text-sm text-gray-500 truncate">
            @{{ post.author.username }}
          </p>
        </button>
      </div>

      <!-- Post type badge & time -->
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span v-if="post.post_type === 'workout'" class="badge-coach">
          Workout
        </span>
        <span>{{ timeAgo }}</span>
      </div>
    </header>

    <!-- Media Carousel (if has media) -->
    <MediaCarousel 
      v-if="hasMedia" 
      :media="post.media" 
      :post-type="post.post_type"
    />

    <!-- Post Actions -->
    <div class="post-actions">
      <!-- Like button -->
      <button 
        @click="toggleLike"
        class="post-action-btn"
        :class="{ 'text-red-500': isLiked }"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          class="w-6 h-6" 
          :fill="isLiked ? 'currentColor' : 'none'" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>

      <!-- Comment button -->
      <button @click="goToPost" class="post-action-btn">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      <!-- Share button -->
      <button class="post-action-btn">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Save/bookmark button -->
      <button class="post-action-btn">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>
    </div>

    <!-- Post Content -->
    <div class="post-content">
      <!-- Like count -->
      <p v-if="likesCount > 0" class="font-semibold text-sm text-gray-900 mb-1">
        {{ likesCount.toLocaleString() }} {{ likesCount === 1 ? 'like' : 'likes' }}
      </p>

      <!-- Caption -->
      <p v-if="post.content" class="text-gray-900">
        <button @click="goToProfile" class="font-semibold hover:underline">
          {{ post.author.username }}
        </button>
        <span class="ml-1">{{ post.content }}</span>
      </p>

      <!-- View comments link -->
      <button 
        v-if="post.comments_count > 0"
        @click="goToPost"
        class="text-gray-500 text-sm mt-1 hover:text-gray-700"
      >
        View all {{ post.comments_count }} comments
      </button>
    </div>
  </article>
</template>
