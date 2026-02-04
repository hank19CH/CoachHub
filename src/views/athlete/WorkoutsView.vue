<script setup lang="ts">
</script>

<template>
  <div class="p-4">
    <h1 class="font-display text-2xl font-bold text-gray-900 mb-6">My Workouts</h1>

    <!-- Empty state -->
    <div class="text-center py-12">
      <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-summit-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <h2 class="font-display text-xl font-bold text-gray-900 mb-2">No workouts assigned</h2>
      <p class="text-gray-600 max-w-sm mx-auto">
        When your coach assigns workouts, they'll appear here.
      </p>
    </div>
  </div>
</template>
