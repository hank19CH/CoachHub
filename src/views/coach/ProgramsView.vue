<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Program } from '@/types/database'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Toast from '@/components/ui/Toast.vue'

const router = useRouter()
const authStore = useAuthStore()

// State
const programs = ref<(Program & { workout_count?: number })[]>([])
const loading = ref(true)
const searchQuery = ref('')
const showCreateModal = ref(false)

// Confirm dialog state
const showDeleteConfirm = ref(false)
const programToDelete = ref<Program | null>(null)
const deleting = ref(false)

// Toast state
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastVisible = ref(false)

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

// Program form state
const programForm = ref({
  name: '',
  description: '',
  duration_weeks: 4,
  difficulty: '' as 'beginner' | 'intermediate' | 'advanced' | '',
  sport_id: null as string | null
})

const saving = ref(false)
const errorMessage = ref('')

// Computed
const filteredPrograms = computed(() => {
  if (!searchQuery.value) return programs.value
  
  const query = searchQuery.value.toLowerCase()
  return programs.value.filter((program: any) =>
    program.name.toLowerCase().includes(query) ||
    (program.description && program.description.toLowerCase().includes(query))
  )
})

const hasPrograms = computed(() => programs.value.length > 0)

onMounted(async () => {
  await loadPrograms()
})

