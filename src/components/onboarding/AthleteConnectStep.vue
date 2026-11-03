<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { followUser } from '@/services/social'
import { getTeammates, type Teammate } from '@/services/onboarding'
import { reportError } from '@/utils/errorReporting'

const router = useRouter()
const authStore = useAuthStore()

const people = ref<Teammate[]>([])
const following = ref<Set<string>>(new Set())
const loading = ref(true)
const finishing = ref(false)

onMounted(async () => {
  if (authStore.profile) {
    try { people.value = await getTeammates(authStore.profile.id) } catch { people.value = [] }
  }
  loading.value = false
})

async function follow(p: Teammate) {
  if (!authStore.profile || following.value.has(p.id)) return
  const result = await followUser(authStore.profile.id, p.id, p.is_private)
  if (result) following.value = new Set([...following.value, p.id])
}

async function followAll() {
  for (const p of people.value) await follow(p)
}

async function finish() {
  finishing.value = true
  try {
    await authStore.completeOnboarding()
  } catch (e) {
    reportError(e, 'complete onboarding')
  }
  router.push('/athlete/hub')
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-1.5">
      <h1 class="font-display text-2xl font-bold text-gray-900">Follow your people</h1>
      <p class="text-sm text-gray-600">See their sessions, PBs and updates in your feed.</p>
    </div>

    <p v-if="loading" class="text-sm text-gray-500">Finding your coach and teammates…</p>
    <ul v-else-if="people.length" class="flex flex-col gap-3">
      <li v-for="p in people" :key="p.id" class="flex items-center gap-3">
        <img :src="p.avatar_url || '/default-avatar.svg'" alt="" class="w-11 h-11 rounded-full object-cover bg-gray-200" />
        <span class="flex-1 min-w-0 flex flex-col">
          <strong class="text-sm truncate">{{ p.display_name }}</strong>
          <span class="text-xs text-gray-600">{{ p.role === 'coach' ? 'Your coach' : `@${p.username}` }}</span>
        </span>
        <button
          type="button"
          :aria-pressed="following.has(p.id)"
          :class="['min-h-[40px] px-4 rounded-full text-sm font-semibold', following.has(p.id) ? 'border border-summit-800 bg-summit-50 text-summit-900' : 'bg-summit-800 text-white']"
          @click="follow(p)"
        >{{ following.has(p.id) ? (p.is_private ? 'Requested' : 'Following') : 'Follow' }}</button>
      </li>
    </ul>
    <p v-else class="text-sm text-gray-600 bg-gray-50 rounded-lg px-3.5 py-3">No teammates here yet. You can find people to follow on the Explore page any time.</p>

    <button v-if="people.length > 1" type="button" class="self-start text-sm font-semibold text-summit-800 min-h-[44px]" @click="followAll">Follow everyone</button>

    <button type="button" :disabled="finishing" class="btn-primary min-h-[52px] text-base mt-auto disabled:opacity-50" @click="finish">Take me to my plan</button>
  </div>
</template>
