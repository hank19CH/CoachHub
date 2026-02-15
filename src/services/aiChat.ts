import { supabase } from '@/lib/supabase'
import type { AiChatSession, AiChatMessage } from '@/types/database'

// ============================================
// AI Chat Persistence Service
// One active conversation per plan per coach
// ============================================

export const aiChatService = {
  /**
   * Get or create a chat session for a plan.
   * Returns the most recent session, or creates a new one.
   */
  async getOrCreateSession(planId: string, coachId: string): Promise<AiChatSession> {
    // Try to get existing session
    const { data: existing, error: selectError } = await (supabase
      .from('ai_chat_sessions') as any)
      .select('*')
      .eq('plan_id', planId)
      .eq('coach_id', coachId)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (selectError) {
      console.error('Error fetching chat session:', selectError)
      throw new Error(selectError.message)
    }

    if (existing && existing.length > 0) {
      return existing[0]
    }

    // Create new session
    const { data, error } = await (supabase
      .from('ai_chat_sessions') as any)
      .insert({
        plan_id: planId,
        coach_id: coachId,
        title: null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating chat session:', error)
      throw new Error(error.message)
    }

    return data
  },

  /**
   * Load all messages for a session, ordered chronologically.
   */
  async getMessages(sessionId: string): Promise<AiChatMessage[]> {
    const { data, error } = await (supabase
      .from('ai_chat_messages') as any)
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading chat messages:', error)
      throw new Error(error.message)
    }

    return data || []
  },

  /**
   * Save a message to the database.
   * Also touches session updated_at.
   */
  async saveMessage(params: {
    sessionId: string
    role: 'user' | 'assistant'
    content: string
    planData?: any
    sessionData?: any
    tokensUsed?: number
  }): Promise<AiChatMessage> {
    const { data, error } = await (supabase
      .from('ai_chat_messages') as any)
      .insert({
        session_id: params.sessionId,
        role: params.role,
        content: params.content,
        plan_data: params.planData || null,
        session_data: params.sessionData || null,
        tokens_used: params.tokensUsed || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving chat message:', error)
      throw new Error(error.message)
    }

    // Touch session updated_at
    await (supabase
      .from('ai_chat_sessions') as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.sessionId)

    return data
  },

  /**
   * Clear all messages from a session (keeps the session row).
   */
  async clearSession(sessionId: string): Promise<void> {
    const { error } = await (supabase
      .from('ai_chat_messages') as any)
      .delete()
      .eq('session_id', sessionId)

    if (error) {
      console.error('Error clearing chat session:', error)
      throw new Error(error.message)
    }

    // Reset title
    await (supabase
      .from('ai_chat_sessions') as any)
      .update({ title: null, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
  },

  /**
   * Auto-set session title from first user message.
   */
  async updateTitle(sessionId: string, firstMessage: string): Promise<void> {
    const title = firstMessage.length > 60
      ? firstMessage.slice(0, 57) + '...'
      : firstMessage

    await (supabase
      .from('ai_chat_sessions') as any)
      .update({ title })
      .eq('id', sessionId)
  },
}
