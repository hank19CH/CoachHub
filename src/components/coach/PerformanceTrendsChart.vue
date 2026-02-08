<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { useAuthStore } from '@/stores/auth'
import { getPerformanceTrends } from '@/services/coaching'
import { startOfWeek, format } from 'date-fns'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps<{
  athleteId: string
  weeks?: number
}>()

const authStore = useAuthStore()
const trendsData = ref<any[] | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const data = await getPerformanceTrends(
      props.athleteId,
      authStore.user!.id,
      props.weeks || 12
    )
    trendsData.value = data
  } catch (err) {
    console.error('Error fetching trends:', err)
  } finally {
    loading.value = false
  }
})

const chartData = computed(() => {
  if (!trendsData.value || trendsData.value.length === 0) return null

  // Group completions by week
  const weekMap = new Map<string, { count: number; totalDuration: number; pbs: number }>()

  for (const completion of trendsData.value) {
    const weekStart = startOfWeek(new Date(completion.completed_at), { weekStartsOn: 1 })
    const weekKey = format(weekStart, 'MMM d')

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { count: 0, totalDuration: 0, pbs: 0 })
    }

    const week = weekMap.get(weekKey)!
    week.count++
    week.totalDuration += completion.duration_minutes || 0
    week.pbs += completion.exercise_results?.filter((r: any) => r.is_pb).length || 0
  }

  const labels = Array.from(weekMap.keys())
  const workoutCounts = Array.from(weekMap.values()).map(w => w.count)
  const durations = Array.from(weekMap.values()).map(w => Math.round(w.totalDuration / (w.count || 1)))

  return {
    labels,
    datasets: [
      {
        label: 'Workouts',
        data: workoutCounts,
        borderColor: '#5b21b6',
        backgroundColor: 'rgba(91, 33, 182, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Avg Duration (min)',
        data: durations,
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const
    }
  },
  scales: {
    y: {
      beginAtZero: true
    }
  }
}
</script>

<template>
  <div class="card p-6">
    <h3 class="font-semibold text-gray-900 mb-4">Performance Trends</h3>
    <div v-if="loading" class="h-48 flex items-center justify-center">
      <div class="animate-spin h-6 w-6 border-2 border-summit-800 border-t-transparent rounded-full"></div>
    </div>
    <div v-else-if="chartData" class="h-64">
      <Line :data="chartData" :options="chartOptions" />
    </div>
    <div v-else class="h-48 flex items-center justify-center">
      <p class="text-sm text-gray-500">No trend data available yet</p>
    </div>
  </div>
</template>
