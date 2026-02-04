<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="text-center">
      <div class="w-24 h-24 mx-auto mb-6">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full opacity-30">
          <path d="M32 8L52 48H12L32 8Z" class="fill-gray-400" />
          <path d="M32 8L42 28L32 24L22 28L32 8Z" class="fill-gray-300" />
        </svg>
      </div>
      <h1 class="font-display text-4xl font-bold text-gray-900 mb-2">404</h1>
      <p class="text-gray-600 mb-6">This page doesn't exist or has been moved.</p>
      <router-link to="/" class="btn-primary">
        Go Home
      </router-link>
    </div>
  </div>
</template>
