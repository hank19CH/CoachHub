<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import AppLayout from '@/components/layout/AppLayout.vue'
import AuthLayout from '@/components/layout/AuthLayout.vue'

const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()

onMounted(() => {
  authStore.initialize()
})

// Initialize notifications when user is authenticated
watch(
  () => authStore.user,
  (user) => {
    if (user) {
      notificationsStore.fetchNotifications()
      notificationsStore.subscribeToNotifications(user.id)
    } else {
      notificationsStore.$reset()
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  notificationsStore.unsubscribeFromNotifications()
})
</script>

<template>
  <!-- Loading state while auth initializes -->
  <div 
    v-if="authStore.loading" 
    class="min-h-screen flex items-center justify-center gradient-summit"
  >
    <div class="text-center">
      <div class="w-16 h-16 mx-auto mb-4">
        <!-- Mountain Logo Placeholder -->
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
          <path 
            d="M32 8L52 48H12L32 8Z" 
            fill="white" 
            fill-opacity="0.9"
          />
          <path 
            d="M32 8L42 28L32 24L22 28L32 8Z" 
            fill="white"
          />
        </svg>
      </div>
      <p class="text-white/80 font-medium animate-pulse-subtle">Loading...</p>
    </div>
  </div>

  <!-- Auth pages (login/signup) -->
  <AuthLayout v-else-if="!authStore.isAuthenticated">
    <RouterView />
  </AuthLayout>

  <!-- Main app layout (authenticated) -->
  <AppLayout v-else>
    <RouterView />
  </AppLayout>
</template>
