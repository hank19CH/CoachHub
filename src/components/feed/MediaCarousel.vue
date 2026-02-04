<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PostMedia, PostType } from '@/types/database'

const props = defineProps<{
  media: PostMedia[]
  postType: PostType
}>()

const currentIndex = ref(0)

// Sort media by display order, workout_card type always last
const sortedMedia = computed(() => {
  return [...props.media].sort((a, b) => {
    // workout_card always last
    if (a.media_type === 'workout_card') return 1
    if (b.media_type === 'workout_card') return -1
    return a.display_order - b.display_order
  })
})

const hasMultiple = computed(() => sortedMedia.value.length > 1)

function goToSlide(index: number) {
  currentIndex.value = index
}

function nextSlide() {
  if (currentIndex.value < sortedMedia.value.length - 1) {
    currentIndex.value++
  }
}

function prevSlide() {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

// Handle swipe gestures
let touchStartX = 0
let touchEndX = 0

function handleTouchStart(e: TouchEvent) {
  touchStartX = e.changedTouches[0].screenX
}

function handleTouchEnd(e: TouchEvent) {
  touchEndX = e.changedTouches[0].screenX
  handleSwipe()
}

function handleSwipe() {
  const swipeThreshold = 50
  const diff = touchStartX - touchEndX

  if (Math.abs(diff) > swipeThreshold) {
    if (diff > 0) {
      nextSlide()
    } else {
      prevSlide()
    }
  }
}
</script>

<template>
  <div 
    class="relative bg-gray-100 aspect-square overflow-hidden"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
  >
    <!-- Media items -->
    <div 
      class="flex transition-transform duration-300 ease-out h-full"
      :style="{ transform: `translateX(-${currentIndex * 100}%)` }"
    >
      <div 
        v-for="item in sortedMedia" 
        :key="item.id"
        class="w-full h-full flex-shrink-0 relative"
      >
        <!-- Image -->
        <img
          v-if="item.media_type === 'image'"
          :src="item.url!"
          :alt="item.alt_text || 'Post image'"
          class="w-full h-full object-cover"
          loading="lazy"
        />

        <!-- Video -->
        <video
          v-else-if="item.media_type === 'video'"
          :src="item.url!"
          :poster="item.thumbnail_url || undefined"
          class="w-full h-full object-cover"
          controls
          playsinline
          preload="metadata"
        />

        <!-- Workout Card (rendered, not an image) -->
        <div 
          v-else-if="item.media_type === 'workout_card'"
          class="w-full h-full gradient-summit flex items-center justify-center"
        >
          <div class="text-center text-white p-6">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p class="font-display text-lg font-bold">Workout Complete</p>
            <p class="text-white/70 text-sm mt-1">Swipe for details</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation arrows (desktop) -->
    <template v-if="hasMultiple">
      <button
        v-if="currentIndex > 0"
        @click="prevSlide"
        class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors hidden sm:flex"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        v-if="currentIndex < sortedMedia.length - 1"
        @click="nextSlide"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors hidden sm:flex"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </template>

    <!-- Dots indicator -->
    <div 
      v-if="hasMultiple"
      class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5"
    >
      <button
        v-for="(item, index) in sortedMedia"
        :key="item.id"
        @click="goToSlide(index)"
        class="w-1.5 h-1.5 rounded-full transition-all"
        :class="[
          index === currentIndex 
            ? 'bg-white w-3' 
            : 'bg-white/50 hover:bg-white/75'
        ]"
      />
    </div>

    <!-- Counter (top right) -->
    <div 
      v-if="hasMultiple"
      class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-medium"
    >
      {{ currentIndex + 1 }}/{{ sortedMedia.length }}
    </div>
  </div>
</template>
