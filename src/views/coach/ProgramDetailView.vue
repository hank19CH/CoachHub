<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Program, ProgramWeek, Workout } from '@/types/database'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Toast from '@/components/ui/Toast.vue'
import AssignWorkoutModal from '@/components/AssignWorkoutModal.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// State
const program = ref<Program | null>(null)
const weeks = ref<(ProgramWeek & { workouts: (Workout & { exercise_count?: number })[] })[]>([])
const loading = ref(true)
const assignmentCounts = ref<Record<string, number>>({}) // workout_id -> count

// Assign modal
const showAssignModal = ref(false)
const preselectedWorkoutId = ref<string | null>(null)

// Confirm dialog
const showDeleteConfirm = ref(false)
const deleting = ref(false)

// Toast
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastVisible = ref(false)
function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

const programId = computed(() => route.params.id as string)

const totalWorkouts = computed(() => {
  return weeks.value.reduce((sum, w) => sum + w.workouts.length, 0)
})

const totalExercises = computed(() => {
  return weeks.value.reduce((sum, w) =>
    sum + w.workouts.reduce((ws, wo) => ws + (wo.exercise_count || 0), 0), 0)
})

onMounted(async () => {
  await loadProgram()
})

async function loadProgram() {
  if (!authStore.user) return

  try {
    loading.value = true

    // Load program
    const { data: programData, error: programError } = await supabase
      .from('programs')
      .select('*')
      .eq('id', programId.value)
      .eq('coach_id', authStore.user.id)
      .single()

    if (programError) throw programError
    program.value = programData

    // Load weeks
    const { data: weeksData, error: weeksError } = (await supabase
      .from('program_weeks')
      .select('*')
      .eq('program_id', programId.value)
      .order('week_number')) as { data: any[] | null; error: any }

    if (weeksError) throw weeksError

    // Load workouts with exercise counts (separate query to avoid recursion)
    if (weeksData && weeksData.length > 0) {
      const weekIds = weeksData.map((w: any) => w.id)

      const { data: workoutsData, error: workoutsError } = (await supabase
        .from('workouts')
        .select('*, exercises(id)')
        .in('program_week_id', weekIds)
        .order('day_of_week')) as { data: any[] | null; error: any }

      if (workoutsError) throw workoutsError

      // Get assignment counts for these workouts
      const workoutIds = (workoutsData || []).map((w: any) => w.id)
      if (workoutIds.length > 0) {
        const { data: assignments } = (await supabase
          .from('workout_assignments')
          .select('workout_id')
          .in('workout_id', workoutIds)) as { data: any[] | null; error: any }

        const counts: Record<string, number> = {}
        ;(assignments || []).forEach((a: any) => {
          counts[a.workout_id] = (counts[a.workout_id] || 0) + 1
        })
        assignmentCounts.value = counts
      }

      // Assemble weeks with workouts
      weeks.value = weeksData.map((week: any) => ({
        ...week,
        workouts: (workoutsData || [])
          .filter((w: any) => w.program_week_id === week.id)
          .map((w: any) => ({
            ...w,
            exercise_count: w.exercises?.length || 0,
            exercises: undefined // Don't keep full exercises array
          }))
      }))
    } else {
      weeks.value = []
    }
  } catch (e) {
    console.error('Error loading program:', e)
    showToast('Failed to load program', 'error')
  } finally {
    loading.value = false
  }
}

function openAssignModal(workoutId: string) {
  preselectedWorkoutId.value = workoutId
  showAssignModal.value = true
}

function handleAssigned() {
  showAssignModal.value = false
  preselectedWorkoutId.value = null
  showToast('Workout assigned to athlete(s)')
  loadProgram() // Refresh counts
}

async function handleDelete() {
  if (!authStore.user || !program.value) return
  deleting.value = true

  try {
    // Fetch weeks to get workout IDs
    const { data: weekRows } = (await supabase
      .from('program_weeks')
      .select('id')
      .eq('program_id', program.value.id)) as { data: any[] | null; error: any }

    if (weekRows && weekRows.length > 0) {
      const weekIds = weekRows.map((w: any) => w.id)
      const { data: workoutRows } = (await supabase
        .from('workouts')
        .select('id')
        .in('program_week_id', weekIds)) as { data: any[] | null; error: any }

      if (workoutRows && workoutRows.length > 0) {
        const workoutIds = workoutRows.map((w: any) => w.id)
        await supabase.from('exercises').delete().in('workout_id', workoutIds)
        await supabase.from('workouts').delete().in('id', workoutIds).eq('coach_id', authStore.user.id)
      }
      await supabase.from('program_weeks').delete().in('id', weekIds)
    }

    const { error } = await supabase
      .from('programs')
      .delete()
      .eq('id', program.value.id)
      .eq('coach_id', authStore.user.id)

    if (error) throw error
    router.push('/coach/programs')
  } catch (e) {
    console.error('Error deleting program:', e)
    showToast('Failed to delete program', 'error')
  } finally {
    deleting.value = false
  }
}

function getDayLabel(dayValue: number | null): string {
  if (dayValue === null) return ''
  const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return days[dayValue] || ''
}

