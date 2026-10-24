<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { formatPrescription, type GeneratedWeek, type Prescription, type Session } from '@/services/programEngine'

const props = defineProps<{
  block: GeneratedWeek[]
  canonical: Session[]
  selectedWeek: number
}>()

const emit = defineEmits<{
  (e: 'select', week: number): void
  (e: 'pin', week: number, sessionIndex: number, exercise: Prescription): void
}>()

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FIELDS: [keyof Prescription, string][] = [
  ['sets', 'Sets'], ['reps', 'Reps'], ['intensity_percent', '%'], ['distance_meters', 'm'], ['weight_kg', 'kg'], ['rpe', 'RPE'],
]

const week = computed(() => props.block[props.selectedWeek - 1])
const editing = ref<{ si: number; ei: number } | null>(null)
const draft = ref<Record<string, string>>({})
const editorEl = ref<HTMLElement | null>(null)
const setEditor = (el: unknown) => { editorEl.value = el as HTMLElement | null }

watch(() => props.selectedWeek, () => { editing.value = null })

const recoveryNote = computed(() => {
  const t = week.value?.target
  if (!t) return ''
  if (t.isDeload) return `Recovery week: ${Math.round(t.volume * 100)}% of Week 1 volume, lighter intensity.`
  if (t.isTaper) return `Taper: ${Math.round(t.volume * 100)}% volume, intensity held.`
  return ''
})

function cellState(ex: Prescription, si: number, ei: number) {
  if (ex.pinned) return 'pin'
  const base = props.canonical[si]?.exercises[ei]
  return props.selectedWeek > 1 && base && formatPrescription(ex) !== formatPrescription(base) ? 'chg' : ''
}

function edit(si: number, ei: number, ex: Prescription) {
  editing.value = { si, ei }
  draft.value = Object.fromEntries(
    FIELDS.filter(([k]) => ex[k] !== undefined && ex[k] !== null && ex[k] !== '').map(([k]) => [k, String(ex[k])]),
  )
  nextTick(() => editorEl.value?.querySelector('input')?.focus())
}

function pin(ex: Prescription, si: number) {
  const edited: Prescription = { ...ex, ...draft.value, pinned: true }
  // Keep both % fields in sync, as the engine does.
  if (draft.value.intensity_percent !== undefined && ex.load_percent !== undefined && ex.load_percent !== '') {
    edited.load_percent = draft.value.intensity_percent
  }
  emit('pin', props.selectedWeek, si, edited)
  editing.value = null
}

const fieldLabel = (k: string) => FIELDS.find(([f]) => f === k)?.[1] ?? k
</script>

<template>
  <section class="bg-white rounded-2xl border border-gray-200 p-4">
    <div class="flex items-baseline gap-2.5 mb-3">
      <span class="font-display font-bold text-summit-800">4</span>
      <h3 class="font-display font-semibold text-gray-900">Check the weeks</h3>
    </div>

    <div class="flex gap-1.5 overflow-x-auto pb-1 mb-3" role="tablist">
      <button
        v-for="w in block"
        :key="w.target.week"
        type="button"
        role="tab"
        :aria-selected="w.target.week === selectedWeek"
        :class="[
          'shrink-0 px-2.5 py-1.5 rounded-lg border text-sm font-display focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          w.target.week === selectedWeek
            ? 'bg-gray-900 border-gray-900 text-white'
            : w.target.isDeload || w.target.isTaper ? 'bg-amber-50 border-amber-200 text-gray-700' : 'bg-white border-gray-200 text-gray-700',
        ]"
        @click="emit('select', w.target.week)"
      >
        W{{ w.target.week }}{{ w.target.isDeload ? ' D' : w.target.isTaper ? ' T' : '' }}
      </button>
    </div>

    <p v-if="recoveryNote" class="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2 mb-3">{{ recoveryNote }}</p>

    <div v-for="(s, si) in week?.sessions ?? []" :key="si" class="mb-4">
      <h4 class="font-display font-semibold text-sm text-gray-900 mb-1">{{ DAYS[s.day_of_week] }} — {{ s.session_name }}</h4>
      <template v-for="(ex, ei) in s.exercises" :key="ei">
        <div v-if="ex.is_section_header" class="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{{ ex.name }}</div>
        <div v-else class="flex items-center justify-between gap-3 py-1.5 border-b border-dashed border-gray-200">
          <span class="text-sm text-gray-700 min-w-0">{{ ex.name }}</span>
          <button
            type="button"
            :disabled="selectedWeek === 1"
            :title="selectedWeek === 1 ? 'Week 1 is the canonical week — edit it in the week editor' : 'Edit this prescription'"
            :class="[
              'shrink-0 font-display text-sm whitespace-nowrap px-1.5 py-0.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
              cellState(ex, si, ei) === 'pin' ? 'bg-amber-50 text-amber-800'
                : cellState(ex, si, ei) === 'chg' ? 'bg-summit-50 text-summit-800' : 'text-gray-900',
              selectedWeek === 1 ? 'cursor-default' : 'cursor-pointer hover:ring-1 hover:ring-summit-300',
              (week?.target.isDeload || week?.target.isTaper) && cellState(ex, si, ei) === 'chg' ? 'opacity-80' : '',
            ]"
            @click="edit(si, ei, ex)"
          >
            {{ formatPrescription(ex) }}
            <span v-if="ex.pinned" class="ml-1 text-xs">● Pinned</span>
          </button>
        </div>
        <div
          v-if="editing && editing.si === si && editing.ei === ei"
          :ref="setEditor"
          class="flex flex-wrap items-center gap-2 p-2 my-1.5 bg-amber-50 rounded-lg"
          @keydown.esc.stop="editing = null"
        >
          <label v-for="(_, k) in draft" :key="k" class="text-sm text-gray-700">
            {{ fieldLabel(k as string) }}
            <input
              v-model="draft[k]"
              class="w-16 ml-1 border border-gray-200 rounded-md px-1.5 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              @keydown.enter="pin(ex, si)"
            />
          </label>
          <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-900 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" @click="pin(ex, si)">Pin this</button>
          <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" @click="editing = null">Cancel</button>
        </div>
      </template>
    </div>

    <p class="text-xs text-gray-500">
      <span class="text-summit-800">Purple</span> = changed by the engine.
      <span class="text-amber-800">Gold</span> = your edit (pinned — survives regenerating). Tap any prescription to edit.
    </p>
  </section>
</template>
