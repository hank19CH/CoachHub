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

// Coach tools organized by category
const tools: ToolSection[] = [
  {
    category: 'Athletes',
    items: [
      {
        name: 'Athletes',
        description: 'Manage your athlete roster',
        path: '/athletes',
        icon: 'users',
        color: 'bg-blue-500'
      },
      {
        name: 'Invite Athlete',
        description: 'Add new athletes',
        path: '/athletes?invite=true',
        icon: 'user-plus',
        color: 'bg-green-500'
      }
    ]
  },
  {
    category: 'Programming',
    items: [
      {
        name: 'Workouts',
        description: 'Build & manage workouts',
        path: '/workouts',
        icon: 'clipboard',
        color: 'bg-valencia-600'
      },
      {
        name: 'Programs',
        description: '4-12 week training plans',
        path: '/programs',
        icon: 'calendar',
        color: 'bg-summit-600'
      }
    ]
  },
  {
    category: 'Assignments',
    items: [
      {
        name: 'Assign Workout',
        description: 'Schedule workouts to athletes',
        path: '/coach/assign/workout',
        icon: 'send',
        color: 'bg-indigo-500',
        badge: 'Coming Soon'
      },
      {
        name: 'Assign Program',
        description: 'Assign full programs',
        path: '/coach/assign/program',
        icon: 'package',
        color: 'bg-purple-500',
        badge: 'Coming Soon'
      }
    ]
  },
  {
    category: 'Analytics',
    items: [
      {
        name: 'Performance',
        description: 'Track athlete progress',
        path: '/coach/analytics',
        icon: 'trending-up',
        color: 'bg-emerald-500',
        badge: 'Phase 2'
      },
      {
        name: 'Reports',
        description: 'Generate reports',
        path: '/coach/reports',
        icon: 'file-text',
        color: 'bg-amber-500',
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
        <h1 class="text-2xl font-bold text-gray-900">Coach Hub</h1>
        <p class="text-sm text-gray-600 mt-1">Your coaching tools</p>
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
            :class="tool.badge ? 'opacity-60 cursor-not-allowed' : 'hover:border-summit-300'"
          >
            <!-- Badge -->
            <div v-if="tool.badge" class="absolute top-2 right-2 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {{ tool.badge }}
            </div>

            <!-- Icon -->
            <div :class="tool.color" class="w-12 h-12 rounded-lg flex items-center justify-center mb-3">
              <!-- Users icon -->
              <svg v-if="tool.icon === 'users'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>

              <!-- User Plus icon -->
              <svg v-else-if="tool.icon === 'user-plus'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>

              <!-- Clipboard icon -->
              <svg v-else-if="tool.icon === 'clipboard'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>

              <!-- Calendar icon -->
              <svg v-else-if="tool.icon === 'calendar'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>

              <!-- Send icon -->
              <svg v-else-if="tool.icon === 'send'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>

              <!-- Package icon -->
              <svg v-else-if="tool.icon === 'package'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>

              <!-- Trending Up icon -->
              <svg v-else-if="tool.icon === 'trending-up'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>

              <!-- File Text icon -->
              <svg v-else-if="tool.icon === 'file-text'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
