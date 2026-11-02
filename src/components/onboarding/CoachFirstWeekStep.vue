<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { listWeekTemplates, type WeekTemplate } from '@/services/blockModeler'
import { startPlanFromTemplate } from '@/services/onboarding'
import { SHAPES } from '@/services/programEngine'

export type FirstWeekChoice = { mode: 'template'; planId: string; name: string } | { mode: 'import' } | { mode: 'scratch' } | { mode: 'later' }

const emit = defineEmits<{ (e: 'next', choice: FirstWeekChoice): void }>()
const authStore = useAuthStore()

const tab = ref<'template' | 'import' | 'scratch'>('template')
const templates = ref<WeekTemplate[]>([])
const selected = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    templates.value = await listWeekTemplates()
    selected.value = templates.value[0]?.slug ?? null
  } catch {
    error.value = "Couldn't load templates. You can start from scratch instead."
  } finally {
    loading.value = false
  }
})

async function useTemplate() {
  const t = templates.value.find(x => x.slug === selected.value)
  if (!t || !authStore.profile) return
  saving.value = true
  error.value = ''
  try {
    const planId = await startPlanFromTemplate(authStore.profile.id, t.slug!)
    emit('next', { mode: 'template', planId, name: t.name })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not create your plan'
  } finally {
    saving.value = false
  }
}

const tabClass = (t: string) => [
  'min-h-[46px] px-4 text-sm font-semibold border-b-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
  tab.value === t ? 'border-summit-800 text-summit-900' : 'border-transparent text-gray-600 hover:text-gray-900',
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <h1 class="font-display text-3xl font-bold text-gray-900">Build one great week</h1>
      <p class="text-base text-gray-600 max-w-2xl">Your Week 1 is the blueprint. Next you pick a block shape and CoachHub writes the rest of the block — anything you edit stays put.</p>
    </div>

    <ol aria-label="How it works" class="grid gap-3 sm:grid-cols-3">
      <li class="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200 text-sm"><span class="font-display font-bold text-summit-800">1</span><span><strong>Build Week 1</strong> — sessions &amp; exercises</span></li>
      <li class="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200 text-sm"><span class="font-display font-bold text-summit-800">2</span><span><strong>Pick a shape</strong> — build, peak, maintain…</span></li>
      <li class="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200 text-sm"><span class="font-display font-bold text-summit-800">3</span><span><strong>Generate</strong> the remaining weeks</span></li>
    </ol>

    <div role="tablist" aria-label="How to start" class="flex flex-wrap gap-2 border-b border-gray-200">
      <button type="button" role="tab" :aria-selected="tab === 'template'" :class="tabClass('template')" @click="tab = 'template'">Start from a template</button>
      <button type="button" role="tab" :aria-selected="tab === 'import'" :class="tabClass('import')" @click="tab = 'import'">Import my spreadsheet / PDF</button>
      <button type="button" role="tab" :aria-selected="tab === 'scratch'" :class="tabClass('scratch')" @click="tab = 'scratch'">Start from scratch</button>
    </div>

    <template v-if="tab === 'template'">
      <p v-if="loading" class="text-sm text-gray-500">Loading templates…</p>
      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="t in templates"
          :key="t.id"
          type="button"
          :aria-pressed="selected === t.slug"
          :class="['text-left rounded-2xl p-5 flex flex-col gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400', selected === t.slug ? 'border-2 border-summit-800 bg-summit-50' : 'border border-gray-200 bg-white hover:border-summit-300']"
          @click="selected = t.slug"
        >
          <span class="font-display font-semibold text-gray-900">{{ t.name }}</span>
          <span class="text-sm text-gray-600 leading-snug">{{ t.coachLine }}</span>
          <span class="text-xs text-gray-500">{{ t.days.length }} days/wk · {{ SHAPES[t.shape].name }} · {{ t.weeks }} wks</span>
        </button>
      </div>
      <p v-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
      <div class="flex flex-wrap items-center gap-4">
        <button type="button" :disabled="!selected || saving" class="btn-primary min-h-[52px] px-7 text-base disabled:opacity-50" @click="useTemplate">
          {{ saving ? 'Setting up your plan…' : 'Use this as my Week 1' }}
        </button>
        <button type="button" class="text-sm font-semibold text-summit-800 px-2 min-h-[44px]" @click="emit('next', { mode: 'later' })">I'll build it later</button>
      </div>
    </template>

    <div v-else-if="tab === 'import'" class="p-6 rounded-2xl bg-white border border-gray-200 flex flex-col gap-3 max-w-2xl">
      <h2 class="font-display text-xl font-semibold">Smart Import</h2>
      <p class="text-sm text-gray-600 leading-relaxed">Upload an Excel, CSV or PDF program. CoachHub reads the exercises, sets, reps and intensities, and you review before anything is saved.</p>
      <div><button type="button" class="btn-primary min-h-[48px] px-6" @click="emit('next', { mode: 'import' })">Continue — I'll import next</button></div>
    </div>

    <div v-else class="p-6 rounded-2xl bg-white border border-gray-200 flex flex-col gap-3 max-w-2xl">
      <h2 class="font-display text-xl font-semibold">Start from scratch</h2>
      <p class="text-sm text-gray-600 leading-relaxed">Create a plan in the Planner, add a block and build Week 1 day by day.</p>
      <div><button type="button" class="btn-primary min-h-[48px] px-6" @click="emit('next', { mode: 'scratch' })">Continue — I'll build it in the Planner</button></div>
    </div>
  </div>
</template>
