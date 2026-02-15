<script setup lang="ts">
import { computed } from 'vue'
import { usePlansStore } from '@/stores/plans'

const plansStore = usePlansStore()

const weekInfo = computed(() => {
  const week = plansStore.selectedWeek
  if (!week) return null

  // Find block name
  const allWeeks = plansStore.allWeeks
  const enriched = allWeeks.find(w => w.id === week.id)

  return {
    name: week.name || `Week ${week.week_number}`,
    blockName: enriched?.block_name || '',
    blockType: enriched?.block_type || '',
    isDeload: week.is_deload,
    volumeModifier: week.volume_modifier,
    intensityModifier: week.intensity_modifier,
    weekIndex: plansStore.currentWeekIndex,
    totalWeeks: allWeeks.length,
  }
})

function getVolumeLabel(modifier: number | null): string {
  if (!modifier) return ''
  if (modifier >= 1.1) return '↑ Volume'
  if (modifier <= 0.7) return '↓↓ Volume'
  if (modifier <= 0.9) return '↓ Volume'
  return ''
}

function getIntensityLabel(modifier: number | null): string {
  if (!modifier) return ''
  if (modifier >= 1.1) return '↑ Intensity'
  if (modifier <= 0.7) return '↓↓ Intensity'
  if (modifier <= 0.9) return '↓ Intensity'
  return ''
}
</script>

<template>
  <div v-if="weekInfo" class="flex items-center justify-between mb-4">
    <div>
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-bold text-gray-900">{{ weekInfo.name }}</h2>
        <span v-if="weekInfo.isDeload" class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-600">
          Deload
        </span>
      </div>
      <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
        <span>{{ weekInfo.blockName }}</span>
        <span v-if="getVolumeLabel(weekInfo.volumeModifier)" class="text-blue-500">{{ getVolumeLabel(weekInfo.volumeModifier) }}</span>
        <span v-if="getIntensityLabel(weekInfo.intensityModifier)" class="text-orange-500">{{ getIntensityLabel(weekInfo.intensityModifier) }}</span>
        <span class="text-gray-400">{{ weekInfo.weekIndex + 1 }}/{{ weekInfo.totalWeeks }}</span>
      </div>
    </div>

    <div class="flex gap-1.5">
      <button
        @click="plansStore.previousWeek()"
        :disabled="!plansStore.hasPreviousWeek"
        :class="[
          'w-8 h-8 rounded-lg border flex items-center justify-center transition-colors',
          plansStore.hasPreviousWeek
            ? 'border-gray-300 text-gray-600 hover:border-summit-600 hover:text-summit-600'
            : 'border-gray-200 text-gray-300 cursor-not-allowed'
        ]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        @click="plansStore.nextWeek()"
        :disabled="!plansStore.hasNextWeek"
        :class="[
          'w-8 h-8 rounded-lg border flex items-center justify-center transition-colors',
          plansStore.hasNextWeek
            ? 'border-gray-300 text-gray-600 hover:border-summit-600 hover:text-summit-600'
            : 'border-gray-200 text-gray-300 cursor-not-allowed'
        ]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>

  <div v-else class="text-center py-6 text-sm text-gray-400">
    Select a week to view
  </div>
</template>
