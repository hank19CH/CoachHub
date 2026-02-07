<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// Type definition for tool items
interface ToolItem {
  name: string
  description: string
  path: string
  icon: string
  color: string
  badge?: string  // Optional badge property
}

interface ToolSection {
  category: string
  items: ToolItem[]
}

// Athlete tools organized by category
const tools: ToolSection[] = [
  {
    category: 'Training',
    items: [
      {
        name: 'Today',
        description: 'Your workouts for today',
        path: '/athlete/dashboard',
        icon: 'lightning',
        color: 'bg-valencia-600'
      },
      {
        name: 'Calendar',
        description: 'View workout schedule',
        path: '/athlete/calendar',
        icon: 'calendar',
        color: 'bg-summit-600',
        badge: 'Sprint 4'
      }
    ]
  },
  {
    category: 'Progress',
    items: [
      {
        name: 'Personal Bests',
        description: 'Track your PRs',
        path: '/athlete/progress',
        icon: 'trophy',
        color: 'bg-amber-500',
        badge: 'Sprint 4'
      },
      {
        name: 'History',
        description: 'Past workout results',
        path: '/athlete/history',
        icon: 'clock',
        color: 'bg-blue-500',
        badge: 'Sprint 4'
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
  },
  {
    category: 'Coaches',
    items: [
      {
        name: 'My Coaches',
        description: 'View your coaches',
        path: '/athlete/coaches',
        icon: 'users',
        color: 'bg-purple-500',
        badge: 'Phase 2'
      },
      {
        name: 'Messages',
        description: 'Chat with coaches',
        path: '/messages',
        icon: 'message',
        color: 'bg-pink-500',
        badge: 'Phase 2'
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
            class="relative bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md transition-all active:scale-95"
            :disabled="tool.badge !== undefined"
            :class="tool.badge ? 'opacity-60 cursor-not-allowed' : 'hover:border-valencia-300'"
          >
            <!-- Badge -->
            <div v-if="tool.badge" class="absolute top-2 right-2 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {{ tool.badge }}
            </div>

            <!-- Icon -->
            <div :class="tool.color" class="w-12 h-12 rounded-lg flex items-center justify-center mb-3">
              <!-- Lightning icon -->
              <svg v-if="tool.icon === 'lightning'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>

              <!-- Calendar icon -->
              <svg v-else-if="tool.icon === 'calendar'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>

              <!-- Trophy icon -->
              <svg v-else-if="tool.icon === 'trophy'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>

              <!-- Clock icon -->
              <svg v-else-if="tool.icon === 'clock'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>

              <!-- Share icon -->
              <svg v-else-if="tool.icon === 'share'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>

              <!-- Grid icon -->
              <svg v-else-if="tool.icon === 'grid'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>

              <!-- Users icon -->
              <svg v-else-if="tool.icon === 'users'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>

              <!-- Message icon -->
              <svg v-else-if="tool.icon === 'message'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
