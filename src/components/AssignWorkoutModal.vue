<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 overflow-y-auto">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-black bg-opacity-50 transition-opacity" @click="closeModal"></div>
    
    <!-- Modal -->
    <div class="flex min-h-full items-end sm:items-center justify-center p-4">
      <div class="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 transform transition-all max-h-[90vh] overflow-y-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Assign Workout</h2>
          <button
            @click="closeModal"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleAssign" class="space-y-6">
          <!-- Workout Selection -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">
              Select Workout <span class="text-red-500">*</span>
            </label>
            <select
              v-model="formData.workoutId"
              required
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-summit-500 focus:border-transparent transition-all"
            >
              <option value="">Choose a workout...</option>
              <option
                v-for="workout in workouts"
                :key="workout.id"
                :value="workout.id"
              >
                {{ workout.name }}
                <span v-if="workout.workout_type"> - {{ workout.workout_type }}</span>
              </option>
            </select>
            <p class="mt-1 text-sm text-gray-500">Select which workout to assign</p>
          </div>

          <!-- Athlete Selection (Multi-select) -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">
              Assign To <span class="text-red-500">*</span>
            </label>
            
            <!-- Selected Athletes Pills -->
            <div v-if="formData.athleteIds.length > 0" class="flex flex-wrap gap-2 mb-3">
              <div
                v-for="athleteId in formData.athleteIds"
                :key="athleteId"
                class="inline-flex items-center gap-2 px-3 py-1 bg-summit-100 text-summit-700 rounded-full text-sm"
              >
                <span>{{ getAthleteName(athleteId) }}</span>
                <button
                  type="button"
                  @click="removeAthlete(athleteId)"
                  class="hover:text-summit-900"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Athlete Dropdown -->
            <select
              v-model="selectedAthleteToAdd"
              @change="addAthlete"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-summit-500 focus:border-transparent transition-all"
            >
              <option value="">+ Add athlete...</option>
              <option
                v-for="athlete in availableAthletes"
                :key="athlete.id"
                :value="athlete.id"
              >
                {{ athlete.display_name }} (@{{ athlete.username }})
              </option>
            </select>
            <p class="mt-1 text-sm text-gray-500">
              {{ formData.athleteIds.length === 0 ? 'Select at least one athlete' : `${formData.athleteIds.length} athlete(s) selected` }}
            </p>
          </div>

          <!-- Date Selection -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">
              Assigned Date <span class="text-red-500">*</span>
            </label>
            <input
              type="date"
              v-model="formData.assignedDate"
              required
              :min="todayDate"
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-summit-500 focus:border-transparent transition-all"
            />
            <p class="mt-1 text-sm text-gray-500">When should this workout be completed?</p>
          </div>

          <!-- Notes (Optional) -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              v-model="formData.notes"
              rows="3"
              placeholder="Add any specific instructions for this assignment..."
              class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-summit-500 focus:border-transparent transition-all resize-none"
            ></textarea>
            <p class="mt-1 text-sm text-gray-500">
              {{ formData.notes.length }}/500 characters
            </p>
          </div>

          <!-- Error Message -->
          <div v-if="error" class="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p class="text-sm text-red-600">{{ error }}</p>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 pt-4 pb-2">
            <button
              type="button"
              @click="closeModal"
              class="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading || !isFormValid"
              class="btn-primary flex-1"
            >
              {{ loading ? 'Assigning...' : 'Assign Workout' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { workoutsService } from '@/services/workouts'
import { athletesService } from '@/services/athletes'
import { assignmentsService } from '@/services/assignments'
import { useAuthStore } from '@/stores/auth'

// Props
interface Props {
  isOpen: boolean
  preselectedWorkoutId?: string | null
  preselectedAthleteId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  preselectedWorkoutId: null,
  preselectedAthleteId: null
})

// Emits
const emit = defineEmits<{
  close: []
  assigned: [assignmentIds: string[]]
}>()

// State
const authStore = useAuthStore()
const loading = ref(false)
const error = ref('')
const workouts = ref<any[]>([])
const athletes = ref<any[]>([])
const selectedAthleteToAdd = ref('')

// Form data
const formData = ref({
  workoutId: props.preselectedWorkoutId || '',
  athleteIds: props.preselectedAthleteId ? [props.preselectedAthleteId] : [] as string[],
  assignedDate: getTomorrowDate(),
  notes: ''
})

// Computed
const todayDate = computed(() => {
  return new Date().toISOString().split('T')[0]
})

const availableAthletes = computed(() => {
  return athletes.value.filter(a => !formData.value.athleteIds.includes(a.id))
})

const isFormValid = computed(() => {
  return formData.value.workoutId && 
         formData.value.athleteIds.length > 0 && 
         formData.value.assignedDate &&
         formData.value.notes.length <= 500
})

// Methods
function getTomorrowDate(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().split('T')[0]
}

function getAthleteName(athleteId: string): string {
  const athlete = athletes.value.find(a => a.id === athleteId)
  return athlete ? athlete.display_name : 'Unknown'
}

function addAthlete() {
  if (selectedAthleteToAdd.value && !formData.value.athleteIds.includes(selectedAthleteToAdd.value)) {
    formData.value.athleteIds.push(selectedAthleteToAdd.value)
  }
  selectedAthleteToAdd.value = ''
}

function removeAthlete(athleteId: string) {
  formData.value.athleteIds = formData.value.athleteIds.filter(id => id !== athleteId)
}

async function loadWorkouts() {
  if (!authStore.user?.id) return
  
  try {
    const data = await workoutsService.getCoachWorkouts(authStore.user.id)
    workouts.value = data
  } catch (err) {
    console.error('Error loading workouts:', err)
    error.value = 'Failed to load workouts'
  }
}

async function loadAthletes() {
  if (!authStore.user?.id) return
  
  try {
    const data = await athletesService.getCoachAthletes(authStore.user.id)
    athletes.value = data
  } catch (err) {
    console.error('Error loading athletes:', err)
    error.value = 'Failed to load athletes'
  }
}

async function handleAssign() {
  if (!isFormValid.value || !authStore.user?.id) return
  
  loading.value = true
  error.value = ''
  
  try {
    // Create assignments for all selected athletes
    const assignments = await assignmentsService.createBatchAssignments({
      workoutId: formData.value.workoutId,
      athleteIds: formData.value.athleteIds,
      coachId: authStore.user.id,
      assignedDate: formData.value.assignedDate,
      notes: formData.value.notes || undefined
    })
    
    emit('assigned', assignments.map(a => a.id))
    closeModal()
  } catch (err: any) {
    console.error('Error assigning workout:', err)
    error.value = err.message || 'Failed to assign workout'
  } finally {
    loading.value = false
  }
}

function closeModal() {
  // Reset form
  formData.value = {
    workoutId: '',
    athleteIds: [],
    assignedDate: getTomorrowDate(),
    notes: ''
  }
  error.value = ''
  selectedAthleteToAdd.value = ''
  
  emit('close')
}

// Watch for modal opening
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    loadWorkouts()
    loadAthletes()
    
    // Set preselected values
    if (props.preselectedWorkoutId) {
      formData.value.workoutId = props.preselectedWorkoutId
    }
    if (props.preselectedAthleteId && !formData.value.athleteIds.includes(props.preselectedAthleteId)) {
      formData.value.athleteIds = [props.preselectedAthleteId]
    }
  }
})
</script>

<style scoped>
/* Date input styling */
input[type="date"]::-webkit-calendar-picker-indicator {
  cursor: pointer;
  opacity: 0.6;
}

input[type="date"]::-webkit-calendar-picker-indicator:hover {
  opacity: 1;
}
</style>
