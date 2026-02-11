<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const props = defineProps<{
  postId: string
  initialCount: number
  size?: 'sm' | 'md'
}>()

const emit = defineEmits<{
  (e: 'update:count', count: number): void
}>()

const authStore = useAuthStore()
const isLiked = ref(false)
const likesCount = ref(props.initialCount)
const isLiking = ref(false)

onMounted(async () => {
  if (!authStore.user) return
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', authStore.user.id)
    .eq('post_id', props.postId)
    .maybeSingle()
  isLiked.value = !!data
})

async function toggleLike() {
  if (isLiking.value || !authStore.user) return
  isLiking.value = true
  const wasLiked = isLiked.value

  // Optimistic update
  isLiked.value = !wasLiked
  likesCount.value += wasLiked ? -1 : 1
  emit('update:count', likesCount.value)

  try {
    if (wasLiked) {
      await supabase
        .from('likes')
        .delete()
        .eq('user_id', authStore.user.id)
        .eq('post_id', props.postId)
    } else {
      await supabase
        .from('likes')
        .insert({ user_id: authStore.user.id, post_id: props.postId })
    }
  } catch {
    // Revert on error
    isLiked.value = wasLiked
    likesCount.value += wasLiked ? 1 : -1
    emit('update:count', likesCount.value)
  } finally {
    isLiking.value = false
  }
}
</script>

<template>
  <button
    @click.stop="toggleLike"
    class="flex items-center gap-1.5 transition-colors duration-150"
    :class="[
      isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-400',
      size === 'sm' ? 'text-sm' : ''
    ]"
    :disabled="isLiking"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      :class="size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'"
      :fill="isLiked ? 'currentColor' : 'none'"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
    <span v-if="likesCount > 0" class="font-medium" :class="size === 'sm' ? 'text-xs' : 'text-sm'">
      {{ likesCount.toLocaleString() }}
    </span>
  </button>
</template>
