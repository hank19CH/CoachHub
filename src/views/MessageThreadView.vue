<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getConversationMessages,
  getConversationById,
  sendMessage,
  markMessagesAsRead,
  subscribeToConversation,
  uploadMessageAttachment
} from '@/services/messages'
import type { Message, Conversation } from '@/services/messages'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { format, isToday, isYesterday } from 'date-fns'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const messages = ref<Message[]>([])
const newMessage = ref('')
const loading = ref(true)
const sending = ref(false)
const conversation = ref<Conversation | null>(null)
const messagesContainer = ref<HTMLDivElement>()
const fileInput = ref<HTMLInputElement>()
const uploadingFile = ref(false)
const textareaRef = ref<HTMLTextAreaElement>()

let channel: RealtimeChannel | null = null

const conversationId = computed(() => route.params.id as string)

const otherParticipant = computed(() => {
  if (!conversation.value || !authStore.user) return null

  return conversation.value.participant_1_id === authStore.user.id
    ? conversation.value.participant_2
    : conversation.value.participant_1
})

onMounted(async () => {
  if (!authStore.user) return

  try {
    // Load conversation details
    conversation.value = await getConversationById(conversationId.value)

    // Load messages
    messages.value = await getConversationMessages(conversationId.value)

    // Mark as read
    await markMessagesAsRead(conversationId.value, authStore.user.id)

    // Scroll to bottom
    await nextTick()
    scrollToBottom()

    // Subscribe to new messages
    channel = subscribeToConversation(conversationId.value, (message) => {
      // Avoid duplicates (we might receive our own message back)
      if (!messages.value.find(m => m.id === message.id)) {
        messages.value.push(message)
      }

      // Mark as read if from other person
      if (message.sender_id !== authStore.user?.id) {
        markMessagesAsRead(conversationId.value, authStore.user!.id)
      }

      nextTick(() => scrollToBottom())
    })

  } catch (error) {
    console.error('Error loading messages:', error)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (channel) {
    channel.unsubscribe()
  }
})

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function handleSend() {
  if (!newMessage.value.trim() || !authStore.user || sending.value) return

  sending.value = true
  const content = newMessage.value.trim()
  newMessage.value = ''

  // Reset textarea height
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }

  try {
    const sent = await sendMessage(
      conversationId.value,
      authStore.user.id,
      content
    )

    // Add locally immediately (realtime will also deliver it, but we deduplicate)
    if (!messages.value.find(m => m.id === sent.id)) {
      messages.value.push(sent)
    }

    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('Error sending message:', error)
    // Restore the message on failure
    newMessage.value = content
  } finally {
    sending.value = false
  }
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file || !authStore.user) return

  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime']
  if (!validTypes.includes(file.type)) {
    alert('Please upload an image (JPG, PNG, GIF, WEBP) or video (MP4, MOV)')
    return
  }

  if (file.size > 10 * 1024 * 1024) {
    alert('File must be less than 10MB')
    return
  }

  uploadingFile.value = true

  try {
    const url = await uploadMessageAttachment(file, conversationId.value)
    const type = file.type.startsWith('image/') ? 'image' as const : 'video' as const

    const sent = await sendMessage(
      conversationId.value,
      authStore.user.id,
      type === 'image' ? 'Photo' : 'Video',
      url,
      type
    )

    if (!messages.value.find(m => m.id === sent.id)) {
      messages.value.push(sent)
    }

    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('Error uploading file:', error)
    alert('Failed to upload file')
  } finally {
    uploadingFile.value = false
    if (target) target.value = ''
  }
}

function formatMessageDate(timestamp: string) {
  const date = new Date(timestamp)

  if (isToday(date)) {
    return format(date, 'h:mm a')
  } else if (isYesterday(date)) {
    return 'Yesterday ' + format(date, 'h:mm a')
  } else {
    return format(date, 'MMM d, h:mm a')
  }
}

function shouldShowDateDivider(currentMsg: Message, previousMsg: Message | undefined) {
  if (!previousMsg) return true

  const current = new Date(currentMsg.created_at)
  const previous = new Date(previousMsg.created_at)

  return current.toDateString() !== previous.toDateString()
}

function autoResize(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
}
</script>

