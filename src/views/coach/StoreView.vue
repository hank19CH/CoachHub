<script setup lang="ts">
/**
 * Coach Store (Sprint 15): payouts (Stripe Connect), products, sales.
 * Buyers pay the coach's own Stripe account; CoachHub keeps a 10% platform fee.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { plansService } from '@/services/plans'
import {
  CURRENCIES, KIND_LABELS, PLATFORM_FEE_PERCENT, STATUS_LABELS,
  deleteProduct, formatMoney, getPayoutAccount, listMyProducts, listSales, monthTotals, priceLabel,
  refreshPayoutStatus, saveProduct, startPayoutOnboarding, validateDraft,
  type ProductDraft, type SaleRow,
} from '@/services/store'
import type { CoachPayoutAccount, StoreProduct, StoreProductKind } from '@/types/database'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(true)
const loadError = ref('')
const payout = ref<CoachPayoutAccount | null>(null)
const products = ref<StoreProduct[]>([])
const sales = ref<SaleRow[]>([])
const plans = ref<{ id: string; name: string }[]>([])
const groups = ref<{ id: string; name: string }[]>([])

const country = ref('AU')
const connecting = ref(false)
const payoutError = ref('')
const copied = ref(false)

const storeUrl = computed(() => `${window.location.origin}/store/${authStore.profile?.username ?? ''}`)
const payoutState = computed<'none' | 'incomplete' | 'pending' | 'ready'>(() => {
  if (!payout.value) return 'none'
  if (payout.value.charges_enabled) return 'ready'
  return payout.value.details_submitted ? 'pending' : 'incomplete'
})
const totals = computed(() => monthTotals(sales.value))

async function load() {
  const coachId = authStore.profile?.id
  if (!coachId) return
  loading.value = true
  loadError.value = ''
  try {
    const [p, prods, s, pl, gr] = await Promise.all([
      getPayoutAccount(coachId),
      listMyProducts(coachId),
      listSales(coachId),
      plansService.getCoachPlans(coachId),
      plansService.getCoachGroups(coachId),
    ])
    payout.value = p
    products.value = prods
    sales.value = s
    plans.value = pl.map(x => ({ id: x.id, name: x.name }))
    groups.value = gr
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Could not load your store'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  // Back from Stripe onboarding: pull the latest status straight away
  if (route.query.payouts && payout.value) {
    try { payout.value = await refreshPayoutStatus() } catch { /* webhook will catch up */ }
    router.replace({ query: {} })
  }
})

