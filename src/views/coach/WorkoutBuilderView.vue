<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Workout, Exercise, FavoriteExercise, ExerciseLibraryItem } from '@/types/database'
import { trackEvent } from '@/utils/analytics'
import { exerciseLibraryService } from '@/services/exerciseLibrary'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Toast from '@/components/ui/Toast.vue'
import ExerciseLibrary from '@/components/planner/ExerciseLibrary.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// State
const workout = ref<Workout | null>(null)
const exercises = ref<Exercise[]>([])
const favorites = ref<FavoriteExercise[]>([])
const loading = ref(true)
const saving = ref(false)
const showExerciseModal = ref(false)
const showFavoritesPanel = ref(false)
const showExerciseLibrary = ref(false)

// Session header fields (Sprint 9.3b)
const sessionType = ref('')
const sessionFocus = ref('')
const targetRpe = ref<number | null>(null)
const savingSession = ref(false)

const sessionTypes = [
  'strength', 'hypertrophy', 'power', 'speed', 'conditioning',
  'skills', 'technique', 'recovery', 'testing', 'mixed'
]
const sessionFocusOptions = [
  'upper_body', 'lower_body', 'full_body', 'push', 'pull',
  'posterior_chain', 'anterior_chain', 'core', 'sport_specific',
  'aerobic', 'anaerobic', 'mobility'
]

// Confirm dialog state
const showDeleteConfirm = ref(false)
const exerciseToDeleteId = ref<string | null>(null)
const deletingExercise = ref(false)

// Toast state
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastVisible = ref(false)

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

// Estimated session load (volume × intensity across exercises)
const estimatedLoad = computed(() => {
  let totalLoad = 0
  for (const ex of exercises.value) {
    const sets = ex.sets || 0
    const reps = parseInt(String(ex.reps || '0')) || 0
    const weight = ex.weight_kg || 0
    const intensity = ex.intensity_percent ? ex.intensity_percent / 100 : 1
    if (sets && reps && weight) {
      totalLoad += sets * reps * weight * intensity
    }
  }
  return Math.round(totalLoad)
})

// Exercise form state
const exerciseForm = ref({
  name: '',
  description: '',
  sets: null as number | null,
  reps: '',
  weight_kg: null as number | null,
  duration_seconds: null as number | null,
  distance_meters: null as number | null,
  rpe: null as number | null,
  intensity_percent: null as number | null,
  target_time_seconds: null as number | null,
  rest_seconds: null as number | null,
  notes: '',
  video_url: '',
  // Sprint 9.3b enrichment fields
  intensity_prescription: '',
  tempo: '',
  superset_group: '',
})

const editingExerciseId = ref<string | null>(null)
const errorMessage = ref('')

const workoutId = computed(() => route.params.id as string | undefined)
const isNewWorkout = computed(() => !workoutId.value || workoutId.value === 'new')

// Sprint 9: Plan session context (when building a session within a plan)
const planContext = computed(() => {
  const mode = route.query.mode as string
  if (mode !== 'plan-session') return null

  return {
    planId: route.query.planId as string,
    blockId: route.query.blockId as string,
    weekId: route.query.weekId as string,
    dayIndex: parseInt(route.query.dayIndex as string),
    blockType: route.query.blockType as string,
    isDeload: route.query.isDeload === 'true',
  }
})

const isPlanSession = computed(() => planContext.value !== null)

// Handle back navigation
function handleBack() {
  if (isPlanSession.value && planContext.value) {
    router.push(`/coach/planner/${planContext.value.planId}`)
  } else {
    router.push('/coach/workouts')
  }
}

onMounted(async () => {
  await Promise.all([loadWorkout(), loadFavorites()])
  await loadExercises()
})

async function loadFavorites() {
  if (!authStore.user) return
  try {
    const { data } = await supabase
      .from('favorite_exercises')
      .select('*')
      .eq('coach_id', authStore.user.id)
      .order('exercise_name')
    favorites.value = data || []
  } catch (e) {
    console.error('Error loading favorites:', e)
  }
}

function isFavorite(name: string): boolean {
  return favorites.value.some(f => f.exercise_name.toLowerCase() === name.toLowerCase())
}

