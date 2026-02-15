<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePlansStore } from '@/stores/plans'
import type { Database } from '@/types/database'

type Plan = Database['public']['Tables']['plans']['Row']

const router = useRouter()
const authStore = useAuthStore()
const plansStore = usePlansStore()

const emit = defineEmits<{
  (e: 'create'): void
}>()

const filter = ref<'all' | 'draft' | 'active' | 'completed' | 'archived'>('all')

const filteredPlans = computed(() => {
  if (filter.value === 'all') return plansStore.plans
  return plansStore.plans.filter(p => p.status === filter.value)
})

onMounted(async () => {
  if (!authStore.user) return
  await plansStore.fetchPlans(authStore.user.id)
})

function openPlan(plan: Plan) {
  router.push(`/coach/planner/${plan.id}`)
}

function getStatusColor(status: string) {
  switch (status) {
    case 'draft': return 'bg-gray-100 text-gray-600'
    case 'active': return 'bg-emerald-100 text-emerald-700'
    case 'completed': return 'bg-blue-100 text-blue-700'
    case 'archived': return 'bg-gray-100 text-gray-400'
    default: return 'bg-gray-100 text-gray-500'
  }
}

function getModelLabel(model: string | null) {
  if (!model) return null
  const labels: Record<string, string> = {
    linear: 'Linear',
    undulating: 'Undulating',
    block: 'Block',
    conjugate: 'Conjugate',
    polarized: 'Polarized',
    flexible: 'Flexible',
    custom: 'Custom',
  }
  return labels[model] || model
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
        <h1 class="font-display text-lg font-semibold text-gray-900">Training Plans</h1>
        <button @click="emit('create')" class="text-summit-700 hover:text-summit-800 p-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <!-- Status filter tabs -->
      <div class="flex gap-2 px-4 pb-3 overflow-x-auto">
        <button
          v-for="f in (['all', 'active', 'draft', 'completed', 'archived'] as const)"
          :key="f"
          @click="filter = f"
          :class="[
            'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors',
            filter === f
              ? 'bg-summit-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          ]"
        >
          {{ f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) }}
          <span v-if="f !== 'all'" class="ml-1 opacity-75">{{ plansStore.planStatusCounts[f] }}</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="plansStore.loading" class="p-6 space-y-4">
      <div v-for="i in 3" :key="i" class="animate-pulse">
        <div class="bg-gray-200 rounded-2xl h-28"></div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="filteredPlans.length === 0" class="p-8 text-center">
      <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-summit-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <h2 class="font-display text-xl font-bold text-gray-900 mb-2">
        {{ filter === 'all' ? 'No Plans Yet' : `No ${filter} Plans` }}
      </h2>
      <p class="text-gray-600 text-sm mb-6">
        Create a training plan to structure your athletes' season with periodized blocks and weekly programming.
      </p>
      <button @click="emit('create')" class="btn-primary">Create Your First Plan</button>
    </div>

    <!-- Plans list -->
    <div v-else class="p-4 space-y-3">
      <div
        v-for="plan in filteredPlans"
        :key="plan.id"
        class="card-hover p-4 cursor-pointer"
        @click="openPlan(plan)"
      >
        <div class="flex items-start justify-between mb-2">
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-gray-900 truncate">{{ plan.name }}</h3>
            <p class="text-sm text-gray-500 mt-0.5">
              {{ formatDate(plan.start_date) }} – {{ formatDate(plan.end_date) }}
            </p>
          </div>
          <span :class="['text-xs font-semibold px-2.5 py-1 rounded-full ml-3', getStatusColor(plan.status)]">
            {{ plan.status }}
          </span>
        </div>

        <div class="flex items-center gap-3 mt-3">
          <span v-if="getModelLabel(plan.periodization_model)" class="text-xs font-medium px-2 py-0.5 rounded bg-summit-100 text-summit-700">
            {{ getModelLabel(plan.periodization_model) }}
          </span>
          <span v-if="plan.ai_generated" class="text-xs font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-700">
            AI Generated
          </span>
          <span v-if="plan.goal_description" class="text-xs text-gray-400 truncate flex-1">
            {{ plan.goal_description }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
