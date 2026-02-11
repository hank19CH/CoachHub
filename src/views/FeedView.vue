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
const feedFilter = ref<'all' | 'following'>('all')

onMounted(async () => {
  await fetchPosts()
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

async function switchFilter(filter: 'all' | 'following') {
  if (feedFilter.value === filter) return
  feedFilter.value = filter
  hasMore.value = true
  await fetchPosts()
}

async function fetchPosts(append = false) {
  try {
    if (!append) {
      loading.value = true
      error.value = null
    }

    const offset = append ? posts.value.length : 0

    let query = supabase
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

    if (feedFilter.value === 'following' && authStore.user) {
      // Get following IDs first
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', authStore.user.id)
        .eq('status', 'active')

      const followingIds = (follows || []).map((f: any) => f.following_id)
      followingIds.push(authStore.user.id) // Include own posts

      query = query
        .in('author_id', followingIds)
        .in('visibility', ['public', 'followers'])
    } else {
      query = query.eq('visibility', 'public')
    }

    const { data, error: fetchError } = (await query
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)) as { data: any[] | null; error: any }

    if (fetchError) throw fetchError

    // Normalize relations: untyped supabase returns single FK relations as arrays
    const fetchedPosts: any[] = (data || []).map((post: any) => {
      const author = Array.isArray(post.author) ? post.author[0] : post.author
      const media = post.media || []
      let wc = Array.isArray(post.workout_completion)
        ? post.workout_completion[0] ?? null
        : post.workout_completion ?? null

      // Normalize nested assignment/workout inside workout_completion
      if (wc) {
        const assignment = Array.isArray(wc.assignment) ? wc.assignment[0] ?? null : wc.assignment ?? null
        if (assignment) {
          assignment.workout = Array.isArray(assignment.workout) ? assignment.workout[0] ?? null : assignment.workout ?? null
        }
        wc = { ...wc, assignment }
      }

      return { ...post, author, media, workout_completion: wc }
    })

    // For workout posts, fetch exercise results for the workout card
    const workoutPosts = fetchedPosts.filter(
      (p: any) => p.post_type === 'workout' && p.workout_completion
    )

    if (workoutPosts.length > 0) {
      const completionIds = workoutPosts.map((p: any) => p.workout_completion.id)

      const { data: exerciseResults } = (await supabase
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
        .in('completion_id', completionIds)) as { data: any[] | null; error: any }

      // Attach exercise results to matching posts
      if (exerciseResults) {
        // Normalize exercise relation (may be array from untyped client)
        for (const er of exerciseResults) {
          if (Array.isArray(er.exercise)) {
            er.exercise = er.exercise[0] ?? null
          }
        }

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

function handlePostDeleted(postId: string) {
  posts.value = posts.value.filter(p => p.id !== postId)
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
    <!-- Feed filter tabs -->
    <div class="sticky top-0 bg-white/90 backdrop-blur-sm z-10 border-b border-gray-100">
      <div class="flex">
        <button
          @click="switchFilter('all')"
          class="flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2"
          :class="feedFilter === 'all'
            ? 'text-summit-800 border-summit-800'
            : 'text-gray-500 border-transparent hover:text-gray-700'"
        >
          For You
        </button>
        <button
          @click="switchFilter('following')"
          class="flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2"
          :class="feedFilter === 'following'
            ? 'text-summit-800 border-summit-800'
            : 'text-gray-500 border-transparent hover:text-gray-700'"
        >
          Following
        </button>
      </div>
    </div>

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
        <template v-if="feedFilter === 'following'">
          Follow people to see their posts
        </template>
        <template v-else>
          Welcome to CoachHub, {{ authStore.displayName }}!
        </template>
      </h2>

      <p class="text-gray-600 mb-6 max-w-sm mx-auto">
        <template v-if="feedFilter === 'following'">
          When you follow coaches and athletes, their posts will show up here.
        </template>
        <template v-else>
          Your feed is empty. Start by following coaches and athletes, or create your first post.
        </template>
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
          @deleted="handlePostDeleted"
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
