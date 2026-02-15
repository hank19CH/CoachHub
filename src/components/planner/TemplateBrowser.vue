<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePlansStore } from '@/stores/plans'
import { plansService } from '@/services/plans'
import type { Database } from '@/types/database'

type PeriodizationTemplate = Database['public']['Tables']['periodization_templates']['Row']

const authStore = useAuthStore()
const plansStore = usePlansStore()

const emit = defineEmits<{
  (e: 'applied'): void
  (e: 'close'): void
}>()

const templates = ref<PeriodizationTemplate[]>([])
const loading = ref(true)
const applying = ref(false)
const selectedTemplate = ref<PeriodizationTemplate | null>(null)
const searchQuery = ref('')
const filterDifficulty = ref('')

const filteredTemplates = computed(() => {
  let result = templates.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(t => t.name.toLowerCase().includes(q))
  }
  if (filterDifficulty.value) {
    result = result.filter(t => t.difficulty === filterDifficulty.value)
  }
  return result
})

onMounted(async () => {
  try {
    templates.value = await plansService.getTemplates(authStore.user?.id)
  } catch (e) {
    console.error('Error loading templates:', e)
  } finally {
    loading.value = false
  }
})

function getDifficultyColor(difficulty: string | null) {
  switch (difficulty) {
    case 'beginner': return 'bg-emerald-100 text-emerald-700'
    case 'intermediate': return 'bg-blue-100 text-blue-700'
    case 'advanced': return 'bg-orange-100 text-orange-700'
    case 'elite': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function getBlockCount(template: PeriodizationTemplate): number {
  const structure = template.structure as any
  return structure?.blocks?.length || 0
}

function getBlockTypes(template: PeriodizationTemplate): string[] {
  const structure = template.structure as any
  if (!structure?.blocks) return []
  return structure.blocks
    .map((b: any) => b.block_type || b.name || 'Block')
    .slice(0, 4)
}

async function handleApply() {
  if (!selectedTemplate.value || !plansStore.activePlan) return
  applying.value = true

  try {
    await plansService.applyTemplate(plansStore.activePlan.id, selectedTemplate.value)
    emit('applied')
  } catch (e) {
    console.error('Error applying template:', e)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      @click.self="emit('close')"
    >
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">Periodization Templates</h3>
          <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Search & filter -->
        <div class="flex gap-2 mb-4">
          <input
            v-model="searchQuery"
            type="text"
            class="input flex-1"
            placeholder="Search templates..."
          />
          <select v-model="filterDifficulty" class="input w-auto">
            <option value="">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="elite">Elite</option>
          </select>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="space-y-3">
          <div v-for="i in 4" :key="i" class="animate-pulse bg-gray-100 rounded-xl h-24"></div>
        </div>

        <!-- Templates grid -->
        <div v-else-if="filteredTemplates.length > 0" class="space-y-3 max-h-[50vh] overflow-y-auto">
          <div
            v-for="template in filteredTemplates"
            :key="template.id"
            @click="selectedTemplate = selectedTemplate?.id === template.id ? null : template"
            :class="[
              'p-4 rounded-xl border cursor-pointer transition-all',
              selectedTemplate?.id === template.id
                ? 'border-summit-600 bg-summit-50 ring-1 ring-summit-600'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            ]"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h4 class="font-semibold text-gray-900 text-sm">{{ template.name }}</h4>
                  <span v-if="template.difficulty" :class="['text-[10px] font-bold px-2 py-0.5 rounded-full uppercase', getDifficultyColor(template.difficulty)]">
                    {{ template.difficulty }}
                  </span>
                </div>
                <p class="text-xs text-gray-500">
                  {{ template.duration_weeks }} weeks · {{ getBlockCount(template) }} blocks
                  <span v-if="!template.coach_id" class="ml-1 text-summit-600">System template</span>
                </p>
              </div>
            </div>

            <!-- Block preview -->
            <div class="flex gap-1 mt-3">
              <span
                v-for="(blockType, i) in getBlockTypes(template)"
                :key="i"
                class="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium"
              >
                {{ typeof blockType === 'string' ? blockType.replace(/_/g, ' ') : blockType }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8">
          <p class="text-sm text-gray-400">No templates found</p>
        </div>

        <!-- Apply button -->
        <div v-if="selectedTemplate" class="mt-4 p-4 bg-summit-50 rounded-xl border border-summit-200">
          <p class="text-sm text-gray-700 mb-3">
            Apply <strong>{{ selectedTemplate.name }}</strong> to your plan? This will replace existing blocks.
          </p>
          <div class="flex gap-3">
            <button @click="selectedTemplate = null" class="flex-1 btn-secondary text-sm">Cancel</button>
            <button @click="handleApply" class="flex-1 btn-primary text-sm" :disabled="applying">
              <span v-if="applying" class="flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Applying...
              </span>
              <span v-else>Apply Template</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
