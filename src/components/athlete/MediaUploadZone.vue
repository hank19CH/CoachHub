<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    maxFiles?: number
    maxImageSize?: number // bytes
    maxVideoSize?: number // bytes
  }>(),
  {
    maxFiles: 10,
    maxImageSize: 10 * 1024 * 1024, // 10MB
    maxVideoSize: 50 * 1024 * 1024, // 50MB
  }
)

const emit = defineEmits<{
  (e: 'filesChanged', files: File[]): void
}>()

const files = ref<File[]>([])
const previews = ref<{ url: string; type: 'image' | 'video' }[]>([])
const isDragOver = ref(false)
const errorMessage = ref('')

const canAddMore = computed(() => files.value.length < props.maxFiles)

function handleDrop(e: DragEvent) {
  isDragOver.value = false
  if (!e.dataTransfer?.files) return
  addFiles(Array.from(e.dataTransfer.files))
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  addFiles(Array.from(input.files))
  input.value = '' // reset so same file can be re-selected
}

function addFiles(newFiles: File[]) {
  errorMessage.value = ''

  for (const file of newFiles) {
    if (files.value.length >= props.maxFiles) {
      errorMessage.value = `Maximum ${props.maxFiles} files allowed`
      break
    }

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      errorMessage.value = 'Only images and videos are allowed'
      continue
    }

    if (isImage && file.size > props.maxImageSize) {
      errorMessage.value = `Images must be under ${Math.round(props.maxImageSize / 1024 / 1024)}MB`
      continue
    }

    if (isVideo && file.size > props.maxVideoSize) {
      errorMessage.value = `Videos must be under ${Math.round(props.maxVideoSize / 1024 / 1024)}MB`
      continue
    }

    files.value.push(file)
    previews.value.push({
      url: URL.createObjectURL(file),
      type: isImage ? 'image' : 'video',
    })
  }

  emit('filesChanged', [...files.value])
}

function removeFile(index: number) {
  URL.revokeObjectURL(previews.value[index].url)
  files.value.splice(index, 1)
  previews.value.splice(index, 1)
  errorMessage.value = ''
  emit('filesChanged', [...files.value])
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1024 / 1024).toFixed(1) + 'MB'
}
</script>

<template>
  <div>
    <!-- Drop zone -->
    <div
      v-if="canAddMore"
      class="border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer"
      :class="isDragOver ? 'border-summit-500 bg-summit-50' : 'border-gray-300 hover:border-gray-400'"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="handleDrop"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        class="hidden"
        @change="handleFileInput"
      />

      <svg class="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>

      <p class="text-sm text-gray-600 font-medium">
        {{ isDragOver ? 'Drop files here' : 'Tap to add photos or videos' }}
      </p>
      <p class="text-xs text-gray-400 mt-1">
        {{ files.length }}/{{ maxFiles }} files
      </p>
    </div>

    <!-- Error message -->
    <p v-if="errorMessage" class="text-sm text-red-600 mt-2">
      {{ errorMessage }}
    </p>

    <!-- Preview thumbnails -->
    <div v-if="previews.length > 0" class="mt-3 flex gap-2 overflow-x-auto pb-2">
      <div
        v-for="(preview, index) in previews"
        :key="index"
        class="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100"
      >
        <!-- Image preview -->
        <img
          v-if="preview.type === 'image'"
          :src="preview.url"
          class="w-full h-full object-cover"
        />

        <!-- Video preview -->
        <div v-else class="w-full h-full flex items-center justify-center bg-gray-800">
          <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
          </svg>
        </div>

        <!-- File size badge -->
        <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
          {{ formatFileSize(files[index].size) }}
        </div>

        <!-- Remove button -->
        <button
          @click.stop="removeFile(index)"
          class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
