<script setup lang="ts">
/**
 * BlockModeler — Sprint 14 Progression tab.
 * Coach builds Week 1 → picks weeks / shape / recovery → previews → generates weeks 2–N.
 * No AI here: every number comes from programEngine.generateBlock(), recomputed locally.
 * UX spec: prototype/block-modeler.html
 */
import { computed, ref, watch } from 'vue'
import {
  SHAPES,
  generateBlock,
  refOf,
  type DeloadCadence,
  type Lever,
  type Prescription,
  type Session,
  type ShapeConfig,
  type ShapeSlug,
} from '@/services/programEngine'
import {
  applyTemplate,
  listWeekTemplates,
  loadBlockForModeling,
  manualSessionsToReplace,
  resolveShapeConfig,
  saveModeledBlock,
  weeksToRemove,
  type ModelingData,
  type WeekTemplate,
} from '@/services/blockModeler'
import { usePlansStore } from '@/stores/plans'
import ShapePicker from './ShapePicker.vue'
import BlockChart from './BlockChart.vue'
import LeverList from './LeverList.vue'
import WeekPreview from './WeekPreview.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

const props = defineProps<{ blockId: string }>()
const emit = defineEmits<{ (e: 'saved'): void }>()

const plansStore = usePlansStore()
const DELOAD_LABEL: Record<DeloadCadence, string> = {
  none: 'none', every_3: 'every 3rd week', every_4: 'every 4th week', final: 'final week',
}

// ── Summary card (lives in the narrow Progression tab) ──
const blockRow = computed(() => plansStore.activePlan?.training_blocks.find(b => b.id === props.blockId) ?? null)
const summaryCfg = computed(() => blockRow.value ? resolveShapeConfig(blockRow.value, blockRow.value.block_weeks.length) : null)

// ── Modeler state ──
const open = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const model = ref<ModelingData | null>(null)
const canonical = ref<Session[]>([])
const cfg = ref<ShapeConfig>({ shape: 'steady_build', weeks: 6, deload: 'every_4', overrides: {} })
const pins = ref<Record<number, Session[]>>({})
const selectedWeek = ref(2)
const templates = ref<WeekTemplate[]>([])

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) }

// Instant, no network: the whole block is recomputed on every change.
const block = computed(() => canonical.value.length ? generateBlock(canonical.value, cfg.value, pins.value) : [])

async function load() {
  loading.value = true
  error.value = ''
  try {
    const m = await loadBlockForModeling(props.blockId)
    model.value = m
    canonical.value = clone(m.canonical)
    cfg.value = clone(m.cfg)
    pins.value = clone(m.existing)
    selectedWeek.value = Math.min(2, m.cfg.weeks)
    if (!m.canonical.length && !templates.value.length) templates.value = await listWeekTemplates()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load block'
  } finally {
    loading.value = false
  }
}

async function openModeler() {
  open.value = true
  await load()
}

watch(() => props.blockId, () => { if (open.value) load() })

// ── Controls ──
function setWeeks(n: number) {
  cfg.value = { ...cfg.value, weeks: n, overrides: {} }
  if (selectedWeek.value > n) selectedWeek.value = n
}
function setShape(s: ShapeSlug) {
  cfg.value = { ...cfg.value, shape: s, deload: SHAPES[s].defaultDeload, overrides: {} }
}
function setDeload(d: DeloadCadence) {
  cfg.value = { ...cfg.value, deload: d, overrides: {} }
}
function setVolume(week: number, volume: number) {
  const overrides = { ...(cfg.value.overrides ?? {}) }
  overrides[week] = { ...(overrides[week] ?? {}), volume }
  cfg.value = { ...cfg.value, overrides }
  selectedWeek.value = week
}

/** Lever change writes progression onto the Week 1 exercise (saved with the block). */
function setLever(si: number, ei: number, lever: Lever) {
  const ex = canonical.value[si]?.exercises[ei]
  if (ex) ex.progression = { ...(ex.progression ?? {}), lever }
}

