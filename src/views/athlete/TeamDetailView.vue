<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { getGroupById, getGroupMembers } from '@/services/groups'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const group = ref<any>(null)
const members = ref<any[]>([])
const upcomingWorkouts = ref<any[]>([])
const loading = ref(true)

const groupId = computed(() => route.params.id as string)

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true

  const [groupData, membersData] = await Promise.all([
    getGroupById(groupId.value),
    getGroupMembers(groupId.value),
  ])

  group.value = groupData
  members.value = membersData

  // Fetch upcoming workouts for this athlete from group assignments
  if (authStore.user) {
    const { data } = await supabase
      .from('workout_assignments')
      .select('*, workout:workouts(id, name, description, estimated_duration_min)')
      .eq('athlete_id', authStore.user.id)
      .eq('status', 'pending')
      .gte('assigned_date', new Date().toISOString().split('T')[0])
      .order('assigned_date', { ascending: true })
      .limit(5)

    upcomingWorkouts.value = (data || []).map((a: any) => ({
      ...a,
      workout: Array.isArray(a.workout) ? a.workout[0] ?? null : a.workout ?? null,
    }))
  }

  loading.value = false
}

// Fetch coach profile for the group
const coachProfile = ref<any>(null)
onMounted(async () => {
  // Wait for group to load, then fetch coach
  const checkCoach = setInterval(async () => {
    if (group.value?.coach_id) {
      clearInterval(checkCoach)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', group.value.coach_id)
        .single()
      coachProfile.value = data
    }
  }, 100)
  setTimeout(() => clearInterval(checkCoach), 5000)
})

function getInitials(name: string) {
  return name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 bg-white/90 backdrop-blur-sm z-10 border-b border-gray-100">
      <div class="flex items-center justify-between p-4">
        <button @click="router.back()" class="text-gray-600 hover:text-gray-900 p-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="font-display text-lg font-semibold text-gray-900 truncate">
          {{ group?.name || 'Team' }}
        </h1>
        <div class="w-8"></div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-6">
      <div class="animate-pulse space-y-4">
        <div class="h-20 bg-gray-200 rounded-xl"></div>
        <div class="h-6 w-32 bg-gray-200 rounded"></div>
        <div class="grid grid-cols-3 gap-3">
          <div v-for="i in 6" :key="i" class="h-20 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    </div>

    <div v-else-if="group" class="p-4 space-y-6">
      <!-- Group Info Card -->
      <div class="card p-4">
        <div class="flex items-start gap-3">
          <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            <span v-if="group.sport?.icon">{{ group.sport.icon }}</span>
            <span v-else>{{ getInitials(group.name) }}</span>
          </div>
          <div>
            <h2 class="font-display text-xl font-bold text-gray-900">{{ group.name }}</h2>
            <p v-if="group.team" class="text-sm text-purple-600 font-medium">{{ group.team.name }}</p>
            <p v-if="group.sport" class="text-sm text-gray-500">{{ group.sport.name }}</p>
            <p v-if="group.description" class="text-sm text-gray-600 mt-2">{{ group.description }}</p>
          </div>
        </div>
      </div>

      <!-- Coach Section -->
      <div v-if="coachProfile" class="card p-4">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Coach</h3>
        <button
          @click="router.push(`/profile/${coachProfile.username}`)"
          class="flex items-center gap-3 w-full text-left"
        >
          <img
            v-if="coachProfile.avatar_url"
            :src="coachProfile.avatar_url"
            :alt="coachProfile.display_name"
            class="w-12 h-12 rounded-full object-cover"
          />
          <div
            v-else
            class="w-12 h-12 rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-semibold text-sm"
          >
            {{ getInitials(coachProfile.display_name) }}
          </div>
          <div>
            <p class="font-semibold text-gray-900 hover:underline">{{ coachProfile.display_name }}</p>
            <p class="text-sm text-gray-500">@{{ coachProfile.username }}</p>
          </div>
        </button>
      </div>

      <!-- Members Section -->
      <div>
        <h3 class="font-semibold text-gray-900 mb-3">
          Teammates
          <span class="text-gray-400 font-normal">({{ members.length }})</span>
        </h3>

        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="member in members"
            :key="member.id"
            @click="router.push(`/profile/${member.athlete?.username}`)"
            class="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <img
              v-if="member.athlete?.avatar_url"
              :src="member.athlete.avatar_url"
              :alt="member.athlete.display_name"
              class="w-12 h-12 rounded-full object-cover"
            />
            <div
              v-else
              class="w-12 h-12 rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-semibold text-sm"
            >
              {{ getInitials(member.athlete?.display_name || '?') }}
            </div>
            <p class="text-xs font-medium text-gray-900 text-center truncate w-full">
              {{ member.athlete?.display_name }}
            </p>
          </button>
        </div>
      </div>

      <!-- Upcoming Workouts Section -->
      <div v-if="upcomingWorkouts.length > 0">
        <h3 class="font-semibold text-gray-900 mb-3">Upcoming Workouts</h3>
        <div class="space-y-2">
          <div
            v-for="assignment in upcomingWorkouts"
            :key="assignment.id"
            class="card p-3 flex items-center gap-3"
          >
            <div class="w-10 h-10 rounded-lg bg-valencia-100 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-valencia-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{{ assignment.workout?.name || 'Workout' }}</p>
              <p class="text-xs text-gray-500">{{ formatDate(assignment.assigned_date) }}</p>
            </div>
            <span class="text-xs text-gray-400">
              {{ assignment.workout?.estimated_duration_min ? `${assignment.workout.estimated_duration_min}min` : '' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
