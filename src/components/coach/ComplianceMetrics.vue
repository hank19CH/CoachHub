<script setup lang="ts">
defineProps<{
  stats: {
    totalCompletions: number
    totalPBs: number
    avgDuration: number
  }
}>()
</script>

<template>
  <div class="grid grid-cols-3 gap-3">
    <div class="card p-4 flex items-center gap-3">
      <span class="text-2xl">✅</span>
      <div>
        <p class="text-xl font-bold text-gray-900">{{ stats.totalCompletions }}</p>
        <p class="text-xs text-gray-600">Completed</p>
      </div>
    </div>

    <div class="card p-4 flex items-center gap-3">
      <span class="text-2xl">🏆</span>
      <div>
        <p class="text-xl font-bold text-gray-900">{{ stats.totalPBs }}</p>
        <p class="text-xs text-gray-600">Personal Bests</p>
      </div>
    </div>

    <div class="card p-4 flex items-center gap-3">
      <span class="text-2xl">⏱️</span>
      <div>
        <p class="text-xl font-bold text-gray-900">{{ stats.avgDuration }}<span class="text-sm font-normal">m</span></p>
        <p class="text-xs text-gray-600">Avg Duration</p>
      </div>
    </div>
  </div>
</template>
