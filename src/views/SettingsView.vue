<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { CoachProfile } from '@/types/database'

const router = useRouter()
const authStore = useAuthStore()

// Form state
const isEditing = ref(false)
const isSaving = ref(false)
const uploadingAvatar = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Profile fields
const displayName = ref('')
const bio = ref('')
const isPrivate = ref(false)
const selectedSports = ref<string[]>([])
const avatarFile = ref<File | null>(null)
const avatarPreview = ref<string | null>(null)

// Coach-specific fields
const qualifications = ref('')
const experienceYears = ref<number | null>(null)
const location = ref('')
const websiteUrl = ref('')
const specialties = ref<string[]>([])
const acceptsAthletes = ref(true)
const coachProfile = ref<CoachProfile | null>(null)

// Sports list (we'll load this from the database)
const availableSports = ref<{ id: string; name: string }[]>([])
const showSportsModal = ref(false)

// Specialties input
const specialtyInput = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)

const initials = computed(() => {
  if (!displayName.value) return authStore.profile?.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  return displayName.value.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
})

const currentAvatar = computed(() => {
  if (avatarPreview.value) return avatarPreview.value
  if (authStore.profile?.avatar_url) return authStore.profile.avatar_url
  return null
})

onMounted(async () => {
  await loadProfile()
  await loadSports()
})

async function loadProfile() {
  if (!authStore.profile) return

  // Load basic profile data
  displayName.value = authStore.profile.display_name
  bio.value = authStore.profile.bio || ''
  isPrivate.value = authStore.profile.is_private
  selectedSports.value = authStore.profile.sport_ids || []

  // Load coach-specific data if user is a coach
  if (authStore.isCoach) {
    try {
      const { data, error } = (await supabase
        .from('coach_profiles')
        .select('*')
        .eq('id', authStore.user!.id)
        .single()) as { data: CoachProfile | null; error: any }

      if (error) throw error

      coachProfile.value = data
      qualifications.value = data?.qualifications || ''
      experienceYears.value = data?.experience_years ?? null
      location.value = data?.location || ''
      websiteUrl.value = data?.website_url || ''
      specialties.value = data?.specialties || []
      acceptsAthletes.value = data?.accepts_athletes ?? true
    } catch (e) {
      console.error('Error loading coach profile:', e)
    }
  }
}

async function loadSports() {
  try {
    const { data, error } = await supabase
      .from('sports')
      .select('id, name')
      .eq('is_approved', true)
      .order('name')

    if (error) throw error
    availableSports.value = data || []
  } catch (e) {
    console.error('Error loading sports:', e)
  }
}

function handleAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      errorMessage.value = 'Please select an image file'
      return
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      errorMessage.value = 'Image must be less than 5MB'
      return
    }

    avatarFile.value = file
    
    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      avatarPreview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

async function uploadAvatar(): Promise<string | null> {
  if (!avatarFile.value || !authStore.user) return null

  try {
    uploadingAvatar.value = true
    
    // Create unique filename
    const fileExt = avatarFile.value.name.split('.').pop()
    const fileName = `${authStore.user.id}-${Date.now()}.${fileExt}`
    
    // Upload to Supabase Storage (path should just be the filename, not nested)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, avatarFile.value, {
        upsert: true
      })

    if (uploadError) throw uploadError

    // Get public URL
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    return data.publicUrl
  } catch (e) {
    console.error('Error uploading avatar:', e)
    errorMessage.value = 'Failed to upload avatar'
    return null
  } finally {
    uploadingAvatar.value = false
  }
}

function toggleSport(sportId: string) {
  const index = selectedSports.value.indexOf(sportId)
  if (index > -1) {
    selectedSports.value.splice(index, 1)
  } else {
    selectedSports.value.push(sportId)
  }
}

function addSpecialty() {
  if (specialtyInput.value.trim() && !specialties.value.includes(specialtyInput.value.trim())) {
    specialties.value.push(specialtyInput.value.trim())
    specialtyInput.value = ''
  }
}

function removeSpecialty(specialty: string) {
  specialties.value = specialties.value.filter(s => s !== specialty)
}

