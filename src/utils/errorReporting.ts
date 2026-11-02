import { ref } from 'vue'

/**
 * Global error reporting (Sprint 14.5).
 * ErrorBoundary.vue takes over the page for errors that break rendering; everything else
 * (button handlers, watchers, async actions) lands here and shows a toast in App.vue.
 */
export const lastErrorMessage = ref<string | null>(null)

export function reportError(err: unknown, info?: string) {
  console.error('[CoachHub]', info ?? '', err)
  lastErrorMessage.value = 'Something went wrong. Please try again.'
}

/** Database rate limit (migration 20261102_social_rate_limits) rejected the write. */
export function isRateLimited(err: unknown): boolean {
  return /rate_limited/.test(String((err as { message?: string } | null)?.message ?? err))
}

/** Toast for a failed social action: friendly wording when it was the rate limit. */
export function reportActionError(err: unknown, action: string) {
  if (isRateLimited(err)) {
    console.warn('[CoachHub] rate limited:', action)
    lastErrorMessage.value = "You're going a bit fast. Wait a moment and try again."
    return
  }
  reportError(err, action)
}

// Vue passes `info` as a readable string in dev ("render function", "mounted hook") and as an
// error-reference URL ending in "#runtime-<code>" in production builds.
// Only errors that stop a page from being built count. Errors in mounted/updated hooks (typically a
// background fetch after the page is already showing) get the toast instead of replacing the page.
const FATAL_DEV = /^(setup function|render function|(beforeCreate|created|beforeMount|serverPrefetch) hook)$/
const FATAL_PROD = new Set(['0', '1', 'bc', 'c', 'bm', 'sp'])

/** True when the error happened while building or rendering a component, so the page can't be trusted. */
export function isRenderError(info: string): boolean {
  if (FATAL_DEV.test(info)) return true
  const code = info.match(/#runtime-([a-z0-9]+)$/i)?.[1]
  return code !== undefined && FATAL_PROD.has(code)
}
