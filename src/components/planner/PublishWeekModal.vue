<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePlansStore } from '@/stores/plans'
import { plansService } from '@/services/plans'
import { planPublishService } from '@/services/planPublish'

const authStore = useAuthStore()
const plansStore = usePlansStore()

const emit = defineEmits<{
  (e: 'published', result: { workoutsCreated: number; assignmentsCreated: number }): void
  (e: 'close'): void
}>()

const loading = ref(false)
const publishing = ref(false)
const athletes = ref<{ id: string; display_name: string; avatar_url: string | null; selected: boolean; loadModifier: number }[]>([])
const groups = ref<{ id: string; name: string }[]>([])
const selectedGroupId = ref('')
const publishMode = ref<'athletes' | 'group'>('athletes')

const selectedAthletes = computed(() => athletes.value.filter(a => a.selected))
const hasSelection = computed(() => {
  if (publishMode.value === 'group') return !!selectedGroupId.value
  return selectedAthletes.value.length > 0
})

const weekLabel = computed(() => {
  const week = plansStore.selectedWeek
  if (!week) return 'Selected Week'
  const allWeeks = plansStore.allWeeks
  const idx = allWeeks.findIndex(w => w.id === week.id)
  if (idx >= 0) {
    const w = allWeeks[idx]
    return `${w.block_name} — Week ${week.week_number}`
  }
  return `Week ${week.week_number}`
})

onMounted(async () => {
  if (!authStore.user) return
  loading.value = true

  try {
    // Get plan athletes first
    const planAthletes = plansStore.activePlan?.plan_athletes || []

    if (planAthletes.length > 0) {
      athletes.value = planAthletes.map((pa: any) => ({
        id: pa.athlete_id,
        display_name: pa.athlete?.display_name || 'Unknown',
        avatar_url: pa.athlete?.avatar_url || null,
        selected: true,
        loadModifier: 1.0,
      }))
    } else {
      // Fallback: load all coach athletes
      const coachAthletes = await plansService.getCoachAthletes(authStore.user.id)
      athletes.value = coachAthletes.map(a => ({
        ...a,
        selected: false,
        loadModifier: 1.0,
      }))
    }

    groups.value = await plansService.getCoachGroups(authStore.user.id)
  } catch (e) {
    console.error('Error loading athletes/groups:', e)
  } finally {
    loading.value = false
  }
})

function toggleAll(selected: boolean) {
  athletes.value.forEach(a => a.selected = selected)
}

async function handlePublish() {
  if (!authStore.user || !plansStore.activePlan || !plansStore.selectedWeekId) return
  publishing.value = true

  try {
    const athleteList = publishMode.value === 'athletes'
      ? selectedAthletes.value.map(a => ({
          athleteId: a.id,
          loadModifier: a.loadModifier,
        }))
      : [] // Group mode will resolve members server-side

    const result = await planPublishService.publishWeek({
      planId: plansStore.activePlan.id,
      coachId: authStore.user.id,
      blockWeekId: plansStore.selectedWeekId,
      athletes: athleteList,
      groupId: publishMode.value === 'group' ? selectedGroupId.value : undefined,
    })

    emit('published', {
      workoutsCreated: result.workoutsCreated,
      assignmentsCreated: result.assignmentsCreated,
    })
  } catch (e) {
    console.error('Error publishing:', e)
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50 p-4"
      @click.self="emit('close')"
    >
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
        <!-- Header -->
        <div class="p-4 border-b border-feed-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 class="font-semibold text-lg">Publish Week</h2>
            <p class="text-xs text-gray-500 mt-0.5">{{ weekLabel }}</p>
          </div>
          <button @click="emit('close')" class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-5">
          <!-- Loading -->
          <div v-if="loading" class="text-center py-8">
            <div class="w-6 h-6 border-2 border-summit-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p class="text-sm text-gray-500">Loading athletes...</p>
          </div>

          <template v-else>
            <!-- Publish mode tabs -->
            <div class="flex rounded-xl bg-gray-100 p-1">
              <button
                @click="publishMode = 'athletes'"
                :class="['flex-1 py-2 text-xs font-semibold rounded-lg transition-colors', publishMode === 'athletes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500']"
              >
                Individual Athletes
              </button>
              <button
                @click="publishMode = 'group'"
                :class="['flex-1 py-2 text-xs font-semibold rounded-lg transition-colors', publishMode === 'group' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500']"
              >
                Group
              </button>
            </div>

            <!-- Individual Athletes mode -->
            <div v-if="publishMode === 'athletes'">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold uppercase tracking-wider text-gray-400">
                  {{ selectedAthletes.length }}/{{ athletes.length }} selected
                </span>
                <div class="flex gap-2">
                  <button @click="toggleAll(true)" class="text-xs text-summit-600 font-semibold">All</button>
                  <button @click="toggleAll(false)" class="text-xs text-gray-500 font-semibold">None</button>
                </div>
              </div>

              <div class="space-y-2">
                <div
                  v-for="athlete in athletes"
                  :key="athlete.id"
                  :class="[
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                    athlete.selected ? 'border-summit-300 bg-summit-50' : 'border-gray-100 bg-white'
                  ]"
                >
                  <!-- Checkbox -->
                  <button @click="athlete.selected = !athlete.selected" class="flex-shrink-0">
                    <div :class="['w-5 h-5 rounded border-2 flex items-center justify-center transition-colors', athlete.selected ? 'bg-summit-600 border-summit-600' : 'border-gray-300']">
                      <svg v-if="athlete.selected" xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </button>

                  <!-- Avatar + name -->
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-summit-400 to-summit-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {{ athlete.display_name?.charAt(0)?.toUpperCase() || '?' }}
                    </div>
                    <span class="text-sm font-medium text-gray-900 truncate">{{ athlete.display_name }}</span>
                  </div>

                  <!-- Load modifier -->
                  <div v-if="athlete.selected" class="flex items-center gap-1 flex-shrink-0">
                    <input
                      v-model.number="athlete.loadModifier"
                      type="number"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      class="w-16 text-right text-xs py-1 px-2 border border-gray-200 rounded-lg focus:border-summit-500 focus:ring-1 focus:ring-summit-500"
                    />
                    <span class="text-[10px] text-gray-400">×</span>
                  </div>
                </div>
              </div>

              <div class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                <strong>Load Modifier:</strong> Scale workout loads per athlete. 1.0 = 100%, 0.85 = 85% load.
              </div>
            </div>

            <!-- Group mode -->
            <div v-if="publishMode === 'group'">
              <label class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 block">Select Group</label>
              <select v-model="selectedGroupId" class="input">
                <option value="">Choose a group...</option>
                <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>

              <div v-if="groups.length === 0" class="mt-3 text-center text-sm text-gray-400 py-4">
                No groups found. Create groups first.
              </div>

              <div v-if="selectedGroupId" class="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                All members of this group will be assigned the week's sessions with a default load modifier of 1.0×.
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-feed-border flex-shrink-0 space-y-2">
          <button
            @click="handlePublish"
            :disabled="!hasSelection || publishing"
            class="btn-primary w-full"
          >
            <span v-if="publishing" class="flex items-center justify-center gap-2">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Publishing...
            </span>
            <span v-else>
              Publish & Assign
              <span v-if="publishMode === 'athletes' && selectedAthletes.length > 0">
                ({{ selectedAthletes.length }} athlete{{ selectedAthletes.length !== 1 ? 's' : '' }})
              </span>
            </span>
          </button>
          <button @click="emit('close')" class="btn-secondary w-full">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
