import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface Conversation {
  id: string
  participant_1_id: string
  participant_2_id: string
  last_message_at: string | null
  created_at: string
  participant_1?: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    user_type: string
  }
  participant_2?: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    user_type: string
  }
  last_message?: Message | null
  unread_count?: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  attachment_url: string | null
  attachment_type: string | null
  is_read: boolean
  created_at: string
  updated_at: string
  sender?: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
}

function normalizeParticipant(p: any) {
  return Array.isArray(p) ? p[0] ?? null : p ?? null
}

/**
 * Get or create a conversation between two users
 */
export async function getOrCreateConversation(
  userId: string,
  otherUserId: string
): Promise<Conversation> {
  // Try to find existing conversation
  const { data: existing, error: findError } = await (supabase as any)
    .from('conversations')
    .select(`
      *,
      participant_1:profiles!participant_1_id(id, username, display_name, avatar_url, user_type),
      participant_2:profiles!participant_2_id(id, username, display_name, avatar_url, user_type)
    `)
    .or(`and(participant_1_id.eq.${userId},participant_2_id.eq.${otherUserId}),and(participant_1_id.eq.${otherUserId},participant_2_id.eq.${userId})`)
    .single()

  if (existing && !findError) {
    return {
      ...existing,
      participant_1: normalizeParticipant(existing.participant_1),
      participant_2: normalizeParticipant(existing.participant_2),
    } as Conversation
  }

  // Create new conversation
  const { data: newConversation, error: createError } = await (supabase as any)
    .from('conversations')
    .insert({
      participant_1_id: userId,
      participant_2_id: otherUserId
    })
    .select(`
      *,
      participant_1:profiles!participant_1_id(id, username, display_name, avatar_url, user_type),
      participant_2:profiles!participant_2_id(id, username, display_name, avatar_url, user_type)
    `)
    .single()

  if (createError) throw new Error(createError.message)
  return {
    ...newConversation,
    participant_1: normalizeParticipant(newConversation.participant_1),
    participant_2: normalizeParticipant(newConversation.participant_2),
  } as Conversation
}

/**
 * Get all conversations for current user with last message and unread count
 */
export async function getUserConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await (supabase as any)
    .from('conversations')
    .select(`
      *,
      participant_1:profiles!participant_1_id(id, username, display_name, avatar_url, user_type),
      participant_2:profiles!participant_2_id(id, username, display_name, avatar_url, user_type)
    `)
    .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) throw new Error(error.message)

  const conversationsWithDetails = await Promise.all(
    (data || []).map(async (conv: any) => {
      // Get last message
      const { data: lastMsg } = await (supabase as any)
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Get unread count
      const otherUserId = conv.participant_1_id === userId
        ? conv.participant_2_id
        : conv.participant_1_id

      const { count } = await (supabase as any)
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('sender_id', otherUserId)
        .eq('is_read', false)

      return {
        ...conv,
        participant_1: normalizeParticipant(conv.participant_1),
        participant_2: normalizeParticipant(conv.participant_2),
        last_message: lastMsg || null,
        unread_count: count || 0
      } as Conversation
    })
  )

  return conversationsWithDetails
}

/**
 * Get messages for a conversation
 */
export async function getConversationMessages(
  conversationId: string,
  limit = 50
): Promise<Message[]> {
  const { data, error } = await (supabase as any)
    .from('messages')
    .select(`
      *,
      sender:profiles!sender_id(id, username, display_name, avatar_url)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data || []).map((msg: any) => ({
    ...msg,
    sender: normalizeParticipant(msg.sender)
  })).reverse() as Message[]
}

/**
 * Get conversation by ID with participant details
 */
export async function getConversationById(conversationId: string): Promise<Conversation | null> {
  const { data, error } = await (supabase as any)
    .from('conversations')
    .select(`
      *,
      participant_1:profiles!participant_1_id(id, username, display_name, avatar_url, user_type),
      participant_2:profiles!participant_2_id(id, username, display_name, avatar_url, user_type)
    `)
    .eq('id', conversationId)
    .single()

  if (error || !data) return null
  return {
    ...data,
    participant_1: normalizeParticipant(data.participant_1),
    participant_2: normalizeParticipant(data.participant_2),
  } as Conversation
}

/**
 * Send a message
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  attachmentUrl?: string,
  attachmentType?: 'image' | 'video'
): Promise<Message> {
  const { data, error } = await (supabase as any)
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      attachment_url: attachmentUrl || null,
      attachment_type: attachmentType || null
    })
    .select(`
      *,
      sender:profiles!sender_id(id, username, display_name, avatar_url)
    `)
    .single()

  if (error) throw new Error(error.message)

  const normalizedMessage = {
    ...data,
    sender: normalizeParticipant(data.sender)
  } as Message

  // Create notification for recipient
  const { data: conversation } = await (supabase as any)
    .from('conversations')
    .select('participant_1_id, participant_2_id')
    .eq('id', conversationId)
    .single()

  if (conversation) {
    const recipientId = conversation.participant_1_id === senderId
      ? conversation.participant_2_id
      : conversation.participant_1_id

    const senderName = normalizedMessage.sender?.display_name || 'Someone'
    const preview = content.length > 50 ? content.slice(0, 50) + '...' : content

    await (supabase as any).from('notifications').insert({
      user_id: recipientId,
      actor_id: senderId,
      type: 'message',
      title: 'New message',
      message: `${senderName}: ${preview}`,
      action_url: `/messages/${conversationId}`,
      created_at: new Date().toISOString()
    })
  }

  return normalizedMessage
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false)

  if (error) throw new Error(error.message)
}

/**
 * Upload message attachment to Supabase Storage
 */
export async function uploadMessageAttachment(
  file: File,
  conversationId: string
): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${conversationId}/${Date.now()}.${fileExt}`

  const { data, error } = await supabase.storage
    .from('message-attachments')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) throw new Error(error.message)

  const { data: { publicUrl } } = supabase.storage
    .from('message-attachments')
    .getPublicUrl(data.path)

  return publicUrl
}

/**
 * Subscribe to new messages in a conversation
 */
export function subscribeToConversation(
  conversationId: string,
  onMessage: (message: Message) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      async (payload) => {
        // Fetch full message with sender details
        const { data } = await (supabase as any)
          .from('messages')
          .select(`
            *,
            sender:profiles!sender_id(id, username, display_name, avatar_url)
          `)
          .eq('id', (payload.new as any).id)
          .single()

        if (data) {
          onMessage({
            ...data,
            sender: normalizeParticipant(data.sender)
          } as Message)
        }
      }
    )
    .subscribe()

  return channel
}

/**
 * Get total unread message count for user
 */
export async function getTotalUnreadCount(userId: string): Promise<number> {
  const { data: conversations } = await (supabase as any)
    .from('conversations')
    .select('id, participant_1_id, participant_2_id')
    .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`)

  if (!conversations || conversations.length === 0) return 0

  let totalUnread = 0

  for (const conv of conversations) {
    const otherUserId = conv.participant_1_id === userId
      ? conv.participant_2_id
      : conv.participant_1_id

    const { count } = await (supabase as any)
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('sender_id', otherUserId)
      .eq('is_read', false)

    totalUnread += count || 0
  }

  return totalUnread
}
