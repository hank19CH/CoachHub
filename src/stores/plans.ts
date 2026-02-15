import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { plansService, type PlanFull, type TrainingBlockWithWeeks } from '@/services/plans'
import type { Database } from '@/types/database'

type Plan = Database['public']['Tables']['plans']['Row']
type TrainingBlock = Database['public']['Tables']['training_blocks']['Row']
type BlockWeek = Database['public']['Tables']['block_weeks']['Row']

export const usePlansStore = defineStore('plans', () => {
  // ============================================
  // State
  // ============================================
  const plans = ref<Plan[]>([])
  const activePlan = ref<PlanFull | null>(null)
  const selectedBlockId = ref<string | null>(null)
  const selectedWeekId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Mobile navigation state
  const mobileTab = ref<'plan' | 'week' | 'session'>('plan')

  // ============================================
  // Getters
  // ============================================
  const selectedBlock = computed<TrainingBlockWithWeeks | null>(() => {
    if (!activePlan.value || !selectedBlockId.value) return null
    return activePlan.value.training_blocks.find(b => b.id === selectedBlockId.value) ?? null
  })

  const selectedWeek = computed<BlockWeek | null>(() => {
    if (!selectedBlock.value || !selectedWeekId.value) return null
    return selectedBlock.value.block_weeks.find(w => w.id === selectedWeekId.value) ?? null
  })

  const allWeeks = computed<(BlockWeek & { block_name: string; block_type: string | null })[]>(() => {
    if (!activePlan.value) return []
    const weeks: (BlockWeek & { block_name: string; block_type: string | null })[] = []
    for (const block of activePlan.value.training_blocks) {
      for (const week of block.block_weeks) {
        weeks.push({
          ...week,
          block_name: block.name,
          block_type: block.block_type,
        })
      }
    }
    return weeks
  })

  const currentWeekIndex = computed(() => {
    if (!selectedWeekId.value) return -1
    return allWeeks.value.findIndex(w => w.id === selectedWeekId.value)
  })

  const hasPreviousWeek = computed(() => currentWeekIndex.value > 0)
  const hasNextWeek = computed(() => currentWeekIndex.value < allWeeks.value.length - 1)

  const planStatusCounts = computed(() => {
    const counts = { draft: 0, active: 0, completed: 0, archived: 0 }
    for (const plan of plans.value) {
      const status = plan.status as keyof typeof counts
      if (status in counts) counts[status]++
    }
    return counts
  })

  // ============================================
  // Actions
  // ============================================

  async function fetchPlans(coachId: string) {
    try {
      loading.value = true
      error.value = null
      plans.value = await plansService.getCoachPlans(coachId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch plans'
      console.error('Plans store fetch error:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadPlan(planId: string, coachId?: string) {
    try {
      loading.value = true
      error.value = null
      activePlan.value = await plansService.getPlanById(planId, coachId)

      // Auto-select first block if available
      if (activePlan.value.training_blocks.length > 0) {
        selectedBlockId.value = activePlan.value.training_blocks[0].id

        // Auto-select first week of the first block
        const firstBlock = activePlan.value.training_blocks[0]
        if (firstBlock.block_weeks && firstBlock.block_weeks.length > 0) {
          selectedWeekId.value = firstBlock.block_weeks[0].id
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load plan'
      console.error('Plans store load error:', e)
    } finally {
      loading.value = false
    }
  }

  function selectBlock(blockId: string) {
    selectedBlockId.value = blockId

    // Auto-select first week of the selected block
    const block = activePlan.value?.training_blocks.find(b => b.id === blockId)
    if (block?.block_weeks && block.block_weeks.length > 0) {
      selectedWeekId.value = block.block_weeks[0].id
    } else {
      selectedWeekId.value = null
    }
  }

  function selectWeek(weekId: string) {
    selectedWeekId.value = weekId

    // Find which block this week belongs to and auto-select it
    if (activePlan.value) {
      for (const block of activePlan.value.training_blocks) {
        if (block.block_weeks.some(w => w.id === weekId)) {
          selectedBlockId.value = block.id
          break
        }
      }
    }
  }

  function previousWeek() {
    if (!hasPreviousWeek.value) return
    const prevWeek = allWeeks.value[currentWeekIndex.value - 1]
    selectWeek(prevWeek.id)
  }

  function nextWeek() {
    if (!hasNextWeek.value) return
    const nextWeekItem = allWeeks.value[currentWeekIndex.value + 1]
    selectWeek(nextWeekItem.id)
  }

  async function refreshPlan() {
    if (!activePlan.value) return
    const currentBlockId = selectedBlockId.value
    const currentWeekId = selectedWeekId.value

    await loadPlan(activePlan.value.id, activePlan.value.coach_id)

    // Restore previous selections if they still exist
    if (currentBlockId && activePlan.value?.training_blocks.some(b => b.id === currentBlockId)) {
      selectBlock(currentBlockId)

      // Restore week selection if it still exists
      if (currentWeekId) {
        const block = activePlan.value.training_blocks.find(b => b.id === currentBlockId)
        if (block?.block_weeks.some(w => w.id === currentWeekId)) {
          selectedWeekId.value = currentWeekId
        }
      }
    }
  }

  function clearPlan() {
    activePlan.value = null
    selectedBlockId.value = null
    selectedWeekId.value = null
    error.value = null
  }

  function setMobileTab(tab: 'plan' | 'week' | 'session') {
    mobileTab.value = tab
  }

  return {
    // State
    plans,
    activePlan,
    selectedBlockId,
    selectedWeekId,
    loading,
    error,
    mobileTab,
    // Getters
    selectedBlock,
    selectedWeek,
    allWeeks,
    currentWeekIndex,
    hasPreviousWeek,
    hasNextWeek,
    planStatusCounts,
    // Actions
    fetchPlans,
    loadPlan,
    selectBlock,
    selectWeek,
    previousWeek,
    nextWeek,
    refreshPlan,
    clearPlan,
    setMobileTab,
  }
})
