<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { usePlansStore } from '@/stores/plans'
import { plansService } from '@/services/plans'
import type { Database } from '@/types/database'

type TrainingBlock = Database['public']['Tables']['training_blocks']['Row']

const plansStore = usePlansStore()

const emit = defineEmits<{
  (e: 'updated'): void
  (e: 'deleted'): void
}>()

const editing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const errorMessage = ref('')

const form = ref({
  name: '',
  block_type: '',
  focus_tags: '',
  volume_target: '',
  intensity_target: '',
  duration_weeks: 0,
})

const block = computed(() => plansStore.selectedBlock)

watch(block, (newBlock) => {
  if (newBlock) {
    form.value = {
      name: newBlock.name,
      block_type: newBlock.block_type || '',
      focus_tags: (newBlock.focus_tags || []).join(', '),
      volume_target: newBlock.volume_target || '',
      intensity_target: newBlock.intensity_target || '',
      duration_weeks: newBlock.duration_weeks || 0,
    }
    editing.value = false
  }
}, { immediate: true })

async function handleSave() {
  if (!block.value) return
  saving.value = true
  errorMessage.value = ''

  try {
    await plansService.updateBlock(block.value.id, {
      name: form.value.name.trim(),
      block_type: form.value.block_type || null,
      focus_tags: form.value.focus_tags ? form.value.focus_tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      volume_target: (form.value.volume_target as any) || null,
      intensity_target: (form.value.intensity_target as any) || null,
    })
    editing.value = false
    emit('updated')
  } catch (e: any) {
    console.error('Error updating block:', e)
    errorMessage.value = e?.message || 'Failed to update block. Please try again.'
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!block.value) return
  deleting.value = true

  try {
    await plansService.deleteBlock(block.value.id)
    showDeleteConfirm.value = false
    emit('deleted')
  } catch (e) {
    console.error('Error deleting block:', e)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="block" class="p-4">
    <!-- Block header -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-base font-bold text-gray-900">{{ block.name }}</h3>
      <div class="flex gap-1">
        <button
          v-if="!editing"
          @click="editing = true"
          class="p-1.5 text-gray-400 hover:text-summit-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          @click="showDeleteConfirm = true"
          class="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Edit form -->
    <div v-if="editing" class="space-y-3">
      <div>
        <label class="label">Name</label>
        <input v-model="form.name" type="text" class="input" />
      </div>
      <div>
        <label class="label">Block Type</label>
        <select v-model="form.block_type" class="input">
          <option value="">Custom</option>
          <option value="general_prep">General Prep</option>
          <option value="specific_prep">Specific Prep</option>
          <option value="accumulation">Accumulation</option>
          <option value="max_strength">Max Strength</option>
          <option value="hypertrophy">Hypertrophy</option>
          <option value="speed">Speed</option>
          <option value="power">Power</option>
          <option value="pre_competition">Pre-Competition</option>
          <option value="competition">Competition</option>
          <option value="taper">Taper</option>
          <option value="deload">Deload</option>
          <option value="transition">Transition</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label">Volume</label>
          <select v-model="form.volume_target" class="input">
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label class="label">Intensity</label>
          <select v-model="form.intensity_target" class="input">
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
            <option value="peak">Peak</option>
          </select>
        </div>
      </div>
      <div>
        <label class="label">Focus Tags</label>
        <input v-model="form.focus_tags" type="text" class="input" placeholder="comma separated" />
      </div>
      <div v-if="errorMessage" class="p-2.5 rounded-lg bg-red-50 border border-red-200">
        <p class="text-xs text-red-700">{{ errorMessage }}</p>
      </div>
      <div class="flex gap-2">
        <button @click="editing = false" class="flex-1 btn-secondary text-sm" :disabled="saving">Cancel</button>
        <button @click="handleSave" class="flex-1 btn-primary text-sm" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <!-- Read-only view -->
    <div v-else class="space-y-3">
      <div v-if="block.block_type" class="flex items-center gap-2">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type:</span>
        <span class="text-sm text-gray-900">{{ block.block_type.replace(/_/g, ' ') }}</span>
      </div>
      <div v-if="block.duration_weeks" class="flex items-center gap-2">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration:</span>
        <span class="text-sm text-gray-900">{{ block.duration_weeks }} weeks</span>
      </div>
      <div v-if="block.volume_target || block.intensity_target" class="flex gap-3">
        <div v-if="block.volume_target">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Volume:</span>
          <span class="text-sm text-gray-900 ml-1">{{ block.volume_target }}</span>
        </div>
        <div v-if="block.intensity_target">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Intensity:</span>
          <span class="text-sm text-gray-900 ml-1">{{ block.intensity_target }}</span>
        </div>
      </div>
      <div v-if="block.focus_tags && block.focus_tags.length > 0" class="flex flex-wrap gap-1">
        <span
          v-for="tag in block.focus_tags"
          :key="tag"
          class="text-xs px-2 py-0.5 rounded-full bg-summit-100 text-summit-700"
        >
          {{ tag }}
        </span>
      </div>

      <!-- Weeks list -->
      <div class="mt-4 border-t border-gray-100 pt-3">
        <h4 class="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Weeks</h4>
        <div class="space-y-1.5">
          <button
            v-for="week in block.block_weeks"
            :key="week.id"
            @click="plansStore.selectWeek(week.id)"
            :class="[
              'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
              plansStore.selectedWeekId === week.id
                ? 'bg-summit-100 text-summit-800 font-semibold'
                : 'hover:bg-gray-50 text-gray-700'
            ]"
          >
            <div class="flex items-center justify-between">
              <span>{{ week.name || `Week ${week.week_number}` }}</span>
              <span v-if="week.is_deload" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-semibold">
                Deload
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="p-6 text-center text-sm text-gray-400">
    Select a block to see details
  </div>

  <!-- Delete confirmation -->
  <Teleport to="body">
    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      @click.self="showDeleteConfirm = false"
    >
      <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Delete Block?</h3>
        <p class="text-sm text-gray-600 mb-6">
          Are you sure you want to delete "{{ block?.name }}"? All weeks within this block will also be removed.
        </p>
        <div class="flex gap-3">
          <button @click="showDeleteConfirm = false" class="flex-1 btn-secondary" :disabled="deleting">Cancel</button>
          <button @click="handleDelete" class="flex-1 btn bg-red-600 text-white hover:bg-red-700 focus:ring-red-500" :disabled="deleting">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
