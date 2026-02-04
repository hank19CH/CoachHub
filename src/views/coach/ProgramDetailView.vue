<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

function goBack() {
  router.back()
}
</script>

<template>
  <div class="p-4">
    <button @click="goBack" class="mb-4 text-summit-700 font-medium">
      ← Back to Programs
    </button>
    <h1 class="font-display text-2xl font-bold text-gray-900 mb-2">Program Detail</h1>
    <p class="text-gray-500">Program ID: {{ route.params.id }}</p>
    <p class="text-gray-400 text-sm mt-4">Program details coming soon...</p>
  </div>
</template>
