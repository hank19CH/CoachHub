<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { plansService } from '@/services/plans'
import { saveAthleteAbout } from '@/services/onboarding'

const emit = defineEmits<{ (e: 'next'): void }>()
const authStore = useAuthStore()

const GOALS = ['Compete', 'Get faster', 'Get stronger', 'Stay fit', 'Return from injury']
const TRACK_EVENTS = ['100m', '200m', '400m', '800m', 'Hurdles', 'Relays', 'Jumps', 'Throws']

const sports = ref<{ id: string; name: string }[]>([])
const name = ref(authStore.profile?.display_name ?? '')
const sportId = ref<string | null>(authStore.profile?.sport_ids?.[0] ?? null)
const events = ref<string[]>([])
const goals = ref<string[]>([])
const customEvent = ref('')
const saving = ref(false)
const error = ref('')

const isTrack = computed(() => /track|athletic|sprint|running/i.test(sports.value.find(s => s.id === sportId.value)?.name ?? ''))
const eventOptions = computed(() => [...new Set([...(isTrack.value ? TRACK_EVENTS : []), ...events.value])])

onMounted(async () => {
  try { sports.value = await plansService.getSports() } catch { sports.value = [] }
})

function toggle(which: 'events' | 'goals', v: string) {
  const list = which === 'events' ? events : goals
  list.value = list.value.includes(v) ? list.value.filter(x => x !== v) : [...list.value, v]
}
function addEvent() {
  const v = customEvent.value.trim()
  if (v && !events.value.includes(v)) events.value = [...events.value, v]
  customEvent.value = ''
}

async function save() {
  if (!authStore.profile || !name.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    await saveAthleteAbout(authStore.profile.id, { displayName: name.value.trim(), sportId: sportId.value, events: events.value, goals: goals.value })
    await authStore.fetchProfile()
    emit('next')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save'
  } finally {
    saving.value = false
  }
}

const chip = (on: boolean) => ['min-h-[40px] px-3.5 rounded-full text-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400', on ? 'border-summit-800 bg-summit-50 text-summit-900 font-semibold' : 'border-gray-300 bg-white text-gray-700']
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="save">
    <div class="flex flex-col gap-1.5">
      <h1 class="font-display text-2xl font-bold text-gray-900">About you</h1>
      <p class="text-sm text-gray-600">Your coach sees this to tailor your plan.</p>
    </div>
    <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
      Your name
      <input v-model="name" type="text" required autocomplete="name" class="input font-normal text-base" />
    </label>
    <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
      Sport
      <select v-model="sportId" class="input font-normal text-base">
        <option :value="null">Choose your sport</option>
        <option v-for="s in sports" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </label>
    <fieldset class="flex flex-col gap-2">
      <legend class="text-sm font-semibold text-gray-700 mb-2">Your events or positions</legend>
      <div v-if="eventOptions.length" class="flex flex-wrap gap-2">
        <button v-for="e in eventOptions" :key="e" type="button" :aria-pressed="events.includes(e)" :class="chip(events.includes(e))" @click="toggle('events', e)">{{ e }}</button>
      </div>
      <span class="flex gap-2">
        <input v-model="customEvent" type="text" placeholder="Add one, e.g. Winger" aria-label="Add an event or position" class="input flex-1 min-w-0 font-normal text-base" @keydown.enter.prevent="addEvent" />
        <button type="button" class="btn-secondary min-h-[44px]" @click="addEvent">Add</button>
      </span>
    </fieldset>
    <fieldset class="flex flex-col gap-2">
      <legend class="text-sm font-semibold text-gray-700 mb-2">What are you training for?</legend>
      <div class="flex flex-wrap gap-2">
        <button v-for="g in GOALS" :key="g" type="button" :aria-pressed="goals.includes(g)" :class="chip(goals.includes(g))" @click="toggle('goals', g)">{{ g }}</button>
      </div>
    </fieldset>
    <p v-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
    <button type="submit" :disabled="saving || !name.trim()" class="btn-primary min-h-[52px] text-base disabled:opacity-50">{{ saving ? 'Saving…' : 'Continue' }}</button>
  </form>
</template>
