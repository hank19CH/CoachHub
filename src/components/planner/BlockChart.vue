<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GeneratedWeek, WeekTotals } from '@/services/programEngine'

// Ported from prototype/block-modeler.html: SVG so a week's volume bar can be dragged.
const props = defineProps<{
  block: GeneratedWeek[]
  selectedWeek: number
}>()

const emit = defineEmits<{
  (e: 'select', week: number): void
  (e: 'set-volume', week: number, volume: number): void
}>()

const W = 640, H = 250, P = { l: 44, r: 20, t: 18, b: 38 }
const V_MAX = 1.6
const svg = ref<SVGSVGElement | null>(null)

const cw = computed(() => (W - P.l - P.r) / Math.max(1, props.block.length))
const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / V_MAX)
const iRange = computed(() => {
  const vals = props.block.map(w => w.target.intensity)
  return { min: Math.min(-2, ...vals), max: Math.max(4, ...vals) }
})
const yi = (v: number) => P.t + (H - P.t - P.b) * (1 - (v - iRange.value.min) / (iRange.value.max - iRange.value.min))

const bars = computed(() => props.block.map((w, i) => {
  const t = w.target, x = P.l + i * cw.value, bw = cw.value * 0.56
  return {
    t, x, bx: x + (cw.value - bw) / 2, bw,
    light: t.isDeload || t.isTaper,
    cx: x + cw.value / 2,
    iy: yi(t.intensity),
    // Drop the intensity label below its point when it would collide with the bar's value label.
    labelY: Math.abs(yi(t.intensity) - y(t.volume)) < 20 ? yi(t.intensity) + 17 : yi(t.intensity) - 7,
  }
}))
const linePoints = computed(() => bars.value.map(b => `${b.cx},${b.iy}`).join(' '))

const snap = (v: number) => Math.max(0.3, Math.min(1.5, Math.round(v * 20) / 20))

function volumeAt(clientY: number) {
  const r = svg.value!.getBoundingClientRect()
  const py = (clientY - r.top) * (H / r.height)
  return snap((1 - (py - P.t) / (H - P.t - P.b)) * V_MAX)
}

function startDrag(e: PointerEvent, week: number) {
  emit('select', week)
  if (week === 1) return
  const el = e.target as Element
  el.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => emit('set-volume', week, volumeAt(ev.clientY))
  const up = () => {
    el.removeEventListener('pointermove', move as EventListener)
    el.removeEventListener('pointerup', up)
  }
  el.addEventListener('pointermove', move as EventListener)
  el.addEventListener('pointerup', up)
}

function onKey(e: KeyboardEvent, week: number, volume: number) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); emit('select', week); return }
  if (week === 1) return
  const d = e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowDown' ? -0.05 : 0
  if (!d) return
  e.preventDefault()
  emit('select', week)
  emit('set-volume', week, snap(volume + d))
}

// ── Totals strip: selected week vs Week 1 ──
const TOTALS: [string, keyof WeekTotals][] = [
  ['Sets', 'sets'], ['Meters', 'meters'], ['Loaded reps', 'loadedReps'], ['Rel. load', 'relativeLoad'],
]
const totals = computed(() => {
  const w1 = props.block[0]?.totals, wk = props.block[props.selectedWeek - 1]?.totals
  if (!w1 || !wk) return []
  return TOTALS
    .filter(([, k]) => (w1[k] as number) || (wk[k] as number))
    .map(([label, k]) => {
      const a = w1[k] as number, b = wk[k] as number
      return { label, value: b.toLocaleString(), delta: a ? Math.round((b / a - 1) * 100) : 0 }
    })
})
</script>

