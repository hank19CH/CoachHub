<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { UpgradePromptType } from '@/types/database'

const props = defineProps<{
  promptType: UpgradePromptType
  currentCount: number
  limit: number
}>()

const emit = defineEmits<{
  close: []
  action: [action: 'upgrade' | 'dismiss' | 'manage' | 'claim_bonus']
}>()

const router = useRouter()
const claiming = ref(false)

const config: Record<UpgradePromptType, {
  title: string
  description: string
  icon: 'rocket' | 'gift' | 'lock' | 'bell'
  iconBg: string
  primaryLabel: string
  primaryAction: 'upgrade' | 'claim_bonus'
  secondaryLabel?: string
  secondaryAction?: 'dismiss' | 'manage'
  canDismiss: boolean
}> = {
  soft_nudge: {
    title: 'Growing Your Roster!',
    description: `You have ${props.currentCount} of ${props.limit} athlete seats filled. Upgrade to Team for unlimited athletes.`,
    icon: 'rocket',
    iconBg: 'bg-blue-100 text-blue-600',
    primaryLabel: 'View Plans',
    primaryAction: 'upgrade',
    secondaryLabel: 'Not now',
    secondaryAction: 'dismiss',
    canDismiss: true,
  },
  bonus_delight: {
    title: 'Bonus! 3 Extra Seats',
    description: `Congrats on reaching ${props.limit} athletes! As a thank you, we've added 3 bonus seats to your plan. Enjoy!`,
    icon: 'gift',
    iconBg: 'bg-emerald-100 text-emerald-600',
    primaryLabel: 'Claim Bonus',
    primaryAction: 'claim_bonus',
    secondaryLabel: 'Awesome, thanks!',
    secondaryAction: 'dismiss',
    canDismiss: true,
  },
  hard_gate: {
    title: 'Roster Full',
    description: `You've reached your maximum of ${props.limit + 3} athletes. Upgrade to Team for unlimited athletes, or remove athletes to make room.`,
    icon: 'lock',
    iconBg: 'bg-red-100 text-red-600',
    primaryLabel: 'Upgrade to Team',
    primaryAction: 'upgrade',
    secondaryLabel: 'Manage Athletes',
    secondaryAction: 'manage',
    canDismiss: false,
  },
  followup: {
    title: 'Ready to Grow?',
    description: `You're using ${props.currentCount} of ${props.limit + 3} seats. Upgrade to Team for unlimited athletes and advanced features.`,
    icon: 'bell',
    iconBg: 'bg-purple-100 text-purple-600',
    primaryLabel: 'See Plans',
    primaryAction: 'upgrade',
    secondaryLabel: 'Not now',
    secondaryAction: 'dismiss',
    canDismiss: true,
  },
}

const c = config[props.promptType]

function handlePrimary() {
  if (c.primaryAction === 'upgrade') {
    router.push('/pricing')
    emit('action', 'upgrade')
  } else if (c.primaryAction === 'claim_bonus') {
    claiming.value = true
    emit('action', 'claim_bonus')
  }
}

function handleSecondary() {
  if (c.secondaryAction === 'manage') {
    emit('action', 'manage')
  } else {
    emit('action', 'dismiss')
  }
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl max-w-sm w-full p-6 animate-scale-in">
      <!-- Icon -->
      <div class="flex justify-center mb-4">
        <div :class="c.iconBg" class="w-16 h-16 rounded-full flex items-center justify-center">
          <!-- Rocket -->
          <svg v-if="c.icon === 'rocket'" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <!-- Gift -->
          <svg v-else-if="c.icon === 'gift'" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
          <!-- Lock -->
          <svg v-else-if="c.icon === 'lock'" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <!-- Bell -->
          <svg v-else class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
      </div>

      <!-- Title & Description -->
      <h3 class="text-xl font-bold text-gray-900 text-center mb-2">{{ c.title }}</h3>
      <p class="text-sm text-gray-600 text-center mb-6">{{ c.description }}</p>

      <!-- Actions -->
      <div class="space-y-2">
        <button
          @click="handlePrimary"
          :disabled="claiming"
          class="w-full bg-summit-600 text-white font-semibold py-3 rounded-xl hover:bg-summit-700 transition-colors disabled:opacity-50"
        >
          {{ claiming ? 'Claiming...' : c.primaryLabel }}
        </button>

        <button
          v-if="c.secondaryLabel"
          @click="handleSecondary"
          class="w-full text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
        >
          {{ c.secondaryLabel }}
        </button>
      </div>

      <!-- Close X for dismissible modals -->
      <button
        v-if="c.canDismiss"
        @click="emit('close')"
        class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
