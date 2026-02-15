<script setup lang="ts">
import { ref, onMounted, watch, computed, shallowRef } from 'vue'
import { usePlansStore } from '@/stores/plans'
import { useAuthStore } from '@/stores/auth'
import { planAnalyticsService, type WeeklyVolume, type AthleteCompliance, type BlockSummary } from '@/services/planAnalytics'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Line } from 'vue-chartjs'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const plansStore = usePlansStore()
const authStore = useAuthStore()

const loading = ref(true)
const activeTab = ref<'volume' | 'compliance' | 'blocks'>('volume')

const weeklyTrends = ref<WeeklyVolume[]>([])
const athleteCompliance = ref<AthleteCompliance[]>([])
const blockSummaries = ref<BlockSummary[]>([])

// Volume chart data
const volumeChartData = computed(() => ({
  labels: weeklyTrends.value.map(w => `W${w.weekNumber}`),
  datasets: [
    {
      label: 'Planned',
      data: weeklyTrends.value.map(w => Math.round(w.plannedVolume / 1000)), // in tonnes
      backgroundColor: 'rgba(93, 93, 255, 0.15)',
      borderColor: 'rgba(93, 93, 255, 0.8)',
      borderWidth: 2,
      borderRadius: 4,
    },
    {
      label: 'Actual',
      data: weeklyTrends.value.map(w => Math.round(w.actualVolume / 1000)),
      backgroundColor: 'rgba(16, 185, 129, 0.3)',
      borderColor: 'rgba(16, 185, 129, 0.9)',
      borderWidth: 2,
      borderRadius: 4,
    },
  ],
}))

const volumeChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 12, padding: 12, font: { size: 10 } } },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y} tonnes`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    y: {
      title: { display: true, text: 'Volume (tonnes)', font: { size: 10 } },
      grid: { color: 'rgba(0,0,0,0.05)' },
      ticks: { font: { size: 10 } },
      beginAtZero: true,
    },
  },
}

// Intensity chart data
const intensityChartData = computed(() => ({
  labels: weeklyTrends.value.map(w => `W${w.weekNumber}`),
  datasets: [
    {
      label: 'Avg Intensity (%)',
      data: weeklyTrends.value.map(w => w.plannedIntensity),
      borderColor: 'rgba(239, 68, 68, 0.8)',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6,
    },
  ],
}))

const intensityChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `Intensity: ${ctx.parsed.y}%`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    y: {
      title: { display: true, text: '%', font: { size: 10 } },
      grid: { color: 'rgba(0,0,0,0.05)' },
      ticks: { font: { size: 10 } },
      min: 0,
      max: 100,
    },
  },
}

// Compliance rate
const overallCompliance = computed(() => {
  const total = athleteCompliance.value.reduce((sum, a) => sum + a.totalAssigned, 0)
  const completed = athleteCompliance.value.reduce((sum, a) => sum + a.totalCompleted, 0)
  return total > 0 ? Math.round((completed / total) * 100) : 0
})

async function loadAnalytics() {
  const planId = plansStore.activePlan?.id
  const coachId = authStore.user?.id
  if (!planId || !coachId) return

  loading.value = true
  try {
    const [trends, compliance, summaries] = await Promise.all([
      planAnalyticsService.getWeeklyTrends(planId, coachId),
      planAnalyticsService.getAthleteCompliance(planId),
      planAnalyticsService.getBlockSummaries(planId, coachId),
    ])
    weeklyTrends.value = trends
    athleteCompliance.value = compliance
    blockSummaries.value = summaries
  } catch (e) {
    console.error('Error loading analytics:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadAnalytics)
watch(() => plansStore.activePlan?.id, () => {
  if (plansStore.activePlan) loadAnalytics()
})

function getComplianceColor(rate: number): string {
  if (rate >= 90) return 'text-emerald-600'
  if (rate >= 70) return 'text-green-500'
  if (rate >= 50) return 'text-amber-500'
  return 'text-red-500'
}

function getComplianceBg(rate: number): string {
  if (rate >= 90) return 'bg-emerald-500'
  if (rate >= 70) return 'bg-green-500'
  if (rate >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}
</script>

<template>
  <div class="p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-bold text-gray-900">Plan Analytics</h3>
      <button @click="loadAnalytics" class="text-[10px] text-summit-600 font-semibold hover:text-summit-700">
        Refresh
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div v-for="i in 3" :key="i" class="animate-pulse bg-gray-100 rounded-xl h-32"></div>
    </div>

    <template v-else>
      <!-- Tab navigation -->
      <div class="flex gap-1 mb-4 bg-gray-100 rounded-lg p-0.5">
        <button
          v-for="tab in (['volume', 'compliance', 'blocks'] as const)"
          :key="tab"
          @click="activeTab = tab"
          :class="[
            'flex-1 py-1.5 text-[10px] font-semibold rounded-md transition-colors capitalize',
            activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          ]"
        >
          {{ tab }}
        </button>
      </div>

      <!-- Volume & Intensity tab -->
      <div v-if="activeTab === 'volume'" class="space-y-4">
        <!-- Quick stats -->
        <div class="grid grid-cols-3 gap-2">
          <div class="bg-summit-50 rounded-xl p-3 text-center">
            <div class="text-lg font-bold text-summit-700">{{ weeklyTrends.length }}</div>
            <div class="text-[10px] text-summit-600">Weeks</div>
          </div>
          <div class="bg-emerald-50 rounded-xl p-3 text-center">
            <div class="text-lg font-bold text-emerald-700">{{ weeklyTrends.reduce((s, w) => s + w.sessionCount, 0) }}</div>
            <div class="text-[10px] text-emerald-600">Sessions</div>
          </div>
          <div class="bg-amber-50 rounded-xl p-3 text-center">
            <div class="text-lg font-bold text-amber-700">{{ overallCompliance }}%</div>
            <div class="text-[10px] text-amber-600">Compliance</div>
          </div>
        </div>

        <!-- Volume chart -->
        <div v-if="weeklyTrends.length > 0" class="bg-white rounded-xl border border-gray-100 p-3">
          <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Volume Trend (tonnes)</div>
          <div class="h-[180px]">
            <Bar :data="volumeChartData" :options="volumeChartOptions" />
          </div>
        </div>

        <!-- Intensity chart -->
        <div v-if="weeklyTrends.length > 0" class="bg-white rounded-xl border border-gray-100 p-3">
          <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Intensity Trend</div>
          <div class="h-[140px]">
            <Line :data="intensityChartData" :options="intensityChartOptions" />
          </div>
        </div>

        <div v-if="weeklyTrends.length === 0" class="text-center py-8 text-sm text-gray-400">
          No data yet — sessions will appear after workouts are created and assigned.
        </div>
      </div>

      <!-- Compliance tab -->
      <div v-if="activeTab === 'compliance'" class="space-y-3">
        <!-- Overall compliance bar -->
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-gray-700">Overall Compliance</span>
            <span :class="['text-lg font-bold', getComplianceColor(overallCompliance)]">{{ overallCompliance }}%</span>
          </div>
          <div class="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              :class="['h-full rounded-full transition-all', getComplianceBg(overallCompliance)]"
              :style="{ width: overallCompliance + '%' }"
            ></div>
          </div>
        </div>

        <!-- Per-athlete -->
        <div v-if="athleteCompliance.length > 0" class="space-y-2">
          <div
            v-for="athlete in athleteCompliance"
            :key="athlete.athleteId"
            class="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3"
          >
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-summit-400 to-summit-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {{ athlete.displayName.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-semibold text-gray-900 truncate">{{ athlete.displayName }}</span>
                <span :class="['text-xs font-bold', getComplianceColor(athlete.complianceRate)]">
                  {{ athlete.complianceRate }}%
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  :class="['h-full rounded-full', getComplianceBg(athlete.complianceRate)]"
                  :style="{ width: athlete.complianceRate + '%' }"
                ></div>
              </div>
              <div class="flex gap-3 mt-1 text-[10px] text-gray-400">
                <span>{{ athlete.totalCompleted }}/{{ athlete.totalAssigned }} done</span>
                <span v-if="athlete.totalSkipped > 0" class="text-red-400">{{ athlete.totalSkipped }} skipped</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-sm text-gray-400">
          No assignments yet. Publish a week to start tracking compliance.
        </div>
      </div>

      <!-- Block summaries tab -->
      <div v-if="activeTab === 'blocks'" class="space-y-3">
        <div v-if="blockSummaries.length === 0" class="text-center py-8 text-sm text-gray-400">
          No block data yet.
        </div>

        <div
          v-for="block in blockSummaries"
          :key="block.blockId"
          class="bg-white rounded-xl border border-gray-100 p-4"
        >
          <div class="flex items-center justify-between mb-3">
            <div>
              <h4 class="text-sm font-bold text-gray-900">{{ block.blockName }}</h4>
              <p class="text-[10px] text-gray-400 capitalize">{{ block.blockType?.replace(/_/g, ' ') || 'Custom' }} · {{ block.weekCount }} weeks</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <!-- Planned vs Actual Volume -->
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Planned Vol</div>
              <div class="text-sm font-bold text-gray-900">
                {{ (block.plannedVolume / 1000).toFixed(1) }}t
              </div>
            </div>
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Actual Vol</div>
              <div class="text-sm font-bold" :class="block.actualVolume > 0 ? 'text-emerald-600' : 'text-gray-300'">
                {{ block.actualVolume > 0 ? (block.actualVolume / 1000).toFixed(1) + 't' : '—' }}
              </div>
            </div>

            <!-- Sessions -->
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Sessions</div>
              <div class="text-sm font-bold text-gray-900">{{ block.totalSessions }}</div>
            </div>
            <div>
              <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Completed</div>
              <div class="text-sm font-bold" :class="block.completedSessions > 0 ? 'text-emerald-600' : 'text-gray-300'">
                {{ block.completedSessions || '—' }}
              </div>
            </div>
          </div>

          <!-- Volume bar -->
          <div v-if="block.plannedVolume > 0" class="mt-3">
            <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                class="h-full rounded-full bg-summit-500 transition-all"
                :style="{ width: Math.min(100, block.plannedVolume > 0 ? (block.actualVolume / block.plannedVolume) * 100 : 0) + '%' }"
              ></div>
            </div>
            <div class="text-[10px] text-gray-400 mt-1 text-right">
              {{ block.plannedVolume > 0 ? Math.round((block.actualVolume / block.plannedVolume) * 100) : 0 }}% of planned
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
