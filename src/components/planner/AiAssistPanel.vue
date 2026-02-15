<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePlansStore } from '@/stores/plans'
import { aiPeriodizationService, type ConversationMessage } from '@/services/aiPeriodization'
import { aiChatService } from '@/services/aiChat'
import { plansService } from '@/services/plans'
import { planChangelogService } from '@/services/planPublish'
import { supabase } from '@/lib/supabase'
import { type AdaptiveSuggestion } from '@/services/adaptive'
import type { AiChatMessage, TrainingBlockInsert } from '@/types/database'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Toast from '@/components/ui/Toast.vue'
import SessionApprovalModal from '@/components/planner/SessionApprovalModal.vue'

const router = useRouter()
const authStore = useAuthStore()
const plansStore = usePlansStore()

// ============================================
// State
// ============================================
const chatInput = ref('')
const isLoading = ref(false)
const isLoadingSuggestions = ref(false)
const isLoadingHistory = ref(false)
const isApplying = ref(false)
const messages = ref<ChatMessageUI[]>([])
const suggestions = ref<AdaptiveSuggestion[]>([])
const activeTab = ref<'suggestions' | 'chat'>('suggestions')
const error = ref<string | null>(null)

// Persistence
const currentSessionId = ref<string | null>(null)

// Confirm dialog
const showConfirmDialog = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmAction = ref<(() => void) | null>(null)

// Toast
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'info'>('success')

// Track which messages have been applied (prevent double-apply)
const appliedPlanMessageIds = ref<Set<string>>(new Set())
const appliedSessionMessageIds = ref<Set<string>>(new Set())

// Session approval modal
const showSessionApprovalModal = ref(false)
const pendingSession = ref<any>(null)
const pendingSessionMessageId = ref<string | null>(null)

// Chat scroll container ref
const chatContainer = ref<HTMLElement | null>(null)

// ============================================
// UI Message type (extends DB message with parsed plan/session)
// ============================================
interface ChatMessageUI {
  id?: string // DB id (present after save)
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  plan?: any // parsed AI plan
  session?: any // parsed AI session
}

// ============================================
// Context awareness
// ============================================
const currentContext = computed(() => {
  if (plansStore.selectedWeek) {
    return {
      level: 'week',
      label: `Week ${plansStore.selectedWeek.week_number}${plansStore.selectedWeek.is_deload ? ' (Deload)' : ''}`,
    }
  }
  if (plansStore.selectedBlock) {
    return {
      level: 'block',
      label: plansStore.selectedBlock.name,
    }
  }
  if (plansStore.activePlan) {
    return {
      level: 'plan',
      label: plansStore.activePlan.name,
    }
  }
  return null
})

const planAthletes = computed(() =>
  plansStore.activePlan?.plan_athletes?.map(pa => ({
    id: pa.athlete_id,
    name: (pa as any).athlete?.display_name || 'Unknown',
  })) || []
)

// ============================================
// Load Tier 1 suggestions when context changes
// ============================================
async function loadSuggestions() {
  if (!plansStore.activePlan || !authStore.user) return

  isLoadingSuggestions.value = true
  error.value = null
  try {
    const athleteId = planAthletes.value.length > 0 ? planAthletes.value[0].id : undefined
    suggestions.value = await aiPeriodizationService.getTier1Suggestions(
      plansStore.activePlan.id,
      authStore.user.id,
      athleteId
    )
  } catch (e) {
    console.error('Error loading suggestions:', e)
    error.value = 'Failed to load suggestions'
  } finally {
    isLoadingSuggestions.value = false
  }
}

// Reload suggestions when plan/block/week selection changes
watch(
  () => [plansStore.activePlan?.id, plansStore.selectedBlockId, plansStore.selectedWeekId],
  () => {
    if (plansStore.activePlan) {
      loadSuggestions()
    }
  }
)

