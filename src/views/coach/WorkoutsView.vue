<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Workout } from '@/types/database'

const router = useRouter()
const authStore = useAuthStore()

// State
const workouts = ref<Workout[]>([])
const loading = ref(true)
const searchQuery = ref('')
const showCreateModal = ref(false)

// Workout form state
const workoutForm = ref({
  name: '',
  description: '',
  workout_type: '',
  estimated_duration_min: null as number | null,
  is_template: true
})

const saving = ref(false)
const errorMessage = ref('')

// Computed
const filteredWorkouts = computed(() => {
  if (!searchQuery.value) return workouts.value
  
  const query = searchQuery.value.toLowerCase()
  return workouts.value.filter(workout => 
    workout.name.toLowerCase().includes(query) ||
    (workout.description && workout.description.toLowerCase().includes(query))
  )
})

const hasWorkouts = computed(() => workouts.value.length > 0)

const workoutTypes = [
  'Strength',
  'Cardio',
  'Speed & Power',
  'Skills',
  'Recovery',
  'Conditioning',
  'Mobility',
  'Mixed'
]

onMounted(async () => {
  await loadWorkouts()
})

async function loadWorkouts() {
  if (!authStore.user) return
  
  try {
    loading.value = true
    
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('coach_id', authStore.user.id)
      .is('program_week_id', null) // Only standalone workouts for now
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    workouts.value = data || []
  } catch (e) {
    console.error('Error loading workouts:', e)
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  // Reset form
  workoutForm.value = {
    name: '',
    description: '',
    workout_type: '',
    estimated_duration_min: null,
    is_template: true
  }
  errorMessage.value = ''
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
  errorMessage.value = ''
}

async function createWorkout() {
  if (!authStore.user || !workoutForm.value.name) return
  
  try {
    saving.value = true
    errorMessage.value = ''
    
    // Create the workout
    const { data: workout, error } = await supabase
      .from('workouts')
      .insert({
        coach_id: authStore.user.id,
        name: workoutForm.value.name,
        description: workoutForm.value.description || null,
        workout_type: workoutForm.value.workout_type || null,
        estimated_duration_min: workoutForm.value.estimated_duration_min,
        is_template: workoutForm.value.is_template
      })
      .select()
      .single()
    
    if (error) throw error
    
    // Navigate to workout builder to add exercises
    router.push(`/workouts/${workout.id}/edit`)
  } catch (e) {
    console.error('Error creating workout:', e)
    errorMessage.value = e instanceof Error ? e.message : 'Failed to create workout'
  } finally {
    saving.value = false
  }
}

function editWorkout(workoutId: string) {
  router.push(`/workouts/${workoutId}/edit`)
}

async function duplicateWorkout(workout: Workout) {
  if (!authStore.user) return
  
  try {
    // Create duplicate workout
    const { data: newWorkout, error: workoutError } = await supabase
      .from('workouts')
      .insert({
        coach_id: authStore.user.id,
        name: `${workout.name} (Copy)`,
        description: workout.description,
        workout_type: workout.workout_type,
        estimated_duration_min: workout.estimated_duration_min,
        is_template: workout.is_template
      })
      .select()
      .single()
    
    if (workoutError) throw workoutError
    
    // Fetch exercises from original workout
    const { data: exercises, error: exercisesError } = await supabase
      .from('exercises')
      .select('*')
      .eq('workout_id', workout.id)
      .order('order_index')
    
    if (exercisesError) throw exercisesError
    
    // Copy exercises to new workout
    if (exercises && exercises.length > 0) {
      const exerciseCopies = exercises.map(ex => ({
        workout_id: newWorkout.id,
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
      
      const { error: insertError } = await supabase
        .from('exercises')
        .insert(exerciseCopies)
      
      if (insertError) throw insertError
    }
    
    // Reload workouts list
    await loadWorkouts()
    
    // Show success message (optional)
    alert(`Workout duplicated! "${newWorkout.name}" has been created.`)
  } catch (e) {
    console.error('Error duplicating workout:', e)
    alert('Failed to duplicate workout')
  }
}

async function deleteWorkout(workout: Workout) {
  if (!authStore.user) return
  if (!confirm(`Delete "${workout.name}"? This cannot be undone.`)) return

  try {
    // Delete exercises first
    const { error: exerciseError } = await supabase
      .from('exercises')
      .delete()
      .eq('workout_id', workout.id)

    if (exerciseError) throw exerciseError

    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workout.id)
      .eq('coach_id', authStore.user.id)

    if (error) throw error

    await loadWorkouts()
  } catch (e) {
    console.error('Error deleting workout:', e)
    alert('Failed to delete workout')
  }
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return 'Not set'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h1 class="font-display text-xl font-bold text-gray-900">Workouts</h1>
        <button
          @click="openCreateModal"
          class="btn-primary px-4 py-2 text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Workout
        </button>
      </div>
    </div>

    <!-- Search bar (only show if has workouts) -->
    <div v-if="hasWorkouts" class="p-4">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search workouts..."
          class="input pl-10"
        />
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="p-6">
      <div class="space-y-4">
        <div v-for="i in 3" :key="i" class="animate-pulse">
          <div class="p-4 bg-gray-50 rounded-xl">
            <div class="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div class="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!hasWorkouts" class="p-6 text-center">
      <div class="max-w-sm mx-auto">
        <div class="w-20 h-20 mx-auto mb-4 bg-summit-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <h2 class="font-semibold text-lg text-gray-900 mb-2">No workouts yet</h2>
        <p class="text-gray-600 mb-6">
          Create your first workout template to assign to your athletes
        </p>
        <button
          @click="openCreateModal"
          class="btn-primary w-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Your First Workout
        </button>
      </div>
    </div>

    <!-- Workouts list -->
    <div v-else class="p-4 space-y-3">
      <div
        v-for="workout in filteredWorkouts"
        :key="workout.id"
        class="card p-4 hover:shadow-md transition-shadow"
      >
        <div class="flex items-start justify-between gap-3">
          <div 
            @click="editWorkout(workout.id)"
            class="flex-1 min-w-0 cursor-pointer"
          >
            <h3 class="font-semibold text-gray-900 mb-1">
              {{ workout.name }}
            </h3>
            <p v-if="workout.description" class="text-sm text-gray-600 mb-2 line-clamp-2">
              {{ workout.description }}
            </p>
            <div class="flex flex-wrap gap-2 text-xs text-gray-500">
              <span v-if="workout.workout_type" class="inline-flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {{ workout.workout_type }}
              </span>
              <span v-if="workout.estimated_duration_min" class="inline-flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ formatDuration(workout.estimated_duration_min) }}
              </span>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-1 flex-shrink-0">
            <button
              @click.stop="editWorkout(workout.id)"
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Edit workout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              @click.stop="duplicateWorkout(workout)"
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Duplicate workout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              @click.stop="deleteWorkout(workout)"
              class="p-2 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete workout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- No results from search -->
      <div v-if="filteredWorkouts.length === 0" class="text-center py-8 text-gray-500">
        <p>No workouts found matching "{{ searchQuery }}"</p>
      </div>
    </div>

    <!-- Create Workout Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50"
      @click.self="closeCreateModal"
    >
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
        <!-- Header -->
        <div class="p-4 border-b border-feed-border flex items-center justify-between flex-shrink-0">
          <h2 class="font-semibold text-lg">Create Workout</h2>
          <button
            @click="closeCreateModal"
            class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- Error message -->
          <div v-if="errorMessage" class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {{ errorMessage }}
          </div>

          <!-- Workout name -->
          <div>
            <label class="label">Workout Name *</label>
            <input
              v-model="workoutForm.name"
              type="text"
              placeholder="e.g., Lower Body Strength"
              class="input"
              required
            />
          </div>

          <!-- Description -->
          <div>
            <label class="label">Description</label>
            <textarea
              v-model="workoutForm.description"
              rows="3"
              placeholder="Brief overview of the workout..."
              class="input resize-none"
            ></textarea>
          </div>

          <!-- Workout type -->
          <div>
            <label class="label">Type</label>
            <select v-model="workoutForm.workout_type" class="input">
              <option value="">Select type...</option>
              <option v-for="type in workoutTypes" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
          </div>

          <!-- Estimated duration -->
          <div>
            <label class="label">Estimated Duration (minutes)</label>
            <input
              v-model.number="workoutForm.estimated_duration_min"
              type="number"
              min="1"
              placeholder="60"
              class="input"
            />
          </div>

          <!-- Info box -->
          <div class="p-3 bg-summit-50 border border-summit-200 rounded-xl text-sm text-summit-800">
            <p class="font-medium mb-1">💡 Next Step</p>
            <p>After creating the workout, you'll add exercises and set parameters (sets, reps, weight, etc.)</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-feed-border flex-shrink-0 space-y-2">
          <button
            @click="createWorkout"
            :disabled="!workoutForm.name || saving"
            class="btn-primary w-full"
          >
            <span v-if="saving" class="flex items-center gap-2 justify-center">
              <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating...
            </span>
            <span v-else>Create & Add Exercises</span>
          </button>
          <button
            @click="closeCreateModal"
            class="btn-secondary w-full"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
