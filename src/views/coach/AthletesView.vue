<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <PageHeader title="Athletes">
      <template #actions>
        <SeatUsageBadge v-if="seatInfo" :seat-info="seatInfo" />
        <button
          @click="handleInviteClick"
          :disabled="seatInfo !== null && !seatInfo.canAddAthlete"
          :class="seatInfo && !seatInfo.canAddAthlete
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-summit-600 hover:bg-summit-700'"
          class="text-white px-4 py-2 rounded-lg transition flex items-center gap-2 text-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          {{ seatInfo && !seatInfo.canAddAthlete ? 'Roster Full' : 'Add Athlete' }}
        </button>
      </template>
    </PageHeader>

    <!-- Content -->
    <div class="max-w-2xl mx-auto px-4 py-6">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-summit-600"></div>
      </div>

      <!-- Error State -->
      <ErrorState
        v-else-if="loadError"
        :message="loadError"
        @retry="loadAthletes"
      />

      <!-- Empty State -->
      <div v-else-if="athletes.length === 0" class="text-center py-12">
        <svg class="mx-auto h-24 w-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-gray-900">No athletes yet</h3>
        <p class="mt-2 text-gray-500">Get started by inviting your first athlete</p>
        <button
          @click="handleInviteClick"
          class="mt-6 bg-summit-600 text-white px-6 py-3 rounded-lg hover:bg-summit-700 transition"
        >
          Invite Athlete
        </button>
      </div>

      <!-- Athlete Cards -->
      <div v-else>
        <!-- Search bar (only show when more than 3 athletes) -->
        <div v-if="athletes.length > 3" class="mb-4">
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search athletes..."
              class="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-summit-500 focus:border-transparent"
            />
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <!-- Filtered empty state -->
        <div v-if="filteredAthletes.length === 0 && searchQuery" class="text-center py-12">
          <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p class="font-medium text-gray-900 mb-1">No athletes found</p>
          <p class="text-sm text-gray-500 mb-4">No athletes match "{{ searchQuery }}"</p>
          <button
            @click="searchQuery = ''"
            class="text-sm font-medium text-summit-600 hover:text-summit-800"
          >
            Clear search
          </button>
        </div>

        <div v-else class="grid gap-4 grid-cols-1 md:grid-cols-2">
          <div
            v-for="athleteRelation in filteredAthletes"
            :key="athleteRelation.id"
            class="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition"
          >
            <div class="flex items-start gap-3">
              <!-- Avatar -->
              <img
                :src="athleteRelation.athlete.avatar_url || '/default-avatar.svg'"
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

    <!-- Upgrade Prompt Modal -->
    <UpgradePromptModal
      v-if="showUpgradePrompt && activePromptType"
      :prompt-type="activePromptType"
      :current-count="seatInfo?.current ?? 0"
      :limit="seatInfo?.limit ?? 3"
      @close="showUpgradePrompt = false"
      @action="handlePromptAction"
    />
  </div>
</template>

<script setup lang="ts">
import InviteAthleteModal from '@/components/InviteAthleteModal.vue'
import AssignWorkoutModal from '@/components/AssignWorkoutModal.vue'
import SeatUsageBadge from '@/components/billing/SeatUsageBadge.vue'
import UpgradePromptModal from '@/components/billing/UpgradePromptModal.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getSeatInfo,
  grantBonusSeats,
  updatePeakAthleteCount,
  getUpgradePromptType,
  logUpgradePrompt,
  recordPromptAction,
  wasPromptShownRecently,
  type SeatInfo,
} from '@/services/billing'
import type { UpgradePromptType } from '@/types/database'

const router = useRouter()
import { fetchCoachAthletes, type AthleteWithProfile } from '@/services/athletes'

const authStore = useAuthStore()

const loading = ref(true)
const loadError = ref<string | null>(null)
const athletes = ref<AthleteWithProfile[]>([])
const searchQuery = ref('')
const showInviteModal = ref(false)

// Seat management
const seatInfo = ref<SeatInfo | null>(null)
const showUpgradePrompt = ref(false)
const activePromptType = ref<UpgradePromptType | null>(null)
const activePromptId = ref<string | null>(null)

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

async function checkSeatPrompts() {
  if (!authStore.profile?.id || !seatInfo.value) return

  const tier = authStore.subscriptionTier ?? 'free'
  const promptType = getUpgradePromptType(
    seatInfo.value.current,
    tier,
    seatInfo.value.limit,
    seatInfo.value.bonus
  )

  if (!promptType) return

  const recentlyShown = await wasPromptShownRecently(authStore.profile.id, promptType)
  if (recentlyShown) return

  const promptId = await logUpgradePrompt(
    authStore.profile.id,
    promptType,
    seatInfo.value.current,
    tier
  )

  activePromptType.value = promptType
  activePromptId.value = promptId
  showUpgradePrompt.value = true
}

async function handlePromptAction(action: 'upgrade' | 'dismiss' | 'manage' | 'claim_bonus') {
  if (activePromptId.value) {
    const mapped = action === 'upgrade' ? 'upgrade_clicked'
      : action === 'claim_bonus' ? 'dismissed'
      : action === 'manage' ? 'dismissed'
      : 'dismissed' as const
    await recordPromptAction(activePromptId.value, mapped)
  }

  if (action === 'claim_bonus' && authStore.profile?.id) {
    await grantBonusSeats(authStore.profile.id)
    seatInfo.value = await getSeatInfo(authStore.profile.id)
    showUpgradePrompt.value = false
  } else if (action === 'manage') {
    showUpgradePrompt.value = false
    // Already on athletes page
  } else {
    showUpgradePrompt.value = false
  }
}

function handleInviteClick() {
  if (seatInfo.value && !seatInfo.value.canAddAthlete) {
    // Trigger hard gate prompt
    activePromptType.value = 'hard_gate'
    showUpgradePrompt.value = true
    return
  }
  showInviteModal.value = true
}

async function loadAthletes() {
  loading.value = true
  loadError.value = null
  try {
    if (authStore.profile?.id) {
      const [athleteData, seats] = await Promise.all([
        fetchCoachAthletes(authStore.profile.id),
        getSeatInfo(authStore.profile.id),
      ])
      athletes.value = athleteData
      seatInfo.value = seats

      // Update peak count
      await updatePeakAthleteCount(authStore.profile.id, seats.current)

      // Check for upgrade prompts
      await checkSeatPrompts()
    }
  } catch (error: any) {
    console.error('Error fetching athletes:', error)
    loadError.value = error?.message || 'Failed to load athletes'
  } finally {
    loading.value = false
  }
}

onMounted(loadAthletes)
</script>
