<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { assignmentsService } from '@/services/assignments'
import { format, addDays, startOfWeek, isSameDay, isWeekend } from 'date-fns'
import AssignWorkoutModal from '@/components/AssignWorkoutModal.vue'
import Toast from '@/components/ui/Toast.vue'

const authStore = useAuthStore()

// State
const assignments = ref<any[]>([])
const loading = ref(true)
const currentWeekStart = ref<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }))

// Assign modal
const showAssignModal = ref(false)
const preselectedAthleteId = ref<string | null>(null)

// Toast
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastVisible = ref(false)
function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

// Computed week days
const weekDays = computed(() => {
  const days = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(currentWeekStart.value, i)
    days.push({
      date,
      dateString: format(date, 'yyyy-MM-dd'),
      dayName: format(date, 'EEE'),
      dayNum: format(date, 'd'),
      isToday: isSameDay(date, new Date()),
      isWeekend: isWeekend(date)
    })
  }
  return days
})

const weekRangeDisplay = computed(() => {
  const start = format(currentWeekStart.value, 'MMM d')
  const end = format(addDays(currentWeekStart.value, 6), 'MMM d, yyyy')
  return `${start} - ${end}`
})

// Group assignments by athlete
const athleteRows = computed(() => {
  const athleteMap = new Map<string, {
    athlete: { id: string; display_name: string; username: string; avatar_url: string | null }
    assignmentsByDate: Map<string, any[]>
    weeklyLoad: number
  }>()

  assignments.value.forEach((a: any) => {
    const athlete = Array.isArray(a.athlete) ? a.athlete[0] : a.athlete
    if (!athlete) return

    if (!athleteMap.has(athlete.id)) {
      athleteMap.set(athlete.id, {
        athlete,
        assignmentsByDate: new Map(),
        weeklyLoad: 0
      })
    }

    const row = athleteMap.get(athlete.id)!
    const dateStr = a.assigned_date
    if (!row.assignmentsByDate.has(dateStr)) {
      row.assignmentsByDate.set(dateStr, [])
    }
    const workout = Array.isArray(a.workout) ? a.workout[0] : a.workout
    row.assignmentsByDate.get(dateStr)!.push({ ...a, workout })
    row.weeklyLoad += workout?.estimated_duration_min || 0
  })

  return Array.from(athleteMap.values()).sort((a, b) =>
    a.athlete.display_name.localeCompare(b.athlete.display_name)
  )
})

// Methods
async function loadAssignments() {
  if (!authStore.user) return
  loading.value = true

  try {
    const startDate = format(currentWeekStart.value, 'yyyy-MM-dd')
    const endDate = format(addDays(currentWeekStart.value, 6), 'yyyy-MM-dd')

    const data = await assignmentsService.getAssignmentsByDateRange(
      authStore.user.id,
      startDate,
      endDate
    )
    assignments.value = data
  } catch (e) {
    console.error('Error loading calendar:', e)
    showToast('Failed to load calendar', 'error')
  } finally {
    loading.value = false
  }
}

function previousWeek() {
  currentWeekStart.value = addDays(currentWeekStart.value, -7)
  loadAssignments()
}

function nextWeek() {
  currentWeekStart.value = addDays(currentWeekStart.value, 7)
  loadAssignments()
}

function goToToday() {
  currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: 1 })
  loadAssignments()
}

function openAssignModal(athleteId?: string) {
  preselectedAthleteId.value = athleteId || null
  showAssignModal.value = true
}

function handleAssigned() {
  showAssignModal.value = false
  preselectedAthleteId.value = null
  showToast('Workout assigned')
  loadAssignments()
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700 border-green-200'
    case 'skipped': return 'bg-gray-100 text-gray-500 border-gray-200'
    default: return 'bg-summit-50 text-summit-700 border-summit-200'
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓'
    case 'skipped': return '—'
    default: return ''
  }
}

