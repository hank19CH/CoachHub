<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getAthleteWorkoutHistory, calculateCompliance } from '@/services/coaching'
import { formatDistanceToNow } from 'date-fns'
import WorkoutCompletionCard from '@/components/coach/WorkoutCompletionCard.vue'
import PerformanceTrendsChart from '@/components/coach/PerformanceTrendsChart.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const athleteId = computed(() => route.params.id as string)
const workoutHistory = ref<any[]>([])
const compliance = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([
    fetchWorkoutHistory(),
    fetchCompliance()
  ])
})

async function fetchWorkoutHistory() {
  try {
    const data = await getAthleteWorkoutHistory(
      athleteId.value,
      authStore.user!.id
    )
    workoutHistory.value = data
  } catch (err: any) {
    console.error('Error fetching workout history:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function fetchCompliance() {
  try {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const data = await calculateCompliance(
      athleteId.value,
      authStore.user!.id,
      {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    )
    compliance.value = data
  } catch (err) {
    console.error('Error calculating compliance:', err)
  }
}

const athlete = computed(() => {
  return workoutHistory.value[0]?.athlete || null
})

const recentPBs = computed(() => {
  const pbs: any[] = []
  workoutHistory.value.forEach(completion => {
    completion.exercise_results?.forEach((result: any) => {
      if (result.is_pb) {
        pbs.push({
          exercise: result.exercise?.name || 'Exercise',
          value: result.weight_used_kg || result.distance_meters || result.duration_seconds,
          unit: result.weight_used_kg ? 'kg' : result.distance_meters ? 'm' : 's',
          date: completion.completed_at
        })
      }
    })
  })
  return pbs.slice(0, 5)
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-6 pb-20">
    <!-- Back Button -->
    <button
      @click="router.push('/coach/dashboard')"
      class="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Dashboard
    </button>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin h-8 w-8 border-4 border-summit-800 border-t-transparent rounded-full mx-auto"></div>
      <p class="mt-3 text-gray-600 text-sm">Loading athlete data...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="p-4 bg-red-50 border border-red-200 rounded-xl">
      <p class="text-red-800 text-sm">{{ error }}</p>
    </div>

    <!-- Content -->
    <div v-else>
      <!-- Athlete Header -->
      <div class="flex items-center gap-4 pb-6 border-b border-gray-200">
        <img
          :src="athlete?.avatar_url || '/default-avatar.png'"
          :alt="athlete?.display_name"
          class="avatar-xl ring-2 ring-white shadow-sm"
        />
        <div class="flex-1">
          <h1 class="text-2xl font-bold text-gray-900">
            {{ athlete?.display_name || 'Athlete' }}
          </h1>
          <p v-if="athlete?.username" class="text-gray-600">@{{ athlete.username }}</p>
          <p class="text-sm text-gray-500 mt-1">
            {{ workoutHistory.length }} workouts completed
          </p>
        </div>
      </div>

      <!-- Compliance Metrics -->
      <div v-if="compliance" class="mt-8">
        <h2 class="text-lg font-semibold text-gray-900 mb-3">30-Day Compliance</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="card p-4 text-center">
            <p class="text-2xl font-bold text-summit-800">{{ compliance.complianceRate }}%</p>
            <p class="text-xs text-gray-600 mt-1">Completion Rate</p>
          </div>
          <div class="card p-4 text-center">
            <p class="text-2xl font-bold text-summit-800">{{ compliance.totalCompleted }}/{{ compliance.totalAssigned }}</p>
            <p class="text-xs text-gray-600 mt-1">Completed</p>
          </div>
          <div class="card p-4 text-center">
            <p class="text-2xl font-bold text-summit-800">{{ compliance.currentStreak }}</p>
            <p class="text-xs text-gray-600 mt-1">Current Streak</p>
          </div>
          <div class="card p-4 text-center">
            <p class="text-2xl font-bold" :class="compliance.missedWorkouts > 0 ? 'text-red-600' : 'text-green-600'">
              {{ compliance.missedWorkouts }}
            </p>
            <p class="text-xs text-gray-600 mt-1">Missed</p>
          </div>
        </div>
      </div>

      <!-- Performance Trends -->
      <div class="mt-8">
        <PerformanceTrendsChart :athlete-id="athleteId" />
      </div>

      <!-- Recent Personal Bests -->
      <div v-if="recentPBs.length" class="mt-8">
        <h2 class="text-lg font-semibold text-gray-900 mb-3">🏆 Recent Personal Bests</h2>
        <div class="space-y-2">
          <div
            v-for="(pb, index) in recentPBs"
            :key="index"
            class="card p-3 flex items-center justify-between"
          >
            <div>
              <span class="font-medium text-gray-900">{{ pb.exercise }}</span>
              <span class="text-xs text-gray-500 ml-2">
                {{ formatDistanceToNow(new Date(pb.date), { addSuffix: true }) }}
              </span>
            </div>
            <span class="font-semibold text-peak-600">
              {{ pb.value }}{{ pb.unit }}
            </span>
          </div>
        </div>
      </div>

      <!-- Workout History -->
      <div class="mt-8">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Workout History</h2>
        <div v-if="workoutHistory.length" class="space-y-4">
          <WorkoutCompletionCard
            v-for="completion in workoutHistory"
            :key="completion.id"
            :completion="completion"
            @feedback-added="fetchWorkoutHistory"
          />
        </div>
        <div v-else class="text-center py-8">
          <p class="text-sm text-gray-500">No workout history yet</p>
        </div>
      </div>
    </div>
  </div>
</template>