async function toggleFavorite(exercise: Exercise) {
  if (!authStore.user) return

  const existing = favorites.value.find(
    f => f.exercise_name.toLowerCase() === exercise.name.toLowerCase()
  )

  if (existing) {
    await supabase.from('favorite_exercises').delete().eq('id', existing.id)
    favorites.value = favorites.value.filter(f => f.id !== existing.id)
  } else {
    const defaults: Record<string, any> = {}
    if (exercise.sets) defaults.sets = exercise.sets
    if (exercise.reps) defaults.reps = exercise.reps
    if (exercise.weight_kg) defaults.weight_kg = exercise.weight_kg
    if (exercise.rest_seconds) defaults.rest_seconds = exercise.rest_seconds

    const { data } = (await (supabase
      .from('favorite_exercises') as any)
      .insert({
        coach_id: authStore.user.id,
        exercise_name: exercise.name,
        exercise_defaults: defaults,
      })
      .select()
      .single()) as { data: any }

    if (data) {
      favorites.value.push(data)
      trackEvent('exercise_favorited', { exercise_name: exercise.name })
    }
  }
}

function loadFromFavorite(fav: FavoriteExercise) {
  resetExerciseForm()
  exerciseForm.value.name = fav.exercise_name
  if (fav.exercise_defaults) {
    const d = fav.exercise_defaults
    if (d.sets) exerciseForm.value.sets = d.sets
    if (d.reps) exerciseForm.value.reps = d.reps
    if (d.weight_kg) exerciseForm.value.weight_kg = d.weight_kg
    if (d.rest_seconds) exerciseForm.value.rest_seconds = d.rest_seconds
  }
  editingExerciseId.value = null
  showFavoritesPanel.value = false
  showExerciseModal.value = true
}

async function loadWorkout() {
  if (!authStore.user) return

  // If creating new workout, create it first
  if (isNewWorkout.value) {
    try {
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      const defaultName = isPlanSession.value && planContext.value
        ? `${planContext.value.blockType || 'Session'} - ${dayNames[planContext.value.dayIndex]}`
        : 'New Workout'

      const { data, error } = (await (supabase
        .from('workouts') as any)
        .insert({
          coach_id: authStore.user.id,
          name: defaultName,
          description: isPlanSession.value ? `Week ${planContext.value?.weekId} - Day ${(planContext.value?.dayIndex || 0) + 1}` : '',
          session_type: planContext.value?.blockType || null,
        })
        .select()
        .single()) as { data: any; error: any }

      if (error) throw error
      workout.value = data

      // If this is a plan session, create the plan_session link
      if (isPlanSession.value && planContext.value) {
        try {
          const { planSessionsService } = await import('@/services/planSessions')
          await planSessionsService.createPlanSession({
            block_week_id: planContext.value.weekId,
            day_of_week: planContext.value.dayIndex,
            workout_id: data.id,
            order_index: 0,
          })
        } catch (linkError: any) {
          // If duplicate key error, a session already exists for this day - that's ok
          if (!linkError.message?.includes('duplicate key')) {
            throw linkError
          }
          console.log('Session link already exists for this day')
        }
      }

      // Update route to use the new workout ID
      router.replace({
        path: `/coach/workouts/${data.id}/edit`,
        query: route.query, // Preserve plan context
      })
    } catch (e) {
      console.error('Error creating workout:', e)
      showToast('Failed to create workout', 'error')
      router.push('/coach/workouts')
    } finally {
      loading.value = false
    }
    return
  }

  // Load existing workout
  try {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutId.value)
      .eq('coach_id', authStore.user.id)
      .single()

    if (error) throw error
    workout.value = data

    // Load session-level metadata from workout
    if (data) {
      sessionType.value = (data as any).session_type || ''
      sessionFocus.value = (data as any).session_focus || ''
      targetRpe.value = (data as any).target_rpe || null
    }
  } catch (e) {
    console.error('Error loading workout:', e)
    router.push('/coach/workouts')
  } finally {
    loading.value = false
  }
}

