<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePlansStore } from '@/stores/plans'
import PlansList from '@/components/planner/PlansList.vue'
import PlanTimeline from '@/components/planner/PlanTimeline.vue'
import WeekEditor from '@/components/planner/WeekEditor.vue'
import BlockEditor from '@/components/planner/BlockEditor.vue'
import CreatePlanModal from '@/components/planner/CreatePlanModal.vue'
import AddBlockModal from '@/components/planner/AddBlockModal.vue'
import TemplateBrowser from '@/components/planner/TemplateBrowser.vue'
import PublishWeekModal from '@/components/planner/PublishWeekModal.vue'
import PlanChangelog from '@/components/planner/PlanChangelog.vue'
import PlanAnalytics from '@/components/planner/PlanAnalytics.vue'
import AiAssistPanel from '@/components/planner/AiAssistPanel.vue'
import Toast from '@/components/ui/Toast.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const plansStore = usePlansStore()

// View mode: 'list' when no planId, 'planner' when planId is present
const viewMode = ref<'list' | 'planner'>('list')

// Modals
const showCreatePlan = ref(false)
const showAddBlock = ref(false)
const showTemplateBrowser = ref(false)
const showPublishModal = ref(false)

// Right panel tabs (desktop)
const rightPanelTab = ref<'details' | 'changelog' | 'analytics' | 'ai'>('details')

// Toast
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('success')
const toastVisible = ref(false)

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

// Mobile tab state (plan | week | analytics | session)
const mobileTab = ref<'plan' | 'week' | 'analytics' | 'ai' | 'session'>('plan')

// Load plan if planId is in route
onMounted(async () => {
  const planId = route.params.planId as string
  if (planId) {
    viewMode.value = 'planner'
    await plansStore.loadPlan(planId, authStore.user?.id)
  } else {
    viewMode.value = 'list'
  }
})

// Watch route changes
watch(() => route.params.planId, async (planId) => {
  if (planId) {
    viewMode.value = 'planner'
    await plansStore.loadPlan(planId as string, authStore.user?.id)
  } else {
    viewMode.value = 'list'
    plansStore.clearPlan()
  }
})

onUnmounted(() => {
  plansStore.clearPlan()
})

// Event handlers
async function handlePlanCreated(plan: any) {
  showCreatePlan.value = false
  showToast('Plan created!')
  router.push(`/coach/planner/${plan.id}`)
}

async function handleBlockCreated() {
  showAddBlock.value = false
  showToast('Block added!')
  await plansStore.refreshPlan()
}

async function handleBlockUpdated() {
  showToast('Block updated')
  await plansStore.refreshPlan()
}

async function handleBlockDeleted() {
  showToast('Block deleted')
  await plansStore.refreshPlan()
}

async function handleTemplateApplied() {
  showTemplateBrowser.value = false
  showToast('Template applied!')
  await plansStore.refreshPlan()
}

function handleCreateSession(dayIndex: number) {
  // Navigate to workout builder with plan context
  if (!plansStore.activePlan || !plansStore.selectedWeek) return

  // Pass context via route query params
  router.push({
    path: '/coach/workouts/new',
    query: {
      mode: 'plan-session',
      planId: plansStore.activePlan.id,
      blockId: plansStore.selectedBlockId,
      weekId: plansStore.selectedWeekId,
      dayIndex: dayIndex.toString(),
      blockType: plansStore.selectedBlock?.block_type || '',
      isDeload: plansStore.selectedWeek.is_deload ? 'true' : 'false'
    }
  })
}

function handlePublished(result: { workoutsCreated: number; assignmentsCreated: number }) {
  showPublishModal.value = false
  showToast(`Published! ${result.assignmentsCreated} assignments created across ${result.workoutsCreated} sessions.`)
}

function goBackToList() {
  plansStore.clearPlan()
  router.push('/coach/planner')
}
</script>