<template>
  <section class="bg-white rounded-2xl border border-gray-200 p-4">
    <h3 class="font-display font-semibold text-gray-900 mb-2">The block at a glance</h3>
    <svg
      ref="svg"
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full h-auto block touch-none select-none"
      role="img"
      aria-label="Weekly volume and intensity"
    >
      <g v-for="v in [0.5, 1, 1.5]" :key="v">
        <line :x1="P.l" :x2="W - P.r" :y1="y(v)" :y2="y(v)" class="stroke-gray-200" :stroke-dasharray="v === 1 ? undefined : '3 4'" />
        <text :x="P.l - 8" :y="y(v) + 4" text-anchor="end" font-size="12" class="fill-gray-500">{{ v * 100 }}%</text>
      </g>

      <g v-for="b in bars" :key="b.t.week">
        <rect v-if="b.light" :x="b.x + 2" :y="P.t" :width="cw - 4" :height="H - P.t - P.b" rx="6" class="fill-amber-50" />
        <rect
          :x="b.bx" :y="y(b.t.volume)" :width="b.bw" :height="y(0) - y(b.t.volume)" rx="5"
          :class="[
            b.light ? 'fill-amber-400' : 'fill-summit-800',
            b.t.pinned ? 'stroke-gray-900' : '',
            b.t.week > 1 ? 'cursor-ns-resize' : 'cursor-pointer',
            'focus:outline-none focus-visible:stroke-amber-500',
          ]"
          :stroke-width="b.t.pinned ? 2 : 3"
          tabindex="0"
          role="slider"
          :aria-label="`Week ${b.t.week} volume`"
          :aria-valuenow="Math.round(b.t.volume * 100)"
          aria-valuemin="30"
          aria-valuemax="150"
          :aria-readonly="b.t.week === 1"
          @pointerdown="startDrag($event, b.t.week)"
          @keydown="onKey($event, b.t.week, b.t.volume)"
        />
        <text :x="b.cx" :y="y(b.t.volume) - 6" text-anchor="middle" font-size="12" class="fill-gray-900 font-display pointer-events-none">
          {{ Math.round(b.t.volume * 100) }}
        </text>
        <text
          :x="b.cx" :y="H - 14" text-anchor="middle" font-size="13"
          :class="['font-display pointer-events-none', b.t.week === selectedWeek ? 'fill-gray-900 font-bold' : 'fill-gray-500']"
        >
          W{{ b.t.week }}{{ b.t.isDeload ? ' ·D' : b.t.isTaper ? ' ·T' : '' }}
        </text>
      </g>

      <polyline :points="linePoints" fill="none" class="stroke-peak-500 pointer-events-none" stroke-width="3" stroke-linejoin="round" />
      <g v-for="b in bars" :key="'i' + b.t.week" class="pointer-events-none">
        <circle :cx="b.cx" :cy="b.iy" r="4.5" class="fill-white stroke-peak-500" stroke-width="2.5" />
        <text :x="b.cx + 7" :y="b.labelY" font-size="11" class="fill-peak-700 font-display">
          {{ b.t.intensity > 0 ? '+' : '' }}{{ b.t.intensity }}
        </text>
      </g>
    </svg>

    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
      <span><i class="inline-block w-3 h-3 rounded-sm bg-summit-800 align-[-1px] mr-1.5"></i>Volume vs Week 1 (drag a bar, or focus it and use ↑ ↓)</span>
      <span><i class="inline-block w-3 h-3 rounded-sm bg-peak-500 align-[-1px] mr-1.5"></i>Intensity steps</span>
      <span><i class="inline-block w-3 h-3 rounded-sm bg-amber-400 align-[-1px] mr-1.5"></i>Recovery / taper</span>
    </div>

    <div v-if="totals.length" class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
      <div v-for="t in totals" :key="t.label" class="border-t border-gray-100 pt-1.5">
        <div class="text-xs text-gray-500">{{ t.label }} · W{{ selectedWeek }}</div>
        <div class="font-display text-lg font-semibold text-gray-900">{{ t.value }}</div>
        <div class="text-xs text-gray-500">{{ t.delta > 0 ? '+' : '' }}{{ t.delta }}% vs W1</div>
      </div>
    </div>
  </section>
</template>