/** A hand-edited generated cell becomes a pin; generateBlock() carries it through regeneration. */
function pinCell(week: number, si: number, edited: Prescription) {
  const src = block.value[week - 1]?.sessions[si]
  if (!src) return
  const sessions = pins.value[week] ? [...pins.value[week]] : []
  let target = sessions.find(s => s.day_of_week === src.day_of_week && s.session_name === src.session_name)
  if (!target) {
    target = { day_of_week: src.day_of_week, session_name: src.session_name, exercises: [] }
    sessions.push(target)
  }
  const key = refOf(src.day_of_week, edited)
  target.exercises = target.exercises.filter(e => refOf(src.day_of_week, e) !== key).concat(edited)
  pins.value = { ...pins.value, [week]: sessions }
}

function clearEdits() {
  pins.value = {}
  cfg.value = { ...cfg.value, overrides: {} }
}

const pinCount = computed(() => block.value.slice(1).reduce(
  (n, w) => n + w.sessions.reduce((m, s) => m + s.exercises.filter(e => e.pinned).length, 0), 0))
const overrideCount = computed(() => Object.keys(cfg.value.overrides ?? {}).length)
const summary = computed(() =>
  `${SHAPES[cfg.value.shape].name} · ${cfg.value.weeks} weeks · recovery ${DELOAD_LABEL[cfg.value.deload]}` +
  (pinCount.value ? ` · ${pinCount.value} pinned edit${pinCount.value > 1 ? 's' : ''}` : '') +
  (overrideCount.value ? ` · ${overrideCount.value} adjusted week${overrideCount.value > 1 ? 's' : ''}` : ''))

// ── Templates ──
const confirmTemplate = ref<WeekTemplate | null>(null)
const pickedTemplate = ref('')

async function ensureTemplates() {
  if (!templates.value.length) templates.value = await listWeekTemplates()
}

function chooseTemplate(slug: string) {
  const t = templates.value.find(x => x.slug === slug)
  pickedTemplate.value = ''
  if (!t) return
  if (canonical.value.length) confirmTemplate.value = t
  else useTemplate(t)
}

async function useTemplate(t: WeekTemplate) {
  confirmTemplate.value = null
  saving.value = true
  error.value = ''
  try {
    await applyTemplate(props.blockId, t.slug!)
    await load()
    cfg.value = { shape: t.shape, deload: t.deload, weeks: t.weeks, overrides: {} }
    pins.value = {}
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to apply template'
  } finally {
    saving.value = false
  }
}

// ── Save ──
const confirmSave = ref('')

function requestSave() {
  if (!model.value) return
  const stale = weeksToRemove(model.value, cfg.value.weeks)
  const manual = manualSessionsToReplace(model.value, cfg.value.weeks)
  const parts: string[] = []
  if (stale.length) parts.push(`Weeks ${stale.map(w => w.week_number).join(', ')} and their sessions will be deleted.`)
  if (manual.length) parts.push(`${manual.length} hand-built session${manual.length > 1 ? 's' : ''} in weeks 2–${cfg.value.weeks} will be replaced by generated ones.`)
  if (parts.length) confirmSave.value = parts.join(' ')
  else save()
}

async function save() {
  confirmSave.value = ''
  if (!model.value) return
  saving.value = true
  error.value = ''
  try {
    await saveModeledBlock(props.blockId, cfg.value, block.value, { ...model.value, canonical: canonical.value })
    emit('saved')
    open.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save block'
  } finally {
    saving.value = false
  }
}

const btnFocus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2'
</script>

