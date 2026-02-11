<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getStreak } from '@/utils/streaks'
import type { UserStreak } from '@/types/database'

const router = useRouter()
const authStore = useAuthStore()
const streak = ref<UserStreak | null>(null)

onMounted(async () => {
  if (authStore.user?.id) {
    streak.value = await getStreak(authStore.user.id)
  }
})

// Type definition for tool items
interface ToolItem {
  name: string
  description: string
  path: string
  icon: string
  color: string
}

interface ToolSection {
  category: string
  items: ToolItem[]
}

// Athlete tools organized by category - only showing active features
const tools: ToolSection[] = [
  {
    category: 'Training',
    items: [
      {
        name: 'Training',
        description: 'Your workouts & training plan',
        path: '/athlete/dashboard',
        icon: 'lightning',
        color: 'bg-valencia-600'
      }
    ]
  },
  {
    category: 'Team',
    items: [
      {
        name: 'My Teams',
        description: 'View your teams & groups',
        path: '/athlete/teams',
        icon: 'team',
        color: 'bg-purple-500'
      }
    ]
  },
  {
    category: 'Social',
    items: [
      {
        name: 'Share Workout',
        description: 'Post to your feed',
        path: '/create',
        icon: 'share',
        color: 'bg-green-500'
      },
      {
        name: 'My Posts',
        description: 'View your feed posts',
        path: '/profile',
        icon: 'grid',
        color: 'bg-indigo-500'
      }
    ]
  }
]

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div class="max-w-lg mx-auto px-4 py-4">
        <h1 class="text-2xl font-bold text-gray-900">Athlete Hub</h1>
        <p class="text-sm text-gray-600 mt-1">Your training tools</p>
      </div>
    </div>

    <!-- Tools Grid -->
    <div class="max-w-lg mx-auto px-4 py-6 space-y-8">
      <!-- Streak Card -->
      <div v-if="streak && streak.current_streak > 0" class="bg-gradient-to-r from-valencia-500 to-valencia-600 rounded-xl p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-white/80 font-medium">Current Streak</p>
            <p class="text-3xl font-bold text-white">{{ streak.current_streak }} <span class="text-lg font-normal">days</span></p>
          </div>
          <div class="text-right">
            <p class="text-sm text-white/80 font-medium">Best</p>
            <p class="text-xl font-bold text-white">{{ streak.longest_streak }} days</p>
          </div>
          <div class="text-4xl">🔥</div>
        </div>
      </div>

      <div v-for="section in tools" :key="section.category">
        <!-- Category Header -->
        <h2 class="text-lg font-semibold text-gray-900 mb-3">
          {{ section.category }}
        </h2>

        <!-- Tools Grid -->
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="tool in section.items"
            :key="tool.name"
            @click="navigateTo(tool.path)"
            class="relative bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md hover:border-valencia-300 transition-all active:scale-95"
          >

            <!-- Icon -->
            <div :class="tool.color" class="w-12 h-12 rounded-lg flex items-center justify-center mb-3">
              <!-- Lightning icon -->
              <svg v-if="tool.icon === 'lightning'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>

              <!-- Share icon -->
              <svg v-else-if="tool.icon === 'share'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>

              <!-- Team icon -->
              <svg v-else-if="tool.icon === 'team'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>

              <!-- Grid icon -->
              <svg v-else-if="tool.icon === 'grid'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>

              <!-- Fallback icon -->
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>

            <!-- Tool Name -->
            <h3 class="font-semibold text-gray-900 mb-1">
              {{ tool.name }}
            </h3>

            <!-- Tool Description -->
            <p class="text-xs text-gray-600">
              {{ tool.description }}
            </p>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
