<script setup lang="ts">
</script>

<template>
  <article class="post-card">
    <!-- Header skeleton -->
    <header class="post-header">
      <div class="skeleton-avatar w-10 h-10"></div>
      <div class="flex-1 space-y-2">
        <div class="skeleton-text w-32"></div>
        <div class="skeleton-text w-20 h-3"></div>
      </div>
    </header>

    <!-- Media skeleton -->
    <div class="skeleton aspect-square"></div>

    <!-- Actions skeleton -->
    <div class="p-3 flex gap-3">
      <div class="skeleton w-6 h-6 rounded"></div>
      <div class="skeleton w-6 h-6 rounded"></div>
      <div class="skeleton w-6 h-6 rounded"></div>
    </div>

    <!-- Content skeleton -->
    <div class="px-4 pb-4 space-y-2">
      <div class="skeleton-text w-24"></div>
      <div class="skeleton-text w-full"></div>
      <div class="skeleton-text w-3/4"></div>
    </div>
  </article>
</template>
