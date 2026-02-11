<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import {
  getGroupById,
  getGroupMembers,
  addGroupMembers,
  removeGroupMember,
  assignProgramToGroup,
} from '@/services/groups'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const group = ref<any>(null)
const members = ref<any[]>([])
const loading = ref(true)

// Add members modal
const showAddMembers = ref(false)
const availableAthletes = ref<any[]>([])
const selectedAthletes = ref<string[]>([])
const addingMembers = ref(false)

// Assign program modal
const showAssignProgram = ref(false)
const programs = ref<any[]>([])
const selectedProgramId = ref('')
const assignStartDate = ref(new Date().toISOString().split('T')[0])
const assigning = ref(false)
const assignResult = ref<any>(null)

const groupId = computed(() => route.params.id as string)

onMounted(async () => {
  await loadGroupData()
})

async function loadGroupData() {
  loading.value = true
  const [groupData, membersData] = await Promise.all([
    getGroupById(groupId.value),
    getGroupMembers(groupId.value),
  ])
  group.value = groupData
  members.value = membersData
  loading.value = false
}

async function openAddMembersModal() {
  if (!authStore.user) return
  // Fetch coach's athletes that aren't already in this group
  const { data } = await supabase
    .from('coach_athletes')
    .select('athlete:profiles!athlete_id(id, username, display_name, avatar_url)')
    .eq('coach_id', authStore.user.id)
    .eq('status', 'active')

  const existingIds = new Set(members.value.map((m: any) => m.athlete_id))
  availableAthletes.value = (data || [])
    .map((ca: any) => Array.isArray(ca.athlete) ? ca.athlete[0] : ca.athlete)
    .filter((a: any) => a && !existingIds.has(a.id))

  selectedAthletes.value = []
  showAddMembers.value = true
}

function toggleAthleteSelection(athleteId: string) {
  const idx = selectedAthletes.value.indexOf(athleteId)
  if (idx >= 0) {
    selectedAthletes.value.splice(idx, 1)
  } else {
    selectedAthletes.value.push(athleteId)
  }
}

async function handleAddMembers() {
  if (selectedAthletes.value.length === 0) return
  addingMembers.value = true
  await addGroupMembers(groupId.value, selectedAthletes.value)
  members.value = await getGroupMembers(groupId.value)
  showAddMembers.value = false
  addingMembers.value = false
}

async function handleRemoveMember(athleteId: string) {
  const success = await removeGroupMember(groupId.value, athleteId)
  if (success) {
    members.value = members.value.filter((m: any) => m.athlete_id !== athleteId)
  }
}

async function openAssignProgramModal() {
  if (!authStore.user) return
  const { data } = await supabase
    .from('programs')
    .select('id, name, duration_weeks, difficulty')
    .eq('coach_id', authStore.user.id)
    .order('name')

  programs.value = data || []
  selectedProgramId.value = ''
  assignResult.value = null
  assignStartDate.value = new Date().toISOString().split('T')[0]
  showAssignProgram.value = true
}

async function handleAssignProgram() {
  if (!selectedProgramId.value || !authStore.user) return
  assigning.value = true
  const result = await assignProgramToGroup(
    selectedProgramId.value,
    groupId.value,
    authStore.user.id,
    assignStartDate.value
  )
  assignResult.value = result
  assigning.value = false
}

