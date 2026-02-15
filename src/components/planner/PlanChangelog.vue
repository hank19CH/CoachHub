<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { usePlansStore } from '@/stores/plans'
import { planChangelogService } from '@/services/planPublish'

const plansStore = usePlansStore()

const entries = ref<any[]>([])
const loading = ref(true)

async function loadChangelog() {
  const planId = plansStore.activePlan?.id
  if (!planId) return
  loading.value = true
  try {
    entries.value = await planChangelogService.getChangelog(planId)
  } catch (e) {
    console.error('Error loading changelog:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadChangelog)

watch(() => plansStore.activePlan?.id, () => {
  if (plansStore.activePlan?.id) loadChangelog()
})

function getChangeIcon(type: string): string {
  const icons: Record<string, string> = {
    block_added: '➕',
    block_removed: '🗑️',
    block_reordered: '↕️',
    week_modified: '📅',
    published: '📤',
    manual: '✏️',
  }
  return icons[type] || '📝'
}

function getChangeColor(type: string): string {
  const colors: Record<string, string> = {
    block_added: 'bg-emerald-100 text-emerald-700',
    block_removed: 'bg-red-100 text-red-700',
    block_reordered: 'bg-blue-100 text-blue-700',
    week_modified: 'bg-amber-100 text-amber-700',
    published: 'bg-summit-100 text-summit-700',
    manual: 'bg-gray-100 text-gray-600',
  }
  return colors[type] || 'bg-gray-100 text-gray-600'
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="p-4">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-bold text-gray-900">Changelog</h3>
      <span v-if="plansStore.activePlan" class="text-[10px] font-bold px-2 py-0.5 rounded bg-summit-100 text-summit-700">
        v{{ plansStore.activePlan.version }}
      </span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="animate-pulse flex gap-3">
        <div class="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0"></div>
        <div class="flex-1">
          <div class="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div class="h-2.5 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="entries.length === 0" class="text-center py-8">
      <p class="text-sm text-gray-400">No changes recorded yet</p>
    </div>

    <!-- Changelog list -->
    <div v-else class="relative">
      <!-- Timeline line -->
      <div class="absolute left-4 top-4 bottom-4 w-px bg-gray-200"></div>

      <div class="space-y-4">
        <div v-for="entry in entries" :key="entry.id" class="flex gap-3 relative">
          <!-- Icon dot -->
          <div :class="['w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 z-10', getChangeColor(entry.change_type)]">
            {{ getChangeIcon(entry.change_type) }}
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0 pb-1">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-xs font-semibold text-gray-900 capitalize">
                {{ entry.change_type.replace(/_/g, ' ') }}
              </span>
              <span class="text-[10px] text-gray-400">v{{ entry.version }}</span>
            </div>

            <p v-if="entry.change_summary" class="text-xs text-gray-600 mb-1">
              {{ entry.change_summary }}
            </p>

            <div class="flex items-center gap-2">
              <span v-if="entry.changed_by_profile" class="text-[10px] text-gray-400">
                {{ entry.changed_by_profile.display_name }}
              </span>
              <span class="text-[10px] text-gray-400">{{ formatDate(entry.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
