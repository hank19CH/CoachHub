<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/ui/PageHeader.vue'
import {
  getSeatInfo,
  createPortalSession,
  getTierDisplayName,
  getStatusBadge,
  PRICING,
  type SeatInfo,
} from '@/services/billing'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const seatInfo = ref<SeatInfo | null>(null)
const loading = ref(true)
const portalLoading = ref(false)

const sub = computed(() => authStore.coachSubscription)
const tierName = computed(() => getTierDisplayName(sub.value?.subscription_tier ?? 'free'))
const statusBadge = computed(() => getStatusBadge(sub.value?.subscription_status ?? 'inactive'))

const isTrialing = computed(() => sub.value?.subscription_status === 'trialing')
const isPastDue = computed(() => sub.value?.subscription_status === 'past_due')
const isFree = computed(() => sub.value?.subscription_tier === 'free' || !sub.value)

const trialDaysLeft = computed(() => {
  if (!isTrialing.value || !sub.value?.trial_ends_at) return 0
  const end = new Date(sub.value.trial_ends_at).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)))
})

const renewalDate = computed(() => {
  if (!sub.value?.subscription_ends_at) return null
  return new Date(sub.value.subscription_ends_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
})

const seatBarWidth = computed(() => {
  if (!seatInfo.value || seatInfo.value.isUnlimited) return '0%'
  const pct = Math.min(100, seatInfo.value.utilizationPercent)
  return `${pct}%`
})

const seatBarColor = computed(() => {
  if (!seatInfo.value) return 'bg-gray-300'
  const pct = seatInfo.value.utilizationPercent
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-yellow-500'
  return 'bg-emerald-500'
})

onMounted(async () => {
  // Refresh subscription if returning from checkout
  if (route.query.checkout === 'success') {
    await authStore.refreshSubscription()
  }

  if (authStore.user) {
    seatInfo.value = await getSeatInfo(authStore.user.id)
  }
  loading.value = false
})

async function openPortal() {
  portalLoading.value = true
  const result = await createPortalSession({
    returnUrl: `${window.location.origin}/coach/billing`,
  })
  if ('url' in result) {
    window.location.href = result.url
  } else {
    console.error('Portal error:', result.error)
  }
  portalLoading.value = false
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <PageHeader title="Billing" show-back back-to="/coach/hub" />

    <div v-if="loading" class="max-w-lg mx-auto px-4 py-12 text-center">
      <div class="animate-spin h-8 w-8 border-4 border-summit-500 border-t-transparent rounded-full mx-auto"></div>
    </div>

    <div v-else class="max-w-lg mx-auto px-4 py-6 space-y-4">
      <!-- Past Due Banner -->
      <div v-if="isPastDue" class="bg-red-50 border border-red-200 rounded-xl p-4">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p class="text-sm font-semibold text-red-800">Payment Failed</p>
            <p class="text-xs text-red-600 mt-0.5">Please update your payment method to avoid service interruption.</p>
          </div>
        </div>
        <button @click="openPortal" class="mt-3 w-full bg-red-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-red-700 transition-colors">
          Update Payment Method
        </button>
      </div>

      <!-- Trial Banner -->
      <div v-if="isTrialing" class="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p class="text-sm font-semibold text-blue-800">{{ trialDaysLeft }} days left in trial</p>
            <p class="text-xs text-blue-600 mt-0.5">Your trial ends on {{ renewalDate }}. Full access until then.</p>
          </div>
        </div>
      </div>

      <!-- Current Plan Card -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm text-gray-500">Current Plan</p>
            <p class="text-xl font-bold text-gray-900 mt-1">{{ tierName }}</p>
          </div>
          <span :class="statusBadge.color" class="px-2.5 py-1 rounded-full text-xs font-semibold">
            {{ statusBadge.label }}
          </span>
        </div>

        <div v-if="!isFree" class="mt-4 pt-4 border-t border-gray-100 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">Billing</span>
            <span class="text-gray-900 font-medium capitalize">{{ sub?.billing_interval ?? 'monthly' }}</span>
          </div>
          <div v-if="renewalDate" class="flex justify-between text-sm">
            <span class="text-gray-500">{{ isTrialing ? 'Trial ends' : 'Next renewal' }}</span>
            <span class="text-gray-900 font-medium">{{ renewalDate }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="mt-5 space-y-2">
          <button
            v-if="!isFree"
            @click="openPortal"
            :disabled="portalLoading"
            class="w-full bg-white border border-gray-300 text-gray-700 text-sm font-semibold py-2.5 rounded-lg hover:border-summit-400 hover:text-summit-600 transition-all"
          >
            {{ portalLoading ? 'Loading...' : 'Manage Subscription' }}
          </button>
          <button
            v-if="isFree || sub?.subscription_tier === 'coach'"
            @click="router.push('/pricing')"
            class="w-full bg-summit-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-summit-700 transition-colors"
          >
            {{ isFree ? 'Upgrade to Coach' : 'Upgrade to Team' }}
          </button>
        </div>
      </div>

      <!-- Seat Usage Card -->
      <div v-if="seatInfo" class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-semibold text-gray-900">Athlete Seats</p>
          <span class="text-sm text-gray-500">
            <template v-if="seatInfo.isUnlimited">Unlimited</template>
            <template v-else>
              {{ seatInfo.current }} / {{ seatInfo.effectiveLimit }}
              <span v-if="seatInfo.bonus > 0" class="text-xs text-summit-600">(+{{ seatInfo.bonus }} bonus)</span>
            </template>
          </span>
        </div>

        <!-- Progress Bar -->
        <div v-if="!seatInfo.isUnlimited" class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            :class="seatBarColor"
            :style="{ width: seatBarWidth }"
            class="h-full rounded-full transition-all duration-500"
          ></div>
        </div>
        <div v-else class="w-full bg-emerald-100 rounded-full h-3">
          <div class="bg-emerald-500 h-full rounded-full w-full opacity-30"></div>
        </div>

        <p v-if="!seatInfo.isUnlimited && seatInfo.utilizationPercent >= 80" class="text-xs text-yellow-600 mt-2">
          {{ seatInfo.effectiveLimit - seatInfo.current }} seats remaining.
          <button @click="router.push('/pricing')" class="underline text-summit-600 hover:text-summit-700">
            Upgrade for more
          </button>
        </p>
      </div>

      <!-- Quick Links -->
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <p class="text-sm font-semibold text-gray-900 mb-3">Quick Links</p>
        <div class="space-y-2">
          <button @click="router.push('/pricing')" class="w-full text-left text-sm text-summit-600 hover:text-summit-700 py-1">
            View all plans &rarr;
          </button>
          <button @click="router.push('/coach/athletes')" class="w-full text-left text-sm text-gray-600 hover:text-gray-800 py-1">
            Manage athletes &rarr;
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