<template>
  <div class="h-screen flex flex-col bg-feed-bg">
    <!-- Header -->
    <div class="bg-white border-b border-feed-border px-4 py-3 flex items-center gap-3 fixed top-0 left-0 right-0 z-50">
      <button
        @click="router.push('/messages')"
        class="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div class="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
        <img
          v-if="otherParticipant?.avatar_url"
          :src="otherParticipant.avatar_url"
          :alt="otherParticipant.display_name"
          class="w-full h-full object-cover"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
          {{ otherParticipant?.display_name?.charAt(0)?.toUpperCase() || '?' }}
        </div>
      </div>

      <div class="flex-1 min-w-0">
        <h1 v-if="otherParticipant" class="font-semibold text-gray-900 text-sm truncate">
          {{ otherParticipant.display_name }}
        </h1>
        <p v-if="otherParticipant" class="text-xs text-gray-500">
          {{ otherParticipant.user_type === 'coach' ? 'Coach' : 'Athlete' }}
        </p>
      </div>
    </div>

    <!-- Messages Container -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-4 py-4 space-y-2 pt-20"
    >
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center h-full">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-summit-600"></div>
      </div>

      <!-- Empty conversation -->
      <div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-center px-8">
        <div class="w-16 h-16 rounded-full bg-summit-100 flex items-center justify-center mb-3">
          <svg class="w-8 h-8 text-summit-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p class="text-sm text-gray-500">
          Send a message to start the conversation
        </p>
      </div>

      <!-- Messages -->
      <template v-else>
        <template v-for="(message, index) in messages" :key="message.id">
          <!-- Date Divider -->
          <div
            v-if="shouldShowDateDivider(message, messages[index - 1])"
            class="flex justify-center my-3"
          >
            <span class="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
              {{ format(new Date(message.created_at), 'MMMM d, yyyy') }}
            </span>
          </div>

          <!-- Message Bubble -->
          <div
            :class="[
              'flex',
              message.sender_id === authStore.user?.id ? 'justify-end' : 'justify-start'
            ]"
          >
            <div
              :class="[
                'max-w-[75%] rounded-2xl px-3.5 py-2',
                message.sender_id === authStore.user?.id
                  ? 'bg-summit-600 text-white rounded-br-md'
                  : 'bg-white border border-feed-border text-gray-900 rounded-bl-md'
              ]"
            >
              <!-- Attachment -->
              <div v-if="message.attachment_url" class="mb-1.5">
                <img
                  v-if="message.attachment_type === 'image'"
                  :src="message.attachment_url"
                  alt="Attachment"
                  class="rounded-lg max-w-full cursor-pointer"
                  loading="lazy"
                />
                <video
                  v-else-if="message.attachment_type === 'video'"
                  :src="message.attachment_url"
                  controls
                  class="rounded-lg max-w-full"
                ></video>
              </div>

              <!-- Content -->
              <p class="text-sm whitespace-pre-wrap break-words">
                {{ message.content }}
              </p>

              <!-- Timestamp -->
              <p
                :class="[
                  'text-[10px] mt-0.5',
                  message.sender_id === authStore.user?.id
                    ? 'text-summit-200'
                    : 'text-gray-400'
                ]"
              >
                {{ formatMessageDate(message.created_at) }}
              </p>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- Input Area -->
    <div class="bg-white border-t border-feed-border p-3 safe-bottom">
      <div class="max-w-lg mx-auto flex items-end gap-2">
        <!-- File Upload Button -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*,video/mp4,video/quicktime"
          class="hidden"
          @change="handleFileSelect"
        />
        <button
          @click="fileInput?.click()"
          :disabled="uploadingFile"
          class="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <svg v-if="!uploadingFile" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <div v-else class="animate-spin rounded-full h-5 w-5 border-b-2 border-summit-600"></div>
        </button>

        <!-- Text Input -->
        <textarea
          ref="textareaRef"
          v-model="newMessage"
          @keydown.enter.exact.prevent="handleSend"
          @input="autoResize"
          placeholder="Type a message..."
          rows="1"
          class="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-summit-500 focus:border-summit-500 max-h-[120px]"
        ></textarea>

        <!-- Send Button -->
        <button
          @click="handleSend"
          :disabled="!newMessage.trim() || sending"
          class="p-2 bg-summit-600 text-white rounded-full hover:bg-summit-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
