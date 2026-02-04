<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { UserType } from '@/types/database'

const router = useRouter()
const authStore = useAuthStore()

// Form state
const step = ref(1) // 1 = user type, 2 = details
const userType = ref<UserType | null>(null)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const displayName = ref('')
const username = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

const userTypes = [
  {
    type: 'coach' as UserType,
    title: 'Coach',
    description: 'Create programs, manage athletes, and share your coaching journey',
    icon: 'clipboard'
  },
  {
    type: 'athlete' as UserType,
    title: 'Athlete',
    description: 'Train with coaches, track progress, and share your achievements',
    icon: 'lightning'
  },
  {
    type: 'follower' as UserType,
    title: 'Follower',
    description: 'Follow athletes and coaches, engage with their journey',
    icon: 'users'
  }
]

// Computed
const usernamePreview = computed(() => {
  if (!username.value) return '@username'
  return '@' + username.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
})

const passwordsMatch = computed(() => {
  return password.value === confirmPassword.value
})

const canSubmit = computed(() => {
  return (
    email.value &&
    password.value &&
    password.value.length >= 8 &&
    passwordsMatch.value &&
    displayName.value &&
    username.value.length >= 3
  )
})

// Methods
function selectUserType(type: UserType) {
  userType.value = type
  step.value = 2
}

function goBack() {
  step.value = 1
  errorMessage.value = ''
}

async function handleSubmit() {
  if (!canSubmit.value || !userType.value) return

  isSubmitting.value = true
  errorMessage.value = ''

  const result = await authStore.signUp(
    email.value,
    password.value,
    userType.value,
    displayName.value,
    username.value
  )

  if (result.success) {
    router.push('/')
  } else {
    errorMessage.value = result.error || 'Signup failed'
  }

  isSubmitting.value = false
}
</script>

<template>
  <div class="bg-white rounded-2xl shadow-elevated p-6 animate-fade-in">
    <!-- Step 1: Choose user type -->
    <template v-if="step === 1">
      <h2 class="font-display text-2xl font-bold text-gray-900 mb-2 text-center">
        Join CoachHub
      </h2>
      <p class="text-gray-600 text-center mb-6">
        How do you want to use CoachHub?
      </p>

      <div class="space-y-3">
        <button
          v-for="ut in userTypes"
          :key="ut.type"
          @click="selectUserType(ut.type)"
          class="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-summit-500 hover:bg-summit-50 transition-all text-left group"
        >
          <div class="flex items-start gap-4">
            <!-- Icon -->
            <div class="w-12 h-12 rounded-xl bg-summit-100 flex items-center justify-center flex-shrink-0 group-hover:bg-summit-200 transition-colors">
              <!-- Clipboard (Coach) -->
              <svg v-if="ut.icon === 'clipboard'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <!-- Lightning (Athlete) -->
              <svg v-else-if="ut.icon === 'lightning'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <!-- Users (Follower) -->
              <svg v-else-if="ut.icon === 'users'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>

            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 group-hover:text-summit-800">
                {{ ut.title }}
              </h3>
              <p class="text-sm text-gray-600 mt-0.5">
                {{ ut.description }}
              </p>
            </div>

            <!-- Arrow -->
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 group-hover:text-summit-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      <!-- Sign in link -->
      <p class="text-center text-gray-600 mt-6">
        Already have an account?
        <router-link to="/login" class="text-summit-700 hover:text-summit-800 font-semibold">
          Sign in
        </router-link>
      </p>
    </template>

    <!-- Step 2: Account details -->
    <template v-else>
      <!-- Back button -->
      <button 
        @click="goBack" 
        class="flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-4 -ml-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        <span class="text-sm font-medium">Back</span>
      </button>

      <h2 class="font-display text-2xl font-bold text-gray-900 mb-1">
        Create your account
      </h2>
      <p class="text-gray-600 mb-6">
        Signing up as <span class="font-semibold text-summit-700">{{ userType }}</span>
      </p>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Error message -->
        <div 
          v-if="errorMessage" 
          class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
        >
          {{ errorMessage }}
        </div>

        <!-- Display Name -->
        <div>
          <label for="displayName" class="label">Full Name</label>
          <input
            id="displayName"
            v-model="displayName"
            type="text"
            class="input"
            placeholder="Your full name"
            required
          />
        </div>

        <!-- Username -->
        <div>
          <label for="username" class="label">Username</label>
          <input
            id="username"
            v-model="username"
            type="text"
            class="input"
            placeholder="your_username"
            pattern="[a-zA-Z0-9_]+"
            minlength="3"
            required
          />
          <p class="helper-text">{{ usernamePreview }}</p>
        </div>

        <!-- Email -->
        <div>
          <label for="email" class="label">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="input"
            placeholder="you@example.com"
            autocomplete="email"
            required
          />
        </div>

        <!-- Password -->
        <div>
          <label for="password" class="label">Password</label>
          <div class="relative">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="input pr-12"
              placeholder="••••••••"
              minlength="8"
              autocomplete="new-password"
              required
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              <svg v-if="showPassword" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          </div>
          <p class="helper-text">Minimum 8 characters</p>
        </div>

        <!-- Confirm Password -->
        <div>
          <label for="confirmPassword" class="label">Confirm Password</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            class="input"
            :class="{ 'input-error': confirmPassword && !passwordsMatch }"
            placeholder="••••••••"
            required
          />
          <p v-if="confirmPassword && !passwordsMatch" class="error-text">
            Passwords don't match
          </p>
        </div>

        <!-- Submit button -->
        <button
          type="submit"
          class="btn-primary w-full"
          :disabled="!canSubmit || isSubmitting"
        >
          <span v-if="isSubmitting" class="flex items-center gap-2">
            <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Creating account...
          </span>
          <span v-else>Create Account</span>
        </button>

        <!-- Terms -->
        <p class="text-xs text-gray-500 text-center">
          By signing up, you agree to our 
          <a href="#" class="text-summit-700 hover:underline">Terms of Service</a>
          and 
          <a href="#" class="text-summit-700 hover:underline">Privacy Policy</a>.
        </p>
      </form>
    </template>
  </div>
</template>