<template>
  <!-- Summary card in the Progression tab -->
  <div class="rounded-xl border border-gray-200 p-4">
    <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Block shape</div>
    <template v-if="summaryCfg && blockRow?.modeled_at">
      <div class="font-display font-semibold text-gray-900">{{ SHAPES[summaryCfg.shape].name }}</div>
      <p class="text-xs text-gray-500 mt-0.5">
        {{ summaryCfg.weeks }} weeks · recovery {{ DELOAD_LABEL[summaryCfg.deload] }}
      </p>
    </template>
    <p v-else class="text-sm text-gray-500">
      Build Week 1, pick a shape, and the engine writes weeks 2–N. Anything you edit stays put.
    </p>
    <button
      type="button"
      :class="['mt-3 w-full text-sm font-semibold text-white bg-summit-800 hover:bg-summit-900 rounded-lg py-2', btnFocus]"
      @click="openModeler"
    >
      {{ blockRow?.modeled_at ? 'Open Block Modeler' : 'Model this block' }}
    </button>
  </div>

  <!-- Full-screen modeler -->
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40 flex flex-col bg-gray-50" role="dialog" aria-modal="true" aria-labelledby="bm-title" @keydown.esc="open = false">
      <header class="bg-white border-b border-gray-200">
        <div class="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <h2 id="bm-title" class="font-display text-xl font-bold text-gray-900 truncate">Model {{ blockRow?.name || 'this block' }}</h2>
            <p class="text-sm text-gray-500">Week 1 is yours. Pick a shape — the engine writes the rest.</p>
          </div>
          <div class="flex items-center gap-2">
            <select
              v-if="canonical.length"
              v-model="pickedTemplate"
              aria-label="Replace Week 1 with a template"
              :class="['text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white max-w-[11rem]', btnFocus]"
              @focus="ensureTemplates"
              @change="chooseTemplate(pickedTemplate)"
            >
              <option value="" disabled>Start from template…</option>
              <option v-for="t in templates" :key="t.id" :value="t.slug ?? ''">{{ t.name }}</option>
            </select>
            <button
              type="button"
              aria-label="Close Block Modeler"
              :class="['p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100', btnFocus]"
              @click="open = false"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <div class="max-w-6xl mx-auto px-4 py-5">
          <p v-if="error" class="mb-4 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>

          <div v-if="loading" class="py-16 text-center text-sm text-gray-500">Loading block…</div>

          <!-- No Week 1 yet: start from a template -->
          <div v-else-if="!canonical.length" class="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 class="font-display font-semibold text-gray-900">Week 1 is empty</h3>
            <p class="text-sm text-gray-500 mt-1 mb-4">Build Week 1 in the week editor, or start from a template.</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <button
                v-for="t in templates"
                :key="t.id"
                type="button"
                :disabled="saving"
                :class="['text-left rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:border-summit-300', btnFocus]"
                @click="useTemplate(t)"
              >
                <strong class="block font-display font-semibold text-gray-900">{{ t.name }}</strong>
                <span class="text-sm text-gray-500">{{ t.coachLine }}</span>
              </button>
            </div>
          </div>

          <!-- Mobile order (<lg): controls → chart → levers → weeks -->
          <div v-else class="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div class="contents lg:flex lg:flex-col lg:gap-5 min-w-0">
              <ShapePicker
                class="order-1"
                :weeks="cfg.weeks" :shape="cfg.shape" :deload="cfg.deload"
                @update:weeks="setWeeks" @update:shape="setShape" @update:deload="setDeload"
              />
              <LeverList class="order-3" :canonical="canonical" :last-week="block[block.length - 1]" @change="setLever" />
            </div>
            <div class="contents lg:flex lg:flex-col lg:gap-5 min-w-0">
              <BlockChart class="order-2" :block="block" :selected-week="selectedWeek" @select="selectedWeek = $event" @set-volume="setVolume" />
              <WeekPreview class="order-4" :block="block" :canonical="canonical" :selected-week="selectedWeek" @select="selectedWeek = $event" @pin="pinCell" />
            </div>
          </div>
        </div>
      </main>

      <footer v-if="canonical.length && !loading" class="bg-gray-900 text-white">
        <div class="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm min-w-0">{{ summary }}</span>
          <span class="flex gap-2">
            <button type="button" :class="['px-3 py-2 rounded-lg text-sm font-semibold border border-white/30', btnFocus]" @click="clearEdits">
              Clear my edits
            </button>
            <button
              type="button"
              :disabled="saving"
              :class="['px-4 py-2 rounded-lg text-sm font-semibold bg-peak-500 hover:bg-peak-600 disabled:opacity-60', btnFocus]"
              @click="requestSave"
            >
              {{ saving ? 'Generating…' : `Generate weeks 2–${cfg.weeks}` }}
            </button>
          </span>
        </div>
      </footer>
    </div>
  </Teleport>

  <ConfirmDialog
    :open="!!confirmSave"
    title="Generate this block?"
    :message="confirmSave"
    confirm-text="Generate"
    :loading="saving"
    @confirm="save"
    @cancel="confirmSave = ''"
  />
  <ConfirmDialog
    :open="!!confirmTemplate"
    title="Replace Week 1?"
    :message="`Week 1's sessions will be replaced with “${confirmTemplate?.name}”. Generated weeks update when you generate again.`"
    confirm-text="Replace Week 1"
    :loading="saving"
    @confirm="confirmTemplate && useTemplate(confirmTemplate)"
    @cancel="confirmTemplate = null"
  />
</template>
