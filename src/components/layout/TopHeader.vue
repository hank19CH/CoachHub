<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50 bg-white border-b border-feed-border safe-top">
    <div class="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
      <!-- Logo / Brand -->
      <router-link to="/" class="flex items-center gap-2">
        <div class="w-8 h-8">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
            <path 
              d="M32 8L52 48H12L32 8Z" 
              class="fill-summit-800"
            />
            <path 
              d="M32 8L42 28L32 24L22 28L32 8Z" 
              class="fill-peak-500"
            />
          </svg>
        </div>
        <span class="font-display font-bold text-xl text-summit-800">CoachHub</span>
      </router-link>

      <!-- Right side actions -->
      <div class="flex items-center gap-2">
        <!-- Notifications (mobile shows in bottom nav, but keep icon here for tablet) -->
        <router-link 
          to="/notifications" 
          class="p-2 rounded-full hover:bg-gray-100 transition-colors hidden sm:flex"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </router-link>

        <!-- Messages / DM (future feature) -->
        <button 
          class="p-2 rounded-full hover:bg-gray-100 transition-colors"
          title="Messages coming soon"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>
    </div>
  </header>
</template>
