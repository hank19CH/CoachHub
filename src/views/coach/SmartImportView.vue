<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { importProgram, saveImportedProgram, getImportHistory } from '@/services/aiImport'
import type { ImportResult, ImportHistoryRecord } from '@/types/import'
import { AI_CONFIG } from '@/config/ai'

const router = useRouter()

const file = ref<File | null>(null)
const isProcessing = ref(false)
const isSaving = ref(false)
const processingStage = ref<'uploading' | 'parsing' | 'validating' | 'complete'>('uploading')
const importResult = ref<ImportResult | null>(null)
const historyRecord = ref<ImportHistoryRecord | null>(null)
const error = ref<string | null>(null)
const importHistory = ref<ImportHistoryRecord[]>([])

// Load import history on mount
const loadHistory = async () => {
  try {
    importHistory.value = await getImportHistory(10)
  } catch (err) {
    console.error('Failed to load history:', err)
  }
}

loadHistory()

const fileTypeLabel = computed(() => {
  if (!file.value) return ''
  const type = file.value.type
  if (type.includes('excel') || type.includes('spreadsheet')) return 'Excel'
  if (type.includes('csv')) return 'CSV'
  if (type.includes('pdf')) return 'PDF'
  if (type.includes('image')) return 'Image'
  return 'File'
})

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    file.value = target.files[0]
    error.value = null
    importResult.value = null
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false
  const droppedFile = event.dataTransfer?.files[0]
  if (droppedFile) {
    file.value = droppedFile
    error.value = null
    importResult.value = null
  }
}

const isDragging = ref(false)

const handleImport = async () => {
  if (!file.value) return

  isProcessing.value = true
  error.value = null
  processingStage.value = 'uploading'

  try {
    processingStage.value = 'uploading'
    await new Promise(resolve => setTimeout(resolve, 500))

    processingStage.value = 'parsing'
    const result = await importProgram(file.value)

    processingStage.value = 'validating'
    await new Promise(resolve => setTimeout(resolve, 300))

    processingStage.value = 'complete'
    importResult.value = result.importResult
    historyRecord.value = result.historyRecord

    await loadHistory()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Import failed'
    console.error('Import error:', err)
  } finally {
    isProcessing.value = false
  }
}

