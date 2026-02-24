<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ExerciseSlot, ExerciseWeekEntry } from '@/types/progression'
import { loadBlockProgressionMatrix, saveWeekEntry, formatPrescription } from '@/services/progressionEngine'
import CellEditPopover from './CellEditPopover.vue'

const props = defineProps<{
  blockId: string
  durationWeeks: number
  deloadWeek: number | null
}>()

const emit = defineEmits<{
  (e: 'updated', slots: ExerciseSlot[]): void
}>()

const loading = ref(true)
const saving = ref(false)
const slots = ref<ExerciseSlot[]>([])

// Cell editing state
const editingCell = ref<{ exerciseIndex: number; weekNumber: number } | null>(null)

const weekNumbers = computed(() =>
  Array.from({ length: props.durationWeeks }, (_, i) => i + 1)
)

async function loadMatrix() {
  loading.value = true
  try {
    slots.value = await loadBlockProgressionMatrix(props.blockId)
    emit('updated', slots.value)
  } catch (e) {
    console.error('Failed to load progression matrix:', e)
  } finally {
    loading.value = false
  }
}

watch(() => props.blockId, loadMatrix)
onMounted(loadMatrix)

function getWeekEntry(slot: ExerciseSlot, weekNumber: number): ExerciseWeekEntry {
  return slot.weeks.find(w => w.week === weekNumber) ?? {
    week: weekNumber,
    sets: '',
    reps: '',
    variation_name: null,
  }
}

function getCellText(slot: ExerciseSlot, weekNumber: number): string {
  const entry = getWeekEntry(slot, weekNumber)
  return formatPrescription(entry)
}

function openEditor(exerciseIndex: number, weekNumber: number) {
  editingCell.value = { exerciseIndex, weekNumber }
}

function closeEditor() {
  editingCell.value = null
}

async function handleCellSave(data: Partial<ExerciseWeekEntry>) {
  if (!editingCell.value) return
  const { exerciseIndex, weekNumber } = editingCell.value
  saving.value = true

  try {
    await saveWeekEntry(props.blockId, exerciseIndex, weekNumber, data)
    // Reload to reflect saved data
    await loadMatrix()
    closeEditor()
  } catch (e) {
    console.error('Failed to save cell:', e)
  } finally {
    saving.value = false
  }
}

function isDeloadWeek(weekNumber: number): boolean {
  return props.deloadWeek === weekNumber
}
</script>

<template>
  <div class="overflow-x-auto">
    <!-- Loading state -->
    <div v-if="loading" class="py-8 text-center text-sm text-gray-400">
      Loading progression data...
    </div>

    <!-- Empty state -->
    <div v-else-if="slots.length === 0" class="py-8 text-center">
      <p class="text-sm text-gray-400">No exercises found for this block.</p>
      <p class="text-xs text-gray-300 mt-1">Import or create sessions in Week 1 to build the progression matrix.</p>
    </div>

    <!-- Matrix grid -->
    <table v-else class="w-full text-xs border-collapse min-w-[500px]">
      <thead>
        <tr class="border-b border-gray-200">
          <th class="text-left py-2 px-3 font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-white z-10 min-w-[140px]">
            Exercise
          </th>
          <th
            v-for="week in weekNumbers"
            :key="week"
            class="text-center py-2 px-2 font-semibold uppercase tracking-wide min-w-[90px]"
            :class="[
              isDeloadWeek(week)
                ? 'text-summit-400 bg-summit-50/50'
                : 'text-gray-500'
            ]"
          >
            <div class="flex items-center justify-center gap-1">
              <span>W{{ week }}</span>
              <span v-if="isDeloadWeek(week)" class="text-[9px] px-1 py-0.5 rounded bg-summit-100 text-summit-600 font-bold">DL</span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(slot, slotIdx) in slots"
          :key="slotIdx"
          class="border-b border-gray-100 hover:bg-gray-50/50"
        >
          <!-- Exercise name (row header) -->
          <td class="py-2 px-3 sticky left-0 bg-white z-10">
            <div class="font-medium text-gray-900 truncate">{{ slot.canonical_name }}</div>
            <div
              v-if="slot.has_variation && slot.variation_summary"
              class="text-[10px] text-summit-500 mt-0.5 truncate"
            >
              {{ slot.variation_summary }}
            </div>
          </td>

          <!-- Week cells -->
          <td
            v-for="week in weekNumbers"
            :key="week"
            class="py-1.5 px-1 text-center relative"
            :class="[
              isDeloadWeek(week)
                ? 'bg-summit-50/30 border-l border-dashed border-summit-200'
                : ''
            ]"
          >
            <button
              @click="openEditor(slotIdx, week)"
              class="w-full px-1.5 py-1.5 rounded-md transition-colors text-center hover:bg-summit-50 min-h-[36px]"
              :class="[
                editingCell?.exerciseIndex === slotIdx && editingCell?.weekNumber === week
                  ? 'bg-summit-100 ring-1 ring-summit-500'
                  : ''
              ]"
            >
              <span
                class="block text-[11px] leading-tight"
                :class="[isDeloadWeek(week) ? 'italic text-gray-400' : 'text-gray-700']"
              >
                {{ getCellText(slot, week) }}
              </span>
              <!-- Variation badge -->
              <span
                v-if="getWeekEntry(slot, week).variation_name"
                class="block text-[9px] text-summit-400 italic mt-0.5 truncate"
              >
                {{ getWeekEntry(slot, week).variation_name }}
              </span>
            </button>

            <!-- Popover -->
            <CellEditPopover
              v-if="editingCell?.exerciseIndex === slotIdx && editingCell?.weekNumber === week"
              :entry="getWeekEntry(slot, week)"
              :exercise-name="slot.canonical_name"
              :week-number="week"
              @save="handleCellSave"
              @close="closeEditor"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Saving indicator -->
    <div v-if="saving" class="text-xs text-summit-600 text-center py-1">
      Saving...
    </div>
  </div>
</template>
