<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getAthleteCompletions } from '@/services/coaching'
import WorkoutCompletionCard from '@/components/coach/WorkoutCompletionCard.vue'
import ComplianceMetrics from '@/components/coach/ComplianceMetrics.vue'
import AthleteProgressSummary from '@/components/coach/AthleteProgressSummary.vue'

const authStore = useAuthStore()
const completions = ref<any[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const selectedAthlete = ref('all')
const dateRange = ref<number | null>(7)
const athletesList = ref<any[]>([])

onMounted(async () => {
  await fetchCompletions()
})

async function fetchCompletions() {
  loading.value = true
  error.value = null

  try {
    const filters: any = { limit: 50 }

    if (selectedAthlete.value !== 'all') {
      filters.athleteId = selectedAthlete.value
    }

    if (dateRange.value) {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - dateRange.value)
      filters.startDate = startDate.toISOString()
    }

    const data = await getAthleteCompletions(authStore.user!.id, filters)
    completions.value = data

    // Extract unique athletes for filter dropdown
    const uniqueAthletes = new Map()
    data.forEach((c: any) => {
      if (c.athlete && !uniqueAthletes.has(c.athlete.id)) {
        uniqueAthletes.set(c.athlete.id, c.athlete)
      }
    })
    athletesList.value = Array.from(uniqueAthletes.values())
  } catch (err: any) {
    console.error('Error fetching completions:', err)
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const summaryStats = computed(() => {
  if (!completions.value.length) return null

  const totalCompletions = completions.value.length
  const totalPBs = completions.value.filter(c => c.has_pb).length
  const avgDuration = Math.round(
    completions.value.reduce((sum, c) => sum + (c.duration_minutes || 0), 0) / totalCompletions
  )

  return { totalCompletions, totalPBs, avgDuration }
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-6">
    <!-- Header -->
    <div class="border-b border-gray-200 pb-4">
      <h1 class="text-2xl font-bold text-gray-900">Athlete Activity</h1>
      <p class="text-gray-600 mt-1 text-sm">Monitor workout completions and provide feedback</p>
    </div>

    <!-- Summary Stats -->
    <ComplianceMetrics
      v-if="summaryStats"
      :stats="summaryStats"
      class="mt-6"
    />

    <!-- Athlete Progress Summary -->
    <AthleteProgressSummary class="mt-6" />

    <!-- Filters -->
    <div class="mt-6 flex gap-3">
      <select
        v-model="selectedAthlete"
        @change="fetchCompletions"
        class="input text-sm !py-2"
      >
        <option value="all">All Athletes</option>
        <option
          v-for="athlete in athletesList"
          :key="athlete.id"
          :value="athlete.id"
        >
          {{ athlete.display_name }}
        </option>
      </select>

      <select
        v-model="dateRange"
        @change="fetchCompletions"
        class="input text-sm !py-2"
      >
        <option :value="7">Last 7 Days</option>
        <option :value="14">Last 14 Days</option>
        <option :value="30">Last 30 Days</option>
        <option :value="null">All Time</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="mt-8 text-center py-12">
      <div class="animate-spin h-8 w-8 border-4 border-summit-800 border-t-transparent rounded-full mx-auto"></div>
      <p class="mt-3 text-gray-600 text-sm">Loading activity...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mt-8 p-4 bg-red-50 border border-red-200 rounded-xl">
      <p class="text-red-800 text-sm">{{ error }}</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="!completions.length" class="mt-8 text-center py-16">
      <div class="text-4xl mb-3">📊</div>
      <p class="text-gray-600 font-medium">No workout completions found</p>
      <p class="text-sm text-gray-500 mt-1">
        Completions will appear here once athletes finish workouts
      </p>
    </div>

    <!-- Activity Feed -->
    <div v-else class="mt-6 space-y-4 pb-20">
      <WorkoutCompletionCard
        v-for="completion in completions"
        :key="completion.id"
        :completion="completion"
        @feedback-added="fetchCompletions"
      />
    </div>
  </div>
</template>
