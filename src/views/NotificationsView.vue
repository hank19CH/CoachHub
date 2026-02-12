<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useNotificationsStore } from '@/stores/notifications'
import NotificationItem from '@/components/notifications/NotificationItem.vue'

const router = useRouter()
const notificationsStore = useNotificationsStore()

const activeTab = ref<'all' | 'unread'>('all')

const {
  notifications,
  loading,
  error,
  unreadCount,
  unreadNotifications
} = storeToRefs(notificationsStore)

const displayedNotifications = computed(() => {
  if (activeTab.value === 'unread') {
    return unreadNotifications.value
  }
  return notifications.value
})

function handleNotificationClick(notification: any) {
  if (!notification.is_read) {
    notificationsStore.markAsRead(notification.id)
  }
  if (notification.action_url) {
    router.push(notification.action_url)
  }
}

onMounted(() => {
  notificationsStore.fetchNotifications()
})
</script>

<template>
  <div class="notifications-view pb-20">
    <!-- Header -->
    <div class="sticky top-14 z-10 bg-white border-b border-gray-200">
      <div class="flex items-center justify-between px-4 py-3">
        <h1 class="text-xl font-bold text-gray-900">Notifications</h1>
        <button
          v-if="unreadCount > 0"
          @click="notificationsStore.markAllAsRead()"
          class="text-sm font-medium text-summit-600 hover:text-summit-700 transition-colors"
        >
          Mark all as read
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-gray-200">
        <button
          @click="activeTab = 'all'"
          :class="[
            'flex-1 px-4 py-3 text-sm font-medium transition-colors',
            activeTab === 'all'
              ? 'text-summit-600 border-b-2 border-summit-600'
              : 'text-gray-500 hover:text-gray-700'
          ]"
        >
          All
        </button>
        <button
          @click="activeTab = 'unread'"
          :class="[
            'flex-1 px-4 py-3 text-sm font-medium transition-colors relative',
            activeTab === 'unread'
              ? 'text-summit-600 border-b-2 border-summit-600'
              : 'text-gray-500 hover:text-gray-700'
          ]"
        >
          Unread
          <span
            v-if="unreadCount > 0"
            class="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold text-white bg-valencia-500 rounded-full min-w-[20px]"
          >
            {{ unreadCount }}
          </span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-summit-600"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-4 mx-4 mt-4 bg-red-50 border border-red-200 rounded-lg">
      <p class="text-sm text-red-800">{{ error }}</p>
      <button
        @click="notificationsStore.fetchNotifications()"
        class="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
      >
        Try again
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="displayedNotifications.length === 0"
      class="flex flex-col items-center justify-center py-16 px-4"
    >
      <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-summit-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-1">
        {{ activeTab === 'unread' ? 'All caught up!' : 'No notifications yet' }}
      </h3>
      <p class="text-sm text-gray-500 text-center max-w-xs">
        {{ activeTab === 'unread' ? 'You have no unread notifications.' : 'When someone likes, comments, or interacts with you, you\'ll see it here.' }}
      </p>
    </div>

    <!-- Notifications List -->
    <div v-else class="divide-y divide-gray-100">
      <NotificationItem
        v-for="notification in displayedNotifications"
        :key="notification.id"
        :notification="notification"
        @click="handleNotificationClick(notification)"
        @delete="notificationsStore.deleteNotification(notification.id)"
      />
    </div>
  </div>
</template>
