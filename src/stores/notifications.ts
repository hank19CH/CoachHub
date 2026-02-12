import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface Notification {
  id: string
  user_id: string
  actor_id: string | null
  type: string
  entity_type: string | null
  entity_id: string | null
  title: string
  message: string | null
  action_url: string | null
  is_read: boolean
  created_at: string
  actor?: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  } | null
}

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let realtimeChannel: RealtimeChannel | null = null

  // Computed
  const unreadCount = computed(() =>
    notifications.value.filter(n => !n.is_read).length
  )

  const unreadNotifications = computed(() =>
    notifications.value.filter(n => !n.is_read)
  )

  // Actions
  async function fetchNotifications() {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await (supabase
        .from('notifications') as any)
        .select(`
          *,
          actor:profiles!actor_id (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (fetchError) throw fetchError

      notifications.value = (data || []).map((n: any) => ({
        ...n,
        actor: Array.isArray(n.actor) ? n.actor[0] ?? null : n.actor ?? null
      }))
    } catch (e) {
      console.error('Error fetching notifications:', e)
      error.value = e instanceof Error ? e.message : 'Failed to fetch notifications'
    } finally {
      loading.value = false
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      const { error: updateError } = await (supabase
        .from('notifications') as any)
        .update({ is_read: true })
        .eq('id', notificationId)

      if (updateError) throw updateError

      const notification = notifications.value.find(n => n.id === notificationId)
      if (notification) {
        notification.is_read = true
      }
    } catch (e) {
      console.error('Error marking notification as read:', e)
    }
  }

  async function markAllAsRead() {
    try {
      const unreadIds = unreadNotifications.value.map(n => n.id)
      if (unreadIds.length === 0) return

      const { error: updateError } = await (supabase
        .from('notifications') as any)
        .update({ is_read: true })
        .in('id', unreadIds)

      if (updateError) throw updateError

      notifications.value.forEach(n => {
        n.is_read = true
      })
    } catch (e) {
      console.error('Error marking all as read:', e)
    }
  }

  async function deleteNotification(notificationId: string) {
    try {
      const { error: deleteError } = await (supabase
        .from('notifications') as any)
        .delete()
        .eq('id', notificationId)

      if (deleteError) throw deleteError

      notifications.value = notifications.value.filter(n => n.id !== notificationId)
    } catch (e) {
      console.error('Error deleting notification:', e)
    }
  }

  function subscribeToNotifications(userId: string) {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
    }

    realtimeChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        async (payload: any) => {
          // Fetch the complete notification with actor details
          const { data } = await (supabase
            .from('notifications') as any)
            .select(`
              *,
              actor:profiles!actor_id (
                id,
                username,
                display_name,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .single()

          if (data) {
            const normalized = {
              ...data,
              actor: Array.isArray(data.actor) ? data.actor[0] ?? null : data.actor ?? null
            }
            notifications.value.unshift(normalized)
          }
        }
      )
      .subscribe()
  }

  function unsubscribeFromNotifications() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  function $reset() {
    notifications.value = []
    loading.value = false
    error.value = null
    unsubscribeFromNotifications()
  }

  return {
    notifications,
    loading,
    error,
    unreadCount,
    unreadNotifications,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    subscribeToNotifications,
    unsubscribeFromNotifications,
    $reset
  }
})
