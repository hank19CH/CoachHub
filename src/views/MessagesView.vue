<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/ui/PageHeader.vue'
import { supabase } from '@/lib/supabase'
import { getUserConversations, getTotalUnreadCount, getOrCreateConversation } from '@/services/messages'
import type { Conversation } from '@/services/messages'
import type { Profile } from '@/types/database'
import { formatDistanceToNow } from 'date-fns'

const router = useRouter()
const authStore = useAuthStore()

const conversations = ref<Conversation[]>([])
const loading = ref(true)
const totalUnread = ref(0)

// New conversation modal state
const showNewModal = ref(false)
const searchQuery = ref('')
const searchResults = ref<Profile[]>([])
const searching = ref(false)
const startingConversation = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  if (!authStore.user) return

  try {
    conversations.value = await getUserConversations(authStore.user.id)
    totalUnread.value = await getTotalUnreadCount(authStore.user.id)
  } catch (error) {
    console.error('Error loading conversations:', error)
  } finally {
    loading.value = false
  }
})

function getOtherParticipant(conversation: Conversation) {
  if (!authStore.user) return null

  return conversation.participant_1_id === authStore.user.id
    ? conversation.participant_2
    : conversation.participant_1
}

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) return ''
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
}

function openConversation(conversation: Conversation) {
  router.push(`/messages/${conversation.id}`)
}

// Search users with debounce
watch(searchQuery, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout)

  const trimmed = val.trim()
  if (trimmed.length < 2) {
    searchResults.value = []
    return
  }

  searching.value = true
  searchTimeout = setTimeout(() => searchUsers(trimmed), 300)
})

async function searchUsers(query: string) {
  if (!authStore.user) return

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, user_type')
      .neq('id', authStore.user.id)
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .order('display_name')
      .limit(15) as { data: Profile[] | null; error: any }

    if (error) throw error
    searchResults.value = data || []
  } catch (error) {
    console.error('Error searching users:', error)
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

async function startConversation(userId: string) {
  if (!authStore.user || startingConversation.value) return

  startingConversation.value = true
  try {
    const conversation = await getOrCreateConversation(authStore.user.id, userId)
    showNewModal.value = false
    searchQuery.value = ''
    searchResults.value = []
    router.push(`/messages/${conversation.id}`)
  } catch (error) {
    console.error('Error starting conversation:', error)
  } finally {
    startingConversation.value = false
  }
}

function openNewModal() {
  showNewModal.value = true
  searchQuery.value = ''
  searchResults.value = []
}

function getUserInitial(name: string | undefined) {
  return name?.charAt(0)?.toUpperCase() || '?'
}
</script>

<template>
  <div class="min-h-screen bg-feed-bg">
    <PageHeader title="Messages" sticky-offset="top-14">
      <template #actions>
        <button
          @click="openNewModal"
          class="w-9 h-9 rounded-full gradient-summit flex items-center justify-center text-white shadow-sm hover:shadow-md transition-shadow"
          title="New message"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </template>
      <template #sub-header>
        <p v-if="totalUnread > 0" class="text-sm text-summit-600 mt-1">
          {{ totalUnread }} unread message{{ totalUnread === 1 ? '' : 's' }}
        </p>
      </template>
    </PageHeader>

    <!-- Loading State -->
    <div v-if="loading" class="max-w-lg mx-auto px-4 py-8">
      <div class="animate-pulse space-y-3">
        <div v-for="i in 4" :key="i" class="bg-white rounded-xl p-4 h-20 border border-feed-border"></div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="conversations.length === 0" class="max-w-lg mx-auto px-4 py-16 text-center">
      <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <h2 class="text-lg font-semibold text-gray-900 mb-1">No messages yet</h2>
      <p class="text-sm text-gray-500 mb-4">Start a conversation with someone</p>
      <button
        @click="openNewModal"
        class="btn-primary inline-flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New Message
      </button>
    </div>

    <!-- Conversation List -->
    <div v-else class="max-w-lg mx-auto px-4 py-3 space-y-2">
      <button
        v-for="conversation in conversations"
        :key="conversation.id"
        @click="openConversation(conversation)"
        class="w-full bg-white rounded-xl p-4 hover:bg-gray-50 transition-colors text-left border border-feed-border"
      >
        <div class="flex items-start gap-3">
          <!-- Avatar -->
          <div class="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
            <img
              v-if="getOtherParticipant(conversation)?.avatar_url"
              :src="getOtherParticipant(conversation)!.avatar_url!"
              :alt="getOtherParticipant(conversation)?.display_name"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-gray-500 font-bold text-lg">
              {{ getUserInitial(getOtherParticipant(conversation)?.display_name) }}
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2 mb-0.5">
              <h3 class="font-semibold text-gray-900 truncate">
                {{ getOtherParticipant(conversation)?.display_name }}
              </h3>
              <span v-if="conversation.last_message_at" class="text-xs text-gray-400 flex-shrink-0">
                {{ formatTimestamp(conversation.last_message_at) }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <p v-if="conversation.last_message" class="text-sm text-gray-500 truncate flex-1">
                <span v-if="conversation.last_message.sender_id === authStore.user?.id" class="text-gray-400">You: </span>
                {{ conversation.last_message.content }}
              </p>
              <p v-else class="text-sm text-gray-400 italic flex-1">
                No messages yet
              </p>

              <!-- Unread badge -->
              <span
                v-if="(conversation.unread_count || 0) > 0"
                class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-summit-600 rounded-full flex-shrink-0"
              >
                {{ conversation.unread_count }}
              </span>
            </div>
          </div>
        </div>
      </button>
    </div>

    <!-- New Message Modal -->
    <Teleport to="body">
      <div
        v-if="showNewModal"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40"
          @click="showNewModal = false"
        ></div>

        <!-- Modal -->
        <div class="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col shadow-xl">
          <!-- Modal Header -->
          <div class="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-bold text-gray-900">New Message</h2>
              <button
                @click="showNewModal = false"
                class="p-1.5 -mr-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg class="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Search Input -->
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search by name or username..."
                class="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-summit-500 focus:bg-white transition-colors"
                autofocus
              />
              <div v-if="searching" class="absolute right-3 top-1/2 -translate-y-1/2">
                <div class="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-summit-600"></div>
              </div>
            </div>
          </div>

          <!-- Results -->
          <div class="overflow-y-auto flex-1 py-1">
            <!-- Prompt -->
            <div v-if="searchQuery.length < 2 && searchResults.length === 0" class="px-4 py-8 text-center">
              <svg class="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p class="text-sm text-gray-400">Type a name or username to find someone</p>
            </div>

            <!-- No results -->
            <div v-else-if="searchQuery.length >= 2 && !searching && searchResults.length === 0" class="px-4 py-8 text-center">
              <p class="text-sm text-gray-500">No users found for "{{ searchQuery }}"</p>
            </div>

            <!-- User results -->
            <button
              v-for="user in searchResults"
              :key="user.id"
              @click="startConversation(user.id)"
              :disabled="startingConversation"
              class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
            >
              <div class="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                <img
                  v-if="user.avatar_url"
                  :src="user.avatar_url"
                  :alt="user.display_name"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
                  {{ getUserInitial(user.display_name) }}
                </div>
              </div>

              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm text-gray-900 truncate">
                  {{ user.display_name }}
                </p>
                <p class="text-xs text-gray-500 truncate">
                  @{{ user.username }}
                  <span class="ml-1 text-gray-400">&middot;</span>
                  <span class="ml-1 capitalize">{{ user.user_type }}</span>
                </p>
              </div>

              <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
