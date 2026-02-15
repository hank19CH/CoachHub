<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { deletePost } from '@/services/social'
import type { PostWithAuthor } from '@/types/database'
import MediaCarousel from './MediaCarousel.vue'
import type { WorkoutCardData } from './MediaCarousel.vue'

const props = defineProps<{
  post: PostWithAuthor & {
    workout_completion?: {
      id: string
      duration_minutes: number | null
      overall_rpe: number | null
      has_pb: boolean
      completed_at: string
      shared_exercise_ids: string[] | null
      share_settings: {
        show_duration: boolean
        show_rpe: boolean
        show_workout_name: boolean
        show_exercise_details: boolean
        highlight_pbs_only: boolean
      } | null
      assignment?: {
        workout?: {
          id: string
          name: string
          description: string | null
        }
      }
      exercise_results?: {
        id: string
        is_pb: boolean
        exercise: {
          id: string
          name: string
          sets: number | null
          reps: string | null
          weight_kg: number | null
          duration_seconds: number | null
          distance_meters: number | null
        }
      }[]
    } | null
  }
}>()

const router = useRouter()
const authStore = useAuthStore()

const isLiked = ref(false)
const likesCount = ref(props.post.likes_count)
const isLiking = ref(false)

// Check if the current user has already liked this post
onMounted(async () => {
  if (!authStore.user) return
  try {
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', authStore.user.id)
      .eq('post_id', props.post.id)
      .maybeSingle()
    isLiked.value = !!data
  } catch {
    // Silently fail — default to not liked
  }
})

// Post type badge config
const postTypeBadge = computed(() => {
  switch (props.post.post_type) {
    case 'workout':
      return { label: 'Workout', class: 'bg-summit-100 text-summit-800' }
    case 'pr':
      return { label: 'PR', class: 'bg-amber-100 text-amber-800' }
    case 'streak_milestone':
      return { label: 'Streak', class: 'bg-valencia-100 text-valencia-800' }
    case 'achievement':
      return { label: 'Achievement', class: 'bg-green-100 text-green-800' }
    default:
      return null
  }
})

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

// Build workout card data for MediaCarousel
const workoutCardData = computed<WorkoutCardData | null>(() => {
  const wc = props.post.workout_completion
  if (!wc) return null

  const settings = wc.share_settings ?? {
    show_duration: true,
    show_rpe: true,
    show_workout_name: true,
    show_exercise_details: true,
    highlight_pbs_only: false,
  }

  const exercises = (wc.exercise_results ?? []).map((er) => ({
    name: er.exercise.name,
    sets: er.exercise.sets,
    reps: er.exercise.reps,
    weight: er.exercise.weight_kg,
    duration: er.exercise.duration_seconds,
    distance: er.exercise.distance_meters,
    isPb: er.is_pb,
  }))

  return {
    workoutName: wc.assignment?.workout?.name ?? 'Workout',
    duration: wc.duration_minutes,
    completedAt: wc.completed_at,
    exercises,
    shareSettings: settings,
    overallRpe: wc.overall_rpe,
    pbCount: exercises.filter((e) => e.isPb).length,
  }
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

// Delete post
const showDeleteConfirm = ref(false)
const deleting = ref(false)
const isOwnPost = computed(() => authStore.user?.id === props.post.author_id)

const emit = defineEmits<{
  (e: 'deleted', postId: string): void
}>()

async function handleDeletePost() {
  if (!authStore.user) return
  deleting.value = true
  const success = await deletePost(props.post.id, authStore.user.id)
  if (success) {
    showDeleteConfirm.value = false
    emit('deleted', props.post.id)
  }
  deleting.value = false
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

      <!-- Post type badge & time & actions -->
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span
          v-if="postTypeBadge"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
          :class="postTypeBadge.class"
        >
          <span v-if="post.post_type === 'pr'" class="mr-0.5">&#9733;</span>
          <span v-if="post.post_type === 'streak_milestone'" class="mr-0.5">&#128293;</span>
          {{ postTypeBadge.label }}
        </span>
        <span>{{ timeAgo }}</span>
        <!-- Delete button for own posts -->
        <button
          v-if="isOwnPost"
          @click.stop="showDeleteConfirm = true"
          class="ml-1 p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Delete post"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Media Carousel (if has media) -->
    <MediaCarousel
      v-if="hasMedia"
      :media="post.media"
      :post-type="post.post_type"
      :workout-card-data="workoutCardData"
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

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        @click.self="showDeleteConfirm = false"
      >
        <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Delete Post?</h3>
          <p class="text-sm text-gray-600 mb-6">
            Are you sure you want to delete this post? This action cannot be undone.
          </p>
          <div class="flex gap-3">
            <button
              @click="showDeleteConfirm = false"
              class="flex-1 btn-secondary"
              :disabled="deleting"
            >
              Cancel
            </button>
            <button
              @click="handleDeletePost"
              class="flex-1 btn bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
              :disabled="deleting"
            >
              <span v-if="deleting" class="flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Deleting...
              </span>
              <span v-else>Delete</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </article>
</template>
