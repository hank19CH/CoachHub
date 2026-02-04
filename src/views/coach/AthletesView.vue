<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

const router = useRouter()
const authStore = useAuthStore()

// State
const athletes = ref<Array<Profile & { relationship_status?: string }>>([])
const loading = ref(true)
const searchQuery = ref('')
const showInviteModal = ref(false)
const inviteLink = ref('')
const inviteCode = ref('')
const copySuccess = ref(false)

// Computed
const filteredAthletes = computed(() => {
  if (!searchQuery.value) return athletes.value
  
  const query = searchQuery.value.toLowerCase()
  return athletes.value.filter(athlete => 
    athlete.display_name.toLowerCase().includes(query) ||
    athlete.username.toLowerCase().includes(query)
  )
})

const hasAthletes = computed(() => athletes.value.length > 0)

onMounted(async () => {
  await loadAthletes()
})

async function loadAthletes() {
  if (!authStore.user) return
  
  try {
    loading.value = true
    
    // Fetch athletes connected to this coach
    const { data, error } = await supabase
      .from('coach_athletes')
      .select(`
        status,
        athlete:profiles!coach_athletes_athlete_id_fkey(*)
      `)
      .eq('coach_id', authStore.user.id)
      .eq('status', 'active')
    
    if (error) throw error
    
    // Map the results to our athletes array
    athletes.value = (data || []).map(item => ({
      ...item.athlete,
      relationship_status: item.status
    }))
  } catch (e) {
    console.error('Error loading athletes:', e)
  } finally {
    loading.value = false
  }
}

async function generateInviteLink() {
  if (!authStore.user) return
  
  try {
    // Generate invite code that encodes the coach ID
    // Format: COACH-{random}-{first 8 chars of coach ID}
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase()
    const coachIdPart = authStore.user.id.substring(0, 8).toUpperCase()
    const code = `${randomPart}-${coachIdPart}`
    
    // Create the invite link (no database record needed yet)
    const baseUrl = window.location.origin
    inviteLink.value = `${baseUrl}/invite/${code}`
    inviteCode.value = code
    showInviteModal.value = true
  } catch (e) {
    console.error('Error generating invite:', e)
    alert('Failed to generate invite link')
  }
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

function closeInviteModal() {
  showInviteModal.value = false
  inviteLink.value = ''
  inviteCode.value = ''
  copySuccess.value = false
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-white border-b border-feed-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h1 class="font-display text-xl font-bold text-gray-900">Athletes</h1>
        <button
          @click="generateInviteLink"
          class="btn-primary px-4 py-2 text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Athlete
        </button>
      </div>
    </div>

    <!-- Search bar (only show if has athletes) -->
    <div v-if="hasAthletes" class="p-4">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search athletes..."
          class="input pl-10"
        />
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="p-6">
      <div class="space-y-4">
        <div v-for="i in 3" :key="i" class="animate-pulse">
          <div class="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
            <div class="w-12 h-12 bg-gray-200 rounded-full"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-gray-200 rounded w-3/4"></div>
              <div class="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!hasAthletes" class="p-6 text-center">
      <div class="max-w-sm mx-auto">
        <div class="w-20 h-20 mx-auto mb-4 bg-summit-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-summit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 class="font-semibold text-lg text-gray-900 mb-2">No athletes yet</h2>
        <p class="text-gray-600 mb-6">
          Start building your roster by inviting athletes to join you on CoachHub
        </p>
        <button
          @click="generateInviteLink"
          class="btn-primary w-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Invite Your First Athlete
        </button>
      </div>
    </div>

    <!-- Athletes list -->
    <div v-else class="p-4 space-y-3">
      <div
        v-for="athlete in filteredAthletes"
        :key="athlete.id"
        class="card p-4 hover:shadow-md transition-shadow"
      >
        <div class="flex items-center gap-3">
          <!-- Avatar -->
          <div class="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden">
            <img
              v-if="athlete.avatar_url"
              :src="athlete.avatar_url"
              :alt="athlete.display_name"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold"
            >
              {{ getInitials(athlete.display_name) }}
            </div>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-gray-900 truncate">
              {{ athlete.display_name }}
            </h3>
            <p class="text-sm text-gray-500 truncate">
              @{{ athlete.username }}
            </p>
          </div>

          <!-- Actions -->
          <div class="flex gap-2">
            <button
              @click="router.push(`/profile/${athlete.username}`)"
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="View profile"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
            <button
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Assign workout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- No results from search -->
      <div v-if="filteredAthletes.length === 0" class="text-center py-8 text-gray-500">
        <p>No athletes found matching "{{ searchQuery }}"</p>
      </div>
    </div>

    <!-- Invite Modal -->
    <div
      v-if="showInviteModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50"
      @click.self="closeInviteModal"
    >
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl p-6 animate-slide-up">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-lg">Invite Athlete</h2>
          <button
            @click="closeInviteModal"
            class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <p class="text-gray-600 mb-4">
          Share this link with your athlete. They'll be prompted to create an account and will automatically be added to your roster.
        </p>

        <!-- Invite code -->
        <div class="mb-4">
          <label class="label">Invite Code</label>
          <div class="p-4 bg-gray-50 rounded-xl text-center">
            <p class="font-mono text-2xl font-bold text-summit-700">
              {{ inviteCode }}
            </p>
          </div>
        </div>

        <!-- Invite link -->
        <div class="mb-6">
          <label class="label">Invite Link</label>
          <div class="flex gap-2">
            <input
              :value="inviteLink"
              readonly
              class="input flex-1 text-sm"
            />
            <button
              @click="copyInviteLink"
              class="btn-secondary px-4 whitespace-nowrap"
            >
              <svg v-if="!copySuccess" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
          <p v-if="copySuccess" class="helper-text text-green-600">
            ✓ Copied to clipboard!
          </p>
        </div>

        <!-- Close button -->
        <button
          @click="closeInviteModal"
          class="btn-primary w-full"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
