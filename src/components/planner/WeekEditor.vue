<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlansStore } from '@/stores/plans'
import { planSessionsService, type PlanSessionWithWorkout } from '@/services/planSessions'
import WeekNavigation from './WeekNavigation.vue'

const router = useRouter()
const plansStore = usePlansStore()

const emit = defineEmits<{
  (e: 'create-session', dayIndex: number): void
}>()

// Sessions for the current week
const weekSessions = ref<PlanSessionWithWorkout[]>([])
const loadingSessions = ref(false)

// Load sessions when week changes
watch(() => plansStore.selectedWeekId, async (weekId) => {
  if (!weekId) {
    weekSessions.value = []
    return
  }

  loadingSessions.value = true
  try {
    weekSessions.value = await planSessionsService.getWeekSessions(weekId)
  } catch (e) {
    console.error('Error loading week sessions:', e)
    weekSessions.value = []
  } finally {
    loadingSessions.value = false
  }
}, { immediate: true })

// Generate 7 days for the week grid
const days = computed(() => {
  const week = plansStore.selectedWeek
  if (!week) return []

  const plan = plansStore.activePlan
  if (!plan) return []

  // Calculate the week's start date based on plan start + week position
  // Use current date as fallback if start_date is not set
  const planStart = plan.start_date ? new Date(plan.start_date) : new Date()
  const weekIndex = plansStore.currentWeekIndex
  const weekStart = new Date(planStart)
  weekStart.setDate(weekStart.getDate() + weekIndex * 7)

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const result = []

  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)

    // Get sessions for this day
    const daySessions = weekSessions.value
      .filter(s => s.day_of_week === i)
      .map(s => ({
        id: s.id,
        workoutId: s.workout_id,
        name: s.workout?.name || 'Unnamed Session',
        type: s.workout?.session_type || 'mixed',
        rpe: s.workout?.target_rpe || null,
      }))

    result.push({
      index: i,
      name: dayNames[i],
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateObj: date,
      sessions: daySessions,
      isRest: daySessions.length === 0 && (i === 3 || i === 6), // Rest day if no sessions and default rest day
    })
  }

  return result
})

const weekLoadSummary = computed(() => {
  // Placeholder - will be computed from actual session data
  return {
    planned: 0,
    completed: 0,
  }
})

function getSessionTypeStyle(type: string) {
  const styles: Record<string, string> = {
    strength: 'bg-purple-100 text-purple-700',
    conditioning: 'bg-orange-100 text-orange-700',
    speed: 'bg-orange-100 text-orange-700',
    skills: 'bg-emerald-100 text-emerald-700',
    recovery: 'bg-blue-100 text-blue-700',
    rest: 'bg-gray-100 text-gray-400',
    power: 'bg-red-100 text-red-700',
    technique: 'bg-emerald-100 text-emerald-700',
  }
  return styles[type] || 'bg-gray-100 text-gray-600'
}
</script>

<template>
  <div class="p-4 sm:p-5">
    <!-- Empty state when no week selected -->
    <div v-if="!plansStore.selectedWeek" class="text-center py-16">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 class="text-base font-semibold text-gray-900 mb-1">No Week Selected</h3>
      <p class="text-sm text-gray-500 mb-2">Select a block from the timeline to view the week editor.</p>
      <p class="text-xs text-gray-400">
        Debug: selectedWeekId = {{ plansStore.selectedWeekId || 'null' }},
        selectedBlockId = {{ plansStore.selectedBlockId || 'null' }}
      </p>
    </div>

    <!-- Week content when week is selected -->
    <div v-else>
      <!-- Week navigation -->
      <WeekNavigation />

      <!-- Week load bar (placeholder for future analytics) -->
      <div class="bg-white rounded-xl p-3.5 mb-4 border border-gray-100 shadow-sm">
        <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Weekly Load Distribution</div>
        <div class="h-2 rounded-full bg-gray-100 flex gap-0.5 overflow-hidden">
          <div v-for="(day, i) in days" :key="i" class="h-full rounded-full transition-all" :class="day.isRest ? 'bg-gray-200' : 'bg-summit-400'" :style="{ width: (100/7) + '%' }"></div>
        </div>
        <div class="flex justify-between mt-2">
          <span v-for="day in days" :key="day.index" class="text-[10px] text-gray-400" :style="{ width: (100/7) + '%', textAlign: 'center' }">
            {{ day.name }}
          </span>
        </div>
      </div>

      <!-- Day cards grid -->
      <div class="grid grid-cols-7 gap-2">
      <div
        v-for="day in days"
        :key="day.index"
        @click="emit('create-session', day.index)"
        :class="[
          'rounded-xl border overflow-hidden cursor-pointer transition-all min-h-[140px] hover:shadow-md hover:-translate-y-0.5',
          day.isRest
            ? 'bg-gray-50 border-dashed border-gray-200'
            : 'bg-white border-gray-200 hover:border-summit-400'
        ]"
      >
        <!-- Day header -->
        <div class="px-2.5 pt-2 pb-1">
          <div class="text-[10px] font-bold uppercase tracking-wide text-gray-400">{{ day.name }}</div>
          <div class="text-xs text-gray-500">{{ day.date }}</div>
        </div>

        <!-- Sessions -->
        <div class="px-2 pb-2">
          <!-- Empty state for day -->
          <div v-if="day.sessions.length === 0 && !day.isRest" class="mt-2 p-2 border border-dashed border-gray-200 rounded-lg text-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mx-auto text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <div class="text-[10px] text-gray-400">Add session</div>
          </div>

          <!-- Rest day indicator -->
          <div v-if="day.isRest && day.sessions.length === 0" class="mt-2 py-1.5 px-2 rounded-md bg-gray-100 text-center">
            <span class="text-[10px] text-gray-400 font-medium">Rest</span>
          </div>

          <!-- Session chips (when sessions are connected) -->
          <div
            v-for="session in day.sessions"
            :key="session.id"
            :class="['mt-1 py-1.5 px-2 rounded-md text-[10px] font-semibold', getSessionTypeStyle(session.type)]"
          >
            {{ session.name }}
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>