async function loadPrograms() {
  if (!authStore.user) return
  
  try {
    loading.value = true
    
    const { data, error } = (await supabase
      .from('programs')
      .select('*, program_weeks(id, workouts:workouts(id))')
      .eq('coach_id', authStore.user.id)
      .order('created_at', { ascending: false })) as { data: any[] | null; error: any }

    if (error) throw error

    // Count workouts across all weeks
    programs.value = (data || []).map((p: any) => {
      const weeks = p.program_weeks || []
      const workoutCount = weeks.reduce((sum: number, w: any) => sum + (w.workouts?.length || 0), 0)
      const { program_weeks, ...rest } = p
      return { ...rest, workout_count: workoutCount }
    })
  } catch (e: any) {
    console.error('Error loading programs:', e?.message || e?.code || JSON.stringify(e))
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  // Reset form
  programForm.value = {
    name: '',
    description: '',
    duration_weeks: 4,
    difficulty: '',
    sport_id: null
  }
  errorMessage.value = ''
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
  errorMessage.value = ''
}

async function createProgram() {
  if (!authStore.user || !programForm.value.name) return
  
  try {
    saving.value = true
    errorMessage.value = ''
    
    // Create the program
    const { data: program, error } = (await (supabase
      .from('programs') as any)
      .insert({
        coach_id: authStore.user.id,
        name: programForm.value.name,
        description: programForm.value.description || null,
        duration_weeks: programForm.value.duration_weeks,
        difficulty: programForm.value.difficulty || null,
        sport_id: programForm.value.sport_id,
        is_template: true,
        is_published: false
      })
      .select()
      .single()) as { data: any; error: any }

    if (error) throw error

    // Navigate to program builder to add weeks/workouts
    router.push(`/programs/${program.id}/edit`)
  } catch (e: any) {
    console.error('Error creating program:', e?.message || e?.code || JSON.stringify(e))
    errorMessage.value = e?.message || (e instanceof Error ? e.message : 'Failed to create program')
  } finally {
    saving.value = false
  }
}

function editProgram(programId: string) {
  router.push(`/programs/${programId}/edit`)
}

function confirmDeleteProgram(program: Program) {
  programToDelete.value = program
  showDeleteConfirm.value = true
}

async function deleteProgram() {
  const program = programToDelete.value
  if (!authStore.user || !program) return
  deleting.value = true

  try {
    // Fetch weeks to get workout IDs
    const { data: weeks } = (await supabase
      .from('program_weeks')
      .select('id')
      .eq('program_id', program.id)) as { data: any[] | null; error: any }

    if (weeks && weeks.length > 0) {
      const weekIds = weeks.map((w: any) => w.id)

      // Get workouts in those weeks
      const { data: workouts } = (await supabase
        .from('workouts')
        .select('id')
        .in('program_week_id', weekIds)) as { data: any[] | null; error: any }

      if (workouts && workouts.length > 0) {
        const workoutIds = workouts.map((w: any) => w.id)

        // Delete exercises for those workouts
        await supabase
          .from('exercises')
          .delete()
          .in('workout_id', workoutIds)

        // Delete workouts
        await supabase
          .from('workouts')
          .delete()
          .in('id', workoutIds)
          .eq('coach_id', authStore.user.id)
      }

      // Delete weeks
      await supabase
        .from('program_weeks')
        .delete()
        .in('id', weekIds)
    }

    // Delete the program itself
    const { error } = await supabase
      .from('programs')
      .delete()
      .eq('id', program.id)
      .eq('coach_id', authStore.user.id)

    if (error) throw error

    showDeleteConfirm.value = false
    programToDelete.value = null
    await loadPrograms()
    showToast('Program deleted')
  } catch (e) {
    console.error('Error deleting program:', e)
    showToast('Failed to delete program', 'error')
  } finally {
    deleting.value = false
  }
}

async function duplicateProgram(program: Program) {
  if (!authStore.user) return
  
  try {
    // Create duplicate program
    const { data: newProgram, error: programError } = (await (supabase
      .from('programs') as any)
      .insert({
        coach_id: authStore.user.id,
        name: `${program.name} (Copy)`,
        description: program.description,
        duration_weeks: program.duration_weeks,
        difficulty: program.difficulty,
        sport_id: program.sport_id,
        is_template: program.is_template,
        is_published: false
      })
      .select()
      .single()) as { data: any; error: any }

    if (programError) throw programError

    // Fetch weeks from original program
    const { data: weeks, error: weeksError } = (await supabase
      .from('program_weeks')
      .select('*')
      .eq('program_id', program.id)
      .order('week_number')) as { data: any[] | null; error: any }

    if (weeksError) throw weeksError

    // Copy weeks and workouts
    if (weeks && weeks.length > 0) {
      for (const week of weeks) {
        // Create new week
        const { data: newWeek, error: weekError } = (await (supabase
          .from('program_weeks') as any)
          .insert({
            program_id: newProgram.id,
            week_number: week.week_number,
            name: week.name,
            notes: week.notes
          })
          .select()
          .single()) as { data: any; error: any }

        if (weekError) throw weekError
        
        // Get workouts from this week
        const { data: workouts, error: workoutsError } = (await supabase
          .from('workouts')
          .select('*, exercises(*)')
          .eq('program_week_id', week.id)) as { data: any[] | null; error: any }

        if (workoutsError) throw workoutsError

        // Copy workouts
        if (workouts) {
          for (const workout of workouts) {
            const { data: newWorkout, error: workoutError } = (await (supabase
              .from('workouts') as any)
              .insert({
                coach_id: authStore.user.id,
                program_week_id: newWeek.id,
                name: workout.name,
                description: workout.description,
                day_of_week: workout.day_of_week,
                estimated_duration_min: workout.estimated_duration_min,
                workout_type: workout.workout_type,
                is_template: workout.is_template
              })
              .select()
              .single()) as { data: any; error: any }

            if (workoutError) throw workoutError

            // Copy exercises
            if (workout.exercises && workout.exercises.length > 0) {
              const exerciseCopies = workout.exercises.map((ex: any) => ({
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

              const { error: exercisesError } = await (supabase
                .from('exercises') as any)
                .insert(exerciseCopies)

              if (exercisesError) throw exercisesError
            }
          }
        }
      }
    }

    // Reload programs list
    await loadPrograms()
    showToast(`"${newProgram.name}" duplicated successfully`)
  } catch (e) {
    console.error('Error duplicating program:', e)
    showToast('Failed to duplicate program', 'error')
  }
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h1 class="font-display text-xl font-bold text-gray-900">Programs</h1>
        <button
          @click="openCreateModal"
          class="btn-primary px-4 py-2 text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Program
        </button>
      </div>
    </div>

    <!-- Search bar (only show if has programs) -->
    <div v-if="hasPrograms" class="p-4">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search programs..."
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
    <div v-else-if="!hasPrograms" class="p-6 text-center">
      <div class="max-w-sm mx-auto">
        <div class="w-20 h-20 mx-auto mb-4 bg-summit-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 class="font-semibold text-lg text-gray-900 mb-2">No programs yet</h2>
        <p class="text-gray-600 mb-6">
          Create your first training program with multiple weeks and structured workouts
        </p>
        <button
          @click="openCreateModal"
          class="btn-primary w-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Your First Program
        </button>
      </div>
    </div>

    <!-- Programs list -->
    <div v-else class="p-4 space-y-3">
      <div
        v-for="program in filteredPrograms"
        :key="program.id"
        class="card p-4 hover:shadow-md transition-shadow"
      >
        <div class="flex items-start justify-between gap-3">
          <div 
            @click="editProgram(program.id)"
            class="flex-1 min-w-0 cursor-pointer"
          >
            <h3 class="font-semibold text-gray-900 mb-1">
              {{ program.name }}
            </h3>
            <p v-if="program.description" class="text-sm text-gray-600 mb-2 line-clamp-2">
              {{ program.description }}
            </p>
            <div class="flex flex-wrap gap-2 text-xs text-gray-500">
              <span class="inline-flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ program.duration_weeks }} week{{ program.duration_weeks !== 1 ? 's' : '' }}
              </span>
              <span v-if="program.workout_count" class="inline-flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {{ program.workout_count }} workout{{ program.workout_count !== 1 ? 's' : '' }}
              </span>
              <span v-if="program.difficulty" class="inline-flex items-center gap-1 capitalize">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {{ program.difficulty }}
              </span>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-1 flex-shrink-0">
            <button
              @click.stop="editProgram(program.id)"
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Edit program"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              @click.stop="duplicateProgram(program)"
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Duplicate program"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              @click.stop="confirmDeleteProgram(program)"
              class="p-2 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete program"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- No results from search -->
      <div v-if="filteredPrograms.length === 0" class="text-center py-8 text-gray-500">
        <p>No programs found matching "{{ searchQuery }}"</p>
      </div>
    </div>

    <!-- Delete Confirm Dialog -->
    <ConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Program?"
      :message="`Delete &quot;${programToDelete?.name}&quot;? This will also delete all weeks and workouts. This cannot be undone.`"
      confirm-text="Delete"
      :loading="deleting"
      @confirm="deleteProgram"
      @cancel="showDeleteConfirm = false"
    />

    <!-- Toast -->
    <Toast
      :message="toastMessage"
      :type="toastType"
      :visible="toastVisible"
      @close="toastVisible = false"
    />

    <!-- Create Program Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50"
      @click.self="closeCreateModal"
    >
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
        <!-- Header -->
        <div class="p-4 border-b border-feed-border flex items-center justify-between flex-shrink-0">
          <h2 class="font-semibold text-lg">Create Program</h2>
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

          <!-- Program name -->
          <div>
            <label class="label">Program Name *</label>
            <input
              v-model="programForm.name"
              type="text"
              placeholder="e.g., 4-Week Speed Development Block"
              class="input"
              required
            />
          </div>

          <!-- Description -->
          <div>
            <label class="label">Description</label>
            <textarea
              v-model="programForm.description"
              rows="3"
              placeholder="Brief overview of the program..."
              class="input resize-none"
            ></textarea>
          </div>

          <!-- Duration -->
          <div>
            <label class="label">Duration (weeks) *</label>
            <input
              v-model.number="programForm.duration_weeks"
              type="number"
              min="1"
              max="52"
              class="input"
              required
            />
          </div>

          <!-- Difficulty -->
          <div>
            <label class="label">Difficulty Level</label>
            <select v-model="programForm.difficulty" class="input">
              <option value="">Select level...</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <!-- Info box -->
          <div class="p-3 bg-summit-50 border border-summit-200 rounded-xl text-sm text-summit-800">
            <p class="font-medium mb-1">💡 Next Step</p>
            <p>After creating the program, you'll build out each week and assign workouts to specific days.</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-feed-border flex-shrink-0 space-y-2">
          <button
            @click="createProgram"
            :disabled="!programForm.name || saving"
            class="btn-primary w-full"
          >
            <span v-if="saving" class="flex items-center gap-2 justify-center">
              <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating...
            </span>
            <span v-else>Create & Build Program</span>
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
