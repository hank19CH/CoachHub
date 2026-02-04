<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function goBack() {
  router.back()
}
</script>

<template>
  <div class="p-6 text-center">
    <button @click="goBack" class="mb-6 text-summit-700 font-medium">
      ← Back
    </button>
    <h1 class="font-display text-2xl font-bold text-gray-900 mb-2">Post Detail</h1>
    <p class="text-gray-600">Post ID: {{ route.params.id }}</p>
    <p class="text-gray-400 text-sm mt-4">Full post view coming soon...</p>
  </div>
</template>
