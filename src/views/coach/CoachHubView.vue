<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-white border-b sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Coach Hub</h1>
            <p class="text-sm text-gray-600 mt-1">Your coaching command center</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-summit-600"></div>
      </div>

      <template v-else>
        <!-- Stats Cards -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <!-- Athletes Card -->
          <div class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-600 font-medium">Total Athletes</p>
                <p class="text-3xl font-bold text-gray-900 mt-2">{{ stats.totalAthletes }}</p>
              </div>
              <div class="w-12 h-12 bg-summit-100 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6 text-summit-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Programs Card -->
          <div class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-600 font-medium">Active Programs</p>
                <p class="text-3xl font-bold text-gray-900 mt-2">{{ stats.totalPrograms }}</p>
              </div>
              <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Workouts Card -->
          <div class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-600 font-medium">Workout Templates</p>
                <p class="text-3xl font-bold text-gray-900 mt-2">{{ stats.totalWorkouts }}</p>
              </div>
              <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- This Week Card -->
          <div class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-600 font-medium">This Week</p>
                <p class="text-3xl font-bold text-gray-900 mt-2">{{ stats.completedThisWeek }}</p>
                <p class="text-xs text-gray-500 mt-1">Workouts completed</p>
              </div>
              <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white rounded-lg p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <router-link
              to="/athletes"
              class="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-summit-500 hover:bg-summit-50 transition group"
            >
              <div class="w-10 h-10 bg-summit-100 rounded-lg flex items-center justify-center group-hover:bg-summit-200 transition">
                <svg class="w-5 h-5 text-summit-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">Add Athlete</p>
                <p class="text-xs text-gray-500">Invite new athlete</p>
              </div>
            </router-link>

            <router-link
              to="/programs/new"
              class="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition group"
            >
              <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">New Program</p>
                <p class="text-xs text-gray-500">Create program</p>
              </div>
            </router-link>

            <router-link
              to="/workouts"
              class="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition group"
            >
              <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition">
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">New Workout</p>
                <p class="text-xs text-gray-500">Create workout</p>
              </div>
            </router-link>

            <router-link
              to="/create"
              class="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition group"
            >
              <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition">
                <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <div>
                <p class="font-medium text-gray-900">New Post</p>
                <p class="text-xs text-gray-500">Share update</p>
              </div>
            </router-link>
          </div>
        </div>

        <!-- Navigation Cards -->
        <div class="grid gap-4 md:grid-cols-3">
          <!-- Athletes Section -->
          <router-link
            to="/athletes"
            class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition border-l-4 border-summit-500"
          >
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">Athletes</h3>
                <p class="text-sm text-gray-600 mt-1">Manage your athlete roster</p>
                <p class="text-2xl font-bold text-summit-600 mt-4">{{ stats.totalAthletes }}</p>
              </div>
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </router-link>

          <!-- Programs Section -->
          <router-link
            to="/programs"
            class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition border-l-4 border-blue-500"
          >
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">Programs</h3>
                <p class="text-sm text-gray-600 mt-1">View and create programs</p>
                <p class="text-2xl font-bold text-blue-600 mt-4">{{ stats.totalPrograms }}</p>
              </div>
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </router-link>

          <!-- Workouts Section -->
          <router-link
            to="/workouts"
            class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition border-l-4 border-green-500"
          >
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">Workouts</h3>
                <p class="text-sm text-gray-600 mt-1">Workout templates library</p>
                <p class="text-2xl font-bold text-green-600 mt-4">{{ stats.totalWorkouts }}</p>
              </div>
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </router-link>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const authStore = useAuthStore()

const loading = ref(true)
const stats = ref({
  totalAthletes: 0,
  totalPrograms: 0,
  totalWorkouts: 0,
  completedThisWeek: 0
})

async function loadStats() {
  try {
    loading.value = true
    const coachId = authStore.profile?.id

    if (!coachId) return

    // Fetch total athletes
    const { count: athleteCount } = await supabase
      .from('coach_athlete_relationships')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .eq('status', 'accepted')

    stats.value.totalAthletes = athleteCount || 0

    // Fetch total programs
    const { count: programCount } = await supabase
      .from('programs')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId)

    stats.value.totalPrograms = programCount || 0

    // Fetch total workouts (standalone templates only)
    const { count: workoutCount } = await supabase
      .from('workouts')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .is('program_week_id', null)

    stats.value.totalWorkouts = workoutCount || 0

    // Fetch completed workouts this week
    const startOfWeek = new Date()
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const { count: completedCount } = await supabase
      .from('workout_logs')
      .select('*', { count: 'exact', head: true })
      .gte('completed_at', startOfWeek.toISOString())
      .eq('status', 'completed')
      .in('athlete_id', await getAthleteIds(coachId))

    stats.value.completedThisWeek = completedCount || 0

  } catch (error) {
    console.error('Error loading stats:', error)
  } finally {
    loading.value = false
  }
}

async function getAthleteIds(coachId: string): Promise<string[]> {
  const { data } = await supabase
    .from('coach_athlete_relationships')
    .select('athlete_id')
    .eq('coach_id', coachId)
    .eq('status', 'accepted')

  return data?.map(r => r.athlete_id) || []
}

onMounted(() => {
  loadStats()
})
</script>
