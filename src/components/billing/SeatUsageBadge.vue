<script setup lang="ts">
import type { SeatInfo } from '@/services/billing'

const props = defineProps<{
  seatInfo: SeatInfo
}>()

const colorClass = props.seatInfo.isUnlimited
  ? 'bg-emerald-100 text-emerald-700'
  : props.seatInfo.utilizationPercent >= 100
    ? 'bg-red-100 text-red-700'
    : props.seatInfo.utilizationPercent >= 80
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-gray-100 text-gray-600'
</script>

<template>
  <span :class="colorClass" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium">
    <template v-if="seatInfo.isUnlimited">Unlimited</template>
    <template v-else>{{ seatInfo.current }}/{{ seatInfo.effectiveLimit }}</template>
  </span>
</template>
