<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getFollowStatus, followUser, unfollowUser } from '@/services/social'

const props = defineProps<{
  userId: string
  isPrivate?: boolean
  size?: 'sm' | 'md'
}>()

const emit = defineEmits<{
  (e: 'change', following: boolean): void
}>()

const authStore = useAuthStore()
const isFollowing = ref(false)
const isPending = ref(false)
const isLoading = ref(false)

onMounted(async () => {
  if (!authStore.user || authStore.user.id === props.userId) return
  const result = await getFollowStatus(authStore.user.id, props.userId)
  isFollowing.value = result.isFollowing && result.status === 'active'
  isPending.value = result.isFollowing && result.status === 'pending'
})

async function handleToggle() {
  if (!authStore.user || isLoading.value) return
  isLoading.value = true

  try {
    if (isFollowing.value || isPending.value) {
      const success = await unfollowUser(authStore.user.id, props.userId)
      if (success) {
        isFollowing.value = false
        isPending.value = false
        emit('change', false)
      }
    } else {
      const result = await followUser(authStore.user.id, props.userId, props.isPrivate ?? false)
      if (result) {
        if (props.isPrivate) {
          isPending.value = true
        } else {
          isFollowing.value = true
        }
        emit('change', true)
      }
    }
  } catch (e) {
    console.error('Error toggling follow:', e)
  } finally {
    isLoading.value = false
  }
}

const isOwnProfile = authStore.user?.id === props.userId
</script>

<template>
  <button
    v-if="!isOwnProfile"
    @click.stop="handleToggle"
    :disabled="isLoading"
    class="font-medium rounded-xl transition-all duration-200 disabled:opacity-50"
    :class="[
      isFollowing
        ? 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 border border-gray-200'
        : isPending
          ? 'bg-gray-100 text-gray-600 border border-gray-200'
          : 'bg-summit-800 text-white hover:bg-summit-700',
      size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
    ]"
  >
    <span v-if="isLoading" class="flex items-center gap-1">
      <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
    </span>
    <span v-else-if="isFollowing">Following</span>
    <span v-else-if="isPending">Requested</span>
    <span v-else>Follow</span>
  </button>
</template>
