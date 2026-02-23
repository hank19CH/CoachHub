<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  title: string
  showBack?: boolean
  backTo?: string
  /** Use 'top-14' for views nested below a top nav bar */
  stickyOffset?: 'top-0' | 'top-14'
}>(), {
  showBack: false,
  stickyOffset: 'top-0',
})

const router = useRouter()

function goBack() {
  if (props.backTo) {
    router.push(props.backTo)
  } else {
    router.back()
  }
}
</script>

<template>
  <div
    class="sticky z-10 bg-white border-b border-feed-border"
    :class="stickyOffset"
  >
    <div class="max-w-2xl mx-auto px-4 py-3">
      <div class="flex items-center gap-3">
        <!-- Back button -->
        <button
          v-if="showBack"
          @click="goBack"
          class="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Go back"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Title -->
        <h1 class="font-display text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
          {{ title }}
        </h1>

        <!-- Right-side actions slot -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <slot name="actions" />
        </div>
      </div>

      <!-- Optional sub-header content (tabs, search, etc.) -->
      <slot name="sub-header" />
    </div>
  </div>
</template>
