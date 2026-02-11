<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getCoachGroups, getCoachTeams, createGroup, updateGroup, deleteGroup, getSports } from '@/services/groups'
import Toast from '@/components/ui/Toast.vue'

const router = useRouter()
const authStore = useAuthStore()

const groups = ref<any[]>([])
const teams = ref<any[]>([])
const sports = ref<any[]>([])
const loading = ref(true)

// Modal state
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteConfirm = ref(false)
const saving = ref(false)
const deleting = ref(false)
const editingGroup = ref<any>(null)

// Toast
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('success')
const toastVisible = ref(false)

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

// Form
const form = ref({
  name: '',
  description: '',
  sport_id: '',
  team_id: '',
})

onMounted(async () => {
  if (!authStore.user) return
  const [groupsData, teamsData, sportsData] = await Promise.all([
    getCoachGroups(authStore.user.id),
    getCoachTeams(authStore.user.id),
    getSports(),
  ])
  groups.value = groupsData
  teams.value = teamsData
  sports.value = sportsData
  loading.value = false
})

function openCreateModal() {
  form.value = { name: '', description: '', sport_id: '', team_id: '' }
  showCreateModal.value = true
}

function openEditModal(group: any) {
  editingGroup.value = group
  form.value = {
    name: group.name,
    description: group.description || '',
    sport_id: group.sport_id || '',
    team_id: group.team_id || '',
  }
  showEditModal.value = true
}

function openDeleteConfirm(group: any) {
  editingGroup.value = group
  showDeleteConfirm.value = true
}

async function handleCreate() {
  if (!authStore.user || !form.value.name.trim()) return
  saving.value = true

  const result = await createGroup({
    coach_id: authStore.user.id,
    name: form.value.name.trim(),
    description: form.value.description.trim() || null,
    sport_id: form.value.sport_id || null,
    team_id: form.value.team_id || null,
  })

  if (result) {
    groups.value = await getCoachGroups(authStore.user.id)
    showCreateModal.value = false
    showToast('Group created successfully!')
  } else {
    showToast('Failed to create group. Please try again.', 'error')
  }
  saving.value = false
}

async function handleUpdate() {
  if (!editingGroup.value || !form.value.name.trim()) return
  saving.value = true

  const result = await updateGroup(editingGroup.value.id, {
    name: form.value.name.trim(),
    description: form.value.description.trim() || null,
    sport_id: form.value.sport_id || null,
    team_id: form.value.team_id || null,
  })

  if (result && authStore.user) {
    groups.value = await getCoachGroups(authStore.user.id)
    showEditModal.value = false
    showToast('Group updated successfully!')
  } else {
    showToast('Failed to update group. Please try again.', 'error')
  }
  saving.value = false
}

async function handleDelete() {
  if (!editingGroup.value || !authStore.user) return
  deleting.value = true

  const success = await deleteGroup(editingGroup.value.id)
  if (success) {
    groups.value = groups.value.filter(g => g.id !== editingGroup.value.id)
    showDeleteConfirm.value = false
    showToast('Group deleted')
  } else {
    showToast('Failed to delete group. Please try again.', 'error')
  }
  deleting.value = false
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
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
        <h1 class="font-display text-lg font-semibold text-gray-900">My Groups</h1>
        <button @click="openCreateModal" class="text-summit-700 hover:text-summit-800 p-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-6 space-y-4">
      <div v-for="i in 3" :key="i" class="animate-pulse">
        <div class="bg-gray-200 rounded-2xl h-24"></div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="groups.length === 0" class="p-8 text-center">
      <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-summit-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <h2 class="font-display text-xl font-bold text-gray-900 mb-2">No Groups Yet</h2>
      <p class="text-gray-600 text-sm mb-6">Create groups to organize your athletes and assign programs to entire teams.</p>
      <button @click="openCreateModal" class="btn-primary">Create Your First Group</button>
    </div>

    <!-- Groups list -->
    <div v-else class="p-4 space-y-3">
      <div
        v-for="group in groups"
        :key="group.id"
        class="card-hover p-4 cursor-pointer"
        @click="router.push(`/coach/groups/${group.id}`)"
      >
        <div class="flex items-start gap-3">
          <!-- Group icon -->
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            <span v-if="group.sport?.icon">{{ group.sport.icon }}</span>
            <span v-else>{{ getInitials(group.name) }}</span>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-gray-900 truncate">{{ group.name }}</h3>
            <p v-if="group.team" class="text-xs text-summit-600 font-medium">{{ group.team.name }}</p>
            <p class="text-sm text-gray-500 mt-0.5">
              {{ group.member_count || 0 }} {{ group.member_count === 1 ? 'athlete' : 'athletes' }}
              <span v-if="group.sport" class="ml-2">{{ group.sport.name }}</span>
            </p>
          </div>

          <!-- Actions -->
          <div class="flex gap-1">
            <button
              @click.stop="openEditModal(group)"
              class="p-2 text-gray-400 hover:text-summit-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              @click.stop="openDeleteConfirm(group)"
              class="p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Create/Edit Modal -->
  <Teleport to="body">
    <div
      v-if="showCreateModal || showEditModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      @click.self="showCreateModal = false; showEditModal = false"
    >
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          {{ showEditModal ? 'Edit Group' : 'Create Group' }}
        </h3>

        <form @submit.prevent="showEditModal ? handleUpdate() : handleCreate()" class="space-y-4">
          <div>
            <label class="label">Group Name *</label>
            <input v-model="form.name" type="text" class="input" placeholder="e.g., U18 Boys" required />
          </div>

          <div>
            <label class="label">Sport</label>
            <select v-model="form.sport_id" class="input">
              <option value="">Select sport (optional)</option>
              <option v-for="sport in sports" :key="sport.id" :value="sport.id">
                {{ sport.icon ? sport.icon + ' ' : '' }}{{ sport.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="label">Team</label>
            <select v-model="form.team_id" class="input">
              <option value="">No team (standalone group)</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="label">Description</label>
            <textarea v-model="form.description" class="input" rows="3" placeholder="Optional description..."></textarea>
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              @click="showCreateModal = false; showEditModal = false"
              class="flex-1 btn-secondary"
              :disabled="saving"
            >
              Cancel
            </button>
            <button type="submit" class="flex-1 btn-primary" :disabled="saving || !form.name.trim()">
              <span v-if="saving" class="flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </span>
              <span v-else>{{ showEditModal ? 'Update' : 'Create' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>

  <!-- Toast -->
  <Toast :message="toastMessage" :type="toastType" :visible="toastVisible" @close="toastVisible = false" />

  <!-- Delete Confirmation -->
  <Teleport to="body">
    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      @click.self="showDeleteConfirm = false"
    >
      <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Delete Group?</h3>
        <p class="text-sm text-gray-600 mb-6">
          Are you sure you want to delete "{{ editingGroup?.name }}"? All members will be removed from the group.
        </p>
        <div class="flex gap-3">
          <button @click="showDeleteConfirm = false" class="flex-1 btn-secondary" :disabled="deleting">Cancel</button>
          <button @click="handleDelete" class="flex-1 btn bg-red-600 text-white hover:bg-red-700 focus:ring-red-500" :disabled="deleting">
            <span v-if="deleting" class="flex items-center gap-2">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </span>
            <span v-else>Delete</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
