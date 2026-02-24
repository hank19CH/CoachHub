<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import { VOLUME_PRESET_SHAPES, saveVolumeTargets, type VolumePresetShape } from '@/services/progressionEngine'
import { LOAD_METRIC_LABELS } from '@/types/progression'
import type { BlockProgressionParams } from '@/types/progression'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend)

const props = defineProps<{
  blockId: string
  durationWeeks: number
  deloadWeek: number | null
  loadMetric: string
  initialParams?: BlockProgressionParams | null
}>()

const emit = defineEmits<{
  (e: 'updated'): void
}>()

// State
const selectedPreset = ref<string | null>(null)
const showIntensity = ref(false)
const volumeTargets = ref<number[]>([])
const intensityTargets = ref<number[]>([])
const saving = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

const volumeUnitLabel = computed(() =>
  LOAD_METRIC_LABELS[props.loadMetric] || 'Volume'
)

const weekLabels = computed(() =>
  Array.from({ length: props.durationWeeks }, (_, i) => `W${i + 1}`)
)

// Initialize from props
watch(() => props.initialParams, (params) => {
  if (params?.volume_targets?.length) {
    volumeTargets.value = [...params.volume_targets]
  } else {
    volumeTargets.value = new Array(props.durationWeeks).fill(0)
  }
  if (params?.intensity_targets?.length) {
    intensityTargets.value = [...params.intensity_targets]
  } else {
    intensityTargets.value = new Array(props.durationWeeks).fill(0)
  }
  selectedPreset.value = params?.preset_shape ?? null
}, { immediate: true })

watch(() => props.durationWeeks, (weeks) => {
  while (volumeTargets.value.length < weeks) volumeTargets.value.push(0)
  while (intensityTargets.value.length < weeks) intensityTargets.value.push(0)
  volumeTargets.value = volumeTargets.value.slice(0, weeks)
  intensityTargets.value = intensityTargets.value.slice(0, weeks)
})

// Preset application
function applyPreset(presetKey: string) {
  const preset = VOLUME_PRESET_SHAPES[presetKey]
  if (!preset) return
  selectedPreset.value = presetKey

  const baseVolume = volumeTargets.value[0] || 3000
  volumeTargets.value = preset.generate(
    props.durationWeeks,
    baseVolume,
    props.deloadWeek,
    0.5,
  )
  debounceSave()
}

// Week-on-week delta
function getDelta(index: number): string | null {
  if (index === 0) return null
  const prev = volumeTargets.value[index - 1]
  const curr = volumeTargets.value[index]
  if (!prev || !curr) return null
  const pct = ((curr - prev) / prev) * 100
  return `${pct > 0 ? '+' : ''}${Math.round(pct)}%`
}

function isDeltaHigh(index: number): boolean {
  if (index === 0) return false
  const prev = volumeTargets.value[index - 1]
  const curr = volumeTargets.value[index]
  if (!prev || !curr) return false
  return Math.abs(((curr - prev) / prev) * 100) > 15
}

// Chart data
const chartData = computed(() => {
  const datasets: any[] = [
    {
      type: 'bar' as const,
      label: volumeUnitLabel.value,
      data: volumeTargets.value,
      backgroundColor: volumeTargets.value.map((_, i) =>
        props.deloadWeek === i + 1
          ? 'rgba(91, 33, 182, 0.25)'
          : 'rgba(91, 33, 182, 0.7)'
      ),
      borderColor: 'rgb(91, 33, 182)',
      borderWidth: 2,
      borderDash: volumeTargets.value.map((_, i) =>
        props.deloadWeek === i + 1 ? [4, 4] : []
      ),
    },
  ]

  if (showIntensity.value && intensityTargets.value.some(v => v > 0)) {
    datasets.push({
      type: 'line' as const,
      label: 'Intensity (%)',
      data: intensityTargets.value,
      yAxisID: 'y2',
      borderColor: '#F97316',
      backgroundColor: 'rgba(249, 115, 22, 0.1)',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#F97316',
      tension: 0.4,
    })
  }

  return {
    labels: weekLabels.value,
    datasets,
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: showIntensity.value, position: 'top' as const },
    tooltip: { mode: 'index' as const },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: volumeUnitLabel.value, font: { size: 10 } },
    },
    ...(showIntensity.value ? {
      y2: {
        position: 'right' as const,
        beginAtZero: false,
        min: 40,
        max: 110,
        title: { display: true, text: 'Intensity (%)', font: { size: 10 } },
        grid: { drawOnChartArea: false },
      },
    } : {}),
  },
}))

