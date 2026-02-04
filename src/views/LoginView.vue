<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const isSubmitting = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  if (!email.value || !password.value) {
    errorMessage.value = 'Please fill in all fields'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  const result = await authStore.signIn(email.value, password.value)

  if (result.success) {
    // Redirect to intended page or feed
    const redirect = route.query.redirect as string
    router.push(redirect || '/')
  } else {
    errorMessage.value = result.error || 'Sign in failed'
  }

  isSubmitting.value = false
}
</script>

<template>
  <div class="bg-white rounded-2xl shadow-elevated p-6 animate-fade-in">
    <h2 class="font-display text-2xl font-bold text-gray-900 mb-6 text-center">
      Welcome back
    </h2>

    <form @submit.prevent="handleSubmit" class="space-y-4">
      <!-- Error message -->
      <div 
        v-if="errorMessage" 
        class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
      >
        {{ errorMessage }}
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
            autocomplete="current-password"
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
      </div>

      <!-- Forgot password link -->
      <div class="text-right">
        <a href="#" class="text-sm text-summit-700 hover:text-summit-800 font-medium">
          Forgot password?
        </a>
      </div>

      <!-- Submit button -->
      <button
        type="submit"
        class="btn-primary w-full"
        :disabled="isSubmitting"
      >
        <span v-if="isSubmitting" class="flex items-center gap-2">
          <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Signing in...
        </span>
        <span v-else>Sign In</span>
      </button>
    </form>

    <!-- Divider -->
    <div class="flex items-center gap-4 my-6">
      <div class="flex-1 h-px bg-gray-200"></div>
      <span class="text-gray-500 text-sm">or</span>
      <div class="flex-1 h-px bg-gray-200"></div>
    </div>

    <!-- Sign up link -->
    <p class="text-center text-gray-600">
      Don't have an account?
      <router-link to="/signup" class="text-summit-700 hover:text-summit-800 font-semibold">
        Sign up
      </router-link>
    </p>
  </div>
</template>
