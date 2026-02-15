import { supabase } from '@/lib/supabase'
import { athleteHistoryService } from './athleteHistory'
import { adaptiveService, type AdaptiveSuggestion } from './adaptive'

// ============================================
// AI Periodization Service — Frontend caller
// Connects Tier 1 (adaptive rules), Tier 2 (modifications), Tier 3 (generation)
// ============================================

export interface AiPlanResult {
  success: boolean
  tier: 2 | 3
  plan: any | null
  rawText: string | null
  usage?: { input_tokens: number; output_tokens: number }
  error?: string
}

export interface AiSessionResult {
  success: boolean
  session: any | null
  rawText: string | null
  usage?: { input_tokens: number; output_tokens: number }
  error?: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export const aiPeriodizationService = {
  // ============================================
  // Tier 1 — Deterministic Rules (from adaptive.ts)
  // ============================================

  async getTier1Suggestions(
    planId: string,
    coachId: string,
    athleteId?: string
  ): Promise<AdaptiveSuggestion[]> {
    return adaptiveService.getSuggestionsForPlan(planId, coachId, athleteId)
  },

  async getSessionSuggestions(
    workoutId: string,
    athleteId: string
  ): Promise<AdaptiveSuggestion[]> {
    return adaptiveService.getSuggestionsForSession(workoutId, athleteId)
  },

  // ============================================
  // Tier 2 — AI Modifications (existing plan)
  // ============================================

  async modifyPlan(options: {
    planId: string
    coachId: string
    existingPlan: any
    modificationRequest: string
    coachPrompt?: string
    athleteId?: string
    conversationHistory?: ConversationMessage[]
  }): Promise<AiPlanResult> {
    try {
      let athleteContext: string | undefined
      if (options.athleteId) {
        const summary = await athleteHistoryService.getAthleteSummary(options.athleteId)
        athleteContext = summary.contextText
      }

      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: {
          tier: 2,
          planId: options.planId,
          coachId: options.coachId,
          existingPlan: options.existingPlan,
          modificationRequest: options.modificationRequest,
          coachPrompt: options.coachPrompt || options.modificationRequest,
          athleteContext,
          conversationHistory: options.conversationHistory || [],
        },
      })

      if (error) {
        console.error('Edge function error:', error)
        return {
          success: false,
          tier: 2,
          plan: null,
          rawText: null,
          error: error.message || 'AI service error',
        }
      }

      return {
        success: true,
        tier: 2,
        plan: data.plan,
        rawText: data.rawText,
        usage: data.usage,
      }
    } catch (e) {
      console.error('Error in Tier 2 plan modification:', e)
      return {
        success: false,
        tier: 2,
        plan: null,
        rawText: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      }
    }
  },

  // ============================================
  // Tier 3 — Full Plan Generation
  // ============================================

  async generatePlan(options: {
    coachId: string
    sport?: string
    goal?: string
    durationWeeks?: number
    athleteLevel?: string
    sessionsPerWeek?: number
    equipment?: string[]
    injuries?: string
    coachPrompt: string
    athleteId?: string
    conversationHistory?: ConversationMessage[]
  }): Promise<AiPlanResult> {
    try {
      let athleteContext: string | undefined
      if (options.athleteId) {
        const summary = await athleteHistoryService.getAthleteSummary(options.athleteId)
        athleteContext = summary.contextText
      }

      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: {
          tier: 3,
          coachId: options.coachId,
          sport: options.sport,
          goal: options.goal,
          durationWeeks: options.durationWeeks,
          athleteLevel: options.athleteLevel,
          sessionsPerWeek: options.sessionsPerWeek,
          equipment: options.equipment,
          injuries: options.injuries,
          coachPrompt: options.coachPrompt,
          athleteContext,
          conversationHistory: options.conversationHistory || [],
        },
      })

      if (error) {
        console.error('Edge function error:', error)
        return {
          success: false,
          tier: 3,
          plan: null,
          rawText: null,
          error: error.message || 'AI service error',
        }
      }

      return {
        success: true,
        tier: 3,
        plan: data.plan,
        rawText: data.rawText,
        usage: data.usage,
      }
    } catch (e) {
      console.error('Error in Tier 3 plan generation:', e)
      return {
        success: false,
        tier: 3,
        plan: null,
        rawText: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      }
    }
  },

  // ============================================
  // Session Generation
  // ============================================

  async generateSession(options: {
    coachId: string
    blockType?: string
    blockFocusTags?: string[]
    weekNumber?: number
    isDeload?: boolean
    volumeModifier?: number
    intensityModifier?: number
    sessionType?: string
    sessionFocus?: string[]
    targetRpe?: number
    dayOfWeek?: number
    athleteLevel?: string
    injuries?: string
    equipment?: string[]
    coachPrompt: string
    athleteId?: string
    conversationHistory?: ConversationMessage[]
  }): Promise<AiSessionResult> {
    try {
      let athleteContext: string | undefined
      if (options.athleteId) {
        const summary = await athleteHistoryService.getAthleteSummary(options.athleteId)
        athleteContext = summary.contextText
      }

      const { data, error } = await supabase.functions.invoke('generate-session', {
        body: {
          coachId: options.coachId,
          blockType: options.blockType,
          blockFocusTags: options.blockFocusTags,
          weekNumber: options.weekNumber,
          isDeload: options.isDeload,
          volumeModifier: options.volumeModifier,
          intensityModifier: options.intensityModifier,
          sessionType: options.sessionType,
          sessionFocus: options.sessionFocus,
          targetRpe: options.targetRpe,
          dayOfWeek: options.dayOfWeek,
          athleteLevel: options.athleteLevel,
          injuries: options.injuries,
          equipment: options.equipment,
          coachPrompt: options.coachPrompt,
          athleteContext,
          conversationHistory: options.conversationHistory || [],
        },
      })

      if (error) {
        console.error('Edge function error:', error)
        return {
          success: false,
          session: null,
          rawText: null,
          error: error.message || 'AI service error',
        }
      }

      return {
        success: true,
        session: data.session,
        rawText: data.rawText,
        usage: data.usage,
      }
    } catch (e) {
      console.error('Error generating session:', e)
      return {
        success: false,
        session: null,
        rawText: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      }
    }
  },

  // ============================================
  // Log AI interaction
  // ============================================

  async logSuggestionAction(
    coachId: string,
    suggestion: AdaptiveSuggestion,
    action: 'accepted' | 'modified' | 'rejected',
    notes?: string
  ): Promise<void> {
    return adaptiveService.logSuggestion(coachId, suggestion, action, notes)
  },
}