async function saveSessionMeta() {
  if (!workout.value) return
  savingSession.value = true
  try {
    const { error } = (await (supabase
      .from('workouts') as any)
      .update({
        session_type: sessionType.value || null,
        session_focus: sessionFocus.value || null,
        target_rpe: targetRpe.value || null,
      })
      .eq('id', workoutId.value)) as { error: any }

    if (error) throw error
    showToast('Session info saved')
  } catch (e) {
    console.error('Error saving session meta:', e)
    showToast('Failed to save session info', 'error')
  } finally {
    savingSession.value = false
  }
}

function handleLibrarySelect(item: ExerciseLibraryItem) {
  // Pre-fill exercise form from library item
  resetExerciseForm()
  exerciseForm.value.name = item.name
  exerciseForm.value.description = item.cues || ''
  exerciseForm.value.video_url = item.video_url || ''
  editingExerciseId.value = null
  showExerciseLibrary.value = false
  showExerciseModal.value = true
}

async function loadExercises() {
  // Don't try to load exercises for new workouts (workoutId is 'new')
  if (isNewWorkout.value || !workout.value) {
    exercises.value = []
    return
  }

  try {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .eq('workout_id', workoutId.value)
      .order('order_index')

    if (error) throw error
    exercises.value = data || []
  } catch (e) {
    console.error('Error loading exercises:', e)
  }
}

function openExerciseModal() {
  resetExerciseForm()
  editingExerciseId.value = null
  showExerciseModal.value = true
}

function editExercise(exercise: Exercise) {
  exerciseForm.value = {
    name: exercise.name,
    description: exercise.description || '',
    sets: exercise.sets,
    reps: exercise.reps || '',
    weight_kg: exercise.weight_kg,
    duration_seconds: exercise.duration_seconds,
    distance_meters: exercise.distance_meters,
    rpe: exercise.rpe,
    intensity_percent: exercise.intensity_percent,
    target_time_seconds: exercise.target_time_seconds,
    rest_seconds: exercise.rest_seconds,
    notes: exercise.notes || '',
    video_url: exercise.video_url || '',
    intensity_prescription: (exercise as any).intensity_prescription || '',
    tempo: (exercise as any).tempo || '',
    superset_group: (exercise as any).superset_group || '',
  }
  editingExerciseId.value = exercise.id
  showExerciseModal.value = true
}

function resetExerciseForm() {
  exerciseForm.value = {
    name: '',
    description: '',
    sets: null,
    reps: '',
    weight_kg: null,
    duration_seconds: null,
    distance_meters: null,
    rpe: null,
    intensity_percent: null,
    target_time_seconds: null,
    rest_seconds: null,
    notes: '',
    video_url: '',
    intensity_prescription: '',
    tempo: '',
    superset_group: '',
  }
  errorMessage.value = ''
}

function closeExerciseModal() {
  showExerciseModal.value = false
  resetExerciseForm()
  editingExerciseId.value = null
}

async function saveExercise() {
  if (!exerciseForm.value.name) return
  
  try {
    saving.value = true
    errorMessage.value = ''
    
    if (editingExerciseId.value) {
      // Update existing exercise
      const { error } = (await (supabase
        .from('exercises') as any)
        .update({
          name: exerciseForm.value.name,
          description: exerciseForm.value.description || null,
          sets: exerciseForm.value.sets,
          reps: exerciseForm.value.reps || null,
          weight_kg: exerciseForm.value.weight_kg,
          duration_seconds: exerciseForm.value.duration_seconds,
          distance_meters: exerciseForm.value.distance_meters,
          rpe: exerciseForm.value.rpe,
          intensity_percent: exerciseForm.value.intensity_percent,
          target_time_seconds: exerciseForm.value.target_time_seconds,
          rest_seconds: exerciseForm.value.rest_seconds,
          notes: exerciseForm.value.notes || null,
          video_url: exerciseForm.value.video_url || null,
          intensity_prescription: exerciseForm.value.intensity_prescription || null,
          tempo: exerciseForm.value.tempo || null,
          superset_group: exerciseForm.value.superset_group || null,
        })
        .eq('id', editingExerciseId.value)) as { error: any }

      if (error) throw error
    } else {
      // Create new exercise
      const { error } = (await (supabase
        .from('exercises') as any)
        .insert({
          workout_id: workoutId.value,
          name: exerciseForm.value.name,
          description: exerciseForm.value.description || null,
          order_index: exercises.value.length,
          sets: exerciseForm.value.sets,
          reps: exerciseForm.value.reps || null,
          weight_kg: exerciseForm.value.weight_kg,
          duration_seconds: exerciseForm.value.duration_seconds,
          distance_meters: exerciseForm.value.distance_meters,
          rpe: exerciseForm.value.rpe,
          intensity_percent: exerciseForm.value.intensity_percent,
          target_time_seconds: exerciseForm.value.target_time_seconds,
          rest_seconds: exerciseForm.value.rest_seconds,
          notes: exerciseForm.value.notes || null,
          video_url: exerciseForm.value.video_url || null,
          intensity_prescription: exerciseForm.value.intensity_prescription || null,
          tempo: exerciseForm.value.tempo || null,
          superset_group: exerciseForm.value.superset_group || null,
        })) as { error: any }

      if (error) throw error
    }

    await loadExercises()
    closeExerciseModal()
  } catch (e) {
    console.error('Error saving exercise:', e)
    errorMessage.value = e instanceof Error ? e.message : 'Failed to save exercise'
  } finally {
    saving.value = false
  }
}

