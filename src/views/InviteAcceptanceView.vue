<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  decodeInviteCode,
  fetchCoachProfile,
  acceptInvitation,
  checkExistingRelationship
} from '@/services/invites'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(true)
const error = ref<string | null>(null)
const coachProfile = ref<any>(null)
const coachId = ref<string | null>(null)
const inviteCode = ref<string>('')
const alreadyConnected = ref(false)

onMounted(async () => {
  try {
    inviteCode.value = route.params.code as string

    if (!inviteCode.value) {
      throw new Error('No invite code provided')
    }

    // Decode to get coach ID
    coachId.value = decodeInviteCode(inviteCode.value)

    if (!coachId.value) {
      throw new Error('Invalid invite code')
    }

    // Fetch coach profile
    coachProfile.value = await fetchCoachProfile(coachId.value)

    // If user is already logged in as an athlete, check/create relationship
    if (authStore.profile?.id && authStore.profile.user_type === 'athlete') {
      const existing = await checkExistingRelationship(coachId.value, authStore.profile.id)
      if (existing) {
        alreadyConnected.value = true
      } else {
        await acceptInvitation(coachId.value, authStore.profile.id, inviteCode.value)
        alreadyConnected.value = true
      }
    }
  } catch (err: any) {
    error.value = err.message || 'This invitation link is invalid or has expired'
  } finally {
    loading.value = false
  }
})

function handleCreateAccount() {
  sessionStorage.setItem(
    'pending_invite',
    JSON.stringify({
      coach_id: coachId.value,
      invite_code: inviteCode.value,
      coach_name: coachProfile.value?.display_name,
    })
  )

  router.push({
    name: 'signup',
    query: { userType: 'athlete', invite: 'true' },
  })
}

function handleLogin() {
  sessionStorage.setItem(
    'pending_invite',
    JSON.stringify({
      coach_id: coachId.value,
      invite_code: inviteCode.value,
      coach_name: coachProfile.value?.display_name,
    })
  )

  router.push({
    name: 'login',
    query: { invite: 'true' },
  })
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-summit-600 to-valencia-600 flex items-center justify-center p-4">
    <!-- Loading State -->
    <div v-if="loading" class="text-center">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto"></div>
      <p class="text-white mt-4">Loading invitation...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
      <svg class="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h2>
      <p class="text-gray-600 mb-6">{{ error }}</p>
      <router-link
        to="/"
        class="inline-block bg-summit-600 text-white px-6 py-3 rounded-lg hover:bg-summit-700 transition"
      >
        Go to Home
      </router-link>
    </div>

    <!-- Success State - Show Coach Info -->
    <div v-else-if="coachProfile" class="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
      <!-- Coach Avatar -->
      <div class="text-center mb-6">
        <img
          :src="coachProfile.avatar_url || 'https://via.placeholder.com/120'"
          :alt="coachProfile.display_name"
          class="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-summit-100"
        />
        <h2 class="text-2xl font-bold text-gray-900 mb-1">
          You're Invited!
        </h2>
        <p class="text-gray-600">
          <span class="font-semibold text-summit-600">{{ coachProfile.display_name }}</span>
          has invited you to train with them
        </p>
      </div>

      <!-- Coach Bio -->
      <div v-if="coachProfile.bio" class="bg-gray-50 rounded-lg p-4 mb-6">
        <p class="text-sm text-gray-700 italic">"{{ coachProfile.bio }}"</p>
      </div>

      <!-- Already Connected Message -->
      <div v-if="alreadyConnected" class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-800">
          You're already connected with this coach!
        </p>
      </div>

      <!-- Action Buttons -->
      <div v-if="!alreadyConnected" class="space-y-3">
        <button
          @click="handleCreateAccount"
          class="w-full bg-summit-600 text-white px-6 py-3 rounded-lg hover:bg-summit-700 transition font-medium flex items-center justify-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Create Account & Accept
        </button>

        <button
          @click="handleLogin"
          class="w-full bg-white text-summit-600 px-6 py-3 rounded-lg hover:bg-gray-50 transition font-medium border-2 border-summit-600 flex items-center justify-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          I Have an Account
        </button>
      </div>

      <!-- Already Connected - Go to Dashboard -->
      <div v-else>
        <router-link
          to="/athlete/hub"
          class="block w-full bg-summit-600 text-white px-6 py-3 rounded-lg hover:bg-summit-700 transition font-medium text-center"
        >
          Go to Dashboard
        </router-link>
      </div>

      <!-- Decline Link -->
      <div v-if="!alreadyConnected" class="text-center mt-6">
        <router-link to="/" class="text-sm text-gray-500 hover:text-gray-700">
          No thanks, take me home
        </router-link>
      </div>
    </div>
  </div>
</template>
