<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { exerciseLibraryService, type ExerciseLibraryFilters } from '@/services/exerciseLibrary'
import ExerciseCard from './ExerciseCard.vue'
import type { Database, ExerciseCategory, MovementPattern } from '@/types/database'

type ExerciseLibraryItem = Database['public']['Tables']['exercise_library']['Row']

const props = defineProps<{
  selectable?: boolean
  selectedIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'select', exercise: ExerciseLibraryItem): void
  (e: 'close'): void
  (e: 'add-custom'): void
}>()

const authStore = useAuthStore()

const exercises = ref<ExerciseLibraryItem[]>([])
const totalCount = ref(0)
const loading = ref(true)
const loadingMore = ref(false)

// Filters
const search = ref('')
const filterCategory = ref<ExerciseCategory | ''>('')
const filterPattern = ref<MovementPattern | ''>('')
const filterEquipment = ref('')
const filterMuscle = ref('')

// Filter options
const equipmentOptions = ref<string[]>([])
const muscleGroupOptions = ref<string[]>([])

const pageSize = 30
const currentOffset = ref(0)
const hasMore = computed(() => exercises.value.length < totalCount.value)

const categories: { value: ExerciseCategory | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'primary', label: 'Primary' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'warmup', label: 'Warmup' },
  { value: 'cooldown', label: 'Cooldown' },
  { value: 'drill', label: 'Drill' },
  { value: 'plyometric', label: 'Plyometric' },
]

const patterns: { value: MovementPattern | ''; label: string }[] = [
  { value: '', label: 'All patterns' },
  { value: 'squat', label: '🦵 Squat' },
  { value: 'hinge', label: '🔄 Hinge' },
  { value: 'push', label: '💪 Push' },
  { value: 'pull', label: '🏋️ Pull' },
  { value: 'carry', label: '🎒 Carry' },
  { value: 'locomotion', label: '🏃 Locomotion' },
  { value: 'rotation', label: '🌀 Rotation' },
  { value: 'skill', label: '🎯 Skill' },
]

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>

watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    resetAndFetch()
  }, 300)
})

watch([filterCategory, filterPattern, filterEquipment, filterMuscle], () => {
  resetAndFetch()
})

onMounted(async () => {
  const [, eqOpts, mgOpts] = await Promise.all([
    fetchExercises(),
    exerciseLibraryService.getEquipmentOptions(),
    exerciseLibraryService.getMuscleGroupOptions(),
  ])
  equipmentOptions.value = eqOpts
  muscleGroupOptions.value = mgOpts
})

function buildFilters(): ExerciseLibraryFilters {
  return {
    search: search.value || undefined,
    category: filterCategory.value || undefined,
    movementPattern: filterPattern.value || undefined,
    equipment: filterEquipment.value || undefined,
    muscleGroup: filterMuscle.value || undefined,
    coachId: authStore.user?.id,
  }
}

async function fetchExercises() {
  loading.value = true
  try {
    const result = await exerciseLibraryService.searchExercises(buildFilters(), pageSize, 0)
    exercises.value = result.data
    totalCount.value = result.count
    currentOffset.value = result.data.length
  } catch (e) {
    console.error('Error fetching exercises:', e)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const result = await exerciseLibraryService.searchExercises(buildFilters(), pageSize, currentOffset.value)
    exercises.value.push(...result.data)
    currentOffset.value += result.data.length
  } catch (e) {
    console.error('Error loading more exercises:', e)
  } finally {
    loadingMore.value = false
  }
}

function resetAndFetch() {
  currentOffset.value = 0
  fetchExercises()
}

function isSelected(exerciseId: string): boolean {
  return (props.selectedIds || []).includes(exerciseId)
}

function clearFilters() {
  search.value = ''
  filterCategory.value = ''
  filterPattern.value = ''
  filterEquipment.value = ''
  filterMuscle.value = ''
}

const hasActiveFilters = computed(() => {
  return search.value || filterCategory.value || filterPattern.value || filterEquipment.value || filterMuscle.value
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="p-4 border-b border-gray-100 flex-shrink-0">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-bold text-gray-900">Exercise Library</h2>
        <div class="flex gap-2">
          <button
            @click="emit('add-custom')"
            class="text-xs font-semibold text-summit-600 hover:text-summit-700 px-3 py-1.5 rounded-lg border border-summit-200 hover:bg-summit-50 transition-colors"
          >
            + Custom
          </button>
          <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="relative mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="search"
          type="text"
          class="input pl-9"
          placeholder="Search exercises..."
        />
      </div>

      <!-- Category chips -->
      <div class="flex gap-1.5 overflow-x-auto pb-1">
        <button
          v-for="cat in categories"
          :key="cat.value"
          @click="filterCategory = cat.value"
          :class="[
            'px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors',
            filterCategory === cat.value
              ? 'bg-summit-700 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          ]"
        >
          {{ cat.label }}
        </button>
      </div>

      <!-- Advanced filters (collapsible) -->
      <div class="grid grid-cols-3 gap-2 mt-2">
        <select v-model="filterPattern" class="input text-xs py-1.5">
          <option v-for="p in patterns" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
        <select v-model="filterEquipment" class="input text-xs py-1.5">
          <option value="">All equipment</option>
          <option v-for="eq in equipmentOptions" :key="eq" :value="eq">{{ eq }}</option>
        </select>
        <select v-model="filterMuscle" class="input text-xs py-1.5">
          <option value="">All muscles</option>
          <option v-for="mg in muscleGroupOptions" :key="mg" :value="mg">{{ mg }}</option>
        </select>
      </div>

      <!-- Active filters indicator -->
      <div v-if="hasActiveFilters" class="flex items-center justify-between mt-2">
        <span class="text-xs text-gray-500">{{ totalCount }} result{{ totalCount !== 1 ? 's' : '' }}</span>
        <button @click="clearFilters" class="text-xs text-summit-600 font-semibold hover:text-summit-700">
          Clear filters
        </button>
      </div>
    </div>

    <!-- Exercise list -->
    <div class="flex-1 overflow-y-auto p-4 space-y-2.5">
      <!-- Loading -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 6" :key="i" class="animate-pulse bg-gray-100 rounded-xl h-20"></div>
      </div>

      <!-- Empty state -->
      <div v-else-if="exercises.length === 0" class="text-center py-8">
        <p class="text-sm text-gray-400">No exercises found</p>
        <button
          v-if="hasActiveFilters"
          @click="clearFilters"
          class="mt-2 text-sm text-summit-600 font-semibold"
        >
          Clear filters
        </button>
      </div>

      <!-- Exercise cards -->
      <template v-else>
        <ExerciseCard
          v-for="exercise in exercises"
          :key="exercise.id"
          :exercise="exercise"
          :selectable="selectable"
          :selected="isSelected(exercise.id)"
          @select="emit('select', $event)"
        />

        <!-- Load more -->
        <div v-if="hasMore" class="text-center pt-2">
          <button
            @click="loadMore"
            :disabled="loadingMore"
            class="text-sm text-summit-600 font-semibold hover:text-summit-700"
          >
            {{ loadingMore ? 'Loading...' : `Load more (${exercises.length}/${totalCount})` }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
