<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import MediaUploadZone from '@/components/athlete/MediaUploadZone.vue'
import WorkoutCard from '@/components/posts/WorkoutCard.vue'
import { uploadPostMedia, createWorkoutPost } from '@/services/posts'
import type { WorkoutCardExercise } from '@/components/posts/WorkoutCard.vue'

export interface ShareExercise {
  id: string
  name: string
  sets: number | null
  reps: string | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_meters: number | null
  sets_completed: number | null
  reps_completed: string | null
  weight_used_kg: number | null
  actual_duration_seconds: number | null
  actual_distance_meters: number | null
  isPb: boolean
}

const props = defineProps<{
  completionId: string
  workoutName: string
  duration: number // minutes
  exercisesCompleted: number
  pbCount: number
  exercises: ShareExercise[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'shared', postId: string): void
}>()

const authStore = useAuthStore()

// Form state
const caption = ref('')
const visibility = ref<'public' | 'followers' | 'private'>('public')
const mediaFiles = ref<File[]>([])
const selectedExerciseIds = ref<Set<string>>(new Set(props.exercises.map((e) => e.id)))
const isSubmitting = ref(false)
const submitError = ref('')

// Share settings
const shareSettings = ref({
  show_duration: true,
  show_rpe: true,
  show_workout_name: true,
  show_exercise_details: true,
  highlight_pbs_only: false,
})

// Step management: 1 = compose, 2 = preview
const step = ref<1 | 2>(1)

// Computed
const selectedExercises = computed(() =>
  props.exercises.filter((e) => selectedExerciseIds.value.has(e.id))
)

const cardExercises = computed<WorkoutCardExercise[]>(() =>
  selectedExercises.value.map((e) => ({
    name: e.name,
    sets: e.sets_completed ?? e.sets,
    reps: e.reps_completed ?? e.reps,
    weight: e.weight_used_kg ?? e.weight_kg,
    duration: e.actual_duration_seconds ?? e.duration_seconds,
    distance: e.actual_distance_meters ?? e.distance_meters,
    isPb: e.isPb,
  }))
)

const cardPbCount = computed(() => cardExercises.value.filter((e) => e.isPb).length)

const canSubmit = computed(() => {
  return caption.value.trim().length > 0 || mediaFiles.value.length > 0 || true // Can share with just the workout card
})

