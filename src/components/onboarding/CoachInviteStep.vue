<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getOrCreateInviteCode } from '@/services/athletes'

const emit = defineEmits<{ (e: 'next'): void }>()
const authStore = useAuthStore()

const link = ref('')
const loadingLink = ref(true)
const linkError = ref('')
const copied = ref(false)
const emailInput = ref('')
const emails = ref<string[]>([])

const seats = computed(() => {
  const sub = authStore.coachSubscription
  return (sub?.athlete_limit ?? 20) + (sub?.bonus_seats_granted ?? 0)
})
const mailto = computed(() => {
  const subject = encodeURIComponent('Join me on CoachHub')
  const body = encodeURIComponent(`I'd like you to train with me on CoachHub. Join here:\n${link.value}`)
  return `mailto:?bcc=${encodeURIComponent(emails.value.join(','))}&subject=${subject}&body=${body}`
})

onMounted(async () => {
  if (!authStore.profile) return
  try {
    const code = await getOrCreateInviteCode(authStore.profile.id)
    link.value = `${window.location.origin}/invite/${code}`
  } catch {
    linkError.value = "Couldn't create your invite link. You can do this later from Athletes."
  } finally {
    loadingLink.value = false
  }
})

function addEmails() {
  const found = emailInput.value.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
  emails.value = [...new Set([...emails.value, ...found])]
  emailInput.value = ''
}

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* clipboard blocked: the link is selectable */ }
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-2">
      <h1 class="font-display text-3xl font-bold text-gray-900">Bring your athletes in</h1>
      <p class="text-base text-gray-600">Share one link, or email it. You can always do this later.</p>
    </div>

    <div class="flex flex-wrap gap-6 items-start">
      <div class="flex-[3_1_440px] min-w-0 flex flex-col gap-5">
        <section class="p-6 rounded-2xl bg-white border border-gray-200 flex flex-col gap-3">
          <h2 class="font-display text-xl font-semibold">Your invite link</h2>
          <p v-if="loadingLink" class="text-sm text-gray-500">Creating your link…</p>
          <p v-else-if="linkError" class="text-sm text-red-700">{{ linkError }}</p>
          <div v-else class="flex flex-wrap items-center gap-3">
            <span class="flex-1 min-w-0 text-sm text-gray-700 break-all bg-gray-50 rounded-lg px-3 py-2.5 select-all">{{ link }}</span>
            <button type="button" class="btn-secondary min-h-[44px]" @click="copy">{{ copied ? 'Copied' : 'Copy link' }}</button>
          </div>
          <p class="text-xs text-gray-500">Athletes who open it create a free account and join your roster.</p>
        </section>

        <section class="p-6 rounded-2xl bg-white border border-gray-200 flex flex-col gap-3">
          <h2 class="font-display text-xl font-semibold">Email it</h2>
          <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
            Email addresses — paste a list or add one at a time
            <span class="flex gap-2">
              <input v-model="emailInput" type="email" multiple placeholder="athlete@email.com" class="input flex-1 min-w-0 font-normal text-base" @keydown.enter.prevent="addEmails" />
              <button type="button" class="btn bg-gray-900 text-white min-h-[44px] px-5" @click="addEmails">Add</button>
            </span>
          </label>
          <ul v-if="emails.length" class="flex flex-wrap gap-2">
            <li v-for="e in emails" :key="e" class="flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-gray-100 text-sm">
              {{ e }}
              <button type="button" :aria-label="`Remove ${e}`" class="w-7 h-7 rounded-full hover:bg-gray-200 flex items-center justify-center" @click="emails = emails.filter(x => x !== e)">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          </ul>
          <a v-if="emails.length && link" :href="mailto" class="btn-secondary self-start min-h-[44px]">Open email to {{ emails.length }} {{ emails.length === 1 ? 'person' : 'people' }}</a>
          <p class="text-xs text-gray-500">Opens your email app with the invite ready to send.</p>
        </section>
      </div>

      <aside aria-label="Your plan" class="flex-[2_1_280px] min-w-0 p-6 rounded-2xl bg-summit-50 border border-summit-200 flex flex-col gap-3">
        <span class="text-xs font-semibold tracking-wider uppercase text-summit-800">Your plan</span>
        <div class="flex items-baseline gap-2"><span class="font-display text-4xl font-bold">{{ seats }}</span><span class="text-gray-600">athlete seats</span></div>
        <p class="text-sm text-gray-700 leading-relaxed">Coaching a whole squad? The Team plan has unlimited athletes.</p>
        <router-link to="/pricing" class="text-sm font-semibold text-summit-800 hover:text-summit-900">Compare plans</router-link>
      </aside>
    </div>

    <div class="flex flex-wrap items-center gap-4">
      <button type="button" class="btn-primary min-h-[52px] px-7 text-base" @click="emit('next')">Continue</button>
      <button type="button" class="text-sm font-semibold text-summit-800 px-2 min-h-[44px]" @click="emit('next')">Skip for now</button>
    </div>
  </div>
</template>
