<script setup lang="ts">
/** Buyer's purchases (Sprint 15): what they bought, status, and cancelling subscriptions. */
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { STATUS_LABELS, cancelSubscription, formatMoney, listPurchases, type PurchaseRow } from '@/services/store'

const authStore = useAuthStore()
const rows = ref<PurchaseRow[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref<string | null>(null)

onMounted(async () => {
  try {
    if (authStore.profile) rows.value = await listPurchases(authStore.profile.id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load purchases'
  } finally {
    loading.value = false
  }
})

async function cancel(r: PurchaseRow) {
  if (!confirm(`Cancel ${r.title}? You keep access until the end of the current period.`)) return
  busy.value = r.id
  error.value = ''
  try {
    await cancelSubscription(r.id)
    r.cancel_at_period_end = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not cancel'
  } finally {
    busy.value = null
  }
}

const renews = (r: PurchaseRow) => (r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : null)
</script>

<template>
  <div class="w-full max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
    <h1 class="font-display text-2xl font-bold text-gray-900">Purchases</h1>
    <p v-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>
    <p v-if="loading" role="status" class="text-sm text-gray-500">Loading…</p>
    <p v-else-if="!rows.length" class="text-sm text-gray-600 bg-white rounded-2xl border border-gray-200 p-6 text-center">You haven’t bought anything yet.</p>
    <ul v-else class="flex flex-col gap-3">
      <li v-for="r in rows" :key="r.id" class="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="font-semibold text-gray-900 truncate">{{ r.title }}</h2>
            <router-link v-if="r.coach" :to="`/store/${r.coach.username}`" class="text-sm text-summit-700">{{ r.coach.display_name }}</router-link>
          </div>
          <span :class="['text-xs font-semibold rounded-full px-2.5 py-1 shrink-0', STATUS_LABELS[r.status]?.tone]">{{ STATUS_LABELS[r.status]?.label ?? r.status }}</span>
        </div>
        <p class="text-sm text-gray-700">
          {{ formatMoney(r.amount_cents, r.currency) }}{{ r.billing_interval ? ` / ${r.billing_interval}` : '' }}
          <template v-if="r.billing_interval && renews(r) && r.status === 'active'"> · {{ r.cancel_at_period_end ? 'ends' : 'renews' }} {{ renews(r) }}</template>
        </p>
        <div v-if="r.billing_interval && r.status === 'active' && !r.cancel_at_period_end">
          <button type="button" :disabled="busy === r.id" class="text-sm font-semibold text-red-700 hover:bg-red-50 rounded-lg px-3 min-h-[40px]" @click="cancel(r)">{{ busy === r.id ? 'Cancelling…' : 'Cancel subscription' }}</button>
        </div>
      </li>
    </ul>
  </div>
</template>