// Toggle exercise selection
function toggleExercise(id: string) {
  const newSet = new Set(selectedExerciseIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selectedExerciseIds.value = newSet
}

function selectAllExercises() {
  selectedExerciseIds.value = new Set(props.exercises.map((e) => e.id))
}

function deselectAllExercises() {
  selectedExerciseIds.value = new Set()
}

// Handle media files from upload zone
function handleFilesChanged(files: File[]) {
  mediaFiles.value = files
}

// Go to preview
function goToPreview() {
  step.value = 2
}

function goBack() {
  step.value = 1
}

// Submit
async function handleSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  submitError.value = ''

  try {
    const userId = authStore.user?.id
    if (!userId) throw new Error('Not authenticated')

    // Upload media files first
    const uploadedMedia = []
    for (const file of mediaFiles.value) {
      const url = await uploadPostMedia(file, userId, props.completionId)
      if (url) {
        uploadedMedia.push({
          file,
          url,
          type: (file.type.startsWith('image/') ? 'image' : 'video') as 'image' | 'video',
        })
      }
    }

    // Create the post
    const post = await createWorkoutPost(
      {
        completionId: props.completionId,
        caption: caption.value.trim(),
        visibility: visibility.value,
        sharedExerciseIds: Array.from(selectedExerciseIds.value),
        shareSettings: shareSettings.value,
      },
      uploadedMedia
    )

    if (post) {
      emit('shared', post.id)
    } else {
      submitError.value = 'Failed to create post. Please try again.'
    }
  } catch (err: any) {
    submitError.value = err.message || 'Something went wrong'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
    <div
      class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <button
          v-if="step === 2"
          @click="goBack"
          class="text-sm text-summit-600 font-medium"
        >
          Back
        </button>
        <button
          v-else
          @click="emit('close')"
          class="p-1 text-gray-400 hover:text-gray-600"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 class="font-semibold text-gray-900">
          {{ step === 1 ? 'Share Workout' : 'Preview' }}
        </h3>

        <button
          v-if="step === 1"
          @click="goToPreview"
          class="text-sm text-summit-600 font-semibold"
        >
          Preview
        </button>
        <button
          v-else
          @click="handleSubmit"
          :disabled="isSubmitting"
          class="text-sm font-semibold"
          :class="isSubmitting ? 'text-gray-400' : 'text-summit-600'"
        >
          {{ isSubmitting ? 'Posting...' : 'Post' }}
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Step 1: Compose -->
        <div v-if="step === 1" class="p-4 space-y-5">
          <!-- Caption -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Caption</label>
            <textarea
              v-model="caption"
              placeholder="How was your workout?"
              rows="3"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-summit-500 focus:border-summit-500 resize-none"
            />
          </div>

          <!-- Media upload -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Photos & Videos</label>
            <MediaUploadZone
              :max-files="5"
              @files-changed="handleFilesChanged"
            />
          </div>

          <!-- Exercise selection -->
          <div v-if="exercises.length > 0">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-gray-700">Exercises to Show</label>
              <button
                @click="selectedExerciseIds.size === exercises.length ? deselectAllExercises() : selectAllExercises()"
                class="text-xs text-summit-600 font-medium"
              >
                {{ selectedExerciseIds.size === exercises.length ? 'Deselect All' : 'Select All' }}
              </button>
            </div>

            <div class="space-y-1.5 max-h-48 overflow-y-auto">
              <label
                v-for="ex in exercises"
                :key="ex.id"
                class="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors"
                :class="selectedExerciseIds.has(ex.id) ? 'bg-summit-50' : 'bg-gray-50'"
              >
                <input
                  type="checkbox"
                  :checked="selectedExerciseIds.has(ex.id)"
                  @change="toggleExercise(ex.id)"
                  class="rounded border-gray-300 text-summit-600 focus:ring-summit-500"
                />
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium text-gray-900 truncate block">{{ ex.name }}</span>
                  <span v-if="ex.isPb" class="text-[10px] font-bold text-amber-600 uppercase tracking-wider">PR</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Share settings -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Card Settings</label>
            <div class="space-y-2">
              <label class="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg cursor-pointer">
                <span class="text-sm text-gray-700">Show workout name</span>
                <input
                  v-model="shareSettings.show_workout_name"
                  type="checkbox"
                  class="rounded border-gray-300 text-summit-600 focus:ring-summit-500"
                />
              </label>
              <label class="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg cursor-pointer">
                <span class="text-sm text-gray-700">Show duration</span>
                <input
                  v-model="shareSettings.show_duration"
                  type="checkbox"
                  class="rounded border-gray-300 text-summit-600 focus:ring-summit-500"
                />
              </label>
              <label class="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg cursor-pointer">
                <span class="text-sm text-gray-700">Show exercise details</span>
                <input
                  v-model="shareSettings.show_exercise_details"
                  type="checkbox"
                  class="rounded border-gray-300 text-summit-600 focus:ring-summit-500"
                />
              </label>
              <label class="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg cursor-pointer">
                <span class="text-sm text-gray-700">Show RPE</span>
                <input
                  v-model="shareSettings.show_rpe"
                  type="checkbox"
                  class="rounded border-gray-300 text-summit-600 focus:ring-summit-500"
                />
              </label>
              <label class="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg cursor-pointer">
                <span class="text-sm text-gray-700">Highlight PRs only</span>
                <input
                  v-model="shareSettings.highlight_pbs_only"
                  type="checkbox"
                  class="rounded border-gray-300 text-summit-600 focus:ring-summit-500"
                />
              </label>
            </div>
          </div>

          <!-- Visibility -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Who can see this?</label>
            <div class="flex gap-2">
              <button
                v-for="opt in [
                  { value: 'public', label: 'Everyone', icon: '🌍' },
                  { value: 'followers', label: 'Followers', icon: '👥' },
                  { value: 'private', label: 'Only me', icon: '🔒' },
                ] as const"
                :key="opt.value"
                @click="visibility = opt.value"
                class="flex-1 py-2 px-3 rounded-lg text-sm font-medium text-center border transition-colors"
                :class="
                  visibility === opt.value
                    ? 'border-summit-500 bg-summit-50 text-summit-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                "
              >
                <span class="block text-lg mb-0.5">{{ opt.icon }}</span>
                {{ opt.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Step 2: Preview -->
        <div v-else class="p-4 space-y-4">
          <!-- Caption preview -->
          <p v-if="caption.trim()" class="text-sm text-gray-900">{{ caption }}</p>

          <!-- Workout card preview -->
          <div class="rounded-xl overflow-hidden aspect-square max-w-[320px] mx-auto">
            <WorkoutCard
              :workout-name="workoutName"
              :duration="duration"
              :exercises="cardExercises"
              :share-settings="shareSettings"
              :pb-count="cardPbCount"
            />
          </div>

          <!-- Visibility indicator -->
          <p class="text-xs text-gray-500 text-center">
            Visible to:
            <span class="font-medium">
              {{ visibility === 'public' ? 'Everyone' : visibility === 'followers' ? 'Followers' : 'Only you' }}
            </span>
          </p>

          <!-- Error -->
          <p v-if="submitError" class="text-sm text-red-600 text-center bg-red-50 rounded-lg p-3">
            {{ submitError }}
          </p>
        </div>
      </div>

      <!-- Bottom action (step 2) -->
      <div v-if="step === 2" class="p-4 border-t flex-shrink-0">
        <button
          @click="handleSubmit"
          :disabled="isSubmitting"
          class="w-full py-3 rounded-lg font-semibold text-white transition-colors"
          :class="isSubmitting ? 'bg-gray-400' : 'bg-summit-600 hover:bg-summit-700'"
        >
          <span v-if="isSubmitting" class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sharing...
          </span>
          <span v-else>Share Workout</span>
        </button>
      </div>
    </div>
  </div>
</template>