function getInitials(name: string) {
  return name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 bg-white/90 backdrop-blur-sm z-10 border-b border-gray-100">
      <div class="flex items-center justify-between p-4">
        <button @click="router.back()" class="text-gray-600 hover:text-gray-900 p-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="font-display text-lg font-semibold text-gray-900 truncate">
          {{ group?.name || 'Group' }}
        </h1>
        <div class="w-8"></div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-6">
      <div class="animate-pulse space-y-4">
        <div class="h-6 w-48 bg-gray-200 rounded"></div>
        <div class="h-4 w-32 bg-gray-200 rounded"></div>
        <div class="h-20 bg-gray-200 rounded-xl"></div>
      </div>
    </div>

    <div v-else-if="group" class="p-4 space-y-6">
      <!-- Group Info -->
      <div class="card p-4">
        <div class="flex items-start gap-3">
          <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            <span v-if="group.sport?.icon">{{ group.sport.icon }}</span>
            <span v-else>{{ getInitials(group.name) }}</span>
          </div>
          <div>
            <h2 class="font-display text-xl font-bold text-gray-900">{{ group.name }}</h2>
            <p v-if="group.team" class="text-sm text-summit-600 font-medium">{{ group.team.name }}</p>
            <p v-if="group.sport" class="text-sm text-gray-500">{{ group.sport.name }}</p>
            <p v-if="group.description" class="text-sm text-gray-600 mt-2">{{ group.description }}</p>
          </div>
        </div>
      </div>

      <!-- Members Section -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900">
            Members
            <span class="text-gray-400 font-normal">({{ members.length }})</span>
          </h3>
          <button @click="openAddMembersModal" class="btn-sm btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add
          </button>
        </div>

        <div v-if="members.length === 0" class="card p-6 text-center text-gray-500 text-sm">
          No members yet. Add athletes to this group.
        </div>

        <div v-else class="grid grid-cols-2 gap-3">
          <div
            v-for="member in members"
            :key="member.id"
            class="card p-3 flex items-center gap-3"
          >
            <img
              v-if="member.athlete?.avatar_url"
              :src="member.athlete.avatar_url"
              :alt="member.athlete.display_name"
              class="w-10 h-10 rounded-full object-cover"
            />
            <div
              v-else
              class="w-10 h-10 rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0"
            >
              {{ getInitials(member.athlete?.display_name || '?') }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{{ member.athlete?.display_name }}</p>
              <p class="text-xs text-gray-500 truncate">@{{ member.athlete?.username }}</p>
            </div>
            <button
              @click="handleRemoveMember(member.athlete_id)"
              class="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
              title="Remove"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Assign Program Section -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900">Programs</h3>
          <button @click="openAssignProgramModal" class="btn-sm btn-primary" :disabled="members.length === 0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Assign Program
          </button>
        </div>
        <p class="text-sm text-gray-500">
          Assign a program to this group to create workout assignments for all {{ members.length }} members.
        </p>
      </div>
    </div>
  </div>

  <!-- Add Members Modal -->
  <Teleport to="body">
    <div
      v-if="showAddMembers"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      @click.self="showAddMembers = false"
    >
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 max-h-[80vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Add Athletes</h3>

        <div v-if="availableAthletes.length === 0" class="text-center py-8 text-gray-500 text-sm">
          All your athletes are already in this group.
        </div>

        <div v-else class="space-y-2 mb-6">
          <button
            v-for="athlete in availableAthletes"
            :key="athlete.id"
            @click="toggleAthleteSelection(athlete.id)"
            class="w-full flex items-center gap-3 p-3 rounded-xl transition-colors"
            :class="selectedAthletes.includes(athlete.id) ? 'bg-summit-50 ring-2 ring-summit-500' : 'hover:bg-gray-50'"
          >
            <img
              v-if="athlete.avatar_url"
              :src="athlete.avatar_url"
              :alt="athlete.display_name"
              class="w-10 h-10 rounded-full object-cover"
            />
            <div
              v-else
              class="w-10 h-10 rounded-full bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-semibold text-xs"
            >
              {{ getInitials(athlete.display_name) }}
            </div>
            <div class="flex-1 text-left">
              <p class="text-sm font-medium text-gray-900">{{ athlete.display_name }}</p>
              <p class="text-xs text-gray-500">@{{ athlete.username }}</p>
            </div>
            <div
              class="w-5 h-5 rounded-full border-2 flex items-center justify-center"
              :class="selectedAthletes.includes(athlete.id) ? 'border-summit-600 bg-summit-600' : 'border-gray-300'"
            >
              <svg v-if="selectedAthletes.includes(athlete.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </button>
        </div>

        <div class="flex gap-3">
          <button @click="showAddMembers = false" class="flex-1 btn-secondary" :disabled="addingMembers">Cancel</button>
          <button
            @click="handleAddMembers"
            class="flex-1 btn-primary"
            :disabled="selectedAthletes.length === 0 || addingMembers"
          >
            <span v-if="addingMembers" class="flex items-center gap-2">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </span>
            <span v-else>Add {{ selectedAthletes.length }} Athlete{{ selectedAthletes.length !== 1 ? 's' : '' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Assign Program Modal -->
  <Teleport to="body">
    <div
      v-if="showAssignProgram"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      @click.self="showAssignProgram = false"
    >
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 max-h-[80vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Assign Program to Group</h3>

        <!-- Success result -->
        <div v-if="assignResult?.success" class="text-center py-6">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p class="font-semibold text-gray-900 mb-1">Program Assigned!</p>
          <p class="text-sm text-gray-600">
            Created {{ assignResult.assignmentCount }} workout assignments
            ({{ assignResult.workoutCount }} workouts x {{ assignResult.memberCount }} athletes)
          </p>
          <button @click="showAssignProgram = false" class="btn-primary mt-6">Done</button>
        </div>

        <!-- Error result -->
        <div v-else-if="assignResult && !assignResult.success" class="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
          {{ assignResult.error }}
        </div>

        <!-- Form -->
        <form v-if="!assignResult?.success" @submit.prevent="handleAssignProgram" class="space-y-4">
          <div>
            <label class="label">Program *</label>
            <select v-model="selectedProgramId" class="input" required>
              <option value="">Select a program</option>
              <option v-for="prog in programs" :key="prog.id" :value="prog.id">
                {{ prog.name }}
                <template v-if="prog.duration_weeks"> ({{ prog.duration_weeks }} weeks)</template>
              </option>
            </select>
          </div>

          <div>
            <label class="label">Start Date *</label>
            <input v-model="assignStartDate" type="date" class="input" required />
          </div>

          <p class="text-sm text-gray-500">
            This will create individual workout assignments for all {{ members.length }} athletes in this group.
          </p>

          <div class="flex gap-3 pt-2">
            <button type="button" @click="showAssignProgram = false" class="flex-1 btn-secondary" :disabled="assigning">Cancel</button>
            <button type="submit" class="flex-1 btn-primary" :disabled="assigning || !selectedProgramId">
              <span v-if="assigning" class="flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Assigning...
              </span>
              <span v-else>Assign Program</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