async function connectPayouts() {
  connecting.value = true
  payoutError.value = ''
  try {
    window.location.href = await startPayoutOnboarding(country.value)
  } catch (e) {
    payoutError.value = e instanceof Error ? e.message : 'Could not reach Stripe'
    connecting.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(storeUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch { /* clipboard unavailable */ }
}

// ─── Product editor ─────────────────────────────────────────────────
const editing = ref<ProductDraft | null>(null)
const saving = ref(false)
const editError = ref('')
const priceInput = ref('')

function blank(kind: StoreProductKind = 'program'): ProductDraft {
  return {
    kind,
    title: '',
    description: '',
    price_cents: 0,
    currency: (payout.value?.default_currency as ProductDraft['currency']) || 'aud',
    billing_interval: kind === 'program' ? null : 'month',
    plan_id: null,
    group_id: null,
    is_published: false,
  }
}

function openEditor(p?: StoreProduct) {
  editError.value = ''
  editing.value = p
    ? { id: p.id, kind: p.kind, title: p.title, description: p.description ?? '', price_cents: p.price_cents, currency: p.currency, billing_interval: p.billing_interval, plan_id: p.plan_id, group_id: p.group_id, is_published: p.is_published }
    : blank()
  priceInput.value = p ? (p.price_cents / 100).toFixed(2) : ''
}

function setKind(kind: StoreProductKind) {
  if (!editing.value) return
  editing.value.kind = kind
  editing.value.billing_interval = kind === 'program' ? null : (editing.value.billing_interval ?? 'month')
}

const draftProblem = computed(() => {
  if (!editing.value) return null
  return validateDraft({ ...editing.value, price_cents: Math.round(parseFloat(priceInput.value || '0') * 100) })
})
const youReceive = computed(() => {
  const cents = Math.round(parseFloat(priceInput.value || '0') * 100)
  if (!editing.value || !cents) return null
  return formatMoney(cents - Math.round((cents * PLATFORM_FEE_PERCENT) / 100), editing.value.currency)
})

async function save() {
  const coachId = authStore.profile?.id
  if (!editing.value || !coachId) return
  saving.value = true
  editError.value = ''
  try {
    const saved = await saveProduct(coachId, { ...editing.value, price_cents: Math.round(parseFloat(priceInput.value || '0') * 100) })
    const i = products.value.findIndex(p => p.id === saved.id)
    if (i >= 0) products.value.splice(i, 1, saved)
    else products.value.push(saved)
    editing.value = null
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Could not save'
  } finally {
    saving.value = false
  }
}

async function remove(p: StoreProduct) {
  if (!confirm(`Delete “${p.title}”? Past sales stay in your records.`)) return
  try {
    await deleteProduct(p.id)
    products.value = products.value.filter(x => x.id !== p.id)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Could not delete'
  }
}

const deliversLabel = (p: StoreProduct) =>
  p.kind === 'squad'
    ? groups.value.find(g => g.id === p.group_id)?.name ?? 'No group chosen'
    : plans.value.find(x => x.id === p.plan_id)?.name ?? (p.kind === 'program' ? 'No plan chosen' : 'You program weekly')

const COUNTRY_OPTIONS = [['AU', 'Australia'], ['NZ', 'New Zealand'], ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['IE', 'Ireland']]
const btnFocus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2'
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 lg:px-8 py-6 flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold text-gray-900">Store</h1>
        <p class="text-sm text-gray-600">Sell programs, coaching and squad memberships. Buyers pay you directly; CoachHub keeps {{ PLATFORM_FEE_PERCENT }}%.</p>
      </div>
      <div v-if="authStore.profile?.username" class="flex items-center gap-2">
        <router-link :to="`/store/${authStore.profile.username}`" :class="['btn-secondary min-h-[44px] text-sm', btnFocus]">View my store</router-link>
        <button type="button" :class="['btn-secondary min-h-[44px] text-sm', btnFocus]" @click="copyLink">{{ copied ? 'Copied' : 'Copy link' }}</button>
      </div>
    </header>

    <p v-if="loadError" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ loadError }}</p>
    <div v-if="loading" class="text-sm text-gray-500" role="status">Loading your store…</div>

    <template v-else>
      <!-- Payouts -->
      <section aria-labelledby="payouts-h" class="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="payouts-h" class="font-display text-lg font-semibold text-gray-900">Payouts</h2>
          <span v-if="payoutState === 'ready'" class="text-xs font-semibold rounded-full px-2.5 py-1 bg-emerald-100 text-emerald-800">Taking payments</span>
          <span v-else-if="payoutState === 'pending'" class="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-100 text-amber-800">Stripe is reviewing</span>
          <span v-else-if="payoutState === 'incomplete'" class="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-100 text-amber-800">Setup not finished</span>
        </div>

        <template v-if="payoutState === 'none'">
          <p class="text-sm text-gray-600">Connect a Stripe account so buyers can pay you. Stripe verifies your identity and pays out to your bank. You’re the seller, so you look after any GST or sales tax on what you sell.</p>
          <div class="flex flex-wrap items-end gap-3">
            <label class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
              Where you’re based
              <select v-model="country" class="input font-normal">
                <option v-for="[code, name] in COUNTRY_OPTIONS" :key="code" :value="code">{{ name }}</option>
              </select>
            </label>
            <button type="button" :disabled="connecting" :class="['btn-primary min-h-[44px]', btnFocus]" @click="connectPayouts">{{ connecting ? 'Opening Stripe…' : 'Set up payouts' }}</button>
          </div>
        </template>
        <template v-else-if="payoutState !== 'ready'">
          <p class="text-sm text-gray-600">{{ payoutState === 'pending' ? 'Stripe is checking your details. This usually takes a few minutes. You can add products in the meantime.' : 'Stripe still needs a few details before you can take payments.' }}</p>
          <div><button type="button" :disabled="connecting" :class="['btn-primary min-h-[44px]', btnFocus]" @click="connectPayouts">{{ connecting ? 'Opening Stripe…' : 'Continue setup' }}</button></div>
        </template>
        <template v-else>
          <p class="text-sm text-gray-600">Payouts go to your bank on Stripe’s schedule. Manage payouts, refunds and tax details in your Stripe Dashboard.</p>
          <div><a href="https://dashboard.stripe.com/" target="_blank" rel="noopener" :class="['btn-secondary min-h-[44px] text-sm inline-flex items-center', btnFocus]">Open Stripe Dashboard</a></div>
        </template>
        <p v-if="payoutError" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ payoutError }}</p>
      </section>

      <!-- Products -->
      <section aria-labelledby="products-h" class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <h2 id="products-h" class="font-display text-lg font-semibold text-gray-900">Products</h2>
          <button type="button" :class="['btn-primary min-h-[44px] text-sm', btnFocus]" @click="openEditor()">New product</button>
        </div>
        <p v-if="!products.length" class="text-sm text-gray-600 bg-white rounded-2xl border border-dashed border-gray-300 p-6 text-center">
          Nothing for sale yet. Turn a plan you’ve built into a program, or offer monthly coaching.
        </p>
        <ul v-else class="grid gap-3 md:grid-cols-2">
          <li v-for="p in products" :key="p.id" class="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-wide text-summit-700">{{ KIND_LABELS[p.kind].name }}</p>
                <h3 class="font-semibold text-gray-900 truncate">{{ p.title }}</h3>
              </div>
              <span :class="['text-xs font-semibold rounded-full px-2.5 py-1 shrink-0', p.is_published ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600']">{{ p.is_published ? 'Live' : 'Draft' }}</span>
            </div>
            <p class="text-lg font-bold text-gray-900">{{ priceLabel(p) }}</p>
            <p class="text-sm text-gray-600">Delivers: {{ deliversLabel(p) }}</p>
            <div class="flex gap-2 mt-1">
              <button type="button" :class="['btn-secondary min-h-[40px] text-sm', btnFocus]" @click="openEditor(p)">Edit</button>
              <button type="button" :class="['min-h-[40px] text-sm px-3 text-red-700 hover:bg-red-50 rounded-lg', btnFocus]" @click="remove(p)">Delete</button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Sales -->
      <section aria-labelledby="sales-h" class="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3">
        <h2 id="sales-h" class="font-display text-lg font-semibold text-gray-900">Sales</h2>
        <dl v-if="totals.length" class="grid grid-cols-3 gap-3">
          <template v-for="t in totals" :key="t.currency">
            <div class="rounded-xl bg-gray-50 p-3"><dt class="text-xs text-gray-500">This month</dt><dd class="font-bold text-gray-900">{{ formatMoney(t.gross, t.currency) }}</dd></div>
            <div class="rounded-xl bg-gray-50 p-3"><dt class="text-xs text-gray-500">CoachHub fee</dt><dd class="font-bold text-gray-900">{{ formatMoney(t.fee, t.currency) }}</dd></div>
            <div class="rounded-xl bg-emerald-50 p-3"><dt class="text-xs text-emerald-800">Yours (before Stripe fees)</dt><dd class="font-bold text-emerald-900">{{ formatMoney(t.net, t.currency) }}</dd></div>
          </template>
        </dl>
        <p v-if="!sales.length" class="text-sm text-gray-600">No sales yet. Share your store link to get started.</p>
        <ul v-else class="divide-y divide-gray-100">
          <li v-for="s in sales" :key="s.id" class="py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{{ s.buyer?.display_name ?? 'Buyer' }} · {{ s.title }}</p>
              <p class="text-xs text-gray-500">{{ new Date(s.created_at).toLocaleDateString() }}{{ s.cancel_at_period_end ? ' · cancels at period end' : '' }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-900">{{ formatMoney(s.amount_cents, s.currency) }}</span>
              <span :class="['text-xs font-semibold rounded-full px-2 py-0.5', STATUS_LABELS[s.status]?.tone]">{{ STATUS_LABELS[s.status]?.label ?? s.status }}</span>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- Editor -->
    <div v-if="editing" class="fixed inset-0 z-[55] bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6" @click.self="editing = null" @keydown.esc="editing = null">
      <form role="dialog" aria-modal="true" aria-labelledby="editor-h" class="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto" @submit.prevent="save">
        <h2 id="editor-h" class="font-display text-lg font-semibold text-gray-900">{{ editing.id ? 'Edit product' : 'New product' }}</h2>

        <fieldset class="flex flex-col gap-2">
          <legend class="text-sm font-semibold text-gray-700 mb-1">What are you selling?</legend>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="k in (['program', 'coaching', 'squad'] as StoreProductKind[])" :key="k" type="button" :aria-pressed="editing.kind === k"
              :class="['rounded-xl border px-3 py-2 text-sm text-left min-h-[44px]', editing.kind === k ? 'border-summit-800 bg-summit-50 font-semibold text-summit-900' : 'border-gray-300 text-gray-700', btnFocus]"
              @click="setKind(k)">{{ KIND_LABELS[k].name }}</button>
          </div>
          <p class="text-xs text-gray-500">{{ KIND_LABELS[editing.kind].blurb }}</p>
        </fieldset>

        <label class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
          Name
          <input v-model="editing.title" type="text" maxlength="120" required class="input font-normal" placeholder="e.g. 8-Week Speed Development" />
        </label>
        <label class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
          Description
          <textarea v-model="editing.description" rows="3" maxlength="4000" class="input font-normal" placeholder="Who it’s for, what’s included, how it works"></textarea>
        </label>

        <div class="grid grid-cols-[1fr_auto] gap-3">
          <label class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Price
            <input v-model="priceInput" type="number" inputmode="decimal" min="1" step="0.01" required class="input font-normal" placeholder="49.00" />
          </label>
          <label class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Currency
            <select v-model="editing.currency" class="input font-normal">
              <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c.toUpperCase() }}</option>
            </select>
          </label>
        </div>
        <label v-if="editing.kind !== 'program'" class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
          Billing
          <select v-model="editing.billing_interval" class="input font-normal">
            <option value="month">Monthly</option>
            <option value="week">Weekly</option>
          </select>
        </label>
        <p v-if="youReceive" class="text-xs text-gray-600">You receive {{ youReceive }}{{ editing.billing_interval ? ` per ${editing.billing_interval}` : '' }} after CoachHub’s {{ PLATFORM_FEE_PERCENT }}%, before Stripe’s processing fee.</p>

        <label v-if="editing.kind !== 'squad'" class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
          {{ editing.kind === 'program' ? 'Plan delivered to the buyer' : 'Starting plan (optional)' }}
          <select v-model="editing.plan_id" class="input font-normal">
            <option :value="null">{{ editing.kind === 'program' ? 'Choose a plan' : 'None. I’ll program for them' }}</option>
            <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label v-else class="flex flex-col gap-1 text-sm font-semibold text-gray-700">
          Group buyers join
          <select v-model="editing.group_id" class="input font-normal">
            <option :value="null">Choose a group</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </label>

        <label class="flex items-center gap-3 text-sm font-semibold text-gray-700 min-h-[44px]">
          <input v-model="editing.is_published" type="checkbox" class="w-5 h-5 accent-summit-800" />
          Live in my store
        </label>
        <p v-if="editing.is_published && payoutState !== 'ready'" class="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Buyers can see it, but can’t pay until your payouts are set up.</p>

        <p v-if="editError || (editing.is_published && draftProblem)" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ editError || draftProblem }}</p>
        <div class="flex gap-2 justify-end">
          <button type="button" :class="['btn-secondary min-h-[44px]', btnFocus]" @click="editing = null">Cancel</button>
          <button type="submit" :disabled="saving" :class="['btn-primary min-h-[44px]', btnFocus]">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
