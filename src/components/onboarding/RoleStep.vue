<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { acceptInviteCode } from '@/services/athletes'
import { reportError } from '@/utils/errorReporting'
import type { UserType } from '@/types/database'

const emit = defineEmits<{ (e: 'created', type: UserType): void }>()
const authStore = useAuthStore()

const ROLES: { type: UserType; title: string; line: string }[] = [
  { type: 'coach', title: 'Coach', line: 'Build programs, manage athletes and teams.' },
  { type: 'athlete', title: 'Athlete', line: "Follow your coach's plan or train on your own." },
  { type: 'follower', title: 'Follower', line: 'Stay fit, share workouts, follow athletes and teams.' },
]

const role = ref<UserType>('coach')
const displayName = ref('')
const username = ref('')
const inviteCode = ref<string | null>(null)
const saving = ref(false)
const error = ref('')

const cleanUsername = computed(() => username.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
const canSubmit = computed(() => displayName.value.trim().length > 0 && cleanUsername.value.length >= 3 && !saving.value)

onMounted(() => {
  const meta = (authStore.user?.user_metadata ?? {}) as Record<string, string | undefined>
  displayName.value = meta.display_name ?? meta.full_name ?? meta.name ?? ''
  username.value = (meta.username ?? authStore.user?.email?.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
  try { inviteCode.value = sessionStorage.getItem('pending_invite_code') } catch { /* storage unavailable */ }
  if (inviteCode.value) role.value = 'athlete'
})

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = ''
  const result = await authStore.createProfile(role.value, displayName.value.trim(), cleanUsername.value)
  if (!result.success) {
    error.value = result.error ?? 'Could not create your profile'
    saving.value = false
    return
  }
  if (inviteCode.value && role.value === 'athlete' && authStore.profile) {
    try {
      await acceptInviteCode(inviteCode.value, authStore.profile.id)
    } catch (e) {
      reportError(e, 'accept invite')
    }
    try { sessionStorage.removeItem('pending_invite_code') } catch { /* storage unavailable */ }
  }
  saving.value = false
  emit('created', role.value)
}
</script>

<template>
  <form class="flex flex-col gap-8" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <h1 class="font-display text-3xl lg:text-4xl font-bold text-gray-900">Welcome to CoachHub</h1>
      <p class="text-lg text-gray-600">Train, coach and follow — all in one place. How will you use it?</p>
    </div>

    <p v-if="inviteCode" class="rounded-xl bg-summit-50 text-summit-900 px-4 py-3 text-sm">
      You're joining from a coach's invite — we've picked <strong>Athlete</strong> for you.
    </p>

    <fieldset class="grid gap-3 sm:grid-cols-3">
      <legend class="sr-only">Account type</legend>
      <button
        v-for="r in ROLES"
        :key="r.type"
        type="button"
        :aria-pressed="role === r.type"
        :class="[
          'text-left rounded-2xl p-5 flex flex-col gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2',
          role === r.type ? 'border-2 border-summit-800 bg-summit-50' : 'border border-gray-200 bg-white hover:border-summit-300',
        ]"
        @click="role = r.type"
      >
        <span class="font-display text-xl font-semibold text-gray-900">{{ r.title }}</span>
        <span class="text-sm text-gray-600 leading-snug">{{ r.line }}</span>
      </button>
    </fieldset>

    <div class="grid gap-4 sm:grid-cols-2 max-w-2xl">
      <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
        Your name
        <input v-model="displayName" type="text" autocomplete="name" required class="input font-normal text-base" />
      </label>
      <label class="flex flex-col gap-1.5 text-sm font-semibold text-gray-700">
        Username
        <input v-model="username" type="text" autocomplete="username" required minlength="3" class="input font-normal text-base" />
        <span class="text-xs font-normal text-gray-500">@{{ cleanUsername || 'username' }}</span>
      </label>
    </div>

    <p v-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 max-w-2xl">{{ error }}</p>

    <div class="flex flex-wrap items-center gap-4">
      <button type="submit" :disabled="!canSubmit" class="btn-primary min-h-[52px] px-7 text-base disabled:opacity-50">
        {{ saving ? 'Creating your account…' : `Continue as ${ROLES.find(r => r.type === role)?.title}` }}
      </button>
      <span v-if="role === 'coach'" class="text-sm text-gray-600">14-day free trial · No card needed</span>
    </div>
  </form>
</template>