onMounted(() => {
  loadAssignments()
})
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center justify-between mb-3">
        <h1 class="font-display text-xl font-bold text-gray-900">Calendar</h1>
        <button @click="openAssignModal()" class="btn-primary px-4 py-2 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Assign
        </button>
      </div>

      <!-- Week navigation -->
      <div class="flex items-center justify-between">
        <button @click="previousWeek" class="p-2 hover:bg-gray-100 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="text-center">
          <span class="font-semibold text-gray-900">{{ weekRangeDisplay }}</span>
          <button
            v-if="!weekDays.some(d => d.isToday)"
            @click="goToToday"
            class="ml-2 text-xs text-summit-700 hover:underline"
          >
            Today
          </button>
        </div>
        <button @click="nextWeek" class="p-2 hover:bg-gray-100 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-6 text-center">
      <div class="animate-spin h-8 w-8 border-4 border-summit-800 border-t-transparent rounded-full mx-auto"></div>
      <p class="mt-3 text-gray-600 text-sm">Loading calendar...</p>
    </div>

    <!-- Calendar Content -->
    <div v-else class="overflow-x-auto">
      <!-- Day Headers -->
      <div class="grid grid-cols-8 border-b border-gray-200 bg-gray-50 min-w-[700px]">
        <div class="px-3 py-2 text-xs font-semibold text-gray-500 border-r border-gray-200">
          Athlete
        </div>
        <div
          v-for="day in weekDays"
          :key="day.dateString"
          class="px-2 py-2 text-center border-r border-gray-200 last:border-r-0"
          :class="{ 'bg-summit-50': day.isToday }"
        >
          <div class="text-xs font-medium text-gray-500 uppercase">{{ day.dayName }}</div>
          <div class="text-sm font-bold" :class="day.isToday ? 'text-summit-700' : 'text-gray-900'">
            {{ day.dayNum }}
          </div>
        </div>
      </div>

      <!-- Athlete Rows -->
      <div
        v-for="row in athleteRows"
        :key="row.athlete.id"
        class="grid grid-cols-8 border-b border-gray-100 min-w-[700px] hover:bg-gray-50/50"
      >
        <!-- Athlete Info -->
        <div class="px-3 py-3 border-r border-gray-200 flex items-center gap-2">
          <div v-if="row.athlete.avatar_url" class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
            <img :src="row.athlete.avatar_url" :alt="row.athlete.display_name" class="w-full h-full object-cover" />
          </div>
          <div v-else class="w-8 h-8 rounded-full bg-summit-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
            {{ row.athlete.display_name.charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">{{ row.athlete.display_name }}</div>
            <div class="text-xs text-gray-500">{{ row.weeklyLoad }}m/wk</div>
          </div>
        </div>

        <!-- Day Cells -->
        <div
          v-for="day in weekDays"
          :key="day.dateString"
          class="px-1 py-2 border-r border-gray-200 last:border-r-0 min-h-[80px] relative group"
          :class="{ 'bg-summit-50/50': day.isToday }"
        >
          <!-- Assignments for this day -->
          <div
            v-for="assignment in (row.assignmentsByDate.get(day.dateString) || [])"
            :key="assignment.id"
            class="text-xs rounded px-1.5 py-1 mb-1 border truncate cursor-default"
            :class="getStatusColor(assignment.status)"
            :title="`${assignment.workout?.name || 'Workout'} - ${assignment.status}`"
          >
            <span v-if="getStatusIcon(assignment.status)" class="mr-0.5">{{ getStatusIcon(assignment.status) }}</span>
            {{ assignment.workout?.name || 'Workout' }}
          </div>

          <!-- Add button (shows on hover) -->
          <button
            @click="openAssignModal(row.athlete.id)"
            class="absolute bottom-1 right-1 w-5 h-5 bg-summit-600 text-white rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex items-center justify-center text-xs"
          >
            +
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="athleteRows.length === 0" class="text-center py-16 px-4">
        <div class="w-16 h-16 mx-auto mb-4 bg-summit-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 class="font-semibold text-gray-900 mb-2">No assignments this week</h3>
        <p class="text-sm text-gray-600 mb-4">Assign workouts to athletes to see them on the calendar</p>
        <button @click="openAssignModal()" class="btn-primary px-6">
          Assign a Workout
        </button>
      </div>
    </div>

    <!-- Assign Workout Modal -->
    <AssignWorkoutModal
      :is-open="showAssignModal"
      :preselected-athlete-id="preselectedAthleteId"
      @close="showAssignModal = false"
      @assigned="handleAssigned"
    />

    <!-- Toast -->
    <Toast
      :message="toastMessage"
      :type="toastType"
      :visible="toastVisible"
      @close="toastVisible = false"
    />
  </div>
</template>
