<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const authStore = useAuthStore()

const coachNavItems = [
  { icon: 'hub', label: 'Hub', route: '/coach/hub' },
  { icon: 'planner', label: 'Planner', route: '/coach/planner' },
  { icon: 'workouts', label: 'Workouts', route: '/coach/workouts' },
  { icon: 'athletes', label: 'Athletes', route: '/coach/athletes' },
  { icon: 'groups', label: 'Groups', route: '/coach/groups' },
  { icon: 'import', label: 'Import', route: '/coach/import' },
  { icon: 'philosophy', label: 'Philosophy', route: '/coach/philosophy' },
]

const secondaryNavItems = [
  { icon: 'feed', label: 'Feed', route: '/' },
  { icon: 'messages', label: 'Messages', route: '/messages' },
  { icon: 'notifications', label: 'Notifications', route: '/notifications' },
  { icon: 'billing', label: 'Billing', route: '/coach/billing' },
]

function isActive(itemRoute: string) {
  if (itemRoute === '/') return route.path === '/'
  return route.path.startsWith(itemRoute)
}

const displayName = computed(() => authStore.displayName)
const avatarUrl = computed(() => authStore.avatarUrl)
</script>

<template>
  <aside class="fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-summit-950 text-white
    w-16 lg:w-56 transition-all duration-200 overflow-hidden">
    <!-- Logo -->
    <div class="flex items-center gap-2 px-4 h-14 flex-shrink-0 border-b border-white/10">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 flex-shrink-0">
        <path d="M32 8L52 48H12L32 8Z" class="fill-summit-400" />
        <path d="M32 8L42 28L32 24L22 28L32 8Z" class="fill-peak-500" />
      </svg>
      <span class="font-display font-bold text-lg whitespace-nowrap hidden lg:block">CoachHub</span>
    </div>

    <!-- Primary nav -->
    <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
      <router-link
        v-for="item in coachNavItems"
        :key="item.route"
        :to="item.route"
        class="flex items-center gap-3 px-3 h-11 rounded-lg transition-colors whitespace-nowrap"
        :class="[
          isActive(item.route)
            ? 'bg-summit-800 text-white border-l-[3px] border-peak-500'
            : 'text-white/60 hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'
        ]"
      >
        <!-- Hub -->
        <svg v-if="item.icon === 'hub'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
        <!-- Planner -->
        <svg v-else-if="item.icon === 'planner'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <!-- Workouts -->
        <svg v-else-if="item.icon === 'workouts'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <!-- Athletes -->
        <svg v-else-if="item.icon === 'athletes'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <!-- Groups -->
        <svg v-else-if="item.icon === 'groups'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <!-- Import -->
        <svg v-else-if="item.icon === 'import'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <!-- Philosophy -->
        <svg v-else-if="item.icon === 'philosophy'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span class="hidden lg:block text-sm font-medium">{{ item.label }}</span>
      </router-link>

      <!-- Divider -->
      <div class="my-3 mx-3 border-t border-white/10"></div>

      <!-- Secondary nav -->
      <router-link
        v-for="item in secondaryNavItems"
        :key="item.route"
        :to="item.route"
        class="flex items-center gap-3 px-3 h-11 rounded-lg transition-colors whitespace-nowrap"
        :class="[
          isActive(item.route)
            ? 'bg-summit-800 text-white border-l-[3px] border-peak-500'
            : 'text-white/40 hover:text-white/70 hover:bg-white/5 border-l-[3px] border-transparent'
        ]"
      >
        <!-- Feed -->
        <svg v-if="item.icon === 'feed'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <!-- Messages -->
        <svg v-else-if="item.icon === 'messages'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <!-- Notifications -->
        <svg v-else-if="item.icon === 'notifications'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <!-- Billing -->
        <svg v-else-if="item.icon === 'billing'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        <span class="hidden lg:block text-sm font-medium">{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- Coach profile at bottom -->
    <div class="flex items-center gap-3 px-3 py-3 border-t border-white/10 flex-shrink-0">
      <router-link to="/profile" class="flex items-center gap-3 min-w-0">
        <img
          :src="avatarUrl || '/default-avatar.svg'"
          :alt="displayName"
          class="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-summit-800"
        />
        <span class="hidden lg:block text-sm font-medium text-white/80 truncate">{{ displayName }}</span>
      </router-link>
    </div>
  </aside>
</template>