// ============================================
// Chat Persistence — Load on mount
// ============================================
async function loadChatSession() {
  if (!plansStore.activePlan || !authStore.user) return

  isLoadingHistory.value = true
  try {
    // Get or create session
    const session = await aiChatService.getOrCreateSession(
      plansStore.activePlan.id,
      authStore.user.id
    )
    currentSessionId.value = session.id

    // Load messages
    const dbMessages = await aiChatService.getMessages(session.id)

    // Map DB messages to UI format
    messages.value = dbMessages.map(dbMsg => ({
      id: dbMsg.id,
      role: dbMsg.role as 'user' | 'assistant',
      content: dbMsg.content,
      timestamp: dbMsg.created_at,
      plan: dbMsg.plan_data || undefined,
      session: dbMsg.session_data || undefined,
    }))

    // Scroll to bottom after loading
    await nextTick()
    scrollToBottom()
  } catch (e) {
    console.error('Error loading chat session:', e)
  } finally {
    isLoadingHistory.value = false
  }
}

// Re-load chat when plan changes
watch(
  () => plansStore.activePlan?.id,
  (newId) => {
    if (newId) {
      currentSessionId.value = null
      messages.value = []
      loadChatSession()
    }
  }
)

onMounted(() => {
  if (plansStore.activePlan) {
    loadSuggestions()
    loadChatSession()
  }
})

