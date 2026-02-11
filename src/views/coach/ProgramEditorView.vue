<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Program, ProgramWeek, Workout } from '@/types/database'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Toast from '@/components/ui/Toast.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// State
const program = ref<Program | null>(null)
const weeks = ref<(ProgramWeek & { workouts?: Workout[] })[]>([])
const availableWorkouts = ref<Workout[]>([])
const loading = ref(true)
const showWorkoutPicker = ref(false)
const selectedWeekId = ref<string | null>(null)
const selectedDay = ref<number | null>(null)

// Confirm dialog state
const showRemoveConfirm = ref(false)
const workoutToRemoveId = ref<string | null>(null)
const removingWorkout = ref(false)

// Toast state
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastVisible = ref(false)

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

const programId = computed(() => route.params.id as string)

const daysOfWeek = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' }
]

onMounted(async () => {
  await loadProgram()
  await loadAvailableWorkouts()
})

async function loadProgram() {
  if (!authStore.user) return
  
  try {
    // Load program
    const { data: programData, error: programError } = await supabase
      .from('programs')
      .select('*')
      .eq('id', programId.value)
      .eq('coach_id', authStore.user.id)
      .single()
    
    if (programError) throw programError
    program.value = programData
    
    // Load weeks with workouts
    const { data: weeksData, error: weeksError } = (await supabase
      .from('program_weeks')
      .select('*')
      .eq('program_id', programId.value)
      .order('week_number')) as { data: any[] | null; error: any }

    if (weeksError) throw weeksError

    // Load workouts for each week
    if (weeksData && weeksData.length > 0) {
      const weeksWithWorkouts = await Promise.all(
        weeksData.map(async (week: any) => {
          const { data: workoutsData } = (await supabase
            .from('workouts')
            .select('*')
            .eq('program_week_id', week.id)
            .order('day_of_week')) as { data: any[] | null; error: any }

          return { ...week, workouts: workoutsData || [] }
        })
      )
      weeks.value = weeksWithWorkouts
    } else {
      // No weeks yet - initialize based on program duration
      await initializeWeeks()
    }
  } catch (e) {
    console.error('Error loading program:', e)
    router.push('/programs')
  } finally {
    loading.value = false
  }
}

async function initializeWeeks() {
  if (!program.value) return
  
  try {
    const weekInserts = []
    for (let i = 1; i <= (program.value.duration_weeks ?? 0); i++) {
      weekInserts.push({
        program_id: programId.value,
        week_number: i,
        name: `Week ${i}`
      })
    }
    
    const { data, error } = (await (supabase
      .from('program_weeks') as any)
      .insert(weekInserts)
      .select()) as { data: any[] | null; error: any }

    if (error) throw error

    weeks.value = (data || []).map((week: any) => ({ ...week, workouts: [] }))
  } catch (e) {
    console.error('Error initializing weeks:', e)
  }
}

async function loadAvailableWorkouts() {
  if (!authStore.user) return
  
  try {
    // Load standalone workouts (not assigned to any program)
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('coach_id', authStore.user.id)
      .is('program_week_id', null)
      .order('name')
    
    if (error) throw error
    availableWorkouts.value = data || []
  } catch (e) {
    console.error('Error loading workouts:', e)
  }
}

function openWorkoutPicker(weekId: string, dayValue: number) {
  selectedWeekId.value = weekId
  selectedDay.value = dayValue
  showWorkoutPicker.value = true
}

function closeWorkoutPicker() {
  showWorkoutPicker.value = false
  selectedWeekId.value = null
  selectedDay.value = null
}

async function assignWorkout(workout: Workout) {
  if (!selectedWeekId.value || selectedDay.value === null) return
  
  try {
    // Create a copy of the workout and assign it to this week/day
    const { data, error } = (await (supabase
      .from('workouts') as any)
      .insert({
        coach_id: authStore.user!.id,
        program_week_id: selectedWeekId.value,
        name: workout.name,
        description: workout.description,
        day_of_week: selectedDay.value,
        estimated_duration_min: workout.estimated_duration_min,
        workout_type: workout.workout_type,
        is_template: false
      })
      .select()
      .single()) as { data: any; error: any }

    if (error) throw error

    // Copy exercises from the template workout
    const { data: exercises, error: exercisesError } = (await supabase
      .from('exercises')
      .select('*')
      .eq('workout_id', workout.id)
      .order('order_index')) as { data: any[] | null; error: any }

    if (exercisesError) throw exercisesError

    if (exercises && exercises.length > 0) {
      const exerciseCopies = exercises.map((ex: any) => ({
        workout_id: data.id,
        name: ex.name,
        description: ex.description,
        order_index: ex.order_index,
        sets: ex.sets,
        reps: ex.reps,
        weight_kg: ex.weight_kg,
        duration_seconds: ex.duration_seconds,
        distance_meters: ex.distance_meters,
        rpe: ex.rpe,
        intensity_percent: ex.intensity_percent,
        target_time_seconds: ex.target_time_seconds,
        rest_seconds: ex.rest_seconds,
        notes: ex.notes,
        video_url: ex.video_url
      }))

      const { error: insertError } = await (supabase
        .from('exercises') as any)
        .insert(exerciseCopies)

      if (insertError) throw insertError
    }
    
    // Reload weeks
    await loadProgram()
    closeWorkoutPicker()
    showToast('Workout assigned')
  } catch (e) {
    console.error('Error assigning workout:', e)
    showToast('Failed to assign workout', 'error')
  }
}

function confirmRemoveWorkout(workoutId: string) {
  workoutToRemoveId.value = workoutId
  showRemoveConfirm.value = true
}