function confirmDeleteExercise(exerciseId: string) {
  exerciseToDeleteId.value = exerciseId
  showDeleteConfirm.value = true
}

async function handleDeleteExercise() {
  if (!exerciseToDeleteId.value) return
  deletingExercise.value = true

  try {
    const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', exerciseToDeleteId.value)

    if (error) throw error
    showDeleteConfirm.value = false
    exerciseToDeleteId.value = null
    await loadExercises()
    showToast('Exercise deleted')
  } catch (e) {
    console.error('Error deleting exercise:', e)
    showToast('Failed to delete exercise', 'error')
  } finally {
    deletingExercise.value = false
  }
}

function formatExerciseDetails(exercise: Exercise): string {
  const parts: string[] = []

  if (exercise.sets) parts.push(`${exercise.sets} sets`)
  if (exercise.reps) parts.push(`${exercise.reps} reps`)
  if (exercise.weight_kg) parts.push(`${exercise.weight_kg}kg`)
  if (exercise.duration_seconds) {
    const mins = Math.floor(exercise.duration_seconds / 60)
    const secs = exercise.duration_seconds % 60
    parts.push(secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}min`)
  }
  if (exercise.distance_meters) parts.push(`${exercise.distance_meters}m`)
  if (exercise.rpe) parts.push(`RPE ${exercise.rpe}`)
  if (exercise.intensity_percent) parts.push(`${exercise.intensity_percent}%`)
  const exAny = exercise as any
  if (exAny.intensity_prescription) parts.push(exAny.intensity_prescription)
  if (exAny.tempo) parts.push(`@${exAny.tempo}`)

  return parts.length > 0 ? parts.join(' • ') : 'No parameters set'
}

function getSupersetsMap(): Map<string, Exercise[]> {
  const map = new Map<string, Exercise[]>()
  for (const ex of exercises.value) {
    const group = (ex as any).superset_group
    if (group) {
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(ex)
    }
  }
  return map
}

function getSupersetLabel(exercise: Exercise): string | null {
  const group = (exercise as any).superset_group
  if (!group) return null
  const map = getSupersetsMap()
  const members = map.get(group)
  if (!members || members.length < 2) return null
  return group
}

function formatTime(seconds: number | null): string {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center gap-3">
        <button
          @click="handleBack"
          class="p-2 hover:bg-gray-100 rounded-lg -ml-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="font-display text-lg font-bold text-gray-900 truncate">
            {{ workout?.name || 'Workout' }}
          </h1>
          <p class="text-sm text-gray-500">{{ exercises.length }} exercise{{ exercises.length !== 1 ? 's' : '' }}</p>
        </div>
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

    <!-- Content -->
    <div v-else class="p-4 space-y-4">
      <!-- Plan context banner -->
      <div v-if="isPlanSession && planContext" class="bg-summit-50 border border-summit-200 rounded-xl p-3">
        <div class="flex items-center gap-2 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="font-semibold text-summit-900">Plan Session</span>
          <span class="text-summit-700">
            {{ planContext.blockType || 'Session' }} · Day {{ planContext.dayIndex + 1 }}
            <span v-if="planContext.isDeload" class="ml-1 text-indigo-600 font-medium">· Deload Week</span>
          </span>
        </div>
      </div>

      <!-- Workout info card -->
      <div v-if="workout?.description" class="card p-4">
        <p class="text-sm text-gray-700">{{ workout.description }}</p>
      </div>

      <!-- Session Metadata Panel (Sprint 9.3b) -->
      <div class="card p-4 border-l-4 border-l-summit-600">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-900">Session Details</h3>
          <button
            @click="saveSessionMeta"
            :disabled="savingSession"
            class="text-xs font-semibold text-summit-600 hover:text-summit-700"
          >
            {{ savingSession ? 'Saving...' : 'Save' }}
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <!-- Session Type -->
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Type</label>
            <select v-model="sessionType" class="input text-sm py-1.5">
              <option value="">Not set</option>
              <option v-for="t in sessionTypes" :key="t" :value="t">
                {{ t.charAt(0).toUpperCase() + t.slice(1) }}
              </option>
            </select>
          </div>
          <!-- Session Focus -->
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Focus</label>
            <select v-model="sessionFocus" class="input text-sm py-1.5">
              <option value="">Not set</option>
              <option v-for="f in sessionFocusOptions" :key="f" :value="f">
                {{ f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }}
              </option>
            </select>
          </div>
          <!-- Target RPE -->
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Target RPE</label>
            <input
              v-model.number="targetRpe"
              type="number"
              min="1"
              max="10"
              step="0.5"
              placeholder="7"
              class="input text-sm py-1.5"
            />
          </div>
        </div>
        <!-- Estimated Load -->
        <div v-if="estimatedLoad > 0" class="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Est. Session Load</span>
          <span class="text-sm font-bold text-summit-700">{{ estimatedLoad.toLocaleString() }} kg</span>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="exercises.length === 0" class="text-center py-8">
        <div class="w-16 h-16 mx-auto mb-4 bg-summit-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 class="font-semibold text-gray-900 mb-1">No exercises yet</h3>
        <p class="text-sm text-gray-600 mb-4">Add exercises to build your workout</p>
        <button
          @click="openExerciseModal"
          class="btn-primary"
        >
          Add First Exercise
        </button>
      </div>

      <!-- Exercises list -->
      <div v-else class="space-y-3">
        <div
          v-for="(exercise, index) in exercises"
          :key="exercise.id"
          class="card p-4"
        >
          <div class="flex items-start gap-3">
            <!-- Order number -->
            <div class="w-8 h-8 rounded-full bg-summit-100 text-summit-700 font-bold flex items-center justify-center flex-shrink-0 text-sm">
              {{ index + 1 }}
            </div>

            <!-- Exercise info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-semibold text-gray-900">
                  {{ exercise.name }}
                </h3>
                <span
                  v-if="getSupersetLabel(exercise)"
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700"
                >
                  {{ getSupersetLabel(exercise) }}
                </span>
              </div>
              <p v-if="exercise.description" class="text-sm text-gray-600 mb-2">
                {{ exercise.description }}
              </p>
              <p class="text-sm text-gray-500">
                {{ formatExerciseDetails(exercise) }}
              </p>
              <p v-if="exercise.rest_seconds" class="text-xs text-gray-500 mt-1">
                Rest: {{ formatTime(exercise.rest_seconds) }}
              </p>
            </div>

            <!-- Actions -->
            <div class="flex gap-1 flex-shrink-0">
              <button
                @click="toggleFavorite(exercise)"
                class="p-2 hover:bg-yellow-50 rounded-lg"
                :title="isFavorite(exercise.name) ? 'Remove from favorites' : 'Add to favorites'"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  :class="isFavorite(exercise.name) ? 'text-yellow-400 fill-current' : 'text-gray-400'"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
              <button
                @click="editExercise(exercise)"
                class="p-2 hover:bg-gray-100 rounded-lg"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                @click="confirmDeleteExercise(exercise.id)"
                class="p-2 hover:bg-red-100 rounded-lg"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Favorites panel -->
        <div v-if="showFavoritesPanel && favorites.length > 0" class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-900 text-sm">Favorite Exercises</h3>
            <button @click="showFavoritesPanel = false" class="text-gray-400 hover:text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="space-y-2">
            <button
              v-for="fav in favorites"
              :key="fav.id"
              @click="loadFromFavorite(fav)"
              class="w-full text-left px-3 py-2 bg-white rounded-lg hover:bg-yellow-100 transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-yellow-400 fill-current flex-shrink-0" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span class="font-medium text-sm text-gray-900">{{ fav.exercise_name }}</span>
            </button>
          </div>
        </div>

        <!-- Add buttons -->
        <div class="flex gap-3">
          <button
            @click="openExerciseModal"
            class="flex-1 p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-summit-500 hover:bg-summit-50 transition-colors text-gray-600 hover:text-summit-700 font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Custom
          </button>
          <button
            @click="showExerciseLibrary = true"
            class="flex-1 p-4 border-2 border-dashed border-emerald-300 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-emerald-600 hover:text-emerald-700 font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            Library
          </button>
          <button
            v-if="favorites.length > 0"
            @click="showFavoritesPanel = !showFavoritesPanel"
            class="p-4 border-2 border-dashed border-yellow-300 rounded-xl hover:border-yellow-500 hover:bg-yellow-50 transition-colors text-yellow-600 hover:text-yellow-700 font-medium"
            title="Add from favorites"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mx-auto mb-1 fill-current" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Favs
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Dialog -->
    <ConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Exercise?"
      message="Are you sure you want to delete this exercise? This cannot be undone."
      confirm-text="Delete"
      :loading="deletingExercise"
      @confirm="handleDeleteExercise"
      @cancel="showDeleteConfirm = false"
    />

    <!-- Toast -->
    <Toast
      :message="toastMessage"
      :type="toastType"
      :visible="toastVisible"
      @close="toastVisible = false"
    />

    <!-- Exercise Library Modal -->
    <Teleport to="body">
      <div
        v-if="showExerciseLibrary"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50"
        @click.self="showExerciseLibrary = false"
      >
        <div class="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
          <div class="p-4 border-b border-feed-border flex items-center justify-between flex-shrink-0">
            <h2 class="font-semibold text-lg">Exercise Library</h2>
            <button
              @click="showExerciseLibrary = false"
              class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto">
            <ExerciseLibrary
              :selectable="true"
              @select="handleLibrarySelect"
            />
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Exercise Modal -->
    <div
      v-if="showExerciseModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50 p-4"
      @click.self="closeExerciseModal"
    >
      <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
        <!-- Header -->
        <div class="p-4 border-b border-feed-border flex items-center justify-between flex-shrink-0">
          <h2 class="font-semibold text-lg">
            {{ editingExerciseId ? 'Edit Exercise' : 'Add Exercise' }}
          </h2>
          <button
            @click="closeExerciseModal"
            class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content - scrollable -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- Error message -->
          <div v-if="errorMessage" class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {{ errorMessage }}
          </div>

          <!-- Exercise name -->
          <div>
            <label class="label">Exercise Name *</label>
            <input
              v-model="exerciseForm.name"
              type="text"
              placeholder="e.g., Back Squat"
              class="input"
              required
            />
          </div>

          <!-- Description -->
          <div>
            <label class="label">Description / Instructions</label>
            <textarea
              v-model="exerciseForm.description"
              rows="2"
              placeholder="Brief instructions or notes..."
              class="input resize-none"
            ></textarea>
          </div>

          <!-- Parameters grid -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Sets -->
            <div>
              <label class="label">Sets</label>
              <input
                v-model.number="exerciseForm.sets"
                type="number"
                min="1"
                placeholder="3"
                class="input"
              />
            </div>

            <!-- Reps -->
            <div>
              <label class="label">Reps</label>
              <input
                v-model="exerciseForm.reps"
                type="text"
                placeholder="8-10"
                class="input"
              />
              <p class="helper-text">Can be range: 8-10</p>
            </div>

            <!-- Weight -->
            <div>
              <label class="label">Weight (kg)</label>
              <input
                v-model.number="exerciseForm.weight_kg"
                type="number"
                step="0.5"
                placeholder="100"
                class="input"
              />
            </div>

            <!-- RPE -->
            <div>
              <label class="label">RPE</label>
              <input
                v-model.number="exerciseForm.rpe"
                type="number"
                min="1"
                max="10"
                step="0.5"
                placeholder="8"
                class="input"
              />
              <p class="helper-text">1-10 scale</p>
            </div>

            <!-- Duration -->
            <div>
              <label class="label">Duration (seconds)</label>
              <input
                v-model.number="exerciseForm.duration_seconds"
                type="number"
                placeholder="60"
                class="input"
              />
            </div>

            <!-- Distance -->
            <div>
              <label class="label">Distance (meters)</label>
              <input
                v-model.number="exerciseForm.distance_meters"
                type="number"
                placeholder="400"
                class="input"
              />
            </div>

            <!-- Intensity % -->
            <div>
              <label class="label">Intensity (%)</label>
              <input
                v-model.number="exerciseForm.intensity_percent"
                type="number"
                min="0"
                max="100"
                placeholder="85"
                class="input"
              />
            </div>

            <!-- Target time -->
            <div>
              <label class="label">Target Time (sec)</label>
              <input
                v-model.number="exerciseForm.target_time_seconds"
                type="number"
                placeholder="90"
                class="input"
              />
            </div>
          </div>

          <!-- Rest period -->
          <div>
            <label class="label">Rest Between Sets (seconds)</label>
            <input
              v-model.number="exerciseForm.rest_seconds"
              type="number"
              placeholder="90"
              class="input"
            />
          </div>

          <!-- Sprint 9.3b: Enrichment fields -->
          <div class="pt-3 border-t border-gray-100">
            <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Advanced Prescription</div>
            <div class="grid grid-cols-2 gap-4">
              <!-- Intensity Prescription -->
              <div class="col-span-2 sm:col-span-1">
                <label class="label">Intensity Prescription</label>
                <input
                  v-model="exerciseForm.intensity_prescription"
                  type="text"
                  placeholder="e.g., 80% 1RM, Zone 3, RPE 7-8"
                  class="input"
                />
                <p class="helper-text">%, RPE range, pace, HR zone, velocity</p>
              </div>

              <!-- Tempo -->
              <div class="col-span-2 sm:col-span-1">
                <label class="label">Tempo</label>
                <input
                  v-model="exerciseForm.tempo"
                  type="text"
                  placeholder="e.g., 3-1-2-0"
                  class="input"
                />
                <p class="helper-text">Eccentric-Pause-Concentric-Pause</p>
              </div>

              <!-- Superset Group -->
              <div class="col-span-2">
                <label class="label">Superset Group</label>
                <input
                  v-model="exerciseForm.superset_group"
                  type="text"
                  placeholder="e.g., A, B, or a custom name"
                  class="input"
                />
                <p class="helper-text">Exercises with the same group letter are performed as a superset</p>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="label">Coach Notes</label>
            <textarea
              v-model="exerciseForm.notes"
              rows="2"
              placeholder="Additional notes for the athlete..."
              class="input resize-none"
            ></textarea>
          </div>

          <!-- Video URL -->
          <div>
            <label class="label">Demo Video URL</label>
            <input
              v-model="exerciseForm.video_url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              class="input"
            />
          </div>

          <!-- Info -->
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
            <p class="font-medium mb-1">💡 Flexible Structure</p>
            <p>Only fill in the fields relevant to this exercise. Blank fields won't appear for athletes.</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-feed-border flex-shrink-0 space-y-2">
          <button
            @click="saveExercise"
            :disabled="!exerciseForm.name || saving"
            class="btn-primary w-full"
          >
            <span v-if="saving" class="flex items-center gap-2 justify-center">
              <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
            <span v-else>{{ editingExerciseId ? 'Save Changes' : 'Add Exercise' }}</span>
          </button>
          <button
            @click="closeExerciseModal"
            class="btn-secondary w-full"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
