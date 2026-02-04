import { createRouter, createWebHistory } from 'vue-router'
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
      path: '/athletes',
      name: 'athletes',
      component: () => import('@/views/coach/AthletesView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/programs',
      name: 'programs',
      component: () => import('@/views/coach/ProgramsView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/programs/new',
      name: 'new-program',
      component: () => import('@/views/coach/ProgramEditorView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/programs/:id',
      name: 'program-detail',
      component: () => import('@/views/coach/ProgramDetailView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/programs/:id/edit',
      name: 'edit-program',
      component: () => import('@/views/coach/ProgramEditorView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/workouts',
      name: 'workouts',
      component: () => import('@/views/coach/WorkoutsView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },
    {
      path: '/workouts/:id/edit',
      name: 'workout-builder',
      component: () => import('@/views/coach/WorkoutBuilderView.vue'),
      meta: { requiresAuth: true, requiresCoach: true }
    },

    // Athlete-specific routes
    {
      path: '/athlete/workouts',
      name: 'athlete-workouts',
      component: () => import('@/views/athlete/WorkoutsView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
    },
    {
      path: '/athlete/workouts/:id',
      name: 'athlete-workout-detail',
      component: () => import('@/views/athlete/WorkoutDetailView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
    },
    {
      path: '/progress',
      name: 'progress',
      component: () => import('@/views/athlete/ProgressView.vue'),
      meta: { requiresAuth: true, requiresAthlete: true }
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

export default router
