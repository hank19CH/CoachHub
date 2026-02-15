<script setup lang="ts">
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { planSessionsService } from '@/services/planSessions'

interface Exercise {
  exercise_name?: string
  name?: string
  sets?: number
  reps?: string | number
  rest_seconds?: number
  load_percentage?: number
  load_unit?: string
  rpe?: number
  tempo?: string
  notes?: string
  category?: string
  movement_pattern?: string
  intensity_percent?: number
  intensity_prescription?: string
  coaching_cues?: string
  weight_kg?: number
}

interface SessionData {
  session_name?: string
  name?: string
  description?: string
  coaching_notes?: string
  session_type?: string
  session_focus?: string[]
  target_rpe?: number
  estimated_duration_min?: number
  exercises: Exercise[]
}

interface Props {
  open: boolean
  session: SessionData | null
  weekId?: string
  blockName?: string
  coachId: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  applied: [workoutId: string]
}>()

// ============================================
// State
// ============================================
const selectedDays = ref<number[]>([])
const isApplying = ref(false)
const error = ref<string | null>(null)

// Session parameter overrides
const sessionName = ref('')
const sessionRpe = ref<number | null>(null)
const volumeMultiplier = ref(1.0)
const intensityMultiplier = ref(1.0)

// Exercise editing
const exercises = ref<Exercise[]>([])

// ============================================
// Computed
// ============================================
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const canApply = computed(() =>
  selectedDays.value.length > 0 && sessionName.value.trim() && exercises.value.length > 0
)

const adjustedExercises = computed(() => {
  return exercises.value.map(ex => ({
    ...ex,
    sets: Math.round((ex.sets || 3) * volumeMultiplier.value),
    load_percentage: ex.load_percentage
      ? Math.round(ex.load_percentage * intensityMultiplier.value)
      : undefined,
  }))
})

// ============================================
// Watchers
// ============================================
function initializeFromSession() {
  if (!props.session) return

  sessionName.value = props.session.session_name || props.session.name || 'AI Session'
  sessionRpe.value = props.session.target_rpe || null
  exercises.value = JSON.parse(JSON.stringify(props.session.exercises || []))

  // Reset modifiers
  volumeMultiplier.value = 1.0
  intensityMultiplier.value = 1.0
  selectedDays.value = []
  error.value = null
}

// Initialize when session changes
import { watch } from 'vue'
watch(() => props.session, (newSession) => {
  if (newSession) {
    initializeFromSession()
  }
}, { immediate: true })

// ============================================
// Actions
// ============================================
function toggleDay(dayIndex: number) {
  const idx = selectedDays.value.indexOf(dayIndex)
  if (idx > -1) {
    selectedDays.value.splice(idx, 1)
  } else {
    selectedDays.value.push(dayIndex)
  }
}

async function handleApply() {
  if (!canApply.value || !props.weekId || !props.coachId) return

  isApplying.value = true
  error.value = null

  try {
    // Create base workout data
    const workoutData = {
      coach_id: props.coachId,
      name: sessionName.value,
      description: props.session?.description || props.session?.coaching_notes || null,
      session_type: props.session?.session_type || null,
      session_focus: props.session?.session_focus || [],
      target_rpe: sessionRpe.value,
      estimated_duration_min: props.session?.estimated_duration_min || null,
      is_template: false,
    }

    // Create workout for each selected day
    for (const dayIndex of selectedDays.value) {
      // 1. Create workout
      const { data: workout, error: workoutError } = (await (supabase
        .from('workouts') as any)
        .insert(workoutData)
        .select()
        .single()) as { data: any; error: any }

      if (workoutError) {
        throw new Error(workoutError.message || 'Failed to create workout')
      }

      // 2. Create exercises with adjustments
      if (adjustedExercises.value.length > 0) {
        const exerciseInserts = adjustedExercises.value.map((ex: any, i: number) => ({
          workout_id: workout.id,
          name: ex.exercise_name || ex.name || `Exercise ${i + 1}`,
          order_index: i,
          sets: ex.sets || null,
          reps: ex.reps ? String(ex.reps) : null,
          weight_kg: ex.weight_kg || null,
          rpe: ex.rpe || null,
          intensity_percent: ex.load_percentage || ex.intensity_percent || null,
          intensity_prescription: ex.load_unit || ex.intensity_prescription || null,
          rest_seconds: ex.rest_seconds || null,
          tempo: ex.tempo || null,
          notes: ex.notes || ex.coaching_cues || null,
          category: ex.category || null,
          movement_pattern: ex.movement_pattern || null,
        }))

        const { error: exerciseError } = await (supabase
          .from('exercises') as any)
          .insert(exerciseInserts)

        if (exerciseError) {
          console.error('Error creating exercises:', exerciseError)
        }
      }

      // 3. Link to plan week
      try {
        await planSessionsService.createPlanSession({
          block_week_id: props.weekId,
          workout_id: workout.id,
          day_of_week: dayIndex,
          order_index: 0,
        })
      } catch (linkError: any) {
        if (!linkError.message?.includes('duplicate key')) {
          throw linkError
        }
        console.log('Session link already exists for this day')
      }

      // Emit the first workout ID (for navigation)
      if (dayIndex === selectedDays.value[0]) {
        emit('applied', workout.id)
      }
    }

    emit('close')
  } catch (e) {
    console.error('Error applying AI session:', e)
    error.value = e instanceof Error ? e.message : 'Failed to create workouts'
  } finally {
    isApplying.value = false
  }
}