function getWorkoutTypeColor(type: string | null): string {
  switch (type) {
    case 'strength': return 'bg-blue-100 text-blue-700'
    case 'cardio': return 'bg-green-100 text-green-700'
    case 'skills': return 'bg-purple-100 text-purple-700'
    case 'recovery': return 'bg-yellow-100 text-yellow-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

function getDifficultyColor(difficulty: string | null): string {
  switch (difficulty) {
    case 'beginner': return 'bg-green-100 text-green-700'
    case 'intermediate': return 'bg-yellow-100 text-yellow-700'
    case 'advanced': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center gap-3">
        <button
          @click="router.push('/coach/programs')"
          class="p-2 hover:bg-gray-100 rounded-lg -ml-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="font-display text-lg font-bold text-gray-900 truncate">
            {{ program?.name || 'Program' }}
          </h1>
        </div>
        <div class="flex gap-1">
          <button
            @click="router.push(`/coach/programs/${programId}/edit`)"
            class="p-2 hover:bg-gray-100 rounded-lg"
            title="Edit program"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            @click="showDeleteConfirm = true"
            class="p-2 hover:bg-red-50 rounded-lg"
            title="Delete program"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-6">
      <div class="animate-pulse space-y-4">
        <div class="h-24 bg-gray-100 rounded-xl"></div>
        <div v-for="i in 3" :key="i">
          <div class="h-6 bg-gray-200 rounded w-32 mb-3"></div>
          <div class="space-y-2">
            <div class="h-16 bg-gray-100 rounded-xl"></div>
            <div class="h-16 bg-gray-100 rounded-xl"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="program" class="p-4 space-y-6">
      <!-- Program Overview Card -->
      <div class="card p-4 space-y-3">
        <p v-if="program.description" class="text-sm text-gray-700">
          {{ program.description }}
        </p>

        <div class="flex flex-wrap gap-2">
          <span v-if="program.difficulty"
            class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full capitalize"
            :class="getDifficultyColor(program.difficulty)"
          >
            {{ program.difficulty }}
          </span>
          <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {{ program.duration_weeks }} week{{ program.duration_weeks !== 1 ? 's' : '' }}
          </span>
          <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {{ totalWorkouts }} workout{{ totalWorkouts !== 1 ? 's' : '' }}
          </span>
          <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            {{ totalExercises }} exercise{{ totalExercises !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="weeks.length === 0" class="text-center py-8">
        <div class="w-16 h-16 mx-auto mb-4 bg-summit-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <p class="text-gray-600 mb-4">No weeks set up yet</p>
        <button
          @click="router.push(`/coach/programs/${programId}/edit`)"
          class="btn-primary px-6"
        >
          Build Program
        </button>
      </div>

      <!-- Weeks & Workouts -->
      <div v-for="week in weeks" :key="week.id" class="space-y-3">
        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
          <span class="w-7 h-7 bg-summit-100 text-summit-700 rounded-full flex items-center justify-center text-xs font-bold">
            {{ week.week_number }}
          </span>
          {{ week.name || `Week ${week.week_number}` }}
          <span class="text-xs text-gray-500 font-normal">
            ({{ week.workouts.length }} workout{{ week.workouts.length !== 1 ? 's' : '' }})
          </span>
        </h3>

        <!-- No workouts for this week -->
        <div v-if="week.workouts.length === 0" class="card p-4 text-center">
          <p class="text-sm text-gray-500">No workouts in this week</p>
          <button
            @click="router.push(`/coach/programs/${programId}/edit`)"
            class="text-summit-700 text-sm font-medium mt-1 hover:underline"
          >
            Add workouts
          </button>
        </div>

        <!-- Workout Cards -->
        <div
          v-for="workout in week.workouts"
          :key="workout.id"
          class="card p-4 hover:shadow-md transition-shadow"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span v-if="workout.day_of_week" class="text-xs font-medium text-summit-700 bg-summit-50 px-2 py-0.5 rounded">
                  {{ getDayLabel(workout.day_of_week) }}
                </span>
                <span v-if="workout.workout_type" class="text-xs font-medium px-2 py-0.5 rounded capitalize"
                  :class="getWorkoutTypeColor(workout.workout_type)"
                >
                  {{ workout.workout_type }}
                </span>
              </div>
              <h4 class="font-semibold text-gray-900">{{ workout.name }}</h4>
              <p v-if="workout.description" class="text-sm text-gray-600 line-clamp-2 mt-1">
                {{ workout.description }}
              </p>
              <div class="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                <span v-if="workout.estimated_duration_min" class="inline-flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ workout.estimated_duration_min }} min
                </span>
                <span v-if="workout.exercise_count" class="inline-flex items-center gap-1">
                  {{ workout.exercise_count }} exercise{{ workout.exercise_count !== 1 ? 's' : '' }}
                </span>
                <span v-if="assignmentCounts[workout.id]" class="inline-flex items-center gap-1 text-summit-700">
                  {{ assignmentCounts[workout.id] }} assigned
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-col gap-1 flex-shrink-0">
              <button
                @click="router.push(`/coach/workouts/${workout.id}/edit`)"
                class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Edit workout"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                @click="openAssignModal(workout.id)"
                class="p-2 hover:bg-summit-50 rounded-lg transition-colors"
                title="Assign to athlete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom actions -->
      <div class="flex gap-3">
        <button
          @click="router.push(`/coach/programs/${programId}/edit`)"
          class="btn-primary flex-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit Program
        </button>
      </div>
    </div>

    <!-- Delete Confirm -->
    <ConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Program?"
      :message="`Delete &quot;${program?.name}&quot;? This will also delete all weeks and workouts. This cannot be undone.`"
      confirm-text="Delete"
      :loading="deleting"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />

    <!-- Assign Workout Modal -->
    <AssignWorkoutModal
      :is-open="showAssignModal"
      :preselected-workout-id="preselectedWorkoutId"
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
