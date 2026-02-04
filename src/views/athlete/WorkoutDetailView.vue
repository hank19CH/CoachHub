<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function goBack() {
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-white">
    <header class="sticky top-0 z-10 bg-white border-b border-feed-border">
      <div class="flex items-center justify-between px-4 h-14">
        <button @click="goBack" class="text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="font-display font-bold text-lg">Workout</h1>
        <div class="w-6"></div>
      </div>
    </header>

    <div class="p-4">
      <p class="text-gray-500 text-center py-12">
        Workout ID: {{ route.params.id }}<br>
        Workout detail view coming soon...
      </p>
    </div>
  </div>
</template>