// Input handling
function onVolumeInput(index: number, event: Event) {
  const val = parseInt((event.target as HTMLInputElement).value) || 0
  volumeTargets.value[index] = val
  selectedPreset.value = null // manual override clears preset
  debounceSave()
}

function onIntensityInput(index: number, event: Event) {
  const val = parseFloat((event.target as HTMLInputElement).value) || 0
  intensityTargets.value[index] = val
  debounceSave()
}

// Debounced auto-save
function debounceSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 800)
}

async function save() {
  saving.value = true
  try {
    await saveVolumeTargets(props.blockId, {
      volume_targets: [...volumeTargets.value],
      intensity_targets: showIntensity.value ? [...intensityTargets.value] : undefined,
      preset_shape: selectedPreset.value,
      deload_week: props.deloadWeek ?? undefined,
      volume_unit: props.loadMetric,
    })
    emit('updated')
  } catch (e) {
    console.error('Failed to save volume targets:', e)
  } finally {
    saving.value = false
  }
}

const presetOptions = Object.entries(VOLUME_PRESET_SHAPES).map(([key, shape]) => ({
  key,
  label: shape.label,
  description: shape.description,
}))
</script>

<template>
  <div class="space-y-3">
    <!-- Controls row -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <label class="text-[10px] font-semibold text-gray-400 uppercase">Load Metric</label>
        <span class="text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{{ volumeUnitLabel }}</span>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-[10px] font-semibold text-gray-400 uppercase">Preset</label>
        <select
          :value="selectedPreset || ''"
          @change="(e) => applyPreset((e.target as HTMLSelectElement).value)"
          class="text-xs px-2 py-1 rounded border border-gray-200 focus:border-summit-500 outline-none"
        >
          <option value="" disabled>Select shape...</option>
          <option v-for="p in presetOptions" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>
      </div>

      <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer ml-auto">
        <input v-model="showIntensity" type="checkbox" class="w-3.5 h-3.5 rounded border-gray-300 text-peak-500 focus:ring-peak-500" />
        Intensity overlay
      </label>
    </div>

    <!-- Chart -->
    <div class="h-48 bg-white rounded-lg border border-gray-100 p-2">
      <Bar :data="chartData" :options="(chartOptions as any)" />
    </div>

    <!-- Week inputs -->
    <div class="overflow-x-auto">
      <div class="flex gap-1 min-w-[500px]">
        <div
          v-for="(_, i) in volumeTargets"
          :key="i"
          class="flex-1 text-center"
          :class="{ 'opacity-60': deloadWeek === i + 1 }"
        >
          <div class="text-[10px] font-semibold text-gray-400 mb-0.5">
            W{{ i + 1 }}
            <span v-if="deloadWeek === i + 1" class="text-summit-500">DL</span>
          </div>
          <input
            :value="volumeTargets[i]"
            @input="onVolumeInput(i, $event)"
            type="number"
            min="0"
            class="w-full text-xs text-center px-1 py-1.5 rounded border border-gray-200 focus:border-summit-500 focus:ring-1 focus:ring-summit-500 outline-none"
          />
          <div
            v-if="getDelta(i)"
            class="text-[9px] mt-0.5 font-semibold"
            :class="isDeltaHigh(i) ? 'text-peak-600' : 'text-gray-400'"
          >
            {{ getDelta(i) }}
          </div>

          <!-- Intensity row -->
          <template v-if="showIntensity">
            <input
              :value="intensityTargets[i]"
              @input="onIntensityInput(i, $event)"
              type="number"
              min="0"
              max="110"
              step="0.5"
              placeholder="%"
              class="w-full text-xs text-center px-1 py-1 rounded border border-peak-200 focus:border-peak-500 focus:ring-1 focus:ring-peak-500 outline-none mt-1"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Save indicator -->
    <div v-if="saving" class="text-[10px] text-summit-500 text-right">Saving...</div>
  </div>
</template>
