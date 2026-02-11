<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { trackEvent } from '@/utils/analytics'
import type { Profile } from '@/types/database'

const props = defineProps<{
  assignmentId: string
}>()

const emit = defineEmits<{
  close: []
  reassigned: []
}>()

const authStore = useAuthStore()
const athletes = ref<Profile[]>([])
const selectedAthleteId = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')

async function loadAthletes() {
  try {
    const { data } = await supabase
      .from('coach_athletes')
      .select('athlete:profiles!coach_athletes_athlete_id_fkey(*)')
      .eq('coach_id', authStore.user?.id)
      .eq('status', 'active')

    athletes.value = (data || [])
      .map((ca: any) => ca.athlete)
      .filter(Boolean)
  } catch (e) {
    console.error('Error loading athletes:', e)
  } finally {
    loading.value = false
  }
}

async function handleReassign() {
  if (!selectedAthleteId.value) return

  saving.value = true
  error.value = ''

  try {
    // Get original assignment details
    const { data: original, error: fetchErr } = await supabase
      .from('workout_assignments')
      .select('*')
      .eq('id', props.assignmentId)
      .single()

    if (fetchErr || !original) throw fetchErr || new Error('Assignment not found')

    // Create new assignment for selected athlete
    const { error: insertErr } = await supabase
      .from('workout_assignments')
      .insert({
        workout_id: original.workout_id,
        athlete_id: selectedAthleteId.value,
        coach_id: original.coach_id,
        assigned_date: original.assigned_date,
        status: 'pending',
        notes: original.notes,
      })

    if (insertErr) throw insertErr

    // Delete old assignment
    const { error: deleteErr } = await supabase
      .from('workout_assignments')
      .delete()
      .eq('id', props.assignmentId)

    if (deleteErr) throw deleteErr

    trackEvent('workout_reassigned', {
      assignment_id: props.assignmentId,
      new_athlete_id: selectedAthleteId.value,
    })

    emit('reassigned')
  } catch (e: any) {
    error.value = e.message || 'Failed to reassign workout'
    console.error('Error reassigning:', e)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadAthletes()
})
</script>

<template>
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="fixed inset-0 bg-black bg-opacity-50" @click="$emit('close')"></div>

    <div class="flex items-center justify-center min-h-screen p-4">
      <div class="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scale-in">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-xl font-bold text-gray-900">Reassign Workout</h2>
          <button
            @click="$emit('close')"
            class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Error -->
        <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {{ error }}
        </div>

        <!-- Loading -->
        <div v-if="loading" class="py-8 text-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-summit-600 mx-auto"></div>
          <p class="text-sm text-gray-500 mt-2">Loading athletes...</p>
        </div>

        <template v-else>
          <!-- No athletes -->
          <div v-if="athletes.length === 0" class="py-8 text-center">
            <p class="text-gray-500">No active athletes found.</p>
          </div>

          <!-- Athlete selector -->
          <div v-else>
            <label class="label mb-2">Select Athlete</label>
            <select
              v-model="selectedAthleteId"
              class="input"
            >
              <option value="">Choose athlete...</option>
              <option
                v-for="athlete in athletes"
                :key="athlete.id"
                :value="athlete.id"
              >
                {{ athlete.display_name }} (@{{ athlete.username }})
              </option>
            </select>
          </div>

          <!-- Actions -->
          <div class="mt-6 flex gap-3">
            <button
              @click="handleReassign"
              :disabled="!selectedAthleteId || saving"
              class="btn-primary flex-1"
            >
              <span v-if="saving" class="flex items-center gap-2 justify-center">
                <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Reassigning...
              </span>
              <span v-else>Reassign</span>
            </button>
            <button @click="$emit('close')" class="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
