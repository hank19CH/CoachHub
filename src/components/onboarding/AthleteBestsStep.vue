<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { saveSelfReportedBests } from '@/services/onboarding'

const emit = defineEmits<{ (e: 'next'): void }>()
const authStore = useAuthStore()

interface Row { exerciseName: string; pbType: 'time' | 'weight'; raw: string }

const rows = ref<Row[]>([
  { exerciseName: '100m', pbType: 'time', raw: '' },
  { exerciseName: 'Back Squat', pbType: 'weight', raw: '' },
])
const saving = ref(false)
const error = ref('')

/** "11.2" → 11.2 s; "4:35.2" → 275.2 s; "1:02:30" → 3750 s. Weights are plain numbers. */
function parseValue(r: Row): number {
  const raw = r.raw.trim().replace(',', '.')
  if (!raw) return NaN
  if (r.pbType === 'weight') return Number(raw)
  return raw.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)
}

const invalid = (r: Row) => r.raw.trim() !== '' && !(parseValue(r) > 0)

async function save() {
  if (!authStore.profile) return
  if (rows.value.some(invalid)) { error.value = 'Check the highlighted values — times like 11.20 or 4:35.2, weights in kg.'; return }
  saving.value = true
  error.value = ''
  try {
    await saveSelfReportedBests(authStore.profile.id, rows.value.map(r => ({ exerciseName: r.exerciseName, pbType: r.pbType, value: parseValue(r) })))
    emit('next')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save your bests'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="save">
    <div class="flex flex-col gap-1.5">
      <h1 class="font-display text-2xl font-bold text-gray-900">Your current bests</h1>
      <p class="text-sm text-gray-600 leading-relaxed">Optional. Helps your coach set the right loads, and lets CoachHub spot your real PBs.</p>
    </div>

    <div v-for="(r, i) in rows" :key="i" class="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-3 items-end">
      <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
        Exercise or event
        <input v-model="r.exerciseName" type="text" class="input font-normal text-base" />
      </label>
      <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
        {{ r.pbType === 'time' ? 'Time (s)' : 'Best (kg)' }}
        <input v-model="r.raw" type="text" inputmode="decimal" :placeholder="r.pbType === 'time' ? '11.20' : 'kg'" :aria-invalid="invalid(r)" :class="['input font-normal text-base', invalid(r) ? 'border-red-500' : '']" />
      </label>
    </div>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn-ghost min-h-[44px]" @click="rows.push({ exerciseName: '', pbType: 'time', raw: '' })">+ Add a time</button>
      <button type="button" class="btn-ghost min-h-[44px]" @click="rows.push({ exerciseName: '', pbType: 'weight', raw: '' })">+ Add a lift</button>
    </div>

    <p class="text-sm text-gray-600 bg-gray-50 rounded-lg px-3.5 py-3">Not sure? Leave it blank — your coach can test you in week 1.</p>
    <p v-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
    <button type="submit" :disabled="saving" class="btn-primary min-h-[52px] text-base disabled:opacity-50">{{ saving ? 'Saving…' : 'Continue' }}</button>
  </form>
</template>
