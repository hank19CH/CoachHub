<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const caption = ref('')

function goBack() {
  router.back()
}
</script>

<template>
  <div class="min-h-screen bg-white">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-white border-b border-feed-border">
      <div class="flex items-center justify-between px-4 h-14">
        <button @click="goBack" class="text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h1 class="font-display font-bold text-lg">New Post</h1>
        <button class="btn-primary btn-sm">Share</button>
      </div>
    </header>

    <!-- Content -->
    <div class="p-4">
      <!-- Media upload area -->
      <div class="aspect-square rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center mb-4 hover:border-summit-500 hover:bg-summit-50/50 transition-colors cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="text-gray-600 font-medium">Add photos or videos</p>
        <p class="text-gray-400 text-sm mt-1">Tap to upload</p>
      </div>

      <!-- Caption -->
      <textarea
        v-model="caption"
        placeholder="Write a caption..."
        class="input resize-none h-32"
      ></textarea>

      <!-- Options -->
      <div class="mt-4 space-y-3">
        <button class="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50">
          <span class="text-gray-700">Tag people</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button class="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50">
          <span class="text-gray-700">Add location</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
