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
        path: '/coach/athletes',
        icon: 'users',
        color: 'bg-blue-500'
      },
      {
        name: 'Invite Athlete',
        description: 'Add new athletes',
        path: '/coach/athletes?invite=true',
        icon: 'user-plus',
        color: 'bg-green-500'
      },
      {
        name: 'Groups',
        description: 'Organize athletes into groups',
        path: '/coach/groups',
        icon: 'user-group',
        color: 'bg-purple-500'
      }
    ]
  },
  {
    category: 'Programming',
    items: [
      {
        name: 'Workouts',
        description: 'Build & manage workouts',
        path: '/coach/workouts',
        icon: 'clipboard',
        color: 'bg-valencia-600'
      },
      {
        name: 'Programs',
        description: '4-12 week training plans',
        path: '/coach/programs',
        icon: 'calendar',
        color: 'bg-summit-600'
      },
      {
        name: 'AI Planner',
        description: 'Periodized training plans with AI',
        path: '/coach/planner',
        icon: 'ai-brain',
        color: 'bg-gradient-to-br from-summit-600 to-valencia-600'
      },
      {
        name: 'Calendar',
        description: 'Weekly assignment planner',
        path: '/coach/calendar',
        icon: 'calendar-week',
        color: 'bg-indigo-500'
      }
    ]
  },
  {
    category: 'Monitoring',
    items: [
      {
        name: 'Dashboard',
        description: 'Monitor athlete activity',
        path: '/coach/dashboard',
        icon: 'trending-up',
        color: 'bg-emerald-500'
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
            class="relative bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md hover:border-summit-300 transition-all active:scale-95"
          >

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

              <!-- Calendar Week icon -->
              <svg v-else-if="tool.icon === 'calendar-week'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
              </svg>

              <!-- User Group icon -->
              <svg v-else-if="tool.icon === 'user-group'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>

              <!-- AI Brain icon -->
              <svg v-else-if="tool.icon === 'ai-brain'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>

              <!-- Trending Up icon -->
              <svg v-else-if="tool.icon === 'trending-up'" xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
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
