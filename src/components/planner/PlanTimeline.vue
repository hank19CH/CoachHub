<script setup lang="ts">
import { computed } from 'vue'
import { usePlansStore } from '@/stores/plans'
import type { Database } from '@/types/database'

type TrainingBlock = Database['public']['Tables']['training_blocks']['Row']

const plansStore = usePlansStore()

const emit = defineEmits<{
  (e: 'add-block'): void
  (e: 'edit-block', block: TrainingBlock): void
}>()

const blocks = computed(() => plansStore.activePlan?.training_blocks ?? [])

function getBlockTypeTag(blockType: string | null) {
  const tags: Record<string, { label: string; classes: string }> = {
    general_prep: { label: 'Gen Prep', classes: 'bg-blue-100 text-blue-700' },
    specific_prep: { label: 'Specific', classes: 'bg-amber-100 text-amber-800' },
    max_strength: { label: 'Max Str', classes: 'bg-purple-100 text-purple-700' },
    hypertrophy: { label: 'Hypertrophy', classes: 'bg-violet-100 text-violet-700' },
    speed: { label: 'Speed', classes: 'bg-orange-100 text-orange-700' },
    power: { label: 'Power', classes: 'bg-red-100 text-red-700' },
    competition: { label: 'Competition', classes: 'bg-rose-100 text-rose-700' },
    pre_competition: { label: 'Pre-Comp', classes: 'bg-rose-100 text-rose-700' },
    taper: { label: 'Taper', classes: 'bg-emerald-100 text-emerald-700' },
    deload: { label: 'Deload', classes: 'bg-indigo-100 text-indigo-700' },
    transition: { label: 'Transition', classes: 'bg-gray-100 text-gray-600' },
    endurance: { label: 'Endurance', classes: 'bg-teal-100 text-teal-700' },
    accumulation: { label: 'Accum', classes: 'bg-blue-100 text-blue-700' },
    transmutation: { label: 'Trans', classes: 'bg-amber-100 text-amber-800' },
    realization: { label: 'Realize', classes: 'bg-red-100 text-red-700' },
  }
  return tags[blockType || ''] || { label: blockType || 'Block', classes: 'bg-gray-100 text-gray-600' }
}

function getBarColor(blockType: string | null) {
  const colors: Record<string, string> = {
    general_prep: 'bg-blue-500',
    specific_prep: 'bg-amber-500',
    max_strength: 'bg-purple-500',
    hypertrophy: 'bg-violet-500',
    speed: 'bg-orange-500',
    power: 'bg-red-500',
    competition: 'bg-rose-500',
    pre_competition: 'bg-rose-500',
    taper: 'bg-emerald-500',
    deload: 'bg-indigo-400',
    transition: 'bg-gray-400',
    endurance: 'bg-teal-500',
    accumulation: 'bg-blue-500',
    transmutation: 'bg-amber-500',
    realization: 'bg-red-500',
  }
  return colors[blockType || ''] || 'bg-gray-400'
}

function getBlockProgress(block: any): number {
  // Calculate progress based on weeks — placeholder
  if (!block.block_weeks || block.block_weeks.length === 0) return 0
  // For now show a basic progress indicator
  return 0
}

function formatWeekRange(block: any): string {
  if (!block.block_weeks || block.block_weeks.length === 0) {
    return `${block.duration_weeks || 0} weeks`
  }
  return `${block.block_weeks.length} weeks`
}
</script>

<template>
  <div class="bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
    <!-- Header -->
    <div class="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
      <h3 class="text-xs font-bold uppercase tracking-wider text-gray-500">Plan Timeline</h3>
      <button
        @click="emit('add-block')"
        class="w-7 h-7 rounded-md border border-gray-300 flex items-center justify-center text-gray-500 hover:border-summit-600 hover:text-summit-600 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <!-- Active Plan Info -->
    <div v-if="plansStore.activePlan" class="p-4 border-b border-gray-100 flex-shrink-0">
      <div class="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Active Plan</div>
      <div class="text-sm font-bold text-gray-900">{{ plansStore.activePlan.name }}</div>
      <div class="text-xs text-gray-500 mt-1">
        {{ plansStore.activePlan.periodization_model || 'Custom' }} · {{ blocks.length }} blocks
      </div>
      <div v-if="plansStore.activePlan.plan_athletes.length > 0" class="flex items-center gap-1 mt-2">
        <div
          v-for="(pa, i) in plansStore.activePlan.plan_athletes.slice(0, 3)"
          :key="pa.id"
          class="w-6 h-6 rounded-full bg-summit-200 flex items-center justify-center text-summit-800 text-[10px] font-bold border-2 border-white"
          :style="{ marginLeft: i > 0 ? '-4px' : '0' }"
        >
          {{ pa.athlete?.display_name?.charAt(0)?.toUpperCase() || '?' }}
        </div>
        <span v-if="plansStore.activePlan.plan_athletes.length > 3" class="text-xs text-gray-400 ml-1">
          +{{ plansStore.activePlan.plan_athletes.length - 3 }}
        </span>
      </div>
    </div>

    <!-- Blocks list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="blocks.length === 0" class="p-6 text-center">
        <p class="text-sm text-gray-400">No training blocks yet</p>
        <button
          @click="emit('add-block')"
          class="mt-3 text-sm text-summit-600 font-semibold hover:text-summit-700"
        >
          + Add Block
        </button>
      </div>

      <div
        v-for="block in blocks"
        :key="block.id"
        @click="plansStore.selectBlock(block.id)"
        class="p-4 border-b border-gray-100 cursor-pointer transition-all hover:bg-gray-50"
        :class="plansStore.selectedBlockId === block.id ? 'bg-summit-50/50 border-l-3 border-l-summit-700 pl-3.5' : ''"
      >
        <span :class="['text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded inline-block mb-1.5', getBlockTypeTag(block.block_type).classes]">
          {{ getBlockTypeTag(block.block_type).label }}
        </span>
        <div class="text-sm font-semibold text-gray-900">{{ block.name }}</div>
        <div class="text-xs text-gray-400 mt-0.5">{{ formatWeekRange(block) }}</div>

        <!-- Progress bar -->
        <div class="h-1 rounded-full bg-gray-100 mt-2 overflow-hidden">
          <div
            :class="['h-full rounded-full transition-all', getBarColor(block.block_type)]"
            :style="{ width: getBlockProgress(block) + '%' }"
          ></div>
        </div>

        <!-- Volume/intensity targets -->
        <div v-if="block.volume_target || block.intensity_target" class="flex gap-2 mt-2">
          <span v-if="block.volume_target" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">
            Vol: {{ block.volume_target }}
          </span>
          <span v-if="block.intensity_target" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">
            Int: {{ block.intensity_target }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
