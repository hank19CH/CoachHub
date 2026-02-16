import { supabase } from '@/lib/supabase'
import { athleteHistoryService } from './athleteHistory'
import { adaptiveService, type AdaptiveSuggestion } from './adaptive'
import { getCoachMethodologyMatches } from './methodologyDetection'
import { getFingerprint } from '@/data/methodologyFingerprints'

// ============================================
// AI Periodization Service — Frontend caller
// Connects Tier 1 (adaptive rules), Tier 2 (modifications), Tier 3 (generation)
// Now injects methodology guardrails for style-consistent AI output
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
      const [athleteContext, methodologyContext] = await Promise.all([
        options.athleteId
          ? athleteHistoryService.getAthleteSummary(options.athleteId).then(s => s.contextText)
          : Promise.resolve(undefined),
        this.getMethodologyContext(options.coachId),
      ])

      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: {
          tier: 2,
          planId: options.planId,
          coachId: options.coachId,
          existingPlan: options.existingPlan,
          modificationRequest: options.modificationRequest,
          coachPrompt: options.coachPrompt || options.modificationRequest,
          athleteContext,
          methodologyContext,
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
      const [athleteContext, methodologyContext] = await Promise.all([
        options.athleteId
          ? athleteHistoryService.getAthleteSummary(options.athleteId).then(s => s.contextText)
          : Promise.resolve(undefined),
        this.getMethodologyContext(options.coachId),
      ])

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
          methodologyContext,
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
      const [athleteContext, methodologyContext] = await Promise.all([
        options.athleteId
          ? athleteHistoryService.getAthleteSummary(options.athleteId).then(s => s.contextText)
          : Promise.resolve(undefined),
        this.getMethodologyContext(options.coachId),
      ])

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
          methodologyContext,
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
  // Methodology Context Builder
  // ============================================

  /**
   * Build compact methodology context for AI prompts.
   * Returns a short string with guardrails (MUST/MUST NOT) instead of full philosophy essay.
   * ~100-200 tokens vs ~500+ tokens for full analysis text.
   */
  async getMethodologyContext(coachId: string): Promise<string | undefined> {
    try {
      const matches = await getCoachMethodologyMatches(coachId)
      if (!matches || matches.length === 0) return undefined

      // Get the confirmed or highest-confidence match
      const confirmed = matches.find(m => m.status === 'confirmed')
      const topMatch = confirmed || matches[0]

      if (!topMatch || topMatch.confidence < 40) return undefined

      // Get the fingerprint data for guardrails
      const fingerprint = getFingerprint(topMatch.methodology_id)
      if (!fingerprint) return undefined

      const confidence = topMatch.status === 'confirmed' ? 'confirmed' : `${topMatch.confidence}% detected`
      const lines: string[] = [
        `**Coach Methodology:** ${fingerprint.name} (${confidence})`,
      ]

      if (fingerprint.ai_guardrails.must.length > 0) {
        lines.push(`**MUST:** ${fingerprint.ai_guardrails.must.join('; ')}`)
      }
      if (fingerprint.ai_guardrails.must_not.length > 0) {
        lines.push(`**MUST NOT:** ${fingerprint.ai_guardrails.must_not.join('; ')}`)
      }

      // Add secondary methodologies if blended
      const secondaryMatches = matches.filter(m =>
        m.methodology_id !== topMatch.methodology_id &&
        m.confidence > 30
      )
      if (secondaryMatches.length > 0) {
        const secondaryNames = secondaryMatches
          .map(m => {
            const fp = getFingerprint(m.methodology_id)
            return fp ? `${fp.shortName} (${m.confidence}%)` : null
          })
          .filter(Boolean)
        if (secondaryNames.length > 0) {
          lines.push(`**Secondary influences:** ${secondaryNames.join(', ')}`)
        }
      }

      lines.push('Flag any suggestions that conflict with these methodology constraints.')

      return lines.join('\n')
    } catch (e) {
      console.error('Error building methodology context:', e)
      return undefined
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
