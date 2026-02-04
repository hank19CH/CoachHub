<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BottomNav from './BottomNav.vue'
import TopHeader from './TopHeader.vue'

const route = useRoute()
const authStore = useAuthStore()

// Pages that should hide the bottom nav
const hideBottomNav = computed(() => {
  return ['create', 'workout-detail', 'settings'].includes(route.name as string)
})

// Pages that should hide the top header
const hideTopHeader = computed(() => {
  return ['create', 'workout-detail'].includes(route.name as string)
})
</script>

<template>
  <div class="min-h-screen bg-feed-bg flex flex-col">
    <!-- Top Header -->
    <TopHeader v-if="!hideTopHeader" />

    <!-- Main Content -->
    <main 
      class="flex-1 w-full max-w-lg mx-auto"
      :class="{
        'pt-14': !hideTopHeader,
        'pb-20': !hideBottomNav
      }"
    >
      <slot />
    </main>

    <!-- Bottom Navigation -->
    <BottomNav v-if="!hideBottomNav" />
  </div>
</template>
