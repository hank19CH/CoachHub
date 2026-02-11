type AnalyticsEvent =
  | 'post_created'
  | 'post_liked'
  | 'comment_created'
  | 'workout_shared'
  | 'profile_viewed'
  | 'streak_incremented'
  | 'exercise_favorited'
  | 'workout_reassigned'
  | 'pr_achieved'
  | 'streak_milestone'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function trackEvent(_event: AnalyticsEvent, _metadata?: Record<string, any>) {
  // Analytics tracking placeholder
  // In development, events are logged to console
  // In production, this will integrate with an analytics provider
  try {
    // @ts-ignore - Vite provides import.meta.env
    const isDev = import.meta.env?.DEV
    if (isDev) {
      console.log('[Analytics]', _event, _metadata)
    }
  } catch {
    // Silently ignore if import.meta is not available
  }
}
