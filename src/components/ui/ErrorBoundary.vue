<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ErrorState from './ErrorState.vue'
import { isRenderError, reportError } from '@/utils/errorReporting'

// Route-level boundary: a page that fails to render shows a recoverable error instead of
// blanking the whole app. Other errors pass through to app.config.errorHandler (toast).
const route = useRoute()
const router = useRouter()
const failed = ref(false)
const attempt = ref(0)

onErrorCaptured((err, _instance, info) => {
  if (!isRenderError(info)) return true
  console.error('[CoachHub] page render error', info, err)
  failed.value = true
  return false
})

watch(() => route.fullPath, () => { failed.value = false })

function retry() {
  failed.value = false
  attempt.value++
}

function goHome() {
  failed.value = false
  router.push('/').catch(err => reportError(err, 'navigation'))
}
</script>

<template>
  <div v-if="failed" class="py-12">
    <ErrorState
      title="Something went wrong"
      message="This page hit an unexpected error. Your data is safe."
      retry-label="Try again"
      @retry="retry"
    />
    <div class="text-center -mt-2">
      <button type="button" class="text-sm font-semibold text-summit-700 hover:text-summit-800" @click="goHome">
        Go home
      </button>
    </div>
  </div>
  <div v-else :key="attempt" class="contents">
    <slot />
  </div>
</template>
