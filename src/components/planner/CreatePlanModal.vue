<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { plansService } from '@/services/plans'
import type { Database } from '@/types/database'

type PlanInsert = Database['public']['Tables']['plans']['Insert']

const emit = defineEmits<{
  (e: 'created', plan: any): void
  (e: 'close'): void
}>()

const authStore = useAuthStore()
const saving = ref(false)

// Form data
const form = ref({
  name: '',
  sport_id: '',
  start_date: '',
  end_date: '',
  goal_description: '',
  periodization_model: '',
})

// Selectable data
const sports = ref<{ id: string; name: string; icon: string | null }[]>([])
const athletes = ref<{ id: string; display_name: string; avatar_url: string | null }[]>([])
const groups = ref<{ id: string; name: string }[]>([])
const selectedAthleteIds = ref<string[]>([])
const selectedGroupId = ref('')

const periodizationModels = [
  { value: 'linear', label: 'Linear', desc: 'Progressive overload in a straight line' },
  { value: 'undulating', label: 'Undulating', desc: 'Daily or weekly volume/intensity variation' },
  { value: 'block', label: 'Block', desc: 'Concentrated loading phases' },
  { value: 'conjugate', label: 'Conjugate', desc: 'Concurrent quality development' },
  { value: 'polarized', label: 'Polarized', desc: 'High or low intensity, minimal moderate' },
  { value: 'flexible', label: 'Flexible', desc: 'Readiness-driven, autoregulated' },
  { value: 'custom', label: 'Custom', desc: 'Build your own structure' },
]

onMounted(async () => {
  if (!authStore.user) return
  const [sportsData, athletesData, groupsData] = await Promise.all([
    plansService.getSports(),
    plansService.getCoachAthletes(authStore.user.id),
    plansService.getCoachGroups(authStore.user.id),
  ])
  sports.value = sportsData
  athletes.value = athletesData
  groups.value = groupsData

  // Default dates
  const today = new Date()
  form.value.start_date = today.toISOString().split('T')[0]
  const end = new Date(today)
  end.setDate(end.getDate() + 84) // 12 weeks default
  form.value.end_date = end.toISOString().split('T')[0]
})

function toggleAthlete(id: string) {
  const idx = selectedAthleteIds.value.indexOf(id)
  if (idx >= 0) {
    selectedAthleteIds.value.splice(idx, 1)
  } else {
    selectedAthleteIds.value.push(id)
  }
}

async function handleSubmit() {
  if (!authStore.user || !form.value.name.trim()) return
  saving.value = true

  try {
    const planInsert: PlanInsert = {
      coach_id: authStore.user.id,
      name: form.value.name.trim(),
      sport_id: form.value.sport_id || null,
      start_date: form.value.start_date,
      end_date: form.value.end_date,
      goal_description: form.value.goal_description.trim() || null,
      periodization_model: form.value.periodization_model || null,
      status: 'draft',
    }

    const plan = await plansService.createPlan(planInsert)

    // Assign athletes if selected
    if (selectedAthleteIds.value.length > 0) {
      await plansService.addPlanAthletes(
        selectedAthleteIds.value.map(athleteId => ({
          plan_id: plan.id,
          athlete_id: athleteId,
          group_id: selectedGroupId.value || null,
        }))
      )
    }

    emit('created', plan)
  } catch (e) {
    console.error('Error creating plan:', e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Create Training Plan</h3>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Plan name -->
          <div>
            <label class="label">Plan Name *</label>
            <input
              v-model="form.name"
              type="text"
              class="input"
              placeholder="e.g., Nationals 2026 Prep"
              required
            />
          </div>

          <!-- Sport -->
          <div>
            <label class="label">Sport</label>
            <select v-model="form.sport_id" class="input">
              <option value="">Select sport (optional)</option>
              <option v-for="sport in sports" :key="sport.id" :value="sport.id">
                {{ sport.icon ? sport.icon + ' ' : '' }}{{ sport.name }}
              </option>
            </select>
          </div>

          <!-- Dates -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Start Date *</label>
              <input v-model="form.start_date" type="date" class="input" required />
            </div>
            <div>
              <label class="label">End Date *</label>
              <input v-model="form.end_date" type="date" class="input" required />
            </div>
          </div>

          <!-- Periodization Model -->
          <div>
            <label class="label">Periodization Model</label>
            <div class="grid grid-cols-2 gap-2 mt-1">
              <button
                v-for="model in periodizationModels"
                :key="model.value"
                type="button"
                @click="form.periodization_model = form.periodization_model === model.value ? '' : model.value"
                :class="[
                  'text-left p-3 rounded-xl border transition-all text-sm',
                  form.periodization_model === model.value
                    ? 'border-summit-600 bg-summit-50 ring-1 ring-summit-600'
                    : 'border-gray-200 hover:border-gray-300'
                ]"
              >
                <div class="font-semibold text-gray-900">{{ model.label }}</div>
                <div class="text-xs text-gray-500 mt-0.5">{{ model.desc }}</div>
              </button>
            </div>
          </div>

          <!-- Goal -->
          <div>
            <label class="label">Goal / Objective</label>
            <textarea
              v-model="form.goal_description"
              class="input"
              rows="2"
              placeholder="e.g., Peak 100m for National Championships"
            ></textarea>
          </div>

          <!-- Athlete assignment -->
          <div v-if="athletes.length > 0">
            <label class="label">Assign Athletes</label>
            <div class="space-y-2 mt-1 max-h-40 overflow-y-auto">
              <label
                v-for="athlete in athletes"
                :key="athlete.id"
                class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="selectedAthleteIds.includes(athlete.id)"
                  @change="toggleAthlete(athlete.id)"
                  class="rounded border-gray-300 text-summit-600 focus:ring-summit-500"
                />
                <div class="w-8 h-8 rounded-full bg-summit-200 flex items-center justify-center text-summit-800 text-xs font-bold flex-shrink-0">
                  {{ athlete.display_name.charAt(0).toUpperCase() }}
                </div>
                <span class="text-sm text-gray-900">{{ athlete.display_name }}</span>
              </label>
            </div>
          </div>

          <!-- Group -->
          <div v-if="groups.length > 0">
            <label class="label">Or Assign to Group</label>
            <select v-model="selectedGroupId" class="input">
              <option value="">No group</option>
              <option v-for="group in groups" :key="group.id" :value="group.id">
                {{ group.name }}
              </option>
            </select>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              @click="emit('close')"
              class="flex-1 btn-secondary"
              :disabled="saving"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 btn-primary"
              :disabled="saving || !form.name.trim() || !form.start_date || !form.end_date"
            >
              <span v-if="saving" class="flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Creating...
              </span>
              <span v-else>Create Plan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
