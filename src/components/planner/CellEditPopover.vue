<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ExerciseWeekEntry } from '@/types/progression'

const props = defineProps<{
  entry: ExerciseWeekEntry
  exerciseName: string
  weekNumber: number
}>()

const emit = defineEmits<{
  (e: 'save', data: Partial<ExerciseWeekEntry>): void
  (e: 'close'): void
}>()

const form = ref({
  sets: '',
  reps: '',
  intensity_percent: null as number | null,
  rpe: null as number | null,
  rest_seconds: null as number | null,
  notes: '',
  variation_name: '',
})

const setsInput = ref<HTMLInputElement | null>(null)

watch(() => props.entry, (e) => {
  form.value = {
    sets: e.sets || '',
    reps: e.reps || '',
    intensity_percent: e.intensity_percent ?? null,
    rpe: e.rpe ?? null,
    rest_seconds: e.rest_seconds ?? null,
    notes: e.notes || '',
    variation_name: e.variation_name || '',
  }
  nextTick(() => setsInput.value?.focus())
}, { immediate: true })

function handleSave() {
  emit('save', {
    sets: form.value.sets,
    reps: form.value.reps,
    intensity_percent: form.value.intensity_percent,
    rpe: form.value.rpe,
    rest_seconds: form.value.rest_seconds,
    notes: form.value.notes || undefined,
    variation_name: form.value.variation_name || null,
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    handleSave()
  } else if (e.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <div
    class="absolute z-30 bg-white rounded-xl shadow-elevated border border-gray-200 p-3 w-64"
    @keydown="handleKeydown"
  >
    <div class="text-xs font-semibold text-gray-500 mb-2 truncate">
      {{ exerciseName }} — Week {{ weekNumber }}
    </div>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <div>
        <label class="text-[10px] font-medium text-gray-400 uppercase">Sets</label>
        <input
          ref="setsInput"
          v-model="form.sets"
          type="text"
          placeholder="4"
          class="w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
        />
      </div>
      <div>
        <label class="text-[10px] font-medium text-gray-400 uppercase">Reps</label>
        <input
          v-model="form.reps"
          type="text"
          placeholder="6"
          class="w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-2">
      <div>
        <label class="text-[10px] font-medium text-gray-400 uppercase">%1RM</label>
        <input
          v-model.number="form.intensity_percent"
          type="number"
          step="0.5"
          min="0"
          max="110"
          placeholder="70"
          class="w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
        />
      </div>
      <div>
        <label class="text-[10px] font-medium text-gray-400 uppercase">RPE</label>
        <input
          v-model.number="form.rpe"
          type="number"
          step="0.5"
          min="1"
          max="10"
          placeholder="8"
          class="w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
        />
      </div>
    </div>

    <div class="mb-2">
      <label class="text-[10px] font-medium text-gray-400 uppercase">Rest (sec)</label>
      <input
        v-model.number="form.rest_seconds"
        type="number"
        step="15"
        min="0"
        placeholder="180"
        class="w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
      />
    </div>

    <div class="mb-2">
      <label class="text-[10px] font-medium text-gray-400 uppercase">Variation name this week</label>
      <input
        v-model="form.variation_name"
        type="text"
        placeholder="Leave blank for canonical"
        class="w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
      />
    </div>

    <div class="mb-2">
      <label class="text-[10px] font-medium text-gray-400 uppercase">Notes</label>
      <input
        v-model="form.notes"
        type="text"
        placeholder="Optional"
        class="w-full text-sm px-2 py-1.5 rounded-md border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
      />
    </div>

    <div class="flex gap-2">
      <button
        @click="$emit('close')"
        class="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        @click="handleSave"
        class="flex-1 text-xs py-1.5 rounded-lg bg-summit-800 text-white hover:bg-summit-700"
      >
        Save
      </button>
    </div>
  </div>
</template>
