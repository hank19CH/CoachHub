<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import PostCard from '@/components/feed/PostCard.vue'
import PostSkeleton from '@/components/feed/PostSkeleton.vue'
import { supabase } from '@/lib/supabase'

const authStore = useAuthStore()

const posts = ref<any[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const hasMore = ref(true)
const PAGE_SIZE = 20

onMounted(async () => {
  await fetchPosts()
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

async function fetchPosts(append = false) {
  try {
    if (!append) {
      loading.value = true
      error.value = null
    }

    const offset = append ? posts.value.length : 0

    const { data, error: fetchError } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!author_id(*),
        media:post_media(*),
        workout_completion:workout_completions!posts_workout_completion_id_fkey(
          id,
          duration_minutes,
          overall_rpe,
          has_pb,
          completed_at,
          shared_exercise_ids,
          share_settings,
          assignment:workout_assignments!workout_completions_assignment_id_fkey(
            workout:workouts!workout_assignments_workout_id_fkey(
              id,
              name,
              description
            )
          )
        )
      `)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (fetchError) throw fetchError

    const fetchedPosts = data || []

    // For workout posts, fetch exercise results for the workout card
    const workoutPosts = fetchedPosts.filter(
      (p: any) => p.post_type === 'workout' && p.workout_completion
    )

    if (workoutPosts.length > 0) {
      const completionIds = workoutPosts.map((p: any) => p.workout_completion.id)

      const { data: exerciseResults } = await supabase
        .from('exercise_results')
        .select(`
          id,
          completion_id,
          is_pb,
          exercise:exercises!exercise_results_exercise_id_fkey(
            id,
            name,
            sets,
            reps,
            weight_kg,
            duration_seconds,
            distance_meters
          )
        `)
        .in('completion_id', completionIds)

      // Attach exercise results to matching posts
      if (exerciseResults) {
        const resultsByCompletion = new Map<string, any[]>()
        for (const er of exerciseResults) {
          const list = resultsByCompletion.get(er.completion_id) || []
          list.push(er)
          resultsByCompletion.set(er.completion_id, list)
        }

        for (const post of fetchedPosts) {
          if (post.workout_completion) {
            const sharedIds = post.workout_completion.shared_exercise_ids as string[] | null
            let results = resultsByCompletion.get(post.workout_completion.id) || []

            // Filter to shared exercises if specified
            if (sharedIds && sharedIds.length > 0) {
              results = results.filter((er: any) => sharedIds.includes(er.exercise?.id))
            }

            post.workout_completion.exercise_results = results
          }
        }
      }
    }

    if (append) {
      posts.value.push(...fetchedPosts)
    } else {
      posts.value = fetchedPosts
    }

    hasMore.value = fetchedPosts.length >= PAGE_SIZE
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load posts'
    console.error('Error fetching posts:', e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function handleRefresh() {
  hasMore.value = true
  await fetchPosts()
}

function handleScroll() {
  if (loadingMore.value || !hasMore.value) return

  const scrollBottom = window.innerHeight + window.scrollY
  const docHeight = document.documentElement.scrollHeight

  if (docHeight - scrollBottom < 400) {
    loadingMore.value = true
    fetchPosts(true)
  }
}
</script>

<template>
  <div class="min-h-full">
    <!-- Welcome message for empty feed -->
    <div
      v-if="!loading && posts.length === 0"
      class="p-6 text-center"
    >
      <div class="w-24 h-24 mx-auto mb-6 rounded-full bg-summit-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </div>

      <h2 class="font-display text-2xl font-bold text-gray-900 mb-2">
        Welcome to CoachHub, {{ authStore.displayName }}!
      </h2>

      <p class="text-gray-600 mb-6 max-w-sm mx-auto">
        Your feed is empty. Start by following coaches and athletes, or create your first post.
      </p>

      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <router-link to="/explore" class="btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Explore
        </router-link>
        <router-link to="/create" class="btn-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Post
        </router-link>
      </div>
    </div>

    <!-- Loading skeletons -->
    <div v-else-if="loading" class="space-y-4 p-4">
      <PostSkeleton v-for="i in 3" :key="i" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="p-6 text-center">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p class="text-gray-900 font-medium mb-2">Something went wrong</p>
      <p class="text-gray-600 text-sm mb-4">{{ error }}</p>
      <button @click="handleRefresh" class="btn-primary">
        Try Again
      </button>
    </div>

    <!-- Posts feed -->
    <div v-else class="pb-4">
      <!-- Pull to refresh hint -->
      <div class="text-center py-3 text-gray-400 text-sm">
        <button @click="handleRefresh" class="hover:text-gray-600 transition-colors">
          Pull to refresh
        </button>
      </div>

      <!-- Post cards -->
      <TransitionGroup name="feed" tag="div" class="space-y-4 px-4">
        <PostCard
          v-for="post in posts"
          :key="post.id"
          :post="post"
        />
      </TransitionGroup>

      <!-- Loading more indicator -->
      <div v-if="loadingMore" class="flex justify-center py-6">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-summit-600"></div>
      </div>

      <!-- End of feed -->
      <div v-else-if="!hasMore && posts.length > 0" class="text-center py-8 text-gray-400 text-sm">
        You're all caught up!
      </div>
    </div>
  </div>
</template>

<style scoped>
.feed-enter-active,
.feed-leave-active {
  transition: all 0.3s ease;
}
.feed-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.feed-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
