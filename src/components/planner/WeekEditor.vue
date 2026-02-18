<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlansStore } from '@/stores/plans'
import { useAuthStore } from '@/stores/auth'
import { planSessionsService, type PlanSessionWithWorkout } from '@/services/planSessions'
import WeekNavigation from './WeekNavigation.vue'
import Toast from '@/components/ui/Toast.vue'

const router = useRouter()
const plansStore = usePlansStore()
const authStore = useAuthStore()

const emit = defineEmits<{
  (e: 'create-session', dayIndex: number): void
  (e: 'open-session', payload: { workoutId: string; sessionId: string }): void
}>()

// Sessions for the current week
const weekSessions = ref<PlanSessionWithWorkout[]>([])
const loadingSessions = ref(false)

// Promote to library state
const promotingSessionId = ref<string | null>(null)

// Toast
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastVisible = ref(false)

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

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

/**
 * Reload sessions (e.g. after creating a new one inline).
 */
async function refreshSessions() {
  const weekId = plansStore.selectedWeekId
  if (!weekId) return
  try {
    weekSessions.value = await planSessionsService.getWeekSessions(weekId)
  } catch (e) {
    console.error('Error refreshing sessions:', e)
  }
}

// Generate 7 days for the week grid
const days = computed(() => {
  const week = plansStore.selectedWeek
  if (!week) return []

  const plan = plansStore.activePlan
  if (!plan) return []

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
        name: s.session_name || s.workout?.name || 'Unnamed Session',
        type: s.workout?.session_type || 'mixed',
        rpe: s.workout?.target_rpe || null,
        isLibrary: !!s.workout_id, // has a linked workout = promoted to library
        exerciseCount: Array.isArray(s.session_data) ? (s.session_data as any[]).length : 0,
      }))

    result.push({
      index: i,
      name: dayNames[i],
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateObj: date,
      sessions: daySessions,
      isRest: daySessions.length === 0 && (i === 3 || i === 6),
    })
  }

  return result
})

function handleSessionClick(event: Event, session: { id: string; workoutId: string | null }) {
  event.stopPropagation()
  if (session.workoutId) {
    // Promoted session — open in WorkoutBuilder
    emit('open-session', { workoutId: session.workoutId, sessionId: session.id })
  } else {
    // Self-contained session — for now navigate to planner session editor
    // (Sprint 12.6 will add sessionMode to WorkoutBuilder)
    emit('open-session', { workoutId: '', sessionId: session.id })
  }
}

async function handleAddSession(dayIndex: number) {
  // Create a self-contained plan session for this day
  const weekId = plansStore.selectedWeekId
  if (!weekId) return

  try {
    const orderIndex = await planSessionsService.getNextOrderIndex(weekId, dayIndex)
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    await planSessionsService.createSelfContainedSession({
      blockWeekId: weekId,
      dayOfWeek: dayIndex,
      orderIndex,
      sessionName: `${dayNames[dayIndex]} Session`,
    })
    await refreshSessions()
  } catch (e) {
    console.error('Error creating session:', e)
    showToast('Failed to create session', 'error')
  }
}

async function handlePromoteToLibrary(event: Event, session: { id: string; name: string }) {
  event.stopPropagation()
  const coachId = authStore.user?.id
  if (!coachId) return

  promotingSessionId.value = session.id
  try {
    await planSessionsService.promoteSessionToLibrary({
      planSessionId: session.id,
      workoutName: session.name,
      coachId,
    })
    showToast('Saved to Workout Library')
    await refreshSessions()
  } catch (e) {
    console.error('Error promoting session:', e)
    showToast(e instanceof Error ? e.message : 'Failed to save to library', 'error')
  } finally {
    promotingSessionId.value = null
  }
}

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
    </div>

    <!-- Week content when week is selected -->
    <div v-else>
      <!-- Week navigation -->
      <WeekNavigation />

      <!-- Week load bar -->
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
        @click="handleAddSession(day.index)"
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

          <!-- Session chips -->
          <div
            v-for="session in day.sessions"
            :key="session.id"
            @click="handleSessionClick($event, session)"
            :class="['mt-1 py-1.5 px-2 rounded-md text-[10px] font-semibold cursor-pointer hover:ring-2 hover:ring-summit-400 transition-all relative group', getSessionTypeStyle(session.type)]"
          >
            <div class="flex items-center gap-1">
              <!-- Library badge (promoted) -->
              <svg
                v-if="session.isLibrary"
                xmlns="http://www.w3.org/2000/svg"
                class="w-3 h-3 shrink-0 opacity-60"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
              </svg>
              <span class="truncate">{{ session.name }}</span>
            </div>

            <!-- Exercise count badge -->
            <div v-if="session.exerciseCount > 0 && !session.isLibrary" class="text-[8px] opacity-60 mt-0.5">
              {{ session.exerciseCount }} exercises
            </div>

            <!-- Save to Library button (only for non-promoted sessions) -->
            <button
              v-if="!session.isLibrary"
              @click.stop="handlePromoteToLibrary($event, session)"
              :disabled="promotingSessionId === session.id"
              class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white shadow-sm border border-gray-200
                     flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity
                     hover:bg-summit-50 hover:border-summit-300"
              title="Save to Workout Library"
            >
              <svg
                v-if="promotingSessionId !== session.id"
                xmlns="http://www.w3.org/2000/svg"
                class="w-3 h-3 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <svg
                v-else
                class="animate-spin w-3 h-3 text-summit-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </button>
          </div>

          <!-- + Session link (when sessions already exist on this day) -->
          <button
            v-if="day.sessions.length > 0"
            @click.stop="handleAddSession(day.index)"
            class="mt-1.5 w-full text-[10px] text-gray-400 hover:text-summit-600 font-medium text-center py-0.5 rounded hover:bg-summit-50 transition-colors"
          >
            + Session
          </button>
        </div>
      </div>
    </div>
    </div>

    <Toast :message="toastMessage" :type="toastType" :visible="toastVisible" @close="toastVisible = false" />
  </div>
</template>
