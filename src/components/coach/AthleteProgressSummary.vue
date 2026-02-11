<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { format, subDays } from 'date-fns'

const authStore = useAuthStore()
const loading = ref(true)
const athletes = ref<{
  id: string
  display_name: string
  avatar_url: string | null
  totalAssigned: number
  totalCompleted: number
  completionRate: number
}[]>([])

onMounted(async () => {
  if (!authStore.user) return

  try {
    loading.value = true
    const startDate = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    // Get assignments for last 7 days (separate queries to avoid recursion)
    const { data: assignmentsData, error: assignError } = (await supabase
      .from('workout_assignments')
      .select(`
        id,
        athlete_id,
        status,
        assigned_date,
        profiles!workout_assignments_athlete_id_fkey (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('coach_id', authStore.user.id)
      .gte('assigned_date', startDate)) as { data: any[] | null; error: any }

    if (assignError) throw assignError

    // Group by athlete and calculate stats client-side
    const athleteMap = new Map<string, {
      id: string
      display_name: string
      avatar_url: string | null
      totalAssigned: number
      totalCompleted: number
      completionRate: number
    }>()

    ;(assignmentsData || []).forEach((assignment: any) => {
      const profile = Array.isArray(assignment.profiles) ? assignment.profiles[0] : assignment.profiles
      if (!profile) return

      if (!athleteMap.has(profile.id)) {
        athleteMap.set(profile.id, {
          id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          totalAssigned: 0,
          totalCompleted: 0,
          completionRate: 0
        })
      }

      const athlete = athleteMap.get(profile.id)!
      athlete.totalAssigned++
      if (assignment.status === 'completed') {
        athlete.totalCompleted++
      }
    })

    // Calculate rates
    athleteMap.forEach(athlete => {
      athlete.completionRate = athlete.totalAssigned > 0
        ? Math.round((athlete.totalCompleted / athlete.totalAssigned) * 100)
        : 0
    })

    athletes.value = Array.from(athleteMap.values())
      .sort((a, b) => b.completionRate - a.completionRate)
  } catch (e) {
    console.error('Error loading athlete progress:', e)
  } finally {
    loading.value = false
  }
})

function getProgressColor(rate: number): string {
  if (rate >= 80) return 'bg-green-500'
  if (rate >= 60) return 'bg-blue-500'
  if (rate >= 40) return 'bg-yellow-500'
  return 'bg-red-400'
}

function getProgressLabel(rate: number): string {
  if (rate >= 80) return 'text-green-700'
  if (rate >= 60) return 'text-blue-700'
  if (rate >= 40) return 'text-yellow-700'
  return 'text-red-600'
}
</script>

<template>
  <div class="card p-4">
    <h3 class="font-semibold text-gray-900 mb-4">Athlete Progress (7 days)</h3>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="animate-pulse flex items-center gap-3">
        <div class="w-8 h-8 bg-gray-200 rounded-full"></div>
        <div class="flex-1">
          <div class="h-4 bg-gray-200 rounded w-24 mb-1"></div>
          <div class="h-1.5 bg-gray-200 rounded-full"></div>
        </div>
      </div>
    </div>

    <!-- Athletes List -->
    <div v-else-if="athletes.length > 0" class="space-y-3">
      <div
        v-for="athlete in athletes"
        :key="athlete.id"
        class="flex items-center gap-3"
      >
        <!-- Avatar -->
        <div v-if="athlete.avatar_url" class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
          <img :src="athlete.avatar_url" :alt="athlete.display_name" class="w-full h-full object-cover" />
        </div>
        <div v-else class="w-8 h-8 rounded-full bg-summit-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {{ athlete.display_name.charAt(0).toUpperCase() }}
        </div>

        <!-- Name + Progress -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-gray-900 truncate">{{ athlete.display_name }}</span>
            <span class="text-xs font-semibold ml-2" :class="getProgressLabel(athlete.completionRate)">
              {{ athlete.completionRate }}%
            </span>
          </div>
          <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="getProgressColor(athlete.completionRate)"
              :style="{ width: `${athlete.completionRate}%` }"
            ></div>
          </div>
          <div class="text-xs text-gray-500 mt-0.5">
            {{ athlete.totalCompleted }}/{{ athlete.totalAssigned }} workouts
          </div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="text-center py-4 text-sm text-gray-500">
      No athlete activity this week
    </div>
  </div>
</template>
