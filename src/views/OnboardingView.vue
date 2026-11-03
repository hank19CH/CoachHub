<script setup lang="ts">
/**
 * OnboardingView — Sprint 14.5. Full-screen (no app chrome).
 * No profile yet (e.g. first Google sign-in) → RoleStep creates one.
 * Coaches: profile → invite → first week → done. Athletes: about → bests → connect.
 * The current step survives a reload (sessionStorage); answers are saved as each step completes.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { acceptInviteCode } from '@/services/athletes'
import { reportError } from '@/utils/errorReporting'
import RoleStep from '@/components/onboarding/RoleStep.vue'
import CoachProfileStep from '@/components/onboarding/CoachProfileStep.vue'
import CoachInviteStep from '@/components/onboarding/CoachInviteStep.vue'
import CoachFirstWeekStep, { type FirstWeekChoice } from '@/components/onboarding/CoachFirstWeekStep.vue'
import CoachDoneStep from '@/components/onboarding/CoachDoneStep.vue'
import AthleteAboutStep from '@/components/onboarding/AthleteAboutStep.vue'
import AthleteBestsStep from '@/components/onboarding/AthleteBestsStep.vue'
import AthleteConnectStep from '@/components/onboarding/AthleteConnectStep.vue'
import type { UserType } from '@/types/database'

const router = useRouter()
const authStore = useAuthStore()

const COACH_STEPS = ['Welcome', 'Your profile', 'Invite athletes', 'Your first week', "You're in"]
const ATHLETE_STEPS = ['About you', 'Your bests', 'Your people']
const STEP_KEY = 'coachhub:onboarding-step'

const step = ref(0)
const firstWeek = ref<FirstWeekChoice | null>(null)

const role = computed<UserType | null>(() => authStore.profile?.user_type ?? null)
const isCoachFlow = computed(() => !authStore.profile || role.value === 'coach')

function homeFor(type: UserType | null) {
  return type === 'coach' ? '/coach/hub' : type === 'athlete' ? '/athlete/hub' : '/'
}

onMounted(async () => {
  if (!authStore.needsOnboarding) {
    // An existing athlete who signed in with Google from an invite link: accept it now.
    let code: string | null = null
    try { code = sessionStorage.getItem('pending_invite_code') } catch { /* storage unavailable */ }
    if (code && role.value === 'athlete' && authStore.profile) {
      try { await acceptInviteCode(code, authStore.profile.id) } catch (e) { reportError(e, 'accept invite') }
      try { sessionStorage.removeItem('pending_invite_code') } catch { /* storage unavailable */ }
    }
    router.replace(homeFor(role.value))
    return
  }
  try {
    const saved = Number(sessionStorage.getItem(STEP_KEY))
    if (authStore.profile && Number.isInteger(saved) && saved > 0) step.value = saved
  } catch { /* storage unavailable */ }
  // Coaches start at step 1 once they have a profile (step 0 = Welcome / role).
  if (authStore.profile && role.value === 'coach' && step.value === 0) step.value = 1
})

watch(step, v => { try { sessionStorage.setItem(STEP_KEY, String(v)) } catch { /* storage unavailable */ } })

