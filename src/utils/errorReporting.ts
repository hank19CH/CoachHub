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
