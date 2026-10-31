<script setup lang="ts">
import { computed } from 'vue'
import { SHAPES, type DeloadCadence, type ShapeSlug } from '@/services/programEngine'

const props = defineProps<{
  weeks: number
  shape: ShapeSlug
  deload: DeloadCadence
}>()

const emit = defineEmits<{
  (e: 'update:weeks', v: number): void
  (e: 'update:shape', v: ShapeSlug): void
  (e: 'update:deload', v: DeloadCadence): void
}>()

const DELOAD_LABEL: Record<DeloadCadence, string> = {
  none: 'None', every_3: 'Every 3rd', every_4: 'Every 4th', final: 'Final week',
}

// 4–8 covers almost every block; keep an existing length outside that range selectable.
const weekOptions = computed(() => [...new Set([4, 5, 6, 7, 8, props.weeks])].sort((a, b) => a - b))
const shapes = Object.entries(SHAPES) as [ShapeSlug, (typeof SHAPES)[ShapeSlug]][]

const pill = 'px-3 py-1.5 rounded-full border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2'
const pillOn = 'bg-summit-800 border-summit-800 text-white'
const pillOff = 'bg-white border-gray-200 text-gray-700 hover:border-summit-300'
</script>

<template>
  <section class="bg-white rounded-2xl border border-gray-200 p-4">
    <div class="flex items-baseline gap-2.5 mb-2.5">
      <span class="font-display font-bold text-summit-800">1</span>
      <h3 class="font-display font-semibold text-gray-900">How long?</h3>
    </div>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="n in weekOptions"
        :key="n"
        type="button"
        :aria-pressed="n === weeks"
        :class="[pill, n === weeks ? pillOn : pillOff]"
        @click="emit('update:weeks', n)"
      >
        {{ n }} wks
      </button>
    </div>

    <div class="flex items-baseline gap-2.5 mt-5 mb-2.5">
      <span class="font-display font-bold text-summit-800">2</span>
      <h3 class="font-display font-semibold text-gray-900">Which direction?</h3>
    </div>
    <div class="grid gap-1.5">
      <button
        v-for="[slug, def] in shapes"
        :key="slug"
        type="button"
        :aria-pressed="slug === shape"
        :class="[
          'text-left rounded-xl border px-3 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2',
          slug === shape
            ? 'border-summit-800 bg-summit-50 shadow-[inset_3px_0_0_theme(colors.summit.800)]'
            : 'border-gray-200 bg-white hover:border-summit-300',
        ]"
        @click="emit('update:shape', slug)"
      >
        <strong class="block font-display font-semibold text-gray-900">{{ def.name }}</strong>
        <span class="text-sm text-gray-500">{{ def.coachLine }}</span>
      </button>
    </div>

    <h3 class="font-semibold text-gray-900 mt-5 mb-2">Recovery week</h3>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="(label, key) in DELOAD_LABEL"
        :key="key"
        type="button"
        :aria-pressed="key === deload"
        :class="[pill, key === deload ? pillOn : pillOff]"
        @click="emit('update:deload', key)"
      >
        {{ label }}
      </button>
    </div>
  </section>
</template>