async function handleSave() {
  if (!authStore.user) return

  isSaving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    // Upload avatar if changed
    let avatarUrl = authStore.profile?.avatar_url || null
    if (avatarFile.value) {
      const uploadedUrl = await uploadAvatar()
      if (uploadedUrl) avatarUrl = uploadedUrl
    }

    // Update basic profile
    const { error: profileError } = (await (supabase
      .from('profiles') as any)
      .update({
        display_name: displayName.value,
        bio: bio.value || null,
        is_private: isPrivate.value,
        sport_ids: selectedSports.value,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', authStore.user.id)) as { error: any }

    if (profileError) throw profileError

    // Update coach profile if user is a coach
    if (authStore.isCoach) {
      const { error: coachError } = (await (supabase
        .from('coach_profiles') as any)
        .update({
          qualifications: qualifications.value || null,
          experience_years: experienceYears.value,
          location: location.value || null,
          website_url: websiteUrl.value || null,
          specialties: specialties.value,
          accepts_athletes: acceptsAthletes.value
        })
        .eq('id', authStore.user.id)) as { error: any }

      if (coachError) throw coachError
    }

    // Refresh profile in store
    await authStore.fetchProfile()

    successMessage.value = 'Profile updated successfully!'
    isEditing.value = false
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)
  } catch (e) {
    console.error('Error updating profile:', e)
    errorMessage.value = e instanceof Error ? e.message : 'Failed to update profile'
  } finally {
    isSaving.value = false
  }
}

function cancelEdit() {
  isEditing.value = false
  loadProfile()
  avatarFile.value = null
  avatarPreview.value = null
  errorMessage.value = ''
}

async function handleSignOut() {
  await authStore.signOut()
  router.push('/login')
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h1 class="font-display text-xl font-bold text-gray-900">
          {{ isEditing ? 'Edit Profile' : 'Settings' }}
        </h1>
        <button 
          v-if="isEditing"
          @click="cancelEdit"
          class="text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </div>

    <div class="p-4 space-y-4">
      <!-- Success message -->
      <div 
        v-if="successMessage" 
        class="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm animate-fade-in"
      >
        {{ successMessage }}
      </div>

      <!-- Error message -->
      <div 
        v-if="errorMessage" 
        class="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
      >
        {{ errorMessage }}
      </div>

      <!-- Profile Section -->
      <div class="card p-4">
        <div class="flex items-center gap-4 mb-4">
          <!-- Avatar -->
          <div class="relative">
            <div class="w-20 h-20 rounded-full overflow-hidden">
              <img
                v-if="currentAvatar"
                :src="currentAvatar"
                alt="Avatar"
                class="w-full h-full object-cover"
              />
              <div 
                v-else 
                class="w-full h-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-bold text-xl"
              >
                {{ initials }}
              </div>
            </div>
            <button
              v-if="isEditing"
              @click="avatarInput?.click()"
              class="absolute bottom-0 right-0 w-7 h-7 bg-summit-700 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-summit-800 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input
              ref="avatarInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleAvatarChange"
            />
          </div>

          <!-- Name & username -->
          <div class="flex-1">
            <template v-if="!isEditing">
              <h2 class="font-semibold text-gray-900">{{ authStore.displayName }}</h2>
              <p class="text-sm text-gray-500">@{{ authStore.profile?.username }}</p>
            </template>
            <template v-else>
              <input
                v-model="displayName"
                type="text"
                placeholder="Display Name"
                class="input text-sm mb-1"
              />
              <p class="text-sm text-gray-500">@{{ authStore.profile?.username }}</p>
            </template>
          </div>
        </div>

        <!-- Bio -->
        <div v-if="isEditing" class="mb-4">
          <label class="label">Bio</label>
          <textarea
            v-model="bio"
            rows="3"
            placeholder="Tell people about yourself..."
            class="input resize-none"
            maxlength="160"
          ></textarea>
          <p class="helper-text text-right">{{ bio.length }}/160</p>
        </div>
        <p v-else-if="authStore.profile?.bio" class="text-sm text-gray-700 mb-4">
          {{ authStore.profile.bio }}
        </p>

        <!-- Sports -->
        <div class="mb-4">
          <label class="label">Sports</label>
          <div v-if="isEditing" class="space-y-2">
            <button
              @click="showSportsModal = true"
              class="w-full p-3 border border-gray-200 rounded-xl text-left hover:border-summit-500 transition-colors"
            >
              <span v-if="selectedSports.length === 0" class="text-gray-400">
                Select sports...
              </span>
              <span v-else class="text-gray-900">
                {{ selectedSports.length }} sport{{ selectedSports.length !== 1 ? 's' : '' }} selected
              </span>
            </button>
          </div>
          <div v-else-if="selectedSports.length > 0" class="flex flex-wrap gap-2">
            <span
              v-for="sportId in selectedSports"
              :key="sportId"
              class="badge badge-coach"
            >
              {{ availableSports.find(s => s.id === sportId)?.name || sportId }}
            </span>
          </div>
          <p v-else class="text-sm text-gray-400">No sports selected</p>
        </div>

        <!-- Privacy -->
        <div v-if="isEditing" class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div>
            <p class="font-medium text-gray-900">Private Account</p>
            <p class="text-sm text-gray-500">Only followers can see your posts</p>
          </div>
          <button
            @click="isPrivate = !isPrivate"
            class="relative w-12 h-6 rounded-full transition-colors"
            :class="isPrivate ? 'bg-summit-600' : 'bg-gray-300'"
          >
            <span
              class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              :class="isPrivate ? 'translate-x-6' : 'translate-x-0'"
            ></span>
          </button>
        </div>
      </div>

      <!-- Coach-specific fields -->
      <div v-if="authStore.isCoach && isEditing" class="card p-4 space-y-4">
        <h2 class="font-semibold text-gray-900">Coach Information</h2>

        <!-- Qualifications -->
        <div>
          <label class="label">Qualifications</label>
          <textarea
            v-model="qualifications"
            rows="2"
            placeholder="Your coaching certifications and qualifications..."
            class="input resize-none"
          ></textarea>
        </div>

        <!-- Experience Years -->
        <div>
          <label class="label">Years of Experience</label>
          <input
            v-model.number="experienceYears"
            type="number"
            min="0"
            placeholder="0"
            class="input"
          />
        </div>

        <!-- Location -->
        <div>
          <label class="label">Location</label>
          <input
            v-model="location"
            type="text"
            placeholder="City, Country"
            class="input"
          />
        </div>

        <!-- Website -->
        <div>
          <label class="label">Website</label>
          <input
            v-model="websiteUrl"
            type="url"
            placeholder="https://yourwebsite.com"
            class="input"
          />
        </div>

        <!-- Specialties -->
        <div>
          <label class="label">Specialties</label>
          <div class="space-y-2">
            <div class="flex gap-2">
              <input
                v-model="specialtyInput"
                type="text"
                placeholder="Add a specialty"
                class="input flex-1"
                @keypress.enter.prevent="addSpecialty"
              />
              <button
                @click="addSpecialty"
                class="btn-secondary px-4"
              >
                Add
              </button>
            </div>
            <div v-if="specialties.length > 0" class="flex flex-wrap gap-2">
              <span
                v-for="specialty in specialties"
                :key="specialty"
                class="inline-flex items-center gap-1 px-3 py-1 bg-summit-100 text-summit-800 rounded-full text-sm"
              >
                {{ specialty }}
                <button
                  @click="removeSpecialty(specialty)"
                  class="hover:text-summit-900"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            </div>
          </div>
        </div>

        <!-- Accepting Athletes -->
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div>
            <p class="font-medium text-gray-900">Accepting New Athletes</p>
            <p class="text-sm text-gray-500">Allow athletes to request coaching</p>
          </div>
          <button
            @click="acceptsAthletes = !acceptsAthletes"
            class="relative w-12 h-6 rounded-full transition-colors"
            :class="acceptsAthletes ? 'bg-summit-600' : 'bg-gray-300'"
          >
            <span
              class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              :class="acceptsAthletes ? 'translate-x-6' : 'translate-x-0'"
            ></span>
          </button>
        </div>
      </div>

      <!-- Action buttons -->
      <div v-if="isEditing" class="space-y-3">
        <button
          @click="handleSave"
          :disabled="isSaving"
          class="btn-primary w-full"
        >
          <span v-if="isSaving" class="flex items-center gap-2 justify-center">
            <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          </span>
          <span v-else>Save Changes</span>
        </button>
      </div>

      <!-- Settings menu (when not editing) -->
      <template v-if="!isEditing">
        <!-- Account section -->
        <div class="card p-4">
          <h2 class="font-semibold text-gray-900 mb-3">Account</h2>
          <div class="space-y-2">
            <button
              @click="isEditing = true"
              class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <span>Edit Profile</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Sign out -->
        <button 
          @click="handleSignOut"
          class="w-full p-4 text-red-600 font-medium rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
        >
          Sign Out
        </button>

        <!-- Version -->
        <p class="text-center text-gray-400 text-sm">
          CoachHub v0.1.0
        </p>
      </template>
    </div>

    <!-- Sports Selection Modal -->
    <div
      v-if="showSportsModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50"
      @click.self="showSportsModal = false"
    >
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up">
        <!-- Modal header -->
        <div class="p-4 border-b border-feed-border flex items-center justify-between">
          <h2 class="font-semibold text-lg">Select Sports</h2>
          <button
            @click="showSportsModal = false"
            class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Sports list -->
        <div class="overflow-y-auto flex-1 p-4">
          <div class="space-y-1">
            <button
              v-for="sport in availableSports"
              :key="sport.id"
              @click="toggleSport(sport.id)"
              class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <span>{{ sport.name }}</span>
              <div
                class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                :class="selectedSports.includes(sport.id) 
                  ? 'bg-summit-600 border-summit-600' 
                  : 'border-gray-300'"
              >
                <svg
                  v-if="selectedSports.includes(sport.id)"
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-3 h-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        <!-- Modal footer -->
        <div class="p-4 border-t border-feed-border">
          <button
            @click="showSportsModal = false"
            class="btn-primary w-full"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