<template>
  <!-- LIST MODE: Show plans list when no planId -->
  <div v-if="viewMode === 'list'">
    <PlansList @create="showCreatePlan = true" />
  </div>

  <!-- PLANNER MODE: Three-panel layout when plan is loaded -->
  <div v-else class="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
    <!-- Top bar (mobile/tablet) -->
    <div class="lg:hidden border-b border-gray-100 bg-white">
      <div class="flex items-center justify-between p-3">
        <button @click="goBackToList" class="text-gray-600 hover:text-gray-900 p-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-sm font-bold text-gray-900 truncate px-2">
          {{ plansStore.activePlan?.name || 'Loading...' }}
        </h1>
        <button @click="showTemplateBrowser = true" class="text-summit-600 text-xs font-semibold">
          Templates
        </button>
      </div>

      <!-- Mobile tab navigation -->
      <div class="flex border-t border-gray-100">
        <button
          v-for="tab in (['plan', 'week', 'analytics', 'ai', 'session'] as const)"
          :key="tab"
          @click="mobileTab = tab"
          :class="[
            'flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors',
            mobileTab === tab
              ? 'text-summit-700 border-summit-700'
              : 'text-gray-400 border-transparent hover:text-gray-600'
          ]"
        >
          {{ tab === 'plan' ? 'Plan' : tab === 'week' ? 'Week' : tab === 'analytics' ? 'Analytics' : tab === 'ai' ? 'AI' : 'Session' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="plansStore.loading" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="w-8 h-8 border-3 border-summit-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p class="text-sm text-gray-500">Loading plan...</p>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="plansStore.error" class="flex-1 flex items-center justify-center p-6">
      <div class="text-center">
        <p class="text-sm text-red-500 mb-3">{{ plansStore.error }}</p>
        <button @click="goBackToList" class="btn-secondary text-sm">Back to Plans</button>
      </div>
    </div>

    <!-- Desktop: Three-panel layout -->
    <div v-else class="flex-1 hidden lg:grid lg:grid-cols-[280px_1fr_320px] overflow-hidden">
      <!-- LEFT: Plan Timeline -->
      <PlanTimeline
        @add-block="showAddBlock = true"
        @edit-block="() => {}"
      />

      <!-- CENTER: Week Editor -->
      <div class="overflow-y-auto bg-gray-50">
        <!-- Template / Add Block / Publish bar -->
        <div class="flex items-center justify-between px-5 pt-4 pb-2">
          <div class="flex gap-2">
            <button
              @click="showTemplateBrowser = true"
              class="text-xs font-semibold text-summit-600 hover:text-summit-700 px-3 py-1.5 rounded-lg border border-summit-200 hover:bg-summit-50 transition-colors"
            >
              Templates
            </button>
            <button
              @click="showAddBlock = true"
              class="text-xs font-semibold text-gray-600 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              + Block
            </button>
          </div>
          <button
            v-if="plansStore.selectedWeekId"
            @click="showPublishModal = true"
            class="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Publish Week
          </button>
        </div>
        <WeekEditor @create-session="handleCreateSession" />
      </div>

      <!-- RIGHT: Block Details / Changelog / Analytics -->
      <div class="bg-white border-l border-gray-200 overflow-y-auto">
        <!-- Tabs -->
        <div class="flex border-b border-gray-100">
          <button
            v-for="tab in ([
              { key: 'details', label: 'Details' },
              { key: 'changelog', label: 'History' },
              { key: 'analytics', label: 'Analytics' },
              { key: 'ai', label: 'AI' },
            ] as const)"
            :key="tab.key"
            @click="rightPanelTab = tab.key"
            :class="[
              'flex-1 py-3 text-center text-xs font-semibold transition-colors',
              rightPanelTab === tab.key
                ? 'text-summit-700 border-b-2 border-summit-700'
                : 'text-gray-400 hover:text-gray-600'
            ]"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <BlockEditor
          v-if="rightPanelTab === 'details'"
          @updated="handleBlockUpdated"
          @deleted="handleBlockDeleted"
        />
        <PlanChangelog v-if="rightPanelTab === 'changelog'" />
        <PlanAnalytics v-if="rightPanelTab === 'analytics'" />
        <AiAssistPanel v-if="rightPanelTab === 'ai'" />
      </div>
    </div>

    <!-- Mobile/Tablet: Tabbed single-panel -->
    <div class="flex-1 lg:hidden overflow-y-auto">
      <!-- Plan tab: blocks overview -->
      <div v-if="mobileTab === 'plan'">
        <div class="p-4">
          <!-- Plan info -->
          <div v-if="plansStore.activePlan" class="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-sm">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-summit-600 to-summit-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {{ plansStore.activePlan.name.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="font-bold text-gray-900 truncate">{{ plansStore.activePlan.name }}</h2>
                <p class="text-xs text-gray-500">
                  {{ plansStore.activePlan.periodization_model || 'Custom' }} · {{ plansStore.activePlan.training_blocks.length }} blocks
                </p>
              </div>
            </div>
            <div v-if="plansStore.activePlan.goal_description" class="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5">
              {{ plansStore.activePlan.goal_description }}
            </div>
          </div>

          <!-- Blocks -->
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">Training Blocks</h3>
            <button @click="showAddBlock = true" class="text-xs text-summit-600 font-semibold">+ Add</button>
          </div>

          <div v-if="plansStore.activePlan?.training_blocks.length === 0" class="text-center py-8">
            <p class="text-sm text-gray-400 mb-3">No blocks yet</p>
            <button @click="showTemplateBrowser = true" class="btn-primary text-sm">Browse Templates</button>
          </div>

          <div v-else class="space-y-2.5">
            <div
              v-for="block in plansStore.activePlan?.training_blocks"
              :key="block.id"
              @click="plansStore.selectBlock(block.id); mobileTab = 'week'"
              :class="[
                'bg-white rounded-xl border p-4 cursor-pointer transition-all active:scale-[0.98]',
                plansStore.selectedBlockId === block.id ? 'border-summit-600 ring-1 ring-summit-600' : 'border-gray-100'
              ]"
            >
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-semibold text-gray-900 text-sm">{{ block.name }}</h4>
                  <p class="text-xs text-gray-500 mt-0.5">
                    {{ block.block_weeks?.length || block.duration_weeks || 0 }} weeks
                    <span v-if="block.block_type" class="ml-1 capitalize">· {{ block.block_type.replace(/_/g, ' ') }}</span>
                  </p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div class="h-1 rounded-full bg-gray-100 mt-3 overflow-hidden">
                <div class="h-full rounded-full bg-summit-400" style="width: 0%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Week tab: day strip + sessions -->
      <div v-if="mobileTab === 'week'">
        <div v-if="plansStore.selectedBlock">
          <!-- Week selector horizontal strip -->
          <div class="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b border-gray-100">
            <button
              v-for="week in plansStore.selectedBlock.block_weeks"
              :key="week.id"
              @click="plansStore.selectWeek(week.id)"
              :class="[
                'flex-shrink-0 w-12 text-center py-2 rounded-xl transition-all',
                plansStore.selectedWeekId === week.id
                  ? 'bg-summit-700 text-white'
                  : 'bg-gray-100 text-gray-600'
              ]"
            >
              <div class="text-[10px] font-semibold uppercase">Wk</div>
              <div class="text-sm font-bold">{{ week.week_number }}</div>
              <div v-if="week.is_deload" class="w-1.5 h-1.5 rounded-full bg-indigo-400 mx-auto mt-1"></div>
            </button>
          </div>

          <!-- Publish button (mobile) -->
          <div class="px-4 pt-3">
            <button
              @click="showPublishModal = true"
              class="w-full text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Publish This Week
            </button>
          </div>

          <!-- Day cards (stacked on mobile) -->
          <div class="p-4 space-y-2.5">
            <div
              v-for="(day, i) in 7"
              :key="i"
              @click="handleCreateSession(i)"
              class="bg-white rounded-xl border border-gray-100 p-3.5 cursor-pointer hover:bg-gray-50 transition-colors active:scale-[0.98]"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    {{ ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] }}
                  </span>
                  <span class="text-xs text-gray-500 ml-2">Day {{ i + 1 }}</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="p-6 text-center">
          <p class="text-sm text-gray-400">Select a block from the Plan tab</p>
          <button @click="mobileTab = 'plan'" class="mt-3 text-sm text-summit-600 font-semibold">Go to Plan</button>
        </div>
      </div>

      <!-- Analytics tab (mobile) -->
      <div v-if="mobileTab === 'analytics'">
        <PlanAnalytics />
      </div>

      <!-- AI tab (mobile) -->
      <div v-if="mobileTab === 'ai'" class="h-full">
        <AiAssistPanel />
      </div>

      <!-- Session tab: block details + changelog -->
      <div v-if="mobileTab === 'session'" class="flex flex-col">
        <!-- Sub-tabs for details / history -->
        <div class="flex border-b border-gray-100 bg-white sticky top-0 z-10">
          <button
            @click="rightPanelTab = 'details'"
            :class="[
              'flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors',
              rightPanelTab === 'details'
                ? 'text-summit-700 border-summit-700'
                : 'text-gray-400 border-transparent'
            ]"
          >
            Block Details
          </button>
          <button
            @click="rightPanelTab = 'changelog'"
            :class="[
              'flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors',
              rightPanelTab === 'changelog'
                ? 'text-summit-700 border-summit-700'
                : 'text-gray-400 border-transparent'
            ]"
          >
            History
          </button>
        </div>
        <BlockEditor
          v-if="rightPanelTab === 'details'"
          @updated="handleBlockUpdated"
          @deleted="handleBlockDeleted"
        />
        <PlanChangelog v-if="rightPanelTab === 'changelog'" />
      </div>
    </div>
  </div>

  <!-- Modals -->
  <CreatePlanModal
    v-if="showCreatePlan"
    @created="handlePlanCreated"
    @close="showCreatePlan = false"
  />

  <AddBlockModal
    v-if="showAddBlock"
    @created="handleBlockCreated"
    @close="showAddBlock = false"
  />

  <TemplateBrowser
    v-if="showTemplateBrowser"
    @applied="handleTemplateApplied"
    @close="showTemplateBrowser = false"
  />

  <PublishWeekModal
    v-if="showPublishModal"
    @published="handlePublished"
    @close="showPublishModal = false"
  />

  <!-- Toast -->
  <Toast :message="toastMessage" :type="toastType" :visible="toastVisible" @close="toastVisible = false" />
</template>
