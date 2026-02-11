import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile, UserType, ProfileInsert } from '@/types/database'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const session = ref<Session | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  // Getters
  const isAuthenticated = computed(() => !!user.value)
  const isCoach = computed(() => profile.value?.user_type === 'coach')
  const isAthlete = computed(() => profile.value?.user_type === 'athlete')
  const isFollower = computed(() => profile.value?.user_type === 'follower')
  const displayName = computed(() => profile.value?.display_name || user.value?.email || 'User')
  const avatarUrl = computed(() => profile.value?.avatar_url || null)

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
          await fetchProfile()
        } else if (event === 'SIGNED_OUT') {
          profile.value = null
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
    } catch (e) {
      console.error('Error fetching profile:', e)
      profile.value = null
    }
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

      // Create profile
      const profileData: ProfileInsert = {
        id: authData.user.id,
        username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        display_name: displayName,
        user_type: userType,
        is_private: false,
        sport_ids: [],
      }

      const { error: profileError } = await (supabase
        .from('profiles') as any)
        .insert(profileData)

      if (profileError) {
        console.error('Profile creation error:', profileError)
        throw profileError
      }

      // If coach, create coach_profile
      if (userType === 'coach') {
        const { error: coachError } = await (supabase
          .from('coach_profiles') as any)
          .insert({ id: authData.user.id })

        if (coachError) {
          console.error('Coach profile creation error:', coachError)
          throw coachError
        }
      }

      // If athlete, create athlete_profile
      if (userType === 'athlete') {
        const { error: athleteError } = await (supabase
          .from('athlete_profiles') as any)
          .insert({ id: authData.user.id })

        if (athleteError) {
          console.error('Athlete profile creation error:', athleteError)
          throw athleteError
        }
      }

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
    // Getters
    isAuthenticated,
    isCoach,
    isAthlete,
    isFollower,
    displayName,
    avatarUrl,
    // Actions
    initialize,
    fetchProfile,
    signUp,
    signIn,
    signOut,
    updateProfile,
  }
})