const handleConfirmImport = async () => {
  if (!importResult.value) return

  isSaving.value = true
  try {
    const programId = await saveImportedProgram(importResult.value)
    router.push(`/coach/programs/${programId}`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save program'
    console.error('Save error:', err)
  } finally {
    isSaving.value = false
  }
}

const handleCancel = () => {
  file.value = null
  importResult.value = null
  historyRecord.value = null
  error.value = null
  processingStage.value = 'uploading'
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const statusColor = (status: string) => {
  switch (status) {
    case 'success': return 'text-emerald-600'
    case 'failed': return 'text-red-600'
    case 'partial': return 'text-amber-600'
    default: return 'text-gray-600'
  }
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'success': return 'M5 13l4 4L19 7'
    case 'failed': return 'M6 18L18 6M6 6l12 12'
    default: return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 sticky top-14 z-10">
      <div class="max-w-3xl mx-auto px-4 py-4">
        <div class="flex items-center gap-3">
          <button @click="router.back()" class="text-gray-500 hover:text-gray-700">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-gray-900">Smart Import</h1>
            <p class="text-sm text-gray-500">Upload training programs for AI extraction</p>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <!-- Import Card -->
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <!-- File Upload (pre-import state) -->
        <div v-if="!importResult" class="p-6 space-y-5">
          <!-- Drop Zone -->
          <div
            v-if="!file"
            class="border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer"
            :class="isDragging ? 'border-summit-500 bg-summit-50' : 'border-gray-300 hover:border-summit-400 hover:bg-gray-50'"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop="handleDrop"
            @click="($refs.fileInput as HTMLInputElement)?.click()"
          >
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-summit-100 flex items-center justify-center">
              <svg class="w-8 h-8 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p class="text-lg font-medium text-gray-700 mb-1">Drop your file here or click to browse</p>
            <p class="text-sm text-gray-500">
              Supports Excel, CSV, PDF, or images (max {{ AI_CONFIG.import.maxFileSize / 1024 / 1024 }}MB)
            </p>
            <input
              ref="fileInput"
              type="file"
              :accept="AI_CONFIG.import.supportedExtensions.join(',')"
              @change="handleFileChange"
              class="hidden"
            />
          </div>

          <!-- File Preview -->
          <div v-if="file" class="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-summit-100 rounded-lg flex items-center justify-center">
                  <svg class="w-6 h-6 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p class="font-medium text-gray-900">{{ file.name }}</p>
                  <p class="text-sm text-gray-500">
                    {{ fileTypeLabel }} &middot; {{ formatFileSize(file.size) }}
                  </p>
                </div>
              </div>
              <button
                @click="file = null"
                class="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Processing Stages -->
          <div v-if="isProcessing" class="space-y-4">
            <div class="flex items-center gap-4">
              <div class="flex-1">
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-summit-600 transition-all duration-500 ease-out"
                    :style="{
                      width: processingStage === 'uploading' ? '25%' :
                             processingStage === 'parsing' ? '60%' :
                             processingStage === 'validating' ? '85%' : '100%'
                    }"
                  ></div>
                </div>
              </div>
              <div class="text-sm font-medium text-gray-700 min-w-[100px] text-right">
                {{ processingStage === 'uploading' ? 'Uploading...' :
                   processingStage === 'parsing' ? 'AI Parsing...' :
                   processingStage === 'validating' ? 'Validating...' : 'Complete!' }}
              </div>
            </div>

            <div class="flex items-center gap-2 text-sm text-gray-600">
              <svg class="animate-spin h-4 w-4 text-summit-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Processing with AI (est. cost: ${{ AI_CONFIG.import.estimatedCostPerImport.toFixed(4) }})</span>
            </div>
          </div>

          <!-- Error -->
          <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl p-4">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p class="font-medium text-red-800">Import Failed</p>
                <p class="text-sm text-red-700 mt-1">{{ error }}</p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              @click="handleImport"
              :disabled="!file || isProcessing"
              class="flex-1 bg-summit-600 text-white px-6 py-3 rounded-xl font-medium
                hover:bg-summit-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isProcessing ? 'Processing...' : 'Import Program' }}
            </button>
            <button
              v-if="file"
              @click="handleCancel"
              :disabled="isProcessing"
              class="px-6 py-3 border border-gray-300 rounded-xl font-medium
                hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Import Preview -->
        <div v-else class="p-6 space-y-5">
          <!-- Success Header -->
          <div class="flex items-center gap-3 pb-5 border-b border-gray-200">
            <div class="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
              <svg class="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-bold text-gray-900">Import Successful</h2>
              <p class="text-sm text-gray-600">Review the extracted program before saving</p>
            </div>
          </div>

          <!-- Program Summary -->
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Program Name</p>
              <p class="font-semibold text-gray-900 text-sm">{{ importResult.programName }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Duration</p>
              <p class="font-semibold text-gray-900 text-sm">{{ importResult.durationWeeks }} weeks</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Periodization</p>
              <p class="font-semibold text-gray-900 text-sm capitalize">{{ importResult.periodization }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs text-gray-500 mb-1">Sport</p>
              <p class="font-semibold text-gray-900 text-sm">{{ importResult.sport || 'Not detected' }}</p>
            </div>
          </div>

          <!-- Import Stats -->
          <div v-if="historyRecord" class="bg-summit-50 rounded-xl p-4">
            <div class="grid grid-cols-3 gap-4 text-center">
              <div>
                <p class="text-xl font-bold text-summit-700">{{ historyRecord.workouts_imported }}</p>
                <p class="text-xs text-gray-600">Workouts</p>
              </div>
              <div>
                <p class="text-xl font-bold text-summit-700">{{ historyRecord.exercises_imported }}</p>
                <p class="text-xs text-gray-600">Exercises</p>
              </div>
              <div>
                <p class="text-xl font-bold text-summit-700">{{ (historyRecord.processing_time_ms / 1000).toFixed(1) }}s</p>
                <p class="text-xs text-gray-600">Processing</p>
              </div>
            </div>
          </div>

          <!-- Week Preview -->
          <div class="space-y-3">
            <h3 class="font-semibold text-gray-900 text-sm">Preview (First 2 Weeks)</h3>
            <div v-for="week in importResult.weeks.slice(0, 2)" :key="week.weekNumber" class="border border-gray-200 rounded-lg p-3">
              <p class="font-medium text-gray-900 text-sm mb-2">
                Week {{ week.weekNumber }}{{ week.name ? ': ' + week.name : '' }}
              </p>
              <div class="space-y-1.5">
                <div v-for="workout in week.workouts" :key="workout.name" class="pl-3 border-l-2 border-summit-300">
                  <p class="text-sm font-medium text-gray-700">{{ workout.name }}</p>
                  <p class="text-xs text-gray-500">{{ workout.exercises.length }} exercises</p>
                </div>
              </div>
            </div>
            <p v-if="importResult.weeks.length > 2" class="text-xs text-gray-500 text-center">
              + {{ importResult.weeks.length - 2 }} more weeks
            </p>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 pt-4 border-t border-gray-200">
            <button
              @click="handleConfirmImport"
              :disabled="isSaving"
              class="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium
                hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {{ isSaving ? 'Saving...' : 'Confirm & Save to CoachHub' }}
            </button>
            <button
              @click="handleCancel"
              :disabled="isSaving"
              class="px-6 py-3 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Import History -->
      <div v-if="importHistory.length > 0" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="font-bold text-gray-900">Recent Imports</h2>
        </div>
        <div class="divide-y divide-gray-100">
          <div
            v-for="record in importHistory"
            :key="record.id"
            class="flex items-center justify-between px-6 py-3 hover:bg-gray-50"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                :class="record.status === 'success' ? 'bg-emerald-100' : record.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'">
                <svg class="w-4 h-4" :class="statusColor(record.status)" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" :d="statusIcon(record.status)" />
                </svg>
              </div>
              <div class="min-w-0">
                <p class="font-medium text-gray-900 text-sm truncate">{{ record.file_name }}</p>
                <p class="text-xs text-gray-500">
                  {{ formatDate(record.created_at) }}
                  <span v-if="record.status === 'success'">
                    &middot; {{ record.workouts_imported }} workouts, {{ record.exercises_imported }} exercises
                  </span>
                </p>
              </div>
            </div>
            <div class="text-right shrink-0 ml-3">
              <p class="text-xs font-medium capitalize" :class="statusColor(record.status)">
                {{ record.status }}
              </p>
              <p v-if="record.processing_time_ms" class="text-xs text-gray-400">{{ (record.processing_time_ms / 1000).toFixed(1) }}s</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
