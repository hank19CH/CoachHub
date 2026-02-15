<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { exerciseLibraryService } from '@/services/exerciseLibrary'
import ExerciseLibrary from '@/components/planner/ExerciseLibrary.vue'
import Toast from '@/components/ui/Toast.vue'
import type { Database, ExerciseCategory, MovementPattern } from '@/types/database'

type ExerciseLibraryItem = Database['public']['Tables']['exercise_library']['Row']

const authStore = useAuthStore()

// Toast
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const toastVisible = ref(false)

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

// Custom exercise modal
const showCreateModal = ref(false)
const saving = ref(false)
const customForm = ref({
  name: '',
  category: '' as ExerciseCategory | '',
  movement_pattern: '' as MovementPattern | '',
  equipment: '',
  muscle_groups: '',
  video_url: '',
  cues: '',
})

function openCreateModal() {
  customForm.value = {
    name: '',
    category: '',
    movement_pattern: '',
    equipment: '',
    muscle_groups: '',
    video_url: '',
    cues: '',
  }
  showCreateModal.value = true
}

async function saveCustomExercise() {
  if (!authStore.user || !customForm.value.name) return
  saving.value = true

  try {
    await exerciseLibraryService.createExercise({
      name: customForm.value.name,
      coach_id: authStore.user.id,
      category: customForm.value.category || null,
      movement_pattern: customForm.value.movement_pattern || null,
      equipment: customForm.value.equipment ? customForm.value.equipment.split(',').map(s => s.trim()).filter(Boolean) : [],
      muscle_groups: customForm.value.muscle_groups ? customForm.value.muscle_groups.split(',').map(s => s.trim()).filter(Boolean) : [],
      video_url: customForm.value.video_url || null,
      cues: customForm.value.cues || null,
    })
    showCreateModal.value = false
    showToast('Exercise created!')
    // Force refresh by toggling a key
    refreshKey.value++
  } catch (e) {
    console.error('Error creating exercise:', e)
    showToast('Failed to create exercise', 'error')
  } finally {
    saving.value = false
  }
}

const refreshKey = ref(0)

// Detail panel
const selectedExercise = ref<ExerciseLibraryItem | null>(null)

function handleSelect(exercise: ExerciseLibraryItem) {
  selectedExercise.value = exercise
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-display text-lg font-bold text-gray-900">Exercise Library</h1>
          <p class="text-sm text-gray-500">Browse and manage exercises</p>
        </div>
        <button @click="openCreateModal" class="btn-primary text-sm px-4 py-2">
          + Custom Exercise
        </button>
      </div>
    </div>

    <!-- Main content -->
    <div class="flex">
      <!-- Library panel -->
      <div class="flex-1 min-h-[calc(100vh-120px)]">
        <ExerciseLibrary
          :key="refreshKey"
          :selectable="true"
          @select="handleSelect"
          @add-custom="openCreateModal"
        />
      </div>

      <!-- Detail panel (desktop) -->
      <div v-if="selectedExercise" class="hidden lg:block w-80 border-l border-gray-200 bg-white p-5">
        <div class="sticky top-20">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-gray-900">{{ selectedExercise.name }}</h3>
            <button @click="selectedExercise = null" class="text-gray-400 hover:text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-3">
            <div v-if="selectedExercise.category">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Category</label>
              <p class="text-sm text-gray-700 capitalize">{{ selectedExercise.category }}</p>
            </div>
            <div v-if="selectedExercise.movement_pattern">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Movement Pattern</label>
              <p class="text-sm text-gray-700 capitalize">{{ selectedExercise.movement_pattern }}</p>
            </div>
            <div v-if="selectedExercise.equipment?.length">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Equipment</label>
              <div class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="eq in selectedExercise.equipment"
                  :key="eq"
                  class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
                >
                  {{ eq }}
                </span>
              </div>
            </div>
            <div v-if="selectedExercise.muscle_groups?.length">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Muscle Groups</label>
              <div class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="mg in selectedExercise.muscle_groups"
                  :key="mg"
                  class="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
                >
                  {{ mg }}
                </span>
              </div>
            </div>
            <div v-if="selectedExercise.cues">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Coaching Cues</label>
              <p class="text-sm text-gray-700 mt-1 whitespace-pre-line">{{ selectedExercise.cues }}</p>
            </div>
            <div v-if="selectedExercise.video_url">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Demo Video</label>
              <a
                :href="selectedExercise.video_url"
                target="_blank"
                rel="noopener"
                class="text-sm text-summit-600 hover:text-summit-700 flex items-center gap-1 mt-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Watch Video
              </a>
            </div>

            <div v-if="selectedExercise.coach_id" class="pt-3 border-t border-gray-100">
              <span class="text-[10px] font-bold uppercase tracking-wider text-summit-600">Custom Exercise</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Exercise Modal -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50 p-4"
        @click.self="showCreateModal = false"
      >
        <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
          <div class="p-4 border-b border-feed-border flex items-center justify-between flex-shrink-0">
            <h2 class="font-semibold text-lg">Create Custom Exercise</h2>
            <button @click="showCreateModal = false" class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label class="label">Exercise Name *</label>
              <input v-model="customForm.name" type="text" class="input" placeholder="e.g., Bulgarian Split Squat" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Category</label>
                <select v-model="customForm.category" class="input">
                  <option value="">Not set</option>
                  <option value="primary">Primary</option>
                  <option value="accessory">Accessory</option>
                  <option value="warmup">Warmup</option>
                  <option value="cooldown">Cooldown</option>
                  <option value="drill">Drill</option>
                  <option value="plyometric">Plyometric</option>
                </select>
              </div>
              <div>
                <label class="label">Movement Pattern</label>
                <select v-model="customForm.movement_pattern" class="input">
                  <option value="">Not set</option>
                  <option value="squat">Squat</option>
                  <option value="hinge">Hinge</option>
                  <option value="push">Push</option>
                  <option value="pull">Pull</option>
                  <option value="carry">Carry</option>
                  <option value="locomotion">Locomotion</option>
                  <option value="rotation">Rotation</option>
                  <option value="skill">Skill</option>
                </select>
              </div>
            </div>

            <div>
              <label class="label">Equipment</label>
              <input v-model="customForm.equipment" type="text" class="input" placeholder="barbell, dumbbells (comma separated)" />
            </div>

            <div>
              <label class="label">Muscle Groups</label>
              <input v-model="customForm.muscle_groups" type="text" class="input" placeholder="quads, glutes, hamstrings (comma separated)" />
            </div>

            <div>
              <label class="label">Video URL</label>
              <input v-model="customForm.video_url" type="url" class="input" placeholder="https://youtube.com/watch?v=..." />
            </div>

            <div>
              <label class="label">Coaching Cues</label>
              <textarea v-model="customForm.cues" rows="3" class="input resize-none" placeholder="Key cues and instructions..."></textarea>
            </div>
          </div>

          <div class="p-4 border-t border-feed-border flex-shrink-0 space-y-2">
            <button
              @click="saveCustomExercise"
              :disabled="!customForm.name || saving"
              class="btn-primary w-full"
            >
              {{ saving ? 'Creating...' : 'Create Exercise' }}
            </button>
            <button @click="showCreateModal = false" class="btn-secondary w-full">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast -->
    <Toast :message="toastMessage" :type="toastType" :visible="toastVisible" @close="toastVisible = false" />
  </div>
</template>
