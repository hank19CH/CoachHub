<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { assignmentsService } from '@/services/assignments'
import type { Assignment } from '@/services/assignments'
import AssignmentCard from '@/components/athlete/AssignmentCard.vue'
import WorkoutPreviewModal from '@/components/athlete/WorkoutPreviewModal.vue'

const router = useRouter()
const authStore = useAuthStore()

// State
const selectedDate = ref(new Date().toISOString().split('T')[0])
const assignments = ref<Assignment[]>([])
const upcomingAssignments = ref<Assignment[]>([])
const stats = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedAssignment = ref<Assignment | null>(null)
const isModalOpen = ref(false)

// Computed
const isToday = computed(() => {
  return selectedDate.value === new Date().toISOString().split('T')[0]
})

const formattedDate = computed(() => {
  const date = new Date(selectedDate.value + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

// Methods
async function loadAssignments() {
  if (!authStore.user?.id) return

  loading.value = true
  error.value = null

  try {
    const data = await assignmentsService.fetchAssignmentsForDate(
      authStore.user.id,
      selectedDate.value
    )
    assignments.value = data
  } catch (err) {
    console.error('Failed to load assignments:', err)
    error.value = 'Failed to load workouts. Please try again.'
  } finally {
    loading.value = false
  }
}

async function loadUpcoming() {
  if (!authStore.user?.id || !isToday.value) return

  try {
    const data = await assignmentsService.fetchUpcomingAssignments(authStore.user.id)
    upcomingAssignments.value = data
  } catch (err) {
    console.error('Failed to load upcoming assignments:', err)
  }
}

async function loadStats() {
  if (!authStore.user?.id) return

  try {
    const data = await assignmentsService.getAssignmentStats(authStore.user.id)
    stats.value = data
  } catch (err) {
    console.error('Failed to load stats:', err)
  }
}

function previousDay() {
  const date = new Date(selectedDate.value + 'T00:00:00')
  date.setDate(date.getDate() - 1)
  selectedDate.value = date.toISOString().split('T')[0]
}

function nextDay() {
  const date = new Date(selectedDate.value + 'T00:00:00')
  date.setDate(date.getDate() + 1)
  selectedDate.value = date.toISOString().split('T')[0]
}

function goToToday() {
  selectedDate.value = new Date().toISOString().split('T')[0]
}

function viewDetails(assignment: Assignment) {
  selectedAssignment.value = assignment
  isModalOpen.value = true
}

function closeModal() {
  isModalOpen.value = false
  selectedAssignment.value = null
}

function startWorkout(assignment: Assignment) {
  router.push(`/athlete/workout/${assignment.id}`)
}

// Watchers
watch(selectedDate, () => {
  loadAssignments()
  if (isToday.value) {
    loadUpcoming()
  } else {
    upcomingAssignments.value = []
  }
})

// Lifecycle
onMounted(() => {
  loadAssignments()
  loadUpcoming()
  loadStats()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <!-- Greeting -->
        <div class="mb-6">
          <h1 class="text-3xl font-bold text-gray-900">
            {{ greeting }}, {{ authStore.profile?.display_name?.split(' ')[0] || 'Athlete' }}!
          </h1>
          <p class="text-gray-600 mt-1">Ready to crush today's workouts?</p>
        </div>

        <!-- Stats -->
        <div v-if="stats" class="grid grid-cols-3 gap-4 mb-6">
          <div class="bg-summit-50 rounded-lg p-4">
            <p class="text-sm text-summit-600 font-medium">This Week</p>
            <p class="text-2xl font-bold text-summit-900">{{ stats.thisWeek }}</p>
          </div>
          <div class="bg-green-50 rounded-lg p-4">
            <p class="text-sm text-green-600 font-medium">Completed</p>
            <p class="text-2xl font-bold text-green-900">{{ stats.completed }}</p>
          </div>
          <div class="bg-valencia-50 rounded-lg p-4">
            <p class="text-sm text-valencia-600 font-medium">Completion Rate</p>
            <p class="text-2xl font-bold text-valencia-900">{{ stats.completionRate }}%</p>
          </div>
        </div>

        <!-- Date Navigation -->
        <div class="flex items-center gap-3">
          <button
            @click="previousDay"
            class="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <input
            v-model="selectedDate"
            type="date"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-summit-500"
          />

          <button
            @click="nextDay"
            class="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            v-if="!isToday"
            @click="goToToday"
            class="px-4 py-2 bg-summit-600 text-white rounded-lg font-medium hover:bg-summit-700 transition-colors"
          >
            Today
          </button>
        </div>

        <p class="text-gray-600 mt-3">{{ formattedDate }}</p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center py-20">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-summit-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-20">
        <svg class="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-gray-600 mb-4">{{ error }}</p>
        <button
          @click="loadAssignments"
          class="px-4 py-2 bg-summit-600 text-white rounded-lg font-medium hover:bg-summit-700 transition-colors"
        >
          Try Again
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="assignments.length === 0" class="text-center py-20">
        <svg class="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 class="text-xl font-semibold text-gray-700 mb-2">No Workouts Scheduled</h3>
        <p class="text-gray-500">
          {{ isToday ? 'Enjoy your rest day!' : 'No workouts assigned for this date.' }}
        </p>
      </div>

      <!-- Assignments Grid -->
      <div v-else>
        <h2 class="text-xl font-bold text-gray-900 mb-4">
          {{ isToday ? "Today's Workouts" : 'Scheduled Workouts' }}
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AssignmentCard
            v-for="assignment in assignments"
            :key="assignment.id"
            :assignment="assignment"
            @view-details="viewDetails(assignment)"
            @start-workout="startWorkout(assignment)"
          />
        </div>
      </div>

      <!-- Upcoming Section -->
      <div v-if="isToday && upcomingAssignments.length > 0" class="mt-12">
        <h2 class="text-xl font-bold text-gray-900 mb-4">Coming Up</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="assignment in upcomingAssignments"
            :key="assignment.id"
            class="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div class="flex items-center justify-between mb-3">
              <p class="text-sm font-semibold text-summit-600">
                {{ new Date(assignment.assigned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}
              </p>
              <span v-if="assignment.workout?.workout_type" class="text-xs text-gray-500">
                {{ assignment.workout.workout_type }}
              </span>
            </div>
            <h3 class="font-semibold text-gray-900 mb-2">{{ assignment.workout?.name }}</h3>
            <div class="flex items-center gap-2">
              <img
                v-if="assignment.coach?.avatar_url"
                :src="assignment.coach.avatar_url"
                :alt="assignment.coach.display_name"
                class="w-6 h-6 rounded-full object-cover"
              />
              <span class="text-sm text-gray-600">{{ assignment.coach?.display_name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Workout Preview Modal -->
    <WorkoutPreviewModal
      :is-open="isModalOpen"
      :assignment="selectedAssignment"
      @close="closeModal"
      @start-workout="startWorkout(selectedAssignment!)"
    />
  </div>
</template>
