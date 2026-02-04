<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Profile, CoachProfile } from '@/types/database'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const profile = ref<Profile | null>(null)
const coachInfo = ref<CoachProfile | null>(null)
const loading = ref(true)
const isOwnProfile = computed(() => {
  if (!route.params.username) return true
  return route.params.username === authStore.profile?.username
})

const displayProfile = computed(() => {
  return isOwnProfile.value ? authStore.profile : profile.value
})

const initials = computed(() => {
  if (!displayProfile.value) return '?'
  return displayProfile.value.display_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

onMounted(async () => {
  if (!isOwnProfile.value && route.params.username) {
    await fetchProfile(route.params.username as string)
  } else {
    loading.value = false
    // If viewing own profile and is a coach, fetch coach info
    if (authStore.isCoach && authStore.user) {
      await fetchCoachInfo(authStore.user.id)
    }
  }
})

async function fetchProfile(username: string) {
  try {
    loading.value = true
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (error) throw error
    profile.value = data

    // If profile is a coach, fetch coach-specific info
    if (data.user_type === 'coach') {
      await fetchCoachInfo(data.id)
    }
  } catch (e) {
    console.error('Error fetching profile:', e)
    router.push('/404')
  } finally {
    loading.value = false
  }
}

async function fetchCoachInfo(userId: string) {
  try {
    const { data, error } = await supabase
      .from('coach_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) throw error
    coachInfo.value = data
  } catch (e) {
    console.error('Error fetching coach info:', e)
  }
}
</script>

<template>
  <div v-if="loading" class="p-6 text-center">
    <div class="animate-pulse space-y-4">
      <div class="w-24 h-24 mx-auto rounded-full bg-gray-200"></div>
      <div class="h-6 w-32 mx-auto bg-gray-200 rounded"></div>
      <div class="h-4 w-24 mx-auto bg-gray-200 rounded"></div>
    </div>
  </div>

  <div v-else-if="displayProfile" class="pb-6">
    <!-- Profile Header -->
    <div class="p-6 text-center">
      <!-- Avatar -->
      <div class="w-24 h-24 mx-auto mb-4">
        <img
          v-if="displayProfile.avatar_url"
          :src="displayProfile.avatar_url"
          :alt="displayProfile.display_name"
          class="w-full h-full rounded-full object-cover ring-4 ring-white shadow-lg"
        />
        <div 
          v-else 
          class="w-full h-full rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-bold text-2xl ring-4 ring-white shadow-lg"
        >
          {{ initials }}
        </div>
      </div>

      <!-- Name & username -->
      <h1 class="font-display text-2xl font-bold text-gray-900">
        {{ displayProfile.display_name }}
      </h1>
      <p class="text-gray-500">@{{ displayProfile.username }}</p>

      <!-- User type badge -->
      <div class="mt-2">
        <span 
          class="badge"
          :class="{
            'badge-coach': displayProfile.user_type === 'coach',
            'bg-blue-100 text-blue-700': displayProfile.user_type === 'athlete',
            'bg-gray-100 text-gray-700': displayProfile.user_type === 'follower'
          }"
        >
          {{ displayProfile.user_type.charAt(0).toUpperCase() + displayProfile.user_type.slice(1) }}
        </span>
      </div>

      <!-- Bio -->
      <p v-if="displayProfile.bio" class="mt-4 text-gray-700 max-w-sm mx-auto">
        {{ displayProfile.bio }}
      </p>

      <!-- Coach-specific info -->
      <div v-if="displayProfile.user_type === 'coach' && coachInfo" class="mt-4 max-w-sm mx-auto text-left bg-gray-50 rounded-xl p-4 space-y-3">
        <!-- Qualifications -->
        <div v-if="coachInfo.qualifications">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Qualifications</p>
          <p class="text-sm text-gray-700">{{ coachInfo.qualifications }}</p>
        </div>

        <!-- Experience & Location -->
        <div v-if="coachInfo.experience_years || coachInfo.location" class="flex gap-4 text-sm text-gray-600">
          <span v-if="coachInfo.experience_years" class="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ coachInfo.experience_years }} years
          </span>
          <span v-if="coachInfo.location" class="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {{ coachInfo.location }}
          </span>
        </div>

        <!-- Specialties -->
        <div v-if="coachInfo.specialties && coachInfo.specialties.length > 0">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Specialties</p>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="specialty in coachInfo.specialties"
              :key="specialty"
              class="px-2 py-1 bg-summit-100 text-summit-800 rounded-full text-xs font-medium"
            >
              {{ specialty }}
            </span>
          </div>
        </div>

        <!-- Website -->
        <a
          v-if="coachInfo.website_url"
          :href="coachInfo.website_url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-summit-700 hover:text-summit-800 inline-flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          Visit website
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        <!-- Accepting athletes badge -->
        <div v-if="coachInfo.accepts_athletes && !isOwnProfile">
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
          <router-link to="/settings" class="btn-secondary">
            Edit Profile
          </router-link>
        </template>
        <template v-else>
          <button class="btn-primary">Follow</button>
          <button class="btn-secondary">Message</button>
        </template>
      </div>
    </div>

    <!-- Stats -->
    <div class="flex justify-center gap-8 py-4 border-y border-feed-border">
      <div class="text-center">
        <p class="font-bold text-gray-900">0</p>
        <p class="text-sm text-gray-500">Posts</p>
      </div>
      <div class="text-center">
        <p class="font-bold text-gray-900">0</p>
        <p class="text-sm text-gray-500">Followers</p>
      </div>
      <div class="text-center">
        <p class="font-bold text-gray-900">0</p>
        <p class="text-sm text-gray-500">Following</p>
      </div>
    </div>

    <!-- Posts grid placeholder -->
    <div class="p-6 text-center text-gray-500">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p>No posts yet</p>
    </div>
  </div>
</template>
