<script setup lang="ts">
import { computed } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import type { Notification } from '@/stores/notifications'

const props = defineProps<{
  notification: Notification
}>()

defineEmits<{
  click: []
  delete: []
}>()

const timeAgo = computed(() => {
  try {
    return formatDistanceToNow(new Date(props.notification.created_at), { addSuffix: true })
  } catch {
    return ''
  }
})

const iconType = computed(() => {
  const map: Record<string, string> = {
    like: 'heart',
    comment: 'chat',
    follow: 'user-plus',
    workout_assigned: 'clipboard',
    workout_completed: 'check-circle',
    personal_best: 'trophy',
  }
  return map[props.notification.type] || 'bell'
})

const iconBgColor = computed(() => {
  const map: Record<string, string> = {
    like: 'bg-red-100',
    comment: 'bg-blue-100',
    follow: 'bg-purple-100',
    workout_assigned: 'bg-summit-100',
    workout_completed: 'bg-emerald-100',
    personal_best: 'bg-yellow-100',
  }
  return map[props.notification.type] || 'bg-gray-100'
})

const iconColor = computed(() => {
  const map: Record<string, string> = {
    like: 'text-red-600',
    comment: 'text-blue-600',
    follow: 'text-purple-600',
    workout_assigned: 'text-summit-700',
    workout_completed: 'text-emerald-600',
    personal_best: 'text-yellow-600',
  }
  return map[props.notification.type] || 'text-gray-600'
})
</script>

<template>
  <div
    :class="[
      'flex items-start gap-3 p-4 cursor-pointer transition-colors',
      !notification.is_read ? 'bg-summit-50/60 hover:bg-summit-100/60' : 'hover:bg-gray-50'
    ]"
    @click="$emit('click')"
  >
    <!-- Icon or Avatar -->
    <div class="flex-shrink-0">
      <img
        v-if="notification.actor?.avatar_url"
        :src="notification.actor.avatar_url"
        :alt="notification.actor.display_name"
        class="w-10 h-10 rounded-full object-cover"
      />
      <div
        v-else
        :class="['w-10 h-10 rounded-full flex items-center justify-center', iconBgColor]"
      >
        <!-- Heart -->
        <svg v-if="iconType === 'heart'" xmlns="http://www.w3.org/2000/svg" :class="['w-5 h-5', iconColor]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <!-- Chat -->
        <svg v-else-if="iconType === 'chat'" xmlns="http://www.w3.org/2000/svg" :class="['w-5 h-5', iconColor]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <!-- User Plus -->
        <svg v-else-if="iconType === 'user-plus'" xmlns="http://www.w3.org/2000/svg" :class="['w-5 h-5', iconColor]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        <!-- Clipboard -->
        <svg v-else-if="iconType === 'clipboard'" xmlns="http://www.w3.org/2000/svg" :class="['w-5 h-5', iconColor]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <!-- Check Circle -->
        <svg v-else-if="iconType === 'check-circle'" xmlns="http://www.w3.org/2000/svg" :class="['w-5 h-5', iconColor]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <!-- Trophy -->
        <svg v-else-if="iconType === 'trophy'" xmlns="http://www.w3.org/2000/svg" :class="['w-5 h-5', iconColor]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 3h14M5 3v4a7 7 0 007 7m-7-7H3m16 0h-2m2 0v4a7 7 0 01-7 7m0 0v3m0-3h-4m4 0h4m-8 3h8" />
        </svg>
        <!-- Bell (default) -->
        <svg v-else xmlns="http://www.w3.org/2000/svg" :class="['w-5 h-5', iconColor]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-gray-900">
        {{ notification.title }}
      </p>
      <p v-if="notification.message" class="text-sm text-gray-600 mt-0.5 line-clamp-2">
        {{ notification.message }}
      </p>
      <p class="text-xs text-gray-400 mt-1">
        {{ timeAgo }}
      </p>
    </div>

    <!-- Unread Indicator & Delete -->
    <div class="flex-shrink-0 flex items-center gap-2">
      <div
        v-if="!notification.is_read"
        class="w-2.5 h-2.5 rounded-full bg-summit-500"
      ></div>

      <button
        @click.stop="$emit('delete')"
        class="p-1.5 text-gray-300 hover:text-gray-500 rounded-full hover:bg-gray-100 transition-colors"
        title="Remove notification"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
