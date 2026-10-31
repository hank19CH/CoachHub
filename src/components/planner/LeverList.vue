<script setup lang="ts">
import { computed, ref } from 'vue'
import { defaultLever, formatPrescription, type GeneratedWeek, type Lever, type Session } from '@/services/programEngine'

const props = defineProps<{
  canonical: Session[]
  lastWeek: GeneratedWeek | undefined
}>()

const emit = defineEmits<{
  (e: 'change', sessionIndex: number, exerciseIndex: number, lever: Lever): void
}>()

const LEVER_LABEL: Record<Lever, string> = {
  hold: 'Nothing', load: 'Load', volume: 'Volume', reps: 'Reps', distance: 'Distance', ladder: 'Custom ladder',
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const showHold = ref(false)

const groups = computed(() => {
  let hidden = 0
  const out = props.canonical.map((s, si) => {
    const rows = s.exercises.flatMap((ex, ei) => {
      if (ex.is_section_header) return []
      const lever = ex.progression?.lever ?? defaultLever(ex)
      if (lever === 'hold' && !showHold.value) { hidden++; return [] }
      const end = props.lastWeek?.sessions[si]?.exercises[ei]
      return [{
        ei, name: ex.name, lever,
        from: formatPrescription(ex),
        to: end ? formatPrescription(end) : '',
        options: (['hold', 'load', 'volume', 'reps', 'distance'] as Lever[]).concat(ex.progression?.ladder ? ['ladder'] : []),
      }]
    })
    return { si, title: `${DAYS[s.day_of_week] ?? ''} — ${s.session_name}`, rows }
  }).filter(g => g.rows.length)
  return { list: out, hidden }
})
</script>

<template>
  <section class="bg-white rounded-2xl border border-gray-200 p-4">
    <div class="flex items-baseline gap-2.5">
      <span class="font-display font-bold text-summit-800">3</span>
      <h3 class="font-display font-semibold text-gray-900">What progresses?</h3>
    </div>
    <p class="text-sm text-gray-500 mt-1 mb-2">Defaults are set from each exercise. Change one only if it's wrong.</p>

    <div v-for="g in groups.list" :key="g.si">
      <div class="pt-3 pb-1 text-xs font-semibold text-gray-500">{{ g.title }}</div>
      <div v-for="r in g.rows" :key="r.ei" class="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-b-0">
        <div class="min-w-0 text-sm">
          <div class="text-gray-900">{{ r.name }}</div>
          <div class="text-xs text-gray-500">
            {{ r.from }} → <b class="font-semibold text-gray-900">{{ r.to }}</b>
            <span v-if="lastWeek"> (W{{ lastWeek.target.week }})</span>
          </div>
        </div>
        <select
          :value="r.lever"
          :aria-label="`What progresses for ${r.name}`"
          class="shrink-0 text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          @change="emit('change', g.si, r.ei, ($event.target as HTMLSelectElement).value as Lever)"
        >
          <option v-for="o in r.options" :key="o" :value="o">{{ LEVER_LABEL[o] }}</option>
        </select>
      </div>
    </div>

    <button
      v-if="groups.hidden || showHold"
      type="button"
      class="mt-3 px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-700 hover:border-summit-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      @click="showHold = !showHold"
    >
      {{ showHold ? 'Hide exercises that stay the same' : `Show ${groups.hidden} exercise${groups.hidden === 1 ? '' : 's'} that stay the same` }}
    </button>
  </section>
</template>
