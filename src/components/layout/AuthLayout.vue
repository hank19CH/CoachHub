<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen gradient-summit flex flex-col">
    <!-- Background decoration -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-peak-500/10 rounded-full blur-3xl"></div>
      <div class="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-summit-600/20 rounded-full blur-3xl"></div>
    </div>

    <!-- Content -->
    <div class="relative flex-1 flex flex-col items-center justify-center p-6">
      <!-- Logo -->
      <div class="mb-8 text-center">
        <div class="w-20 h-20 mx-auto mb-4">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full drop-shadow-lg">
            <path 
              d="M32 8L52 48H12L32 8Z" 
              fill="white" 
              fill-opacity="0.95"
            />
            <path 
              d="M32 8L42 28L32 24L22 28L32 8Z" 
              fill="#f97316"
            />
          </svg>
        </div>
        <h1 class="font-display text-3xl font-bold text-white mb-1">CoachHub</h1>
        <p class="text-white/70 font-medium">Reach Your Summit</p>
      </div>

      <!-- Auth form slot -->
      <div class="w-full max-w-sm">
        <slot />
      </div>
    </div>

    <!-- Footer -->
    <div class="relative text-center pb-8 px-6">
      <p class="text-white/50 text-sm">
        © 2025 CoachHub. All rights reserved.
      </p>
    </div>
  </div>
</template>
