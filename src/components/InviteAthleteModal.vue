<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg max-w-md w-full p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Invite Athlete</h2>
        <button
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-600 transition"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-summit-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8">
        <p class="text-red-600 mb-4">{{ error }}</p>
        <button
          @click="generateLink"
          class="bg-summit-600 text-white px-6 py-2 rounded-lg hover:bg-summit-700 transition"
        >
          Try Again
        </button>
      </div>

      <!-- Success State -->
      <div v-else>
        <p class="text-gray-600 mb-4">
          Share this link with your athlete. They'll be able to create an account and automatically join your roster.
        </p>

        <!-- Invite Link Display -->
        <div class="bg-gray-50 rounded-lg p-4 mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Invite Link</label>
          <div class="flex gap-2">
            <input
              ref="linkInput"
              type="text"
              :value="inviteLink"
              readonly
              class="flex-1 px-3 py-2 border rounded-lg bg-white text-sm"
            />
            <button
              @click="copyToClipboard"
              class="bg-summit-600 text-white px-4 py-2 rounded-lg hover:bg-summit-700 transition flex items-center gap-2"
            >
              <svg v-if="!copied" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>

        <!-- Invite Code Display -->
        <div class="bg-summit-50 rounded-lg p-4 mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">Invite Code</label>
          <div class="text-3xl font-bold text-summit-600 tracking-wider text-center">
            {{ inviteCode }}
          </div>
          <p class="text-xs text-gray-500 text-center mt-2">
            Athletes can also enter this code during signup
          </p>
        </div>

        <!-- Share Options -->
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-700 mb-2">Share via:</p>
          <div class="grid grid-cols-2 gap-2">
            <button
              @click="shareViaEmail"
              class="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email
            </button>
            <button
              @click="shareViaSMS"
              class="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              SMS
            </button>
          </div>
        </div>

        <!-- Close Button -->
        <button
          @click="$emit('close')"
          class="w-full mt-6 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition font-medium"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getOrCreateInviteCode } from '@/services/athletes'

defineEmits<{
  close: []
}>()

const authStore = useAuthStore()
const loading = ref(true)
const error = ref<string | null>(null)
const inviteCode = ref('')
const copied = ref(false)
const linkInput = ref<HTMLInputElement | null>(null)

const inviteLink = ref('')

async function generateLink() {
  loading.value = true
  error.value = null
  
  try {
    if (!authStore.profile?.id) {
      throw new Error('User not authenticated')
    }

    const code = await getOrCreateInviteCode(authStore.profile.id)
    inviteCode.value = code
    
    // Build the invite link
    const baseUrl = window.location.origin
    inviteLink.value = `${baseUrl}/signup?invite=${code}`
  } catch (err) {
    console.error('Error generating invite code:', err)
    error.value = 'Failed to generate invite link. Please try again.'
  } finally {
    loading.value = false
  }
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    // Fallback for older browsers
    linkInput.value?.select()
    document.execCommand('copy')
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}

function shareViaEmail() {
  const subject = encodeURIComponent(`Join me on CoachHub!`)
  const body = encodeURIComponent(
    `I'd like to invite you to join my athlete roster on CoachHub.\n\nClick this link to get started:\n${inviteLink.value}\n\nOr use invite code: ${inviteCode.value}`
  )
  window.location.href = `mailto:?subject=${subject}&body=${body}`
}

function shareViaSMS() {
  const message = encodeURIComponent(
    `Join my athlete roster on CoachHub! ${inviteLink.value}`
  )
  window.location.href = `sms:?body=${message}`
}

onMounted(() => {
  generateLink()
})
</script>