<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()

// CLEAN 5-TAB STRUCTURE - Same for all users, different destinations based on role
const navItems = computed(() => [
  {
    name: 'feed',
    path: '/',
    label: 'Home',
    icon: 'home'
  },
  {
    name: 'hub',
    path: authStore.isCoach ? '/coach/hub' : '/athlete/hub',
    label: 'Hub',
    icon: 'grid'
  },
  {
    name: 'create',
    path: '/create',
    label: 'Create',
    icon: 'plus',
    isCreate: true
  },
  {
    name: 'notifications',
    path: '/notifications',
    label: 'Activity',
    icon: 'bell'
  },
  {
    name: 'profile',
    path: '/profile',
    label: 'Profile',
    icon: 'user'
  }
])

function isActive(itemName: string, itemPath: string) {
  if (itemName === 'feed') {
    return route.path === '/'
  }
  if (itemName === 'hub') {
    return route.path.startsWith('/coach/hub') || route.path.startsWith('/athlete/hub')
  }
  return route.path.startsWith(itemPath)
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-feed-border safe-bottom">
    <div class="max-w-lg mx-auto px-2">
      <div class="flex items-center justify-around h-16">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="item.path"
          class="flex flex-col items-center justify-center w-16 h-full transition-colors"
          :class="[
            isActive(item.name, item.path) 
              ? 'text-summit-800' 
              : 'text-gray-500 hover:text-gray-700'
          ]"
        >
          <!-- Create button (special styling) -->
          <template v-if="item.isCreate">
            <div class="w-10 h-10 rounded-xl gradient-summit flex items-center justify-center shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </template>

          <!-- Regular nav items -->
          <template v-else>
            <!-- Home icon -->
            <svg v-if="item.icon === 'home'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>

            <!-- Grid icon (Hub for both coaches and athletes) -->
            <svg v-else-if="item.icon === 'grid'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>

            <!-- Bell icon (Notifications) -->
            <svg v-else-if="item.icon === 'bell'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>

            <!-- User icon (Profile) -->
            <svg v-else-if="item.icon === 'user'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>

            <span class="text-xs mt-1 font-medium">{{ item.label }}</span>
          </template>
        </router-link>
      </div>
    </div>
  </nav>
</template>
