<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BottomNav from '@/components/layout/BottomNav.vue'
import TopHeader from './TopHeader.vue'
import CoachSidebar from './CoachSidebar.vue'

const route = useRoute()
const authStore = useAuthStore()

// Pages that should hide the bottom nav
const hideBottomNav = computed(() => {
  return ['create', 'workout-detail', 'settings', 'message-thread'].includes(route.name as string)
})

// Pages that should hide the top header
const hideTopHeader = computed(() => {
  return ['create', 'workout-detail', 'message-thread'].includes(route.name as string)
})

// Pages that need full width (no max-width constraint)
const needsFullWidth = computed(() => {
  const fullWidthRoutes = [
    '/coach/planner',
    '/coach/import',
    '/coach/workouts',
    '/coach/athletes',
    '/coach/groups',
    '/coach/philosophy',
    '/coach/billing',
    '/workouts',
  ]
  return fullWidthRoutes.some(r => route.path.startsWith(r))
})

// Detect coach routes for sidebar visibility
const isCoachRoute = computed(() => route.meta.requiresCoach === true)

// Show sidebar only for authenticated coaches on coach routes
const showSidebar = computed(() => isCoachRoute.value && authStore.isCoach)
</script>

<template>
  <div class="min-h-screen bg-feed-bg flex">
    <!-- Coach Sidebar — visible at md: on coach routes -->
    <CoachSidebar v-if="showSidebar" class="hidden md:flex" />

    <!-- Main column -->
    <div
      class="flex-1 flex flex-col min-h-screen"
      :class="{ 'md:ml-16 lg:ml-56': showSidebar }"
    >
      <!-- Top Header -->
      <TopHeader v-if="!hideTopHeader" :slim="showSidebar" />

      <!-- Main Content -->
      <main
        class="flex-1 w-full"
        :class="{
          'pt-14': !hideTopHeader,
          'pb-20': !hideBottomNav && !showSidebar,
          'md:pb-0': showSidebar,
          'max-w-lg mx-auto': !needsFullWidth && !showSidebar,
        }"
      >
        <slot />
      </main>

      <!-- Bottom Navigation — hidden on coach routes at md: when sidebar is visible -->
      <BottomNav v-if="!hideBottomNav" :class="{ 'md:hidden': showSidebar }" />
    </div>
  </div>
</template>
