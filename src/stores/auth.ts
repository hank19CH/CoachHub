import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile, UserType, ProfileInsert } from '@/types/database'
import type { CoachSubscription } from '@/services/billing'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const session = ref<Session | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const coachSubscription = ref<CoachSubscription | null>(null)
  const sessionExpired = ref(false)

  // Getters
  const isAuthenticated = computed(() => !!user.value)
  const isCoach = computed(() => profile.value?.user_type === 'coach')
  const isAthlete = computed(() => profile.value?.user_type === 'athlete')
  const isFollower = computed(() => profile.value?.user_type === 'follower')
  const displayName = computed(() => profile.value?.display_name || user.value?.email || 'User')
  const avatarUrl = computed(() => profile.value?.avatar_url || null)

  // Sprint 13 — Subscription getters
  const subscriptionTier = computed(() => coachSubscription.value?.subscription_tier ?? 'free')
  const subscriptionStatus = computed(() => coachSubscription.value?.subscription_status ?? 'inactive')
  const isSubscribed = computed(() =>
    ['trialing', 'active'].includes(coachSubscription.value?.subscription_status ?? '')
  )
  const isBetaUser = computed(() => coachSubscription.value?.is_beta_user ?? false)
  const athleteLimit = computed(() => coachSubscription.value?.athlete_limit ?? 3)

  // Sprint 14.5 — Onboarding. Signed in without a profile (e.g. first Google sign-in) or a
  // coach/athlete who hasn't finished the flow → /onboarding.
  const needsOnboarding = computed(() => {
    if (!user.value) return false
    if (!profile.value) return true
    // null = still onboarding. undefined = migration 20261103 not applied yet → never trap existing users.
    return profile.value.user_type !== 'follower' && profile.value.onboarding_completed_at === null
  })
  const onboardingFlags = computed(() => profile.value?.onboarding_flags ?? [])

  // Actions
  async function initialize() {
    try {
      loading.value = true
      error.value = null

      // Get initial session
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (currentSession) {
        session.value = currentSession
        user.value = currentSession.user
        await fetchProfile()
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, newSession) => {
        session.value = newSession
        user.value = newSession?.user || null

        if (event === 'SIGNED_IN' && newSession) {
          sessionExpired.value = false
          await fetchProfile()
        } else if (event === 'SIGNED_OUT') {
          profile.value = null
          coachSubscription.value = null
        } else if (event === 'TOKEN_REFRESHED' && !newSession) {
          // Token refresh failed — session is dead
          sessionExpired.value = true
          user.value = null
          profile.value = null
          session.value = null
        }
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to initialize auth'
      console.error('Auth initialization error:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchProfile() {
    if (!user.value) return

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.value.id)
        .single()

      if (fetchError) {
        // Profile doesn't exist yet - this is okay for new users
        if (fetchError.code === 'PGRST116') {
          profile.value = null
          return
        }
        throw fetchError
      }

      profile.value = data

      // Load subscription data for coaches
      if (data.user_type === 'coach') {
        const { fetchCoachSubscription } = await import('@/services/billing')
        coachSubscription.value = await fetchCoachSubscription(data.id)
      }
    } catch (e) {
      console.error('Error fetching profile:', e)
      profile.value = null
    }
  }

  async function refreshSubscription() {
    if (!user.value || !profile.value || profile.value.user_type !== 'coach') return
    const { fetchCoachSubscription } = await import('@/services/billing')
    coachSubscription.value = await fetchCoachSubscription(user.value.id)
  }

  async function signUp(
    email: string,
    password: string,
    userType: UserType,
    displayName: string,
    username: string
  ) {
    try {
      loading.value = true
      error.value = null

      // Create auth user with metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            user_type: userType,
            display_name: displayName,
            username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
          }
        }
      })

      if (authError) {
        console.error('Auth signup error:', authError)
        throw authError
      }
      if (!authData.user) throw new Error('No user returned from signup')

      // Wait a moment for the session to be established
      await new Promise(resolve => setTimeout(resolve, 1000))

      await insertProfileRows(authData.user.id, userType, displayName, username)

      // Fetch the created profile
      await fetchProfile()

      return { success: true }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Signup failed'
      error.value = errorMessage
      console.error('Signup error:', e)
      return { success: false, error: errorMessage }
    } finally {
      loading.value = false
    }
  }

  /** profiles row + the matching coach_profiles / athlete_profiles row. */
  async function insertProfileRows(userId: string, userType: UserType, displayName: string, username: string) {
    const profileData: ProfileInsert = {
      id: userId,
      username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      display_name: displayName,
      user_type: userType,
      is_private: false,
      sport_ids: [],
      // Followers have nothing to set up; coaches and athletes go through /onboarding.
      onboarding_completed_at: userType === 'follower' ? new Date().toISOString() : null,
    }

    const { error: profileError } = await (supabase
      .from('profiles') as any)
      .insert(profileData)

    if (profileError) {
      console.error('Profile creation error:', profileError)
      throw profileError
    }

    if (userType === 'coach') {
      const { error: coachError } = await (supabase
        .from('coach_profiles') as any)
        .insert({ id: userId })

      if (coachError) {
        console.error('Coach profile creation error:', coachError)
        throw coachError
      }
    }

    if (userType === 'athlete') {
      const { error: athleteError } = await (supabase
        .from('athlete_profiles') as any)
        .insert({ id: userId })

      if (athleteError) {
        console.error('Athlete profile creation error:', athleteError)
        throw athleteError
      }
    }
  }

  /** For a signed-in user without a profile yet (e.g. first Google sign-in). */
  async function createProfile(userType: UserType, displayName: string, username: string) {
    if (!user.value) return { success: false, error: 'Not authenticated' }
    try {
      error.value = null
      await insertProfileRows(user.value.id, userType, displayName, username)
      await fetchProfile()
      return { success: true }
    } catch (e) {
      const message = (e as { message?: string })?.message ?? 'Could not create your profile'
      error.value = /duplicate|unique/i.test(message) ? 'That username is taken — try another.' : message
      return { success: false, error: error.value }
    }
  }

  /** Google sign-in. Supabase redirects back to `redirectPath` (must be in the project's allowed redirect URLs). */
  async function signInWithGoogle(redirectPath = '/onboarding') {
    error.value = null
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${redirectPath}` },
    })
    if (oauthError) {
      error.value = oauthError.message
      return { success: false, error: oauthError.message }
    }
    return { success: true }
  }

  async function addOnboardingFlag(flag: string) {
    if (!user.value || !profile.value || profile.value.onboarding_flags?.includes(flag)) return
    const flags = [...(profile.value.onboarding_flags ?? []), flag]
    profile.value = { ...profile.value, onboarding_flags: flags }
    const { error: flagError } = await (supabase.from('profiles') as any)
      .update({ onboarding_flags: flags })
      .eq('id', user.value.id)
    if (flagError) console.error('Error saving onboarding flag:', flagError)
  }

  async function completeOnboarding() {
    if (!user.value || !profile.value) return
    const at = new Date().toISOString()
    // Local first, so navigation away from the last step isn't bounced back by the router guard.
    profile.value = { ...profile.value, onboarding_completed_at: at }
    const { error: doneError } = await (supabase.from('profiles') as any)
      .update({ onboarding_completed_at: at })
      .eq('id', user.value.id)
    if (doneError) throw doneError
  }

  async function signIn(email: string, password: string) {
    try {
      loading.value = true
      error.value = null

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      return { success: true }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sign in failed'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    try {
      loading.value = true
      error.value = null

      const { error: authError } = await supabase.auth.signOut()
      if (authError) throw authError

      user.value = null
      profile.value = null
      session.value = null

      return { success: true }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Sign out failed'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!user.value) return { success: false, error: 'Not authenticated' }

    try {
      loading.value = true
      error.value = null

      const { error: updateError } = await (supabase
        .from('profiles') as any)
        .update(updates)
        .eq('id', user.value.id)

      if (updateError) throw updateError

      // Refresh profile
      await fetchProfile()

      return { success: true }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Update failed'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    user,
    profile,
    session,
    loading,
    error,
    coachSubscription,
    sessionExpired,
    // Getters
    isAuthenticated,
    isCoach,
    isAthlete,
    isFollower,
    displayName,
    avatarUrl,
    // Sprint 13 — Subscription getters
    subscriptionTier,
    subscriptionStatus,
    isSubscribed,
    isBetaUser,
    athleteLimit,
    needsOnboarding,
    onboardingFlags,
    // Actions
    initialize,
    fetchProfile,
    refreshSubscription,
    signUp,
    createProfile,
    signInWithGoogle,
    addOnboardingFlag,
    completeOnboarding,
    signIn,
    signOut,
    updateProfile,
  }
})
