<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Header -->
    <div class="bg-white border-b sticky top-0 z-10">
      <div class="max-w-2xl mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-gray-900">Athletes</h1>
          <button
            @click="showInviteModal = true"
            class="bg-summit-600 text-white px-4 py-2 rounded-lg hover:bg-summit-700 transition flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Athlete
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="max-w-2xl mx-auto px-4 py-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-summit-600"></div>
      </div>

      <!-- Empty State -->
      <div v-else-if="athletes.length === 0" class="text-center py-12">
        <svg class="mx-auto h-24 w-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-gray-900">No athletes yet</h3>
        <p class="mt-2 text-gray-500">Get started by inviting your first athlete</p>
        <button
          @click="showInviteModal = true"
          class="mt-6 bg-summit-600 text-white px-6 py-3 rounded-lg hover:bg-summit-700 transition"
        >
          Invite Athlete
        </button>
      </div>

      <!-- Athlete Cards -->
      <div v-else class="grid gap-4 grid-cols-1 md:grid-cols-2">
        <div
          v-for="athleteRelation in filteredAthletes"
          :key="athleteRelation.id"
          class="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition"
        >
          <div class="flex items-start gap-3">
            <!-- Avatar -->
            <img
              :src="athleteRelation.athlete.avatar_url || 'https://via.placeholder.com/48'"
              :alt="athleteRelation.athlete.display_name"
              class="w-12 h-12 rounded-full object-cover"
            />
            
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-gray-900 truncate">{{ athleteRelation.athlete.display_name }}</h3>
              <p class="text-sm text-gray-500">@{{ athleteRelation.athlete.username }}</p>
              <p class="text-xs text-gray-400 mt-1">
                Last active: {{ formatDate(athleteRelation.last_workout_date) }}
              </p>
            </div>

            <!-- View Detail -->
            <button
              @click="viewAthleteDetail(athleteRelation.athlete.id)"
              class="text-summit-600 hover:text-summit-700 text-sm font-medium"
            >
              View
            </button>
          </div>

          <!-- Assign Workout Button -->
          <div class="mt-3 pt-3 border-t border-gray-100">
            <button
              @click="openAssignModal(athleteRelation.athlete.id)"
              class="w-full px-4 py-2 text-sm font-medium text-summit-600 hover:bg-summit-50 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Assign Workout
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Invite Modal -->
    <InviteAthleteModal
      v-if="showInviteModal"
      @close="showInviteModal = false"
    />

    <!-- Assign Workout Modal -->
    <AssignWorkoutModal
      :is-open="showAssignModal"
      :preselected-athlete-id="selectedAthleteForAssignment"
      @close="closeAssignModal"
      @assigned="handleAssignmentCreated"
    />
  </div>
</template>

<script setup lang="ts">
import InviteAthleteModal from '@/components/InviteAthleteModal.vue'
import AssignWorkoutModal from '@/components/AssignWorkoutModal.vue'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
import { fetchCoachAthletes, type AthleteWithProfile } from '@/services/athletes'

const authStore = useAuthStore()

const loading = ref(true)
const athletes = ref<AthleteWithProfile[]>([])
const searchQuery = ref('')
const showInviteModal = ref(false)

// Assignment modal state
const showAssignModal = ref(false)
const selectedAthleteForAssignment = ref<string | null>(null)

const filteredAthletes = computed(() => {
  if (!searchQuery.value) return athletes.value
  
  const query = searchQuery.value.toLowerCase()
  return athletes.value.filter(athlete =>
    athlete.athlete.display_name.toLowerCase().includes(query) ||
    athlete.athlete.username.toLowerCase().includes(query)
  )
})

const formatDate = (date: string | null) => {
  if (!date) return 'Never'
  const d = new Date(date)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString()
}

// Assignment modal functions
function openAssignModal(athleteId: string) {
  selectedAthleteForAssignment.value = athleteId
  showAssignModal.value = true
}

function closeAssignModal() {
  showAssignModal.value = false
  selectedAthleteForAssignment.value = null
}

function handleAssignmentCreated(_assignmentIds: string[]) {
  // Refresh athlete data after assignment
  closeAssignModal()
}

function viewAthleteDetail(athleteId: string) {
  router.push(`/coach/athletes/${athleteId}`)
}

onMounted(async () => {
  loading.value = true
  try {
    if (authStore.profile?.id) {
      athletes.value = await fetchCoachAthletes(authStore.profile.id)
    }
  } catch (error) {
    console.error('Error fetching athletes:', error)
  } finally {
    loading.value = false
  }
})
</script>
