<script setup lang="ts">
/**
 * TourGuide — first-run tooltip tour (Sprint 14.5).
 * Each step points at an element by CSS selector (use data-tour="…" attributes).
 * Steps whose target isn't on the page are skipped. Finishing or skipping records
 * `tour:<tourId>` in profiles.onboarding_flags so the tour shows once per user.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

export interface TourStep {
  target: string
  title: string
  body: string
}

const props = withDefaults(defineProps<{
  tourId: string
  steps: TourStep[]
  /** ms to wait before starting, so the page can finish rendering */
  delay?: number
}>(), { delay: 400 })

const emit = defineEmits<{ (e: 'finish'): void }>()

const authStore = useAuthStore()
const flag = computed(() => `tour:${props.tourId}`)

const active = ref(false)
const index = ref(0)
const rect = ref<DOMRect | null>(null)
const card = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const visibleSteps = ref<TourStep[]>([])
const step = computed(() => visibleSteps.value[index.value])
const isLast = computed(() => index.value === visibleSteps.value.length - 1)

const PAD = 6
const spotStyle = computed(() => {
  const r = rect.value
  if (!r) return { display: 'none' }
  return {
    top: `${r.top - PAD}px`, left: `${r.left - PAD}px`,
    width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px`,
  }
})
const cardStyle = computed(() => {
  const r = rect.value
  if (!r) return {}
  const w = Math.min(320, window.innerWidth - 32)
  const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), window.innerWidth - w - 16)
  const below = window.innerHeight - r.bottom > 220 || r.top < 220
  return below
    ? { width: `${w}px`, left: `${left}px`, top: `${r.bottom + PAD + 12}px` }
    : { width: `${w}px`, left: `${left}px`, bottom: `${window.innerHeight - r.top + PAD + 12}px` }
})

function targetEl(s: TourStep | undefined) {
  return s ? (document.querySelector(s.target) as HTMLElement | null) : null
}

function measure() {
  const el = targetEl(step.value)
  rect.value = el ? el.getBoundingClientRect() : null
}

async function show(i: number) {
  index.value = i
  const el = targetEl(step.value)
  el?.scrollIntoView({ block: 'center', behavior: 'auto' })
  await nextTick()
  measure()
  card.value?.focus()
}

function start() {
  visibleSteps.value = props.steps.filter(s => targetEl(s))
  if (!visibleSteps.value.length) return
  active.value = true
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
  show(0)
}

function end() {
  if (!active.value) return
  active.value = false
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
  authStore.addOnboardingFlag(flag.value)
  emit('finish')
}

function next() { isLast.value ? end() : show(index.value + 1) }
function back() { if (index.value > 0) show(index.value - 1) }

onMounted(() => {
  if (!authStore.profile || authStore.onboardingFlags.includes(flag.value)) return
  timer = setTimeout(start, props.delay)
})
onUnmounted(() => {
  if (timer) clearTimeout(timer)
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="active && step" class="fixed inset-0 z-[60]" @keydown.esc="end">
      <!-- Click shield: the page stays visible but can't be clicked mid-tour -->
      <div class="absolute inset-0" aria-hidden="true"></div>
      <div
        class="fixed rounded-xl pointer-events-none transition-all duration-200 shadow-[0_0_0_4px_theme(colors.amber.400),0_0_0_9999px_rgba(17,24,39,0.55)]"
        :style="spotStyle"
        aria-hidden="true"
      ></div>
      <div
        ref="card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`tour-title-${tourId}`"
        tabindex="-1"
        class="fixed bg-gray-900 text-white rounded-2xl p-5 shadow-elevated flex flex-col gap-2.5 focus:outline-none"
        :style="cardStyle"
      >
        <span class="text-xs font-bold tracking-wider text-amber-400">TOUR · {{ index + 1 }} OF {{ visibleSteps.length }}</span>
        <h2 :id="`tour-title-${tourId}`" class="font-display text-lg font-semibold">{{ step.title }}</h2>
        <p class="text-sm leading-relaxed text-gray-200">{{ step.body }}</p>
        <div class="flex items-center justify-between mt-1">
          <button type="button" class="text-sm text-gray-300 hover:text-white min-h-[40px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded" @click="end">Skip tour</button>
          <div class="flex gap-2">
            <button v-if="index > 0" type="button" class="text-sm font-semibold text-gray-200 px-3 min-h-[40px] rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" @click="back">Back</button>
            <button type="button" class="text-sm font-bold bg-amber-400 text-gray-900 px-4 min-h-[40px] rounded-lg hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" @click="next">{{ isLast ? 'Done' : 'Next' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
