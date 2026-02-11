<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { getPostById, getPostComments, addComment, deleteComment, deletePost } from '@/services/social'
import MediaCarousel from '@/components/feed/MediaCarousel.vue'
import type { WorkoutCardData } from '@/components/feed/MediaCarousel.vue'
import CommentsList from '@/components/social/CommentsList.vue'
import CommentInput from '@/components/social/CommentInput.vue'
import type { CommentWithAuthor } from '@/components/social/CommentsList.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const post = ref<any>(null)
const comments = ref<CommentWithAuthor[]>([])
const loading = ref(true)
const commentsLoading = ref(true)
const submittingComment = ref(false)
const showDeleteConfirm = ref(false)
const deleting = ref(false)

// Like state
const isLiked = ref(false)
const likesCount = ref(0)
const isLiking = ref(false)

const postId = computed(() => route.params.id as string)

const isOwnPost = computed(() => {
  return post.value && authStore.user && post.value.author_id === authStore.user.id
})

onMounted(async () => {
  await loadPost()
  await Promise.all([loadComments(), checkLikeStatus()])
})

async function loadPost() {
  loading.value = true
  const raw = await getPostById(postId.value)
  if (!raw) {
    router.push('/404')
    return
  }

  // Normalize relations
  const author = Array.isArray(raw.author) ? raw.author[0] : raw.author
  const media = raw.media || raw.post_media || []
  let wc = Array.isArray(raw.workout_completion)
    ? raw.workout_completion[0] ?? null
    : raw.workout_completion ?? null

  if (wc) {
    const assignment = Array.isArray(wc.assignment) ? wc.assignment[0] ?? null : wc.assignment ?? null
    if (assignment) {
      assignment.workout = Array.isArray(assignment.workout) ? assignment.workout[0] ?? null : assignment.workout ?? null
    }
    wc = { ...wc, assignment }
  }

  post.value = { ...raw, author, media, workout_completion: wc }
  likesCount.value = post.value.likes_count || 0

  // Load exercise results for workout posts
  if (post.value.post_type === 'workout' && wc) {
    const { data: exerciseResults } = await supabase
      .from('exercise_results')
      .select(`
        id, completion_id, is_pb,
        exercise:exercises!exercise_results_exercise_id_fkey(
          id, name, sets, reps, weight_kg, duration_seconds, distance_meters
        )
      `)
      .eq('completion_id', wc.id)

    if (exerciseResults) {
      for (const er of exerciseResults as any[]) {
        if (Array.isArray(er.exercise)) er.exercise = er.exercise[0] ?? null
      }
      const sharedIds = wc.shared_exercise_ids as string[] | null
      let results = exerciseResults
      if (sharedIds && sharedIds.length > 0) {
        results = exerciseResults.filter((er: any) => sharedIds.includes(er.exercise?.id))
      }
      post.value.workout_completion.exercise_results = results
    }
  }

  loading.value = false
}

async function loadComments() {
  commentsLoading.value = true
  comments.value = await getPostComments(postId.value) as CommentWithAuthor[]
  commentsLoading.value = false
}

async function checkLikeStatus() {
  if (!authStore.user) return
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', authStore.user.id)
    .eq('post_id', postId.value)
    .maybeSingle()
  isLiked.value = !!data
}

async function toggleLike() {
  if (isLiking.value || !authStore.user) return
  isLiking.value = true
  const wasLiked = isLiked.value

  isLiked.value = !wasLiked
  likesCount.value += wasLiked ? -1 : 1

  try {
    if (wasLiked) {
      await supabase.from('likes').delete()
        .eq('user_id', authStore.user.id).eq('post_id', postId.value)
    } else {
      await supabase.from('likes').insert({ user_id: authStore.user.id, post_id: postId.value })
    }
  } catch {
    isLiked.value = wasLiked
    likesCount.value += wasLiked ? 1 : -1
  } finally {
    isLiking.value = false
  }
}

async function handleAddComment(content: string) {
  if (!authStore.user) return
  submittingComment.value = true
  const result = await addComment(postId.value, authStore.user.id, content)
  if (result) {
    comments.value.push(result as CommentWithAuthor)
    likesCount.value = likesCount.value // keep same, but update comments_count in local
    if (post.value) post.value.comments_count = (post.value.comments_count || 0) + 1
  }
  submittingComment.value = false
}

async function handleDeleteComment(commentId: string) {
  const success = await deleteComment(commentId, postId.value)
  if (success) {
    comments.value = comments.value.filter(c => c.id !== commentId)
    if (post.value) post.value.comments_count = Math.max(0, (post.value.comments_count || 1) - 1)
  }
}

