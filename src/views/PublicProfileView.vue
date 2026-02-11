<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { getStreak } from '@/utils/streaks'
import { trackEvent } from '@/utils/analytics'
import type { Profile, CoachProfile, UserStreak } from '@/types/database'
import PostCard from '@/components/feed/PostCard.vue'
import PostSkeleton from '@/components/feed/PostSkeleton.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const username = computed(() => route.params.username as string)
const profile = ref<Profile | null>(null)
const coachProfile = ref<CoachProfile | null>(null)
const streak = ref<UserStreak | null>(null)
const posts = ref<any[]>([])
const loading = ref(true)
const postsLoading = ref(true)

const initials = computed(() => {
  if (!profile.value) return '?'
  return profile.value.display_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const isOwnProfile = computed(() => {
  return profile.value?.id === authStore.user?.id
})

async function loadProfile() {
  try {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username.value)
      .single() as { data: Profile | null; error: any }

    if (error || !profileData) throw error || new Error('Profile not found')
    profile.value = profileData

    trackEvent('profile_viewed', { viewed_user_id: profileData.id })

    // Load coach profile if applicable
    if (profileData.user_type === 'coach') {
      const { data: coachData } = await supabase
        .from('coach_profiles')
        .select('*')
        .eq('id', profileData.id)
        .single() as { data: CoachProfile | null; error: any }
      coachProfile.value = coachData
    }

    // Load streak
    streak.value = await getStreak(profileData.id)

    // Load posts
    await loadPosts(profileData.id)
  } catch (error) {
    console.error('Error loading profile:', error)
    profile.value = null
  } finally {
    loading.value = false
  }
}

async function loadPosts(authorId: string) {
  try {
    postsLoading.value = true
    const { data, error } = await supabase
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
      .eq('author_id', authorId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    // Normalize relations: untyped supabase returns single FK relations as arrays
    const fetchedPosts: any[] = (data || []).map((post: any) => {
      const author = Array.isArray(post.author) ? post.author[0] : post.author
      const media = post.media || []
      let wc = Array.isArray(post.workout_completion)
        ? post.workout_completion[0] ?? null
        : post.workout_completion ?? null

      if (wc) {
        const assignment = Array.isArray(wc.assignment) ? wc.assignment[0] ?? null : wc.assignment ?? null
        if (assignment) {
          assignment.workout = Array.isArray(assignment.workout) ? assignment.workout[0] ?? null : assignment.workout ?? null
        }
        wc = { ...wc, assignment }
      }

      return { ...post, author, media, workout_completion: wc }
    })

    // Fetch exercise results for workout posts
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
            id, name, sets, reps, weight_kg, duration_seconds, distance_meters
          )
        `)
        .in('completion_id', completionIds)

      if (exerciseResults) {
        for (const er of exerciseResults as any[]) {
          if (Array.isArray(er.exercise)) er.exercise = er.exercise[0] ?? null
        }

        const resultsByCompletion = new Map<string, any[]>()
        for (const er of exerciseResults as any[]) {
          const list = resultsByCompletion.get(er.completion_id) || []
          list.push(er)
          resultsByCompletion.set(er.completion_id, list)
        }
        for (const post of fetchedPosts) {
          if (post.workout_completion) {
            const sharedIds = post.workout_completion.shared_exercise_ids as string[] | null
            let results = resultsByCompletion.get(post.workout_completion.id) || []
            if (sharedIds && sharedIds.length > 0) {
              results = results.filter((er: any) => sharedIds.includes(er.exercise?.id))
            }
            post.workout_completion.exercise_results = results
          }
        }
      }
    }

    posts.value = fetchedPosts
  } catch (error) {
    console.error('Error loading posts:', error)
  } finally {
    postsLoading.value = false
  }
}

onMounted(() => {
  loadProfile()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Loading -->
    <div v-if="loading" class="p-6 text-center">
      <div class="animate-pulse space-y-4">
        <div class="w-24 h-24 mx-auto rounded-full bg-gray-200"></div>
        <div class="h-6 w-32 mx-auto bg-gray-200 rounded"></div>
        <div class="h-4 w-24 mx-auto bg-gray-200 rounded"></div>
      </div>
    </div>

    <!-- Profile not found -->
    <div v-else-if="!profile" class="p-6 text-center">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      <h2 class="font-display text-xl font-bold text-gray-900 mb-2">Profile not found</h2>
      <p class="text-gray-500 mb-4">The user @{{ username }} doesn't exist.</p>
      <button @click="router.push('/')" class="btn-primary">Go Home</button>
    </div>

    <!-- Profile content -->
    <div v-else class="pb-20">
      <!-- Profile Header -->
      <div class="bg-white border-b border-gray-200 p-6 text-center">
        <!-- Avatar -->
        <div class="w-24 h-24 mx-auto mb-4">
          <img
            v-if="profile.avatar_url"
            :src="profile.avatar_url"
            :alt="profile.display_name"
            class="w-full h-full rounded-full object-cover ring-4 ring-white shadow-lg"
          />
          <div
            v-else
            class="w-full h-full rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-bold text-2xl ring-4 ring-white shadow-lg"
          >
            {{ initials }}
          </div>
        </div>

        <!-- Name -->
        <h1 class="font-display text-2xl font-bold text-gray-900">
          {{ profile.display_name }}
        </h1>
        <p class="text-gray-500">@{{ profile.username }}</p>

        <!-- Type badge -->
        <div class="mt-2">
          <span
            class="badge"
            :class="{
              'badge-coach': profile.user_type === 'coach',
              'bg-blue-100 text-blue-700': profile.user_type === 'athlete',
              'bg-gray-100 text-gray-700': profile.user_type === 'follower'
            }"
          >
            {{ profile.user_type.charAt(0).toUpperCase() + profile.user_type.slice(1) }}
          </span>
        </div>

        <!-- Bio -->
        <p v-if="profile.bio" class="mt-4 text-gray-700 max-w-sm mx-auto">
          {{ profile.bio }}
        </p>

        <!-- Streak display -->
        <div v-if="streak && streak.current_streak > 0" class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-valencia-50 border border-valencia-200 rounded-full">
          <span class="text-valencia-600 text-lg">&#x1F525;</span>
          <span class="font-semibold text-valencia-700">{{ streak.current_streak }} day streak</span>
          <span v-if="streak.longest_streak > streak.current_streak" class="text-sm text-gray-500">
            (best: {{ streak.longest_streak }})
          </span>
        </div>

        <!-- Coach-specific info -->
        <div v-if="profile.user_type === 'coach' && coachProfile" class="mt-4 max-w-sm mx-auto text-left bg-gray-50 rounded-xl p-4 space-y-3">
          <div v-if="coachProfile.qualifications">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Qualifications</p>
            <p class="text-sm text-gray-700">{{ coachProfile.qualifications }}</p>
          </div>

          <div v-if="coachProfile.experience_years || coachProfile.location" class="flex gap-4 text-sm text-gray-600">
            <span v-if="coachProfile.experience_years" class="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {{ coachProfile.experience_years }} years
            </span>
            <span v-if="coachProfile.location" class="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {{ coachProfile.location }}
            </span>
          </div>

          <div v-if="coachProfile.specialties && coachProfile.specialties.length > 0">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Specialties</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="specialty in coachProfile.specialties"
                :key="specialty"
                class="px-2 py-1 bg-summit-100 text-summit-800 rounded-full text-xs font-medium"
              >
                {{ specialty }}
              </span>
            </div>
          </div>

          <a
            v-if="coachProfile.website_url"
            :href="coachProfile.website_url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-summit-700 hover:text-summit-800 inline-flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Visit website
          </a>

          <div v-if="coachProfile.accepts_athletes && !isOwnProfile">
            <span class="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Accepting new athletes
            </span>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="mt-6 flex gap-3 justify-center">
          <template v-if="isOwnProfile">
            <router-link to="/settings" class="btn-secondary">Edit Profile</router-link>
          </template>
          <template v-else>
            <button class="btn-primary">Follow</button>
            <button class="btn-secondary">Message</button>
          </template>
        </div>
      </div>

      <!-- Posts section -->
      <div class="max-w-2xl mx-auto px-4 py-6">
        <h2 class="font-display text-lg font-bold text-gray-900 mb-4">Posts</h2>

        <!-- Loading posts -->
        <div v-if="postsLoading" class="space-y-4">
          <PostSkeleton v-for="i in 2" :key="i" />
        </div>

        <!-- Empty posts -->
        <div v-else-if="posts.length === 0" class="text-center py-12 bg-white rounded-lg border border-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="text-gray-500">No posts yet</p>
        </div>

        <!-- Posts list -->
        <div v-else class="space-y-4">
          <PostCard
            v-for="post in posts"
            :key="post.id"
            :post="post"
          />
        </div>
      </div>
    </div>
  </div>
</template>
