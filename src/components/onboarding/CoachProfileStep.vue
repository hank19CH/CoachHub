<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { plansService } from '@/services/plans'
import { saveCoachProfile } from '@/services/onboarding'

const emit = defineEmits<{ (e: 'next'): void }>()
const authStore = useAuthStore()

const SPECIALTIES = ['Individuals', 'Teams / squads', 'Online clients']

const sports = ref<{ id: string; name: string }[]>([])
const bio = ref(authStore.profile?.bio ?? '')
const sportId = ref<string | null>(authStore.profile?.sport_ids?.[0] ?? null)
const years = ref<number | null>(null)
const specialties = ref<string[]>([])
const saving = ref(false)
const error = ref('')

const sportName = computed(() => sports.value.find(s => s.id === sportId.value)?.name ?? '')

onMounted(async () => {
  try { sports.value = await plansService.getSports() } catch { sports.value = [] }
})

function toggle(s: string) {
  specialties.value = specialties.value.includes(s) ? specialties.value.filter(x => x !== s) : [...specialties.value, s]
}

async function save() {
  if (!authStore.profile) return
  saving.value = true
  error.value = ''
  try {
    await saveCoachProfile(authStore.profile.id, {
      bio: bio.value.trim(),
      sportId: sportId.value,
      experienceYears: years.value,
      specialties: specialties.value,
    })
    await authStore.fetchProfile()
    emit('next')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save your profile'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-2">
      <h1 class="font-display text-3xl font-bold text-gray-900">Set up your coach profile</h1>
      <p class="text-base text-gray-600">Athletes and followers see this. You can change it any time.</p>
    </div>

    <div class="flex flex-wrap gap-10 items-start">
      <form class="flex-[3_1_420px] min-w-0 flex flex-col gap-5" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
            Sport / discipline
            <select v-model="sportId" class="input font-normal text-base">
              <option :value="null">Choose your sport</option>
              <option v-for="s in sports" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
            Years coaching
            <input v-model.number="years" type="number" min="0" max="60" inputmode="numeric" class="input font-normal text-base" />
          </label>
        </div>
        <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
          Short bio
          <textarea v-model="bio" rows="3" maxlength="280" class="input font-normal text-base resize-y" placeholder="Former sprinter. Coaching the next generation of speed athletes."></textarea>
        </label>
        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-semibold text-gray-700 mb-2">Who do you coach?</legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="s in SPECIALTIES"
              :key="s"
              type="button"
              :aria-pressed="specialties.includes(s)"
              :class="['min-h-[40px] px-4 rounded-full text-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400', specialties.includes(s) ? 'border-summit-800 bg-summit-50 text-summit-900 font-semibold' : 'border-gray-300 bg-white text-gray-700']"
              @click="toggle(s)"
            >{{ s }}</button>
          </div>
        </fieldset>
        <p v-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
        <div>
          <button type="submit" :disabled="saving" class="btn-primary min-h-[52px] px-7 text-base disabled:opacity-50">{{ saving ? 'Saving…' : 'Continue' }}</button>
        </div>
      </form>

      <section aria-label="Profile preview" class="flex-[2_1_300px] min-w-0 hidden md:flex flex-col gap-3">
        <span class="text-xs font-semibold tracking-wider uppercase text-gray-500">Preview — how others see you</span>
        <div class="rounded-2xl bg-white border border-gray-200 overflow-hidden">
          <div class="h-20 bg-summit-800"></div>
          <div class="px-6 pb-6 flex flex-col gap-2">
            <img :src="authStore.avatarUrl || '/default-avatar.svg'" alt="" class="w-20 h-20 rounded-full -mt-10 border-4 border-white bg-gray-200 object-cover" />
            <div class="flex items-center gap-2">
              <span class="font-display text-xl font-bold text-gray-900">{{ authStore.displayName }}</span>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">COACH</span>
            </div>
            <span class="text-sm text-gray-600">@{{ authStore.profile?.username }}<template v-if="sportName"> · {{ sportName }}</template></span>
            <p class="text-sm text-gray-700 leading-relaxed">{{ bio || 'Your bio appears here.' }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