function handleCancel() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        @click.self="handleCancel"
      >
        <Transition
          enter-active-class="transition-all duration-200"
          leave-active-class="transition-all duration-150"
          enter-from-class="translate-y-full sm:translate-y-0 sm:scale-95 opacity-0"
          enter-to-class="translate-y-0 sm:scale-100 opacity-100"
          leave-from-class="translate-y-0 sm:scale-100 opacity-100"
          leave-to-class="translate-y-full sm:translate-y-0 sm:scale-95 opacity-0"
        >
          <div
            v-if="open"
            class="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col shadow-xl"
            @click.stop
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-5 border-b border-gray-100">
              <div class="flex-1 min-w-0">
                <h3 class="text-base font-bold text-gray-900">Review AI Session</h3>
                <p v-if="blockName" class="text-xs text-gray-400 mt-0.5">{{ blockName }}</p>
              </div>
              <button
                @click="handleCancel"
                class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-5 space-y-5">
              <!-- Error banner -->
              <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl p-3">
                <p class="text-sm text-red-800">{{ error }}</p>
              </div>

              <!-- Session name -->
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">Session Name</label>
                <input
                  v-model="sessionName"
                  type="text"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-summit-500"
                  placeholder="Enter session name"
                />
              </div>

              <!-- Target RPE -->
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1.5">Target RPE</label>
                <input
                  v-model.number="sessionRpe"
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-summit-500"
                  placeholder="e.g., 7.5"
                />
              </div>

              <!-- Volume & Intensity Modifiers -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-700 mb-1.5">
                    Volume Modifier
                    <span class="text-gray-400 font-normal ml-1">({{ volumeMultiplier.toFixed(1) }}x)</span>
                  </label>
                  <input
                    v-model.number="volumeMultiplier"
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    class="w-full"
                  />
                  <p class="text-[10px] text-gray-400 mt-0.5">Adjusts sets per exercise</p>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-700 mb-1.5">
                    Intensity Modifier
                    <span class="text-gray-400 font-normal ml-1">({{ intensityModifier.toFixed(1) }}x)</span>
                  </label>
                  <input
                    v-model.number="intensityModifier"
                    type="range"
                    min="0.8"
                    max="1.2"
                    step="0.05"
                    class="w-full"
                  />
                  <p class="text-[10px] text-gray-400 mt-0.5">Adjusts load percentages</p>
                </div>
              </div>

              <!-- Select days -->
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-2">Apply to Days</label>
                <div class="grid grid-cols-7 gap-1.5">
                  <button
                    v-for="(day, idx) in dayNames"
                    :key="idx"
                    @click="toggleDay(idx)"
                    :class="[
                      'py-2 rounded-lg text-[10px] font-semibold transition-all',
                      selectedDays.includes(idx)
                        ? 'bg-summit-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    ]"
                  >
                    {{ day.slice(0, 3) }}
                  </button>
                </div>
              </div>

              <!-- Exercise preview -->
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-2">
                  Exercise Preview ({{ adjustedExercises.length }})
                </label>
                <div class="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  <div
                    v-for="(ex, idx) in adjustedExercises.slice(0, 10)"
                    :key="idx"
                    class="flex items-center gap-2 text-xs"
                  >
                    <span class="text-gray-400 w-4 text-right flex-shrink-0">{{ idx + 1 }}.</span>
                    <span class="font-medium text-gray-800 flex-1 truncate">
                      {{ ex.exercise_name || ex.name }}
                    </span>
                    <span class="text-gray-500 flex-shrink-0">
                      {{ ex.sets }}×{{ ex.reps }}
                    </span>
                    <span v-if="ex.load_percentage" class="text-summit-600 text-[10px] flex-shrink-0">
                      {{ ex.load_percentage }}% 1RM
                    </span>
                  </div>
                  <p v-if="adjustedExercises.length > 10" class="text-[10px] text-gray-400 text-center pt-2 border-t border-gray-100">
                    +{{ adjustedExercises.length - 10 }} more exercises
                  </p>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="p-5 border-t border-gray-100 flex gap-3">
              <button
                @click="handleCancel"
                :disabled="isApplying"
                class="flex-1 py-2.5 px-4 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                @click="handleApply"
                :disabled="!canApply || isApplying"
                :class="[
                  'flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-all',
                  canApply && !isApplying
                    ? 'bg-summit-600 hover:bg-summit-700 text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                ]"
              >
                <span v-if="isApplying" class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </span>
                <span v-else>
                  Create {{ selectedDays.length > 1 ? `${selectedDays.length} Workouts` : 'Workout' }}
                </span>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