// ============================================
// Chat / AI interaction
// ============================================
async function sendMessage() {
  const input = chatInput.value.trim()
  if (!input || isLoading.value || !authStore.user) return

  const coachId = authStore.user.id
  chatInput.value = ''
  isLoading.value = true
  error.value = null

  // Add user message to UI immediately
  const userMsg: ChatMessageUI = {
    role: 'user',
    content: input,
    timestamp: new Date().toISOString(),
  }
  messages.value.push(userMsg)
  await nextTick()
  scrollToBottom()

  // Save user message to DB
  if (currentSessionId.value) {
    try {
      const savedUserMsg = await aiChatService.saveMessage({
        sessionId: currentSessionId.value,
        role: 'user',
        content: input,
      })
      userMsg.id = savedUserMsg.id

      // Auto-set title from first user message
      const userMessages = messages.value.filter(m => m.role === 'user')
      if (userMessages.length === 1) {
        await aiChatService.updateTitle(currentSessionId.value, input)
      }
    } catch (e) {
      console.error('Error saving user message:', e)
    }
  }

  // Build conversation history for multi-turn context
  const conversationHistory: ConversationMessage[] = messages.value
    .slice(0, -1) // Exclude the message we just added (it's the current prompt)
    .map(m => ({ role: m.role, content: m.content }))

  try {
    // Determine what kind of request this is with enhanced keyword detection
    const lowerInput = input.toLowerCase()

    // High-priority session indicators (body parts, training types, specific sessions)
    const sessionKeywords = [
      'session', 'workout', 'exercise', 'training day',
      'lower body', 'upper body', 'leg day', 'chest day', 'back day', 'shoulder day', 'arm day',
      'strength session', 'power session', 'hypertrophy', 'endurance session',
      'max strength', 'speed work', 'plyometric', 'conditioning',
      'squat', 'deadlift', 'bench press', 'overhead press', 'pull up', 'row'
    ]
    const isSessionRequest = sessionKeywords.some(kw => lowerInput.includes(kw))

    // Plan-level indicators (blocks, weeks, overall structure)
    // Only trigger if NOT a session request (session takes priority)
    const planKeywords = ['add block', 'new block', 'create block', 'periodization', 'macrocycle', 'mesocycle', 'training plan']
    const isPlanRequest = !isSessionRequest && planKeywords.some(kw => lowerInput.includes(kw))

    let assistantMsg: ChatMessageUI

    // Prioritize session generation if we have specific body part or exercise mentions
    if (isSessionRequest && plansStore.selectedBlock) {
      // Generate session
      const result = await aiPeriodizationService.generateSession({
        coachId,
        blockType: plansStore.selectedBlock.block_type || undefined,
        blockFocusTags: plansStore.selectedBlock.focus_tags || undefined,
        weekNumber: plansStore.selectedWeek?.week_number,
        isDeload: plansStore.selectedWeek?.is_deload,
        volumeModifier: plansStore.selectedWeek?.volume_modifier,
        intensityModifier: plansStore.selectedWeek?.intensity_modifier,
        coachPrompt: input,
        athleteId: planAthletes.value.length > 0 ? planAthletes.value[0].id : undefined,
        conversationHistory,
      })

      if (result.success && result.session) {
        assistantMsg = {
          role: 'assistant',
          content: result.session.description || result.session.coaching_notes || `Here's the session I generated for ${plansStore.selectedBlock?.name || 'your training block'}.`,
          timestamp: new Date().toISOString(),
          session: result.session,
        }
      } else {
        // AI may have asked a clarifying question - show rawText as message
        assistantMsg = {
          role: 'assistant',
          content: result.rawText || result.error || 'Failed to generate session. Please try again.',
          timestamp: new Date().toISOString(),
        }
      }
    } else if (isPlanRequest && plansStore.activePlan) {
      // Plan modification (Tier 2) or generation (Tier 3)
      const existingBlocks = plansStore.activePlan.training_blocks.map(b => ({
        name: b.name,
        block_type: b.block_type,
        duration_weeks: b.duration_weeks,
        focus_tags: b.focus_tags,
        volume_target: b.volume_target,
        intensity_target: b.intensity_target,
      }))

      const result = await aiPeriodizationService.modifyPlan({
        planId: plansStore.activePlan.id,
        coachId,
        existingPlan: {
          name: plansStore.activePlan.name,
          periodization_model: plansStore.activePlan.periodization_model,
          goal: plansStore.activePlan.goal_description,
          blocks: existingBlocks,
        },
        modificationRequest: input,
        athleteId: planAthletes.value.length > 0 ? planAthletes.value[0].id : undefined,
        conversationHistory,
      })

      if (result.success && result.plan) {
        assistantMsg = {
          role: 'assistant',
          content: result.plan.summary || 'Plan modification ready for review.',
          timestamp: new Date().toISOString(),
          plan: result.plan,
        }
      } else {
        assistantMsg = {
          role: 'assistant',
          content: result.rawText || result.error || 'Failed to process request. Please try again.',
          timestamp: new Date().toISOString(),
        }
      }
    } else {
      // Generic request — use Tier 3 generation
      const result = await aiPeriodizationService.generatePlan({
        coachId,
        coachPrompt: input,
        athleteId: planAthletes.value.length > 0 ? planAthletes.value[0].id : undefined,
        conversationHistory,
      })

      if (result.success && result.plan) {
        assistantMsg = {
          role: 'assistant',
          content: result.plan.summary || 'Here\'s what I\'ve generated.',
          timestamp: new Date().toISOString(),
          plan: result.plan,
        }
      } else {
        assistantMsg = {
          role: 'assistant',
          content: result.rawText || result.error || 'I had trouble processing that. Try being more specific.',
          timestamp: new Date().toISOString(),
        }
      }
    }

    // Add assistant message to UI
    messages.value.push(assistantMsg)

    // Save assistant message to DB
    if (currentSessionId.value) {
      try {
        const savedAssistantMsg = await aiChatService.saveMessage({
          sessionId: currentSessionId.value,
          role: 'assistant',
          content: assistantMsg.content,
          planData: assistantMsg.plan || null,
          sessionData: assistantMsg.session || null,
        })
        assistantMsg.id = savedAssistantMsg.id
      } catch (e) {
        console.error('Error saving assistant message:', e)
      }
    }
  } catch (e) {
    const errorMsg: ChatMessageUI = {
      role: 'assistant',
      content: `Error: ${e instanceof Error ? e.message : 'Something went wrong.'}`,
      timestamp: new Date().toISOString(),
    }
    messages.value.push(errorMsg)

    // Save error message too
    if (currentSessionId.value) {
      try {
        await aiChatService.saveMessage({
          sessionId: currentSessionId.value,
          role: 'assistant',
          content: errorMsg.content,
        })
      } catch (saveErr) {
        console.error('Error saving error message:', saveErr)
      }
    }
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

// ============================================
// New Conversation
// ============================================
async function handleNewConversation() {
  if (!currentSessionId.value) return

  try {
    await aiChatService.clearSession(currentSessionId.value)
    messages.value = []
    appliedPlanMessageIds.value.clear()
    appliedSessionMessageIds.value.clear()
  } catch (e) {
    console.error('Error clearing session:', e)
    showToast('Failed to clear conversation', 'error')
  }
}

// ============================================
// Accept/Apply Plan
// ============================================
function handleAcceptPlan(msg: ChatMessageUI) {
  if (!msg.plan || !plansStore.activePlan || !authStore.user) return
  if (msg.id && appliedPlanMessageIds.value.has(msg.id)) return

  const aiBlocks = msg.plan.training_blocks || msg.plan.blocks || []
  const existingCount = plansStore.activePlan.training_blocks?.length || 0

  confirmTitle.value = 'Apply AI Plan?'
  confirmMessage.value = existingCount > 0
    ? `This will replace ${existingCount} existing block${existingCount !== 1 ? 's' : ''} with ${aiBlocks.length} AI-generated block${aiBlocks.length !== 1 ? 's' : ''}. This cannot be undone.`
    : `This will create ${aiBlocks.length} new training block${aiBlocks.length !== 1 ? 's' : ''}.`

  confirmAction.value = () => executeApplyPlan(msg, aiBlocks)
  showConfirmDialog.value = true
}

async function executeApplyPlan(msg: ChatMessageUI, aiBlocks: any[]) {
  if (!plansStore.activePlan || !authStore.user) return

  showConfirmDialog.value = false
  isApplying.value = true

  try {
    const planId = plansStore.activePlan.id
    const coachId = authStore.user.id

    // Delete existing blocks
    const { error: deleteError } = await (supabase
      .from('training_blocks') as any)
      .delete()
      .eq('plan_id', planId)

    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to clear existing blocks')
    }

    // Create blocks from AI plan
    for (let i = 0; i < aiBlocks.length; i++) {
      const blockDef = aiBlocks[i]
      const blockInsert: TrainingBlockInsert = {
        plan_id: planId,
        name: blockDef.name || `Block ${i + 1}`,
        block_type: blockDef.block_type || null,
        focus_tags: blockDef.focus_tags || [],
        order_index: i,
        duration_weeks: blockDef.duration_weeks || 4,
        volume_target: blockDef.volume_target || null,
        intensity_target: blockDef.intensity_target || null,
        ai_generated: true,
      }

      await plansService.createBlock(blockInsert) // Auto-creates weeks
    }

    // Update plan's periodization model if AI provided one
    const aiModel = msg.plan?.periodization_model
    if (aiModel) {
      await plansService.updatePlan(planId, {
        periodization_model: aiModel,
      })
    }

    // Log to changelog
    await planChangelogService.addEntry({
      plan_id: planId,
      changed_by: coachId,
      change_type: 'ai_plan_applied',
      change_summary: `Applied AI-generated plan with ${aiBlocks.length} block(s)`,
    })

    // Refresh plan in store
    await plansStore.refreshPlan()

    // Mark as applied
    if (msg.id) {
      appliedPlanMessageIds.value.add(msg.id)
    }

    showToast('Plan applied successfully!', 'success')
  } catch (e) {
    console.error('Error applying AI plan:', e)
    showToast(`Failed to apply plan: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error')
  } finally {
    isApplying.value = false
  }
}

// ============================================
// Accept/Apply Session — Open Approval Modal
// ============================================
function handleAcceptSession(msg: ChatMessageUI) {
  if (!msg.session || !authStore.user) return
  if (msg.id && appliedSessionMessageIds.value.has(msg.id)) return

  // Open approval modal instead of creating immediately
  pendingSession.value = msg.session
  pendingSessionMessageId.value = msg.id || null
  showSessionApprovalModal.value = true
}

function handleSessionApplied(workoutId: string) {
  showSessionApprovalModal.value = false

  // Mark as applied
  if (pendingSessionMessageId.value) {
    appliedSessionMessageIds.value.add(pendingSessionMessageId.value)
  }

  showToast('Workout created! Opening editor...', 'success')

  // Navigate to workout builder for review
  setTimeout(() => {
    router.push({ name: 'workout-builder', params: { id: workoutId } })
  }, 500)

  // Clear pending
  pendingSession.value = null
  pendingSessionMessageId.value = null
}

function handleSessionApprovalClosed() {
  showSessionApprovalModal.value = false
  pendingSession.value = null
  pendingSessionMessageId.value = null
}

// ============================================
// Suggestion actions
// ============================================
async function handleSuggestionAction(
  suggestion: AdaptiveSuggestion,
  action: 'accepted' | 'rejected'
) {
  if (!authStore.user) return
  await aiPeriodizationService.logSuggestionAction(authStore.user.id, suggestion, action)
  suggestions.value = suggestions.value.filter(s => s !== suggestion)
}

// ============================================
// Helpers
// ============================================
function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

function formatSessionPreview(session: any): string {
  if (!session.exercises) return ''
  return session.exercises.slice(0, 5).map((ex: any, i: number) =>
    `${i + 1}. ${ex.exercise_name || ex.name} — ${ex.sets}×${ex.reps}${ex.weight_suggestion ? ` @ ${ex.weight_suggestion}` : ''}`
  ).join('\n') + (session.exercises.length > 5 ? `\n+${session.exercises.length - 5} more exercises` : '')
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200'
    case 'high': return 'text-valencia-600 bg-valencia-50 border-valencia-200'
    case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200'
    default: return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  }
}

function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'critical': return '🚨'
    case 'high': return '⚠️'
    case 'medium': return '💡'
    default: return '📊'
  }
}

function getSuggestionIcon(type: string): string {
  switch (type) {
    case 'progressive_overload': return '📈'
    case 'deload_recommended': return '🛌'
    case 'readiness_adjustment': return '😴'
    case 'compliance_alert': return '📋'
    case 'volume_check': return '📉'
    case 'recovery_needed': return '💊'
    default: return '🤖'
  }
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-4 pt-4 pb-3 border-b border-gray-100">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-summit-500 to-summit-700 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-bold text-gray-900">AI Assist</h3>
          <p v-if="currentContext" class="text-[10px] text-gray-400">
            Viewing: {{ currentContext.label }}
          </p>
        </div>
        <!-- New Conversation button (visible on chat tab when messages exist) -->
        <button
          v-if="activeTab === 'chat' && messages.length > 0"
          @click="handleNewConversation"
          class="text-[10px] text-summit-600 hover:text-summit-700 font-semibold flex items-center gap-1 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          @click="activeTab = 'suggestions'"
          :class="[
            'flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all',
            activeTab === 'suggestions'
              ? 'bg-white text-summit-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          ]"
        >
          Suggestions
          <span
            v-if="suggestions.length > 0"
            class="ml-1 bg-summit-600 text-white text-[9px] px-1.5 py-0.5 rounded-full"
          >
            {{ suggestions.length }}
          </span>
        </button>
        <button
          @click="activeTab = 'chat'"
          :class="[
            'flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all',
            activeTab === 'chat'
              ? 'bg-white text-summit-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          ]"
        >
          AI Chat
        </button>
      </div>
    </div>

    <!-- SUGGESTIONS TAB -->
    <div v-if="activeTab === 'suggestions'" class="flex-1 overflow-y-auto">
      <!-- Loading -->
      <div v-if="isLoadingSuggestions" class="p-6 text-center">
        <div class="w-6 h-6 border-2 border-summit-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p class="text-xs text-gray-400">Analyzing training data...</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="suggestions.length === 0" class="p-6 text-center">
        <div class="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
          <span class="text-xl">✅</span>
        </div>
        <p class="text-sm font-semibold text-gray-900 mb-1">All looking good!</p>
        <p class="text-xs text-gray-400">No adjustments needed right now. Keep up the great work.</p>
      </div>

      <!-- Suggestions list -->
      <div v-else class="p-3 space-y-2.5">
        <div
          v-for="(sug, idx) in suggestions"
          :key="idx"
          :class="[
            'rounded-xl border p-3.5 transition-all',
            getPriorityColor(sug.priority)
          ]"
        >
          <!-- Header -->
          <div class="flex items-start gap-2 mb-2">
            <span class="text-base flex-shrink-0 mt-0.5">{{ getSuggestionIcon(sug.type) }}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <h4 class="text-xs font-bold truncate">{{ sug.title }}</h4>
                <span class="text-[9px] font-semibold uppercase tracking-wider opacity-60">
                  {{ sug.priority }}
                </span>
              </div>
              <p class="text-[11px] opacity-80 mt-0.5 line-clamp-2">{{ sug.description }}</p>
            </div>
          </div>

          <!-- Rationale (expandable) -->
          <details class="mt-2">
            <summary class="text-[10px] font-semibold cursor-pointer opacity-60 hover:opacity-100">
              Why? ({{ sug.confidence }}% confidence)
            </summary>
            <p class="text-[10px] opacity-70 mt-1 pl-2 border-l-2 border-current/20">
              {{ sug.rationale }}
            </p>
          </details>

          <!-- Actions -->
          <div class="flex gap-2 mt-3">
            <button
              @click="handleSuggestionAction(sug, 'accepted')"
              class="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-white/60 hover:bg-white/80 transition-colors text-center"
            >
              ✓ Accept
            </button>
            <button
              @click="handleSuggestionAction(sug, 'rejected')"
              class="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-white/40 hover:bg-white/60 transition-colors text-center opacity-60"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- CHAT TAB -->
    <div v-if="activeTab === 'chat'" class="flex-1 flex flex-col overflow-hidden">
      <!-- Messages -->
      <div ref="chatContainer" class="flex-1 overflow-y-auto p-3 space-y-3">
        <!-- Loading history -->
        <div v-if="isLoadingHistory" class="text-center py-6">
          <div class="w-6 h-6 border-2 border-summit-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p class="text-xs text-gray-400">Loading conversation...</p>
        </div>

        <!-- Welcome message -->
        <div v-else-if="messages.length === 0" class="text-center py-6">
          <div class="w-12 h-12 rounded-full bg-summit-50 flex items-center justify-center mx-auto mb-3">
            <span class="text-xl">🤖</span>
          </div>
          <p class="text-sm font-semibold text-gray-900 mb-1">AI Plan Assistant</p>
          <p class="text-xs text-gray-400 max-w-[200px] mx-auto">
            Ask me to generate plans, sessions, or adjust your current programming.
          </p>
          <!-- Quick prompts -->
          <div class="mt-4 space-y-1.5">
            <button
              v-for="prompt in [
                'Create a lower body max strength session',
                'Build an upper body hypertrophy workout',
                'Generate a speed and power training day',
                'Add a 4-week strength block to the plan',
              ]"
              :key="prompt"
              @click="chatInput = prompt; sendMessage()"
              class="block w-full text-left text-[11px] text-summit-600 bg-summit-50 hover:bg-summit-100 px-3 py-2 rounded-lg transition-colors"
            >
              "{{ prompt }}"
            </button>
          </div>
        </div>

        <!-- Chat messages -->
        <template v-else>
          <div
            v-for="(msg, idx) in messages"
            :key="msg.id || idx"
            :class="[
              'max-w-[90%]',
              msg.role === 'user' ? 'ml-auto' : 'mr-auto'
            ]"
          >
            <div
              :class="[
                'rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-summit-600 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              ]"
            >
              <div class="whitespace-pre-wrap">{{ msg.content }}</div>

              <!-- Plan preview card -->
              <div
                v-if="msg.plan && (msg.plan.training_blocks?.length || msg.plan.blocks?.length)"
                class="mt-3 bg-white rounded-xl border border-gray-200 p-3 shadow-sm"
              >
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-5 h-5 rounded-md bg-summit-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <span class="text-[11px] font-bold text-gray-900">Generated Plan</span>
                  <span
                    v-if="msg.plan.periodization_model"
                    class="ml-auto text-[9px] font-semibold bg-summit-50 text-summit-600 px-1.5 py-0.5 rounded-full"
                  >
                    {{ msg.plan.periodization_model }}
                  </span>
                </div>

                <!-- Block list -->
                <div class="space-y-1 mb-3">
                  <div
                    v-for="(block, bIdx) in (msg.plan.training_blocks || msg.plan.blocks || []).slice(0, 6)"
                    :key="bIdx"
                    class="flex items-center gap-2 text-[10px] text-gray-600"
                  >
                    <div class="w-1.5 h-1.5 rounded-full bg-summit-400 flex-shrink-0"></div>
                    <span class="font-medium text-gray-800">{{ block.name }}</span>
                    <span v-if="block.block_type" class="text-gray-400">{{ block.block_type }}</span>
                    <span class="ml-auto text-gray-400">{{ block.duration_weeks || '?' }}w</span>
                  </div>
                  <p
                    v-if="(msg.plan.training_blocks || msg.plan.blocks || []).length > 6"
                    class="text-[9px] text-gray-400 pl-3.5"
                  >
                    +{{ (msg.plan.training_blocks || msg.plan.blocks || []).length - 6 }} more blocks
                  </p>
                </div>

                <!-- Apply button -->
                <button
                  @click="handleAcceptPlan(msg)"
                  :disabled="isApplying || (msg.id ? appliedPlanMessageIds.has(msg.id) : false)"
                  :class="[
                    'w-full py-2 rounded-lg text-[11px] font-semibold transition-all',
                    (msg.id && appliedPlanMessageIds.has(msg.id))
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : isApplying
                        ? 'bg-gray-100 text-gray-400 cursor-wait'
                        : 'bg-summit-600 hover:bg-summit-700 text-white'
                  ]"
                >
                  <span v-if="msg.id && appliedPlanMessageIds.has(msg.id)" class="flex items-center justify-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Applied
                  </span>
                  <span v-else-if="isApplying" class="flex items-center justify-center gap-1.5">
                    <div class="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    Applying...
                  </span>
                  <span v-else>Apply to Plan</span>
                </button>
              </div>

              <!-- Session preview card -->
              <div
                v-if="msg.session && msg.session.exercises?.length"
                class="mt-3 bg-white rounded-xl border border-gray-200 p-3 shadow-sm"
              >
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-5 h-5 rounded-md bg-valencia-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-valencia-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span class="text-[11px] font-bold text-gray-900">
                    {{ msg.session.session_name || msg.session.name || 'AI Session' }}
                  </span>
                </div>

                <!-- Duration / RPE badges -->
                <div class="flex gap-2 mb-2">
                  <span
                    v-if="msg.session.estimated_duration_min"
                    class="text-[9px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full"
                  >
                    ~{{ msg.session.estimated_duration_min }}min
                  </span>
                  <span
                    v-if="msg.session.target_rpe"
                    class="text-[9px] font-semibold bg-valencia-50 text-valencia-600 px-1.5 py-0.5 rounded-full"
                  >
                    RPE {{ msg.session.target_rpe }}
                  </span>
                  <span
                    v-if="msg.session.session_type"
                    class="text-[9px] font-semibold bg-summit-50 text-summit-600 px-1.5 py-0.5 rounded-full"
                  >
                    {{ msg.session.session_type }}
                  </span>
                </div>

                <!-- Exercise list -->
                <div class="space-y-1 mb-3">
                  <div
                    v-for="(ex, eIdx) in (msg.session.exercises || []).slice(0, 5)"
                    :key="eIdx"
                    class="flex items-center gap-2 text-[10px] text-gray-600"
                  >
                    <span class="text-gray-400 w-3 text-right flex-shrink-0">{{ eIdx + 1 }}.</span>
                    <span class="font-medium text-gray-800">{{ ex.exercise_name || ex.name }}</span>
                    <span class="ml-auto text-gray-400 flex-shrink-0">
                      {{ ex.sets }}×{{ ex.reps }}
                    </span>
                  </div>
                  <p
                    v-if="(msg.session.exercises || []).length > 5"
                    class="text-[9px] text-gray-400 pl-5"
                  >
                    +{{ (msg.session.exercises || []).length - 5 }} more exercises
                  </p>
                </div>

                <!-- Create workout button -->
                <button
                  @click="handleAcceptSession(msg)"
                  :disabled="isApplying || (msg.id ? appliedSessionMessageIds.has(msg.id) : false)"
                  :class="[
                    'w-full py-2 rounded-lg text-[11px] font-semibold transition-all',
                    (msg.id && appliedSessionMessageIds.has(msg.id))
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : isApplying
                        ? 'bg-gray-100 text-gray-400 cursor-wait'
                        : 'bg-valencia-500 hover:bg-valencia-600 text-white'
                  ]"
                >
                  <span v-if="msg.id && appliedSessionMessageIds.has(msg.id)" class="flex items-center justify-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Workout Created
                  </span>
                  <span v-else-if="isApplying" class="flex items-center justify-center gap-1.5">
                    <div class="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </span>
                  <span v-else>Create Workout</span>
                </button>
              </div>
            </div>
            <p :class="[
              'text-[9px] mt-0.5 px-1',
              msg.role === 'user' ? 'text-right text-gray-300' : 'text-gray-300'
            ]">
              {{ formatTimestamp(msg.timestamp) }}
            </p>
          </div>
        </template>

        <!-- Loading indicator -->
        <div v-if="isLoading" class="mr-auto max-w-[80%]">
          <div class="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
            <div class="flex gap-1">
              <div class="w-1.5 h-1.5 bg-summit-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
              <div class="w-1.5 h-1.5 bg-summit-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
              <div class="w-1.5 h-1.5 bg-summit-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>
            <span class="text-[10px] text-gray-400">Thinking...</span>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="border-t border-gray-100 p-3">
        <form @submit.prevent="sendMessage" class="flex gap-2">
          <input
            v-model="chatInput"
            type="text"
            placeholder="Ask AI to build, adjust, or suggest..."
            :disabled="isLoading"
            class="flex-1 bg-gray-100 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-summit-500 focus:bg-white transition-colors disabled:opacity-50"
            @keydown.enter.prevent="sendMessage"
          />
          <button
            type="submit"
            :disabled="isLoading || !chatInput.trim()"
            class="w-9 h-9 rounded-xl bg-summit-600 hover:bg-summit-700 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </form>
        <p class="text-[9px] text-gray-300 text-center mt-1.5">
          AI suggestions require coach review before applying
        </p>
      </div>
    </div>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      :open="showConfirmDialog"
      :title="confirmTitle"
      :message="confirmMessage"
      confirm-text="Apply"
      :confirm-class="'bg-summit-600 text-white hover:bg-summit-700 focus:ring-summit-500'"
      :loading="isApplying"
      @confirm="confirmAction?.()"
      @cancel="showConfirmDialog = false"
    />

    <!-- Toast -->
    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @close="toastVisible = false"
    />

    <!-- Session Approval Modal -->
    <SessionApprovalModal
      :open="showSessionApprovalModal"
      :session="pendingSession"
      :week-id="plansStore.selectedWeekId || undefined"
      :block-name="plansStore.selectedBlock?.name"
      :coach-id="authStore.user?.id || ''"
      @applied="handleSessionApplied"
      @close="handleSessionApprovalClosed"
    />
  </div>
</template>
