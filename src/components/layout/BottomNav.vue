<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const navItems = computed(() => {
  const base = [
    { 
      name: 'feed', 
      path: '/', 
      label: 'Home',
      icon: 'home'
    },
    { 
      name: 'explore', 
      path: '/explore', 
      label: 'Explore',
      icon: 'search'
    },
    { 
      name: 'create', 
      path: '/create', 
      label: 'Create',
      icon: 'plus',
      isCreate: true
    },
  ]

  // Add role-specific nav items
  if (authStore.isCoach) {
    base.push({
      name: 'athletes',
      path: '/athletes',
      label: 'Athletes',
      icon: 'users'
    })
  } else if (authStore.isAthlete) {
    base.push({
      name: 'workouts',
      path: '/workouts',
      label: 'Workouts',
      icon: 'activity'
    })
  } else {
    base.push({
      name: 'notifications',
      path: '/notifications',
      label: 'Activity',
      icon: 'heart'
    })
  }

  // Profile always last
  base.push({
    name: 'my-profile',
    path: '/profile',
    label: 'Profile',
    icon: 'user'
  })

  return base
})

function isActive(itemName: string, itemPath: string) {
  if (itemName === 'feed') {
    return route.path === '/'
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

            <!-- Search icon -->
            <svg v-else-if="item.icon === 'search'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>

            <!-- Users icon (for coaches) -->
            <svg v-else-if="item.icon === 'users'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>

            <!-- Activity icon (for athletes) -->
            <svg v-else-if="item.icon === 'activity'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>

            <!-- Heart icon (notifications) -->
            <svg v-else-if="item.icon === 'heart'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>

            <!-- User icon (profile) -->
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
