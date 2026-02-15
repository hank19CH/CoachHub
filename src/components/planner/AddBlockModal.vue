<script setup lang="ts">
import { ref } from 'vue'
import { usePlansStore } from '@/stores/plans'
import { plansService } from '@/services/plans'
import type { Database } from '@/types/database'

type TrainingBlockInsert = Database['public']['Tables']['training_blocks']['Insert']

const plansStore = usePlansStore()

const emit = defineEmits<{
  (e: 'created'): void
  (e: 'close'): void
}>()

const saving = ref(false)
const errorMessage = ref('')

const form = ref({
  name: '',
  block_type: '',
  duration_weeks: 4,
  focus_tags: '',
  volume_target: '',
  intensity_target: '',
})

const blockTypePresets = [
  { value: 'general_prep', label: 'General Prep', icon: '🏗️', weeks: 4 },
  { value: 'specific_prep', label: 'Specific Prep', icon: '🎯', weeks: 4 },
  { value: 'accumulation', label: 'Accumulation', icon: '📈', weeks: 3 },
  { value: 'max_strength', label: 'Max Strength', icon: '💪', weeks: 4 },
  { value: 'hypertrophy', label: 'Hypertrophy', icon: '🦵', weeks: 4 },
  { value: 'speed', label: 'Speed', icon: '⚡', weeks: 3 },
  { value: 'power', label: 'Power', icon: '🔥', weeks: 3 },
  { value: 'pre_competition', label: 'Pre-Competition', icon: '🏆', weeks: 3 },
  { value: 'competition', label: 'Competition', icon: '🥇', weeks: 2 },
  { value: 'taper', label: 'Taper', icon: '📉', weeks: 2 },
  { value: 'deload', label: 'Deload', icon: '🧘', weeks: 1 },
  { value: 'transition', label: 'Transition', icon: '🔄', weeks: 2 },
]

function selectPreset(preset: typeof blockTypePresets[0]) {
  form.value.block_type = preset.value
  form.value.duration_weeks = preset.weeks
  if (!form.value.name) {
    form.value.name = preset.label
  }
}

async function handleSubmit() {
  if (!plansStore.activePlan || !form.value.name.trim()) return
  saving.value = true
  errorMessage.value = ''

  try {
    const existingBlocks = plansStore.activePlan.training_blocks || []
    const nextOrder = existingBlocks.length > 0
      ? Math.max(...existingBlocks.map(b => b.order_index)) + 1
      : 0

    const blockInsert: TrainingBlockInsert = {
      plan_id: plansStore.activePlan.id,
      name: form.value.name.trim(),
      block_type: form.value.block_type || null,
      duration_weeks: form.value.duration_weeks,
      order_index: nextOrder,
      focus_tags: form.value.focus_tags ? form.value.focus_tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      volume_target: (form.value.volume_target as any) || null,
      intensity_target: (form.value.intensity_target as any) || null,
      ai_generated: false,
    }

    await plansService.createBlock(blockInsert)
    emit('created')
  } catch (e: any) {
    console.error('Error creating block:', e)
    errorMessage.value = e?.message || 'Failed to create block. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Add Training Block</h3>

        <!-- Quick presets -->
        <div class="mb-4">
          <label class="label mb-2">Quick Select Type</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="preset in blockTypePresets"
              :key="preset.value"
              type="button"
              @click="selectPreset(preset)"
              :class="[
                'p-2 rounded-lg border text-center transition-all text-xs',
                form.block_type === preset.value
                  ? 'border-summit-600 bg-summit-50 ring-1 ring-summit-600'
                  : 'border-gray-200 hover:border-gray-300'
              ]"
            >
              <div class="text-base mb-0.5">{{ preset.icon }}</div>
              <div class="font-semibold text-gray-700">{{ preset.label }}</div>
            </button>
          </div>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Block name -->
          <div>
            <label class="label">Block Name *</label>
            <input
              v-model="form.name"
              type="text"
              class="input"
              placeholder="e.g., Accumulation Block 1"
              required
            />
          </div>

          <!-- Duration -->
          <div>
            <label class="label">Duration (weeks)</label>
            <input
              v-model.number="form.duration_weeks"
              type="number"
              class="input"
              min="1"
              max="12"
            />
          </div>

          <!-- Volume / Intensity targets -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Volume Target</label>
              <select v-model="form.volume_target" class="input">
                <option value="">—</option>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label class="label">Intensity Target</label>
              <select v-model="form.intensity_target" class="input">
                <option value="">—</option>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="peak">Peak</option>
              </select>
            </div>
          </div>

          <!-- Focus tags -->
          <div>
            <label class="label">Focus Tags (comma separated)</label>
            <input
              v-model="form.focus_tags"
              type="text"
              class="input"
              placeholder="e.g., posterior_chain, acceleration"
            />
          </div>

          <!-- Error message -->
          <div v-if="errorMessage" class="p-3 rounded-lg bg-red-50 border border-red-200">
            <p class="text-sm text-red-700">{{ errorMessage }}</p>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <button type="button" @click="emit('close')" class="flex-1 btn-secondary" :disabled="saving">
              Cancel
            </button>
            <button type="submit" class="flex-1 btn-primary" :disabled="saving || !form.name.trim()">
              <span v-if="saving" class="flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Adding...
              </span>
              <span v-else>Add Block</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