async function handleRemoveWorkout() {
  if (!workoutToRemoveId.value) return
  removingWorkout.value = true

  try {
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutToRemoveId.value)
      .eq('coach_id', authStore.user!.id)

    if (error) throw error

    showRemoveConfirm.value = false
    workoutToRemoveId.value = null
    await loadProgram()
    showToast('Workout removed')
  } catch (e) {
    console.error('Error removing workout:', e)
    showToast('Failed to remove workout', 'error')
  } finally {
    removingWorkout.value = false
  }
}

function getWorkoutForDay(week: ProgramWeek & { workouts?: Workout[] }, dayValue: number): Workout | undefined {
  return week.workouts?.find((w: any) => w.day_of_week === dayValue)
}

function getDayShortLabel(dayValue: number): string {
  const day = daysOfWeek.find(d => d.value === dayValue)
  return day ? day.label.substring(0, 3) : ''
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center gap-3">
        <button
          @click="router.push('/programs')"
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
          <p class="text-sm text-gray-500">{{ weeks.length }} week{{ weeks.length !== 1 ? 's' : '' }}</p>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="p-6">
      <div class="animate-pulse space-y-4">
        <div v-for="i in 3" :key="i">
          <div class="h-6 bg-gray-200 rounded w-32 mb-3"></div>
          <div class="grid grid-cols-7 gap-2">
            <div v-for="j in 7" :key="j" class="h-20 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Program builder -->
    <div v-else class="p-4 space-y-6">
      <!-- Program info -->
      <div v-if="program?.description" class="card p-4">
        <p class="text-sm text-gray-700">{{ program.description }}</p>
      </div>

      <!-- Empty state for workouts library -->
      <div v-if="availableWorkouts.length === 0" class="card p-4 bg-blue-50 border border-blue-200">
        <p class="text-sm text-blue-800">
          💡 <strong>Tip:</strong> You don't have any standalone workouts yet. <router-link to="/workouts" class="underline">Create some workouts</router-link> first, then come back to assign them to your program.
        </p>
      </div>

      <!-- Weekly calendar -->
      <div v-for="week in weeks" :key="week.id" class="space-y-3">
        <h3 class="font-semibold text-gray-900">{{ week.name }}</h3>
        
        <!-- Days grid -->
        <div class="grid grid-cols-7 gap-2">
          <div
            v-for="day in daysOfWeek"
            :key="day.value"
            class="aspect-square"
          >
            <div 
              v-if="getWorkoutForDay(week, day.value)"
              class="h-full card p-2 flex flex-col justify-between bg-summit-50 border-summit-200 cursor-pointer hover:shadow-md transition-shadow"
              @click="router.push(`/workouts/${getWorkoutForDay(week, day.value)!.id}/edit`)"
            >
              <div class="text-xs text-summit-700 font-medium">
                {{ getDayShortLabel(day.value) }}
              </div>
              <div class="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight">
                {{ getWorkoutForDay(week, day.value)!.name }}
              </div>
              <button
                @click.stop="confirmRemoveWorkout(getWorkoutForDay(week, day.value)!.id)"
                class="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <button
              v-else
              @click="openWorkoutPicker(week.id, day.value)"
              class="h-full w-full border-2 border-dashed border-gray-300 rounded-xl hover:border-summit-500 hover:bg-summit-50 transition-colors flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-summit-700"
            >
              <div class="text-xs font-medium">
                {{ getDayShortLabel(day.value) }}
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Info -->
      <div class="card p-4 bg-gray-50">
        <p class="text-sm text-gray-600">
          <strong>How it works:</strong> Click any day to assign a workout. Workouts are copied from your library so you can customize them for each week.
        </p>
      </div>
    </div>

    <!-- Remove Confirm Dialog -->
    <ConfirmDialog
      :open="showRemoveConfirm"
      title="Remove Workout?"
      message="Remove this workout from the program? This cannot be undone."
      confirm-text="Remove"
      :loading="removingWorkout"
      @confirm="handleRemoveWorkout"
      @cancel="showRemoveConfirm = false"
    />

    <!-- Toast -->
    <Toast
      :message="toastMessage"
      :type="toastType"
      :visible="toastVisible"
      @close="toastVisible = false"
    />

    <!-- Workout Picker Modal -->
    <div
      v-if="showWorkoutPicker"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50"
      @click.self="closeWorkoutPicker"
    >
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up">
        <!-- Header -->
        <div class="p-4 border-b border-feed-border flex items-center justify-between flex-shrink-0">
          <h2 class="font-semibold text-lg">Select Workout</h2>
          <button
            @click="closeWorkoutPicker"
            class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Workouts list -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <div v-if="availableWorkouts.length === 0" class="text-center py-8 text-gray-500">
            <p>No workouts available.</p>
            <router-link to="/workouts" class="text-summit-700 underline text-sm">
              Create a workout first
            </router-link>
          </div>
          
          <button
            v-for="workout in availableWorkouts"
            :key="workout.id"
            @click="assignWorkout(workout)"
            class="w-full text-left p-3 rounded-xl hover:bg-gray-50 border border-gray-200 hover:border-summit-300 transition-colors"
          >
            <h4 class="font-semibold text-gray-900 mb-1">{{ workout.name }}</h4>
            <p v-if="workout.description" class="text-sm text-gray-600 line-clamp-2">
              {{ workout.description }}
            </p>
            <div v-if="workout.workout_type" class="text-xs text-gray-500 mt-1">
              {{ workout.workout_type }}
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
