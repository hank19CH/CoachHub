import { createRouter, createWebHistory } from 'vue-router'
import { reportError } from '@/utils/errorReporting'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Public routes
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresGuest: true }
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('@/views/SignupView.vue'),
      meta: { requiresGuest: true }
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
      meta: { requiresAuth: true, bare: true, title: 'Get started' }
    },
    {
      path: '/invite/:code',
      name: 'invite-acceptance',
      component: () => import('@/views/InviteAcceptanceView.vue'),
      meta: { title: 'Accept Invitation' }
    },

    // Protected routes (require authentication)
    {
      path: '/',
      name: 'feed',
      component: () => import('@/views/FeedView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('@/views/ExploreView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/create',
      name: 'create',
      component: () => import('@/views/CreatePostView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('@/views/NotificationsView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/messages',
      name: 'messages',
      component: () => import('@/views/MessagesView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/messages/:id',
      name: 'message-thread',
      component: () => import('@/views/MessageThreadView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/profile',
      name: 'my-profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/profile/:username',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { requiresAuth: true }
    },

    // Coach-specific routes
    {
      path: '/coach/hub',
      name: 'coach-hub',
      component: () => import('@/views/coach/CoachHubView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/athletes',
      name: 'athletes',
      component: () => import('@/views/coach/AthletesView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/programs',
      name: 'programs',
      component: () => import('@/views/coach/ProgramsView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/programs/:id',
      name: 'program-detail',
      component: () => import('@/views/coach/ProgramDetailView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/programs/:id/edit',
      name: 'edit-program',
      component: () => import('@/views/coach/ProgramEditorView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/workouts',
      name: 'workouts',
      component: () => import('@/views/coach/WorkoutsView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/workouts/new',
      name: 'workout-builder-new',
      component: () => import('@/views/coach/WorkoutBuilderView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/workouts/:id/edit',
      name: 'workout-builder',
      component: () => import('@/views/coach/WorkoutBuilderView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/dashboard',
      name: 'coach-dashboard',
      component: () => import('@/views/coach/CoachDashboardView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/athletes/:id',
      name: 'athlete-detail',
      component: () => import('@/views/coach/AthleteDetailView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/calendar',
      name: 'coach-calendar',
      component: () => import('@/views/coach/CalendarView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/groups',
      name: 'coach-groups',
      component: () => import('@/views/coach/GroupsView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/groups/:id',
      name: 'group-detail',
      component: () => import('@/views/coach/GroupDetailView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/planner',
      name: 'planner',
      component: () => import('@/views/coach/PlannerView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/planner/:planId',
      name: 'planner-detail',
      component: () => import('@/views/coach/PlannerView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/exercises',
      name: 'exercise-library',
      component: () => import('@/views/coach/ExerciseLibraryView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/import',
      name: 'smart-import',
      component: () => import('@/views/coach/SmartImportView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/philosophy',
      name: 'philosophy-insights',
      component: () => import('@/views/coach/PhilosophyInsightsView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/coach/billing',
      name: 'coach-billing',
      component: () => import('@/views/coach/BillingView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },

    // Athlete-specific routes
    {
      path: '/athlete/hub',
      name: 'athlete-hub',
      component: () => import('@/views/athlete/AthleteHubView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
    },
    {
      path: '/athlete/dashboard',
      name: 'athlete-dashboard',
      component: () => import('@/views/athlete/AthleteDashboardView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
    },
    {
      path: '/athlete/workout/:id',
      name: 'workout-execution',
      component: () => import('@/views/athlete/WorkoutExecutionView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
    },
    {
      path: '/athlete/teams',
      name: 'athlete-teams',
      component: () => import('@/views/athlete/TeamsView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
    },
    {
      path: '/athlete/teams/:id',
      name: 'athlete-team-detail',
      component: () => import('@/views/athlete/TeamDetailView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
    },
    // Placeholder routes - redirect to dashboard until implemented
    { path: '/coach/programs/new', redirect: '/coach/programs' },
    { path: '/athlete/workouts', redirect: '/athlete/dashboard' },
    { path: '/athlete/workouts/:id', redirect: '/athlete/dashboard' },
    { path: '/athlete/progress', redirect: '/athlete/dashboard' },

    // Pricing page (public)
    {
      path: '/pricing',
      name: 'pricing',
      component: () => import('@/views/PricingView.vue'),
    },

    // Public profile (/@username)
    {
      path: '/@:username',
      name: 'public-profile',
      component: () => import('@/views/PublicProfileView.vue'),
    },

    // Post detail
    {
      path: '/post/:id',
      name: 'post',
      component: () => import('@/views/PostDetailView.vue'),
      meta: { requiresAuth: true }
    },

    // Catch-all 404
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// Navigation guards
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Wait for auth to initialize
  if (authStore.loading) {
    await new Promise<void>((resolve) => {
      const unwatch = authStore.$subscribe((mutation, state) => {
        if (!state.loading) {
          unwatch()
          resolve()
        }
      })
      // Also resolve if already loaded
      if (!authStore.loading) {
        unwatch()
        resolve()
      }
    })
  }

  const isAuthenticated = authStore.isAuthenticated
  const isCoach = authStore.isCoach
  const isAthlete = authStore.isAthlete

  // Check if route requires authentication
  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  // Signed in but no profile yet, or a coach/athlete mid-onboarding → finish onboarding first.
  // Invite links stay reachable so an invited athlete can still see who invited them.
  if (isAuthenticated && authStore.needsOnboarding && to.name !== 'onboarding' && to.name !== 'invite-acceptance') {
    next({ name: 'onboarding' })
    return
  }

  // Check if route requires guest (not logged in)
  if (to.meta.requiresGuest && isAuthenticated) {
    next({ name: 'feed' })
    return
  }

  // Check if route requires coach role
  if (to.meta.requiresCoach && !isCoach) {
    next({ name: 'feed' })
    return
  }

  // Check if route requires athlete role
  if (to.meta.requiresAthlete && !isAthlete) {
    next({ name: 'feed' })
    return
  }

  next()
})

// After a deploy, tabs opened on the previous build can't load the old page chunks. Reload once
// onto the new build instead of leaving the user stuck; anything else goes to the error toast.
router.onError((err, to) => {
  const msg = err instanceof Error ? err.message : String(err)
  const staleChunk = /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)
  const key = 'coachhub:chunk-reload'
  let alreadyTried = true
  try {
    alreadyTried = sessionStorage.getItem(key) === to.fullPath
    if (staleChunk && !alreadyTried) sessionStorage.setItem(key, to.fullPath)
  } catch { /* storage unavailable: don't risk a reload loop */ }
  if (staleChunk && !alreadyTried) {
    window.location.assign(to.fullPath)
    return
  }
  reportError(err, 'router')
})

export default router