// RoleStep unmounts the moment the profile exists (v-if above), so its `created`
// emit can't be relied on — react to the profile appearing instead.
watch(() => authStore.profile?.user_type, (type, prev) => {
  if (!type || prev) return
  if (type === 'follower') { router.replace('/'); return }
  step.value = type === 'coach' ? 1 : 0
})
function onFirstWeek(choice: FirstWeekChoice) {
  firstWeek.value = choice
  step.value = 4
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900 font-body">
    <!-- No profile yet: choose a role -->
    <div v-if="!authStore.profile" class="min-h-screen flex flex-col">
      <header class="flex items-center gap-3 px-6 lg:px-10 py-6">
        <span class="w-10 h-10 rounded-xl bg-summit-800 flex items-center justify-center" aria-hidden="true">
          <svg width="24" height="24" viewBox="8 12 24 20"><path d="M8 30 L17 14 L22 22 L25 18 L32 30 Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" /><path d="M14.5 18.5 L17 14 L19.5 18.5" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linejoin="round" /></svg>
        </span>
        <span class="font-display font-bold text-xl">CoachHub</span>
      </header>
      <main class="flex-1 w-full max-w-4xl mx-auto px-6 lg:px-10 pb-16 pt-6">
        <RoleStep />
      </main>
    </div>

    <!-- Coach: rail + content (desktop/tablet first) -->
    <div v-else-if="isCoachFlow" class="min-h-screen flex flex-wrap">
      <aside class="flex-[1_1_260px] max-w-xs bg-white border-r border-gray-200 px-8 py-10 hidden md:flex flex-col gap-10">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-xl bg-summit-800 flex items-center justify-center" aria-hidden="true">
            <svg width="24" height="24" viewBox="8 12 24 20"><path d="M8 30 L17 14 L22 22 L25 18 L32 30 Z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" /><path d="M14.5 18.5 L17 14 L19.5 18.5" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linejoin="round" /></svg>
          </span>
          <span class="flex flex-col"><span class="font-display font-bold text-xl">CoachHub</span><span class="text-sm text-gray-500">Reach Your Summit</span></span>
        </div>
        <ol class="flex flex-col gap-1.5" aria-label="Setup steps">
          <li v-for="(label, i) in COACH_STEPS" :key="label" :aria-current="i === step ? 'step' : undefined" :class="['flex items-center gap-3 px-3 py-2.5 rounded-xl', i === step ? 'bg-summit-50' : '']">
            <span v-if="i < step" class="w-7 h-7 rounded-full bg-summit-100 text-summit-800 flex items-center justify-center" aria-hidden="true">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
            </span>
            <span v-else :class="['w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center', i === step ? 'bg-summit-800 text-white' : 'border-[1.5px] border-gray-300 text-gray-500']">{{ i + 1 }}</span>
            <span :class="i === step ? 'font-semibold text-summit-900' : 'text-gray-600'">{{ label }}<span v-if="i < step" class="sr-only"> (done)</span></span>
          </li>
        </ol>
      </aside>

      <main class="flex-[999_1_560px] min-w-0 px-6 md:px-12 lg:px-16 py-10 md:py-14">
        <p class="md:hidden text-sm font-semibold text-summit-800 mb-6">Step {{ step + 1 }} of {{ COACH_STEPS.length }} · {{ COACH_STEPS[step] }}</p>
        <div class="max-w-5xl">
          <CoachProfileStep v-if="step === 1" @next="step = 2" />
          <CoachInviteStep v-else-if="step === 2" @next="step = 3" />
          <CoachFirstWeekStep v-else-if="step === 3" @next="onFirstWeek" />
          <CoachDoneStep v-else-if="step === 4" :first-week="firstWeek" />
          <div v-if="step > 1 && step < 4" class="mt-6">
            <button type="button" class="text-sm font-semibold text-gray-600 hover:text-gray-900 min-h-[44px]" @click="step--">Back</button>
          </div>
        </div>
      </main>
    </div>

    <!-- Athlete: phone first -->
    <div v-else class="min-h-screen flex justify-center">
      <div class="w-full max-w-md bg-white min-h-screen flex flex-col">
        <header class="flex items-center gap-2 px-2 pt-3">
          <button v-if="step > 0" type="button" aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100" @click="step--">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span v-else class="w-11"></span>
          <div role="progressbar" :aria-valuenow="step + 1" aria-valuemin="1" :aria-valuemax="ATHLETE_STEPS.length" :aria-label="`Step ${step + 1} of ${ATHLETE_STEPS.length}`" class="flex-1 h-1.5 rounded-full bg-summit-100 overflow-hidden">
            <div class="h-full bg-summit-800 transition-all" :style="{ width: `${((step + 1) / ATHLETE_STEPS.length) * 100}%` }"></div>
          </div>
          <button v-if="step === 1" type="button" class="text-sm font-semibold text-summit-800 px-3 min-h-[44px]" @click="step = 2">Skip</button>
          <span v-else class="w-4"></span>
        </header>
        <main class="flex-1 flex flex-col px-6 pt-5 pb-8">
          <AthleteAboutStep v-if="step === 0" @next="step = 1" />
          <AthleteBestsStep v-else-if="step === 1" @next="step = 2" />
          <AthleteConnectStep v-else class="flex-1" />
        </main>
      </div>
    </div>
  </div>
</template>
