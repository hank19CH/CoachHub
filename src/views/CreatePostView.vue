<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import MediaUploadZone from '@/components/athlete/MediaUploadZone.vue'
import { uploadPostMedia, createPost } from '@/services/posts'

const router = useRouter()
const authStore = useAuthStore()

// Form state
const caption = ref('')
const visibility = ref<'public' | 'followers' | 'private'>('public')
const mediaFiles = ref<File[]>([])
const isSubmitting = ref(false)
const submitError = ref('')

// Computed
const canPost = computed(() => {
  return caption.value.trim().length > 0 || mediaFiles.value.length > 0
})

function goBack() {
  router.back()
}

function handleFilesChanged(files: File[]) {
  mediaFiles.value = files
}

async function handleSubmit() {
  if (isSubmitting.value || !canPost.value) return
  const userId = authStore.user?.id
  if (!userId) return

  isSubmitting.value = true
  submitError.value = ''

  try {
    // Upload media files
    const tempPostId = crypto.randomUUID()
    const uploadedMedia = []

    for (const file of mediaFiles.value) {
      const url = await uploadPostMedia(file, userId, tempPostId)
      if (url) {
        uploadedMedia.push({
          file,
          url,
          type: (file.type.startsWith('image/') ? 'image' : 'video') as 'image' | 'video',
        })
      }
    }

    // Create the post
    const post = await createPost(userId, caption.value.trim(), visibility.value, uploadedMedia)

    if (post) {
      router.push('/')
    } else {
      submitError.value = 'Failed to create post. Please try again.'
    }
  } catch (err: any) {
    submitError.value = err.message || 'Something went wrong'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-white">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-white border-b border-feed-border">
      <div class="flex items-center justify-between px-4 h-14">
        <button @click="goBack" class="p-1 text-gray-600 hover:text-gray-900">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h1 class="font-display font-bold text-lg">New Post</h1>
        <button
          @click="handleSubmit"
          :disabled="!canPost || isSubmitting"
          class="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
          :class="
            canPost && !isSubmitting
              ? 'bg-summit-600 text-white hover:bg-summit-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          "
        >
          {{ isSubmitting ? 'Posting...' : 'Share' }}
        </button>
      </div>
    </header>

    <!-- Content -->
    <div class="p-4 space-y-5">
      <!-- Error -->
      <div v-if="submitError" class="bg-red-50 text-red-700 text-sm rounded-lg p-3">
        {{ submitError }}
      </div>

      <!-- Media upload -->
      <MediaUploadZone
        :max-files="10"
        @files-changed="handleFilesChanged"
      />

      <!-- Caption -->
      <div>
        <textarea
          v-model="caption"
          placeholder="Write a caption..."
          rows="4"
          class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-summit-500 focus:border-summit-500 resize-none"
        />
      </div>

      <!-- Visibility -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Who can see this?</label>
        <div class="flex gap-2">
          <button
            v-for="opt in [
              { value: 'public', label: 'Everyone', icon: '🌍' },
              { value: 'followers', label: 'Followers', icon: '👥' },
              { value: 'private', label: 'Only me', icon: '🔒' },
            ] as const"
            :key="opt.value"
            @click="visibility = opt.value"
            class="flex-1 py-2.5 px-3 rounded-lg text-sm font-medium text-center border transition-colors"
            :class="
              visibility === opt.value
                ? 'border-summit-500 bg-summit-50 text-summit-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            "
          >
            <span class="block text-lg mb-0.5">{{ opt.icon }}</span>
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Spacer for bottom nav -->
      <div class="h-16"></div>
    </div>
  </div>
</template>