async function handleDeletePost() {
  if (!authStore.user || !post.value) return
  deleting.value = true
  const success = await deletePost(postId.value, authStore.user.id)
  if (success) {
    router.replace('/profile')
  } else {
    deleting.value = false
    showDeleteConfirm.value = false
  }
}

// Post type badge
const postTypeBadge = computed(() => {
  if (!post.value) return null
  switch (post.value.post_type) {
    case 'workout': return { label: 'Workout', class: 'bg-summit-100 text-summit-800' }
    case 'pr': return { label: 'PR', class: 'bg-amber-100 text-amber-800' }
    case 'streak_milestone': return { label: 'Streak', class: 'bg-valencia-100 text-valencia-800' }
    case 'achievement': return { label: 'Achievement', class: 'bg-green-100 text-green-800' }
    default: return null
  }
})

// Time ago
const timeAgo = computed(() => {
  if (!post.value) return ''
  const now = new Date()
  const posted = new Date(post.value.created_at)
  const diffMs = now.getTime() - posted.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return posted.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})

// Author initials
const authorInitials = computed(() => {
  if (!post.value?.author) return '?'
  return post.value.author.display_name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

// Workout card data
const workoutCardData = computed<WorkoutCardData | null>(() => {
  const wc = post.value?.workout_completion
  if (!wc) return null

  const settings = wc.share_settings ?? {
    show_duration: true, show_rpe: true, show_workout_name: true,
    show_exercise_details: true, highlight_pbs_only: false,
  }

  const exercises = (wc.exercise_results ?? []).map((er: any) => ({
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
    pbCount: exercises.filter((e: any) => e.isPb).length,
  }
})

const hasMedia = computed(() => post.value?.media && post.value.media.length > 0)
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="p-6">
    <div class="animate-pulse space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-gray-200"></div>
        <div class="space-y-2 flex-1">
          <div class="h-4 w-24 bg-gray-200 rounded"></div>
          <div class="h-3 w-16 bg-gray-200 rounded"></div>
        </div>
      </div>
      <div class="aspect-square bg-gray-200 rounded-xl"></div>
      <div class="h-4 w-full bg-gray-200 rounded"></div>
    </div>
  </div>

  <div v-else-if="post" class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 bg-white/90 backdrop-blur-sm z-10 border-b border-gray-100">
      <div class="flex items-center justify-between p-4">
        <button @click="router.back()" class="text-gray-600 hover:text-gray-900 p-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="font-display font-semibold text-gray-900">Post</h1>
        <div class="w-8">
          <!-- Delete button (own post only) -->
          <button
            v-if="isOwnPost"
            @click="showDeleteConfirm = true"
            class="text-gray-400 hover:text-red-500 p-1 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Post Author -->
    <header class="post-header">
      <button @click="router.push(`/profile/${post.author.username}`)" class="flex-shrink-0">
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

      <div class="flex-1 min-w-0">
        <button @click="router.push(`/profile/${post.author.username}`)" class="block text-left">
          <p class="font-semibold text-gray-900 truncate hover:underline">
            {{ post.author.display_name }}
          </p>
          <p class="text-sm text-gray-500 truncate">@{{ post.author.username }}</p>
        </button>
      </div>

      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span
          v-if="postTypeBadge"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
          :class="postTypeBadge.class"
        >
          {{ postTypeBadge.label }}
        </span>
        <span>{{ timeAgo }}</span>
      </div>
    </header>

    <!-- Media -->
    <MediaCarousel
      v-if="hasMedia"
      :media="post.media"
      :post-type="post.post_type"
      :workout-card-data="workoutCardData"
    />

    <!-- Actions -->
    <div class="post-actions">
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

      <div class="post-action-btn text-summit-700">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>

      <div class="flex-1"></div>
    </div>

    <!-- Content -->
    <div class="post-content">
      <p v-if="likesCount > 0" class="font-semibold text-sm text-gray-900 mb-1">
        {{ likesCount.toLocaleString() }} {{ likesCount === 1 ? 'like' : 'likes' }}
      </p>

      <p v-if="post.content" class="text-gray-900">
        <button @click="router.push(`/profile/${post.author.username}`)" class="font-semibold hover:underline">
          {{ post.author.username }}
        </button>
        <span class="ml-1">{{ post.content }}</span>
      </p>
    </div>

    <!-- Comments Section -->
    <div class="border-t border-gray-100">
      <div class="px-4 py-3">
        <h3 class="font-semibold text-sm text-gray-900">
          Comments
          <span v-if="comments.length > 0" class="text-gray-400 font-normal">({{ comments.length }})</span>
        </h3>
      </div>

      <CommentsList
        :comments="comments"
        :loading="commentsLoading"
        @delete="handleDeleteComment"
      />

      <CommentInput
        :post-id="postId"
        :loading="submittingComment"
        @submit="handleAddComment"
      />
    </div>
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
</template>
