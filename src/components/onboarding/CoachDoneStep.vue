<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { reportError } from '@/utils/errorReporting'
import type { FirstWeekChoice } from './CoachFirstWeekStep.vue'

const props = defineProps<{ firstWeek: FirstWeekChoice | null }>()
const authStore = useAuthStore()

const trialEnds = computed(() => {
  const at = authStore.coachSubscription?.trial_ends_at
  return at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : null
})
const firstName = computed(() => authStore.displayName.split(' ')[0])

const primary = computed(() => {
  const fw = props.firstWeek
  if (fw?.mode === 'template') return { title: 'Shape your block', line: `${fw.name} is your Week 1 — pick a shape and generate the rest.`, to: `/coach/planner/${fw.planId}?model=1`, cta: 'Open Block Modeler' }
  if (fw?.mode === 'import') return { title: 'Import your program', line: 'Upload a spreadsheet or PDF and review what CoachHub finds.', to: '/coach/import', cta: 'Smart Import' }
  return { title: 'Build your first week', line: 'Create a plan and build Week 1 in the Planner.', to: '/coach/planner', cta: 'Open Planner' }
})

onMounted(async () => {
  try {
    await authStore.completeOnboarding()
  } catch (e) {
    reportError(e, 'complete onboarding')
  }
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-2">
      <h1 class="font-display text-4xl font-bold text-gray-900">You're in, {{ firstName }}.</h1>
      <p class="text-lg text-gray-600">Here's where to start.</p>
    </div>

    <div class="flex flex-wrap gap-6 items-start">
      <section v-if="authStore.coachSubscription" aria-label="Your trial" class="flex-[2_1_300px] min-w-0 rounded-2xl bg-summit-800 text-white p-7 flex flex-col gap-4">
        <span class="text-xs font-semibold tracking-wider uppercase text-amber-200">{{ authStore.isSubscribed ? 'Free trial active' : 'Your plan' }}</span>
        <span class="font-display text-2xl font-bold">All Coach features unlocked</span>
        <ul class="flex flex-col gap-2 text-sm">
          <li>Up to {{ (authStore.coachSubscription.athlete_limit ?? 0) + (authStore.coachSubscription.bonus_seats_granted ?? 0) }} athletes</li>
          <li v-if="authStore.isBetaUser">Founding price locked in</li>
        </ul>
        <span v-if="trialEnds" class="text-sm text-summit-100">Trial ends {{ trialEnds }}</span>
      </section>

      <section aria-label="Next steps" class="flex-[3_1_420px] min-w-0 flex flex-col gap-3">
        <h2 class="font-display text-xl font-semibold">Your next steps</h2>
        <div class="flex flex-wrap items-center gap-4 p-5 rounded-2xl bg-white border-2 border-summit-800">
          <div class="flex-1 min-w-[200px] flex flex-col gap-0.5"><strong>{{ primary.title }}</strong><span class="text-sm text-gray-600">{{ primary.line }}</span></div>
          <router-link :to="primary.to" class="btn-primary min-h-[44px]">{{ primary.cta }}</router-link>
        </div>
        <div class="flex flex-wrap items-center gap-4 p-5 rounded-2xl bg-white border border-gray-200">
          <div class="flex-1 min-w-[200px] flex flex-col gap-0.5"><strong>Invite athletes</strong><span class="text-sm text-gray-600">Share your invite link from the Athletes page any time.</span></div>
          <router-link to="/coach/athletes" class="text-sm font-semibold text-summit-800 px-2 min-h-[44px] inline-flex items-center">Athletes</router-link>
        </div>
        <div class="flex flex-wrap items-center gap-4 p-5 rounded-2xl bg-white border border-gray-200">
          <div class="flex-1 min-w-[200px] flex flex-col gap-0.5"><strong>Post your first update</strong><span class="text-sm text-gray-600">Introduce yourself to your athletes and followers.</span></div>
          <router-link to="/create" class="text-sm font-semibold text-summit-800 px-2 min-h-[44px] inline-flex items-center">Write a post</router-link>
        </div>
      </section>
    </div>

    <div><router-link to="/coach/hub" class="btn-secondary min-h-[52px] px-7 text-base">Go to my Coach Hub</router-link></div>
  </div>
</template>
