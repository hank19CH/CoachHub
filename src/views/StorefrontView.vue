<script setup lang="ts">
/**
 * Public storefront: /store/:username (Sprint 15). Anyone can browse; buying needs an
 * athlete account. Signed-out visitors sign in or up and come straight back here.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { KIND_LABELS, getStorefront, priceLabel, rememberReturnTo, startCheckout, type Storefront } from '@/services/store'
import type { StoreProduct } from '@/types/database'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const username = computed(() => String(route.params.username ?? ''))
const store = ref<Storefront | null>(null)
const loading = ref(true)
const notFound = ref(false)
const error = ref('')
const buying = ref<string | null>(null)

const result = computed(() => route.query.purchase as string | undefined)
const isOwner = computed(() => !!store.value && authStore.profile?.id === store.value.coach.id)
const canBuy = computed(() => authStore.profile?.user_type === 'athlete')
const initials = computed(() => (store.value?.coach.display_name ?? '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())

onMounted(async () => {
  try {
    store.value = await getStorefront(username.value)
    notFound.value = !store.value
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load this store'
  } finally {
    loading.value = false
  }
})

async function buy(p: StoreProduct) {
  error.value = ''
  if (!authStore.isAuthenticated) {
    rememberReturnTo(route.path)
    router.push({ name: 'signup', query: { redirect: route.path } })
    return
  }
  buying.value = p.id
  try {
    window.location.href = await startCheckout(p.id, username.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not start checkout'
    buying.value = null
  }
}

function signIn() {
  rememberReturnTo(route.path)
  router.push({ name: 'login', query: { redirect: route.path } })
}

const cta = (p: StoreProduct) => (p.kind === 'program' ? 'Buy' : 'Subscribe')
const btnFocus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2'
</script>

<template>
  <div class="w-full max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
    <div v-if="loading" role="status" class="text-sm text-gray-500 text-center py-10">Loading store…</div>

    <div v-else-if="notFound" class="bg-white rounded-2xl border border-gray-200 p-6 text-center flex flex-col gap-2">
      <h1 class="font-display text-xl font-bold text-gray-900">Store not found</h1>
      <p class="text-sm text-gray-600">There’s no coach store at this address.</p>
    </div>

    <template v-else-if="store">
      <div v-if="result === 'success'" role="status" class="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex flex-col gap-1">
        <p class="font-semibold text-emerald-900">Payment received. You’re in!</p>
        <p class="text-sm text-emerald-800">It can take a minute to appear. Your sessions and coach will show up in CoachHub.</p>
        <router-link to="/purchases" class="text-sm font-semibold text-emerald-900 underline">See my purchases</router-link>
      </div>
      <p v-else-if="result === 'cancelled'" role="status" class="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">Checkout cancelled. You haven’t been charged.</p>

      <header class="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
        <img v-if="store.coach.avatar_url" :src="store.coach.avatar_url" alt="" class="w-16 h-16 rounded-full object-cover" />
        <span v-else class="w-16 h-16 rounded-full bg-summit-800 text-white font-bold text-xl flex items-center justify-center" aria-hidden="true">{{ initials }}</span>
        <div class="min-w-0">
          <h1 class="font-display text-xl font-bold text-gray-900 truncate">{{ store.coach.display_name }}</h1>
          <router-link :to="`/@${store.coach.username}`" class="text-sm text-summit-700">@{{ store.coach.username }}</router-link>
          <p v-if="store.coach.bio" class="text-sm text-gray-600 mt-1">{{ store.coach.bio }}</p>
        </div>
      </header>

      <p v-if="isOwner" class="text-sm text-gray-700 bg-summit-50 rounded-xl px-4 py-3">This is how buyers see your store. <router-link to="/coach/store" class="font-semibold text-summit-800 underline">Manage products</router-link></p>
      <p v-if="!store.open && store.products.length" class="text-sm text-amber-900 bg-amber-50 rounded-xl px-4 py-3">This coach isn’t taking payments yet. Check back soon.</p>
      <p v-if="error" role="alert" class="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{{ error }}</p>

      <section aria-label="Products" class="flex flex-col gap-3">
        <p v-if="!store.products.length" class="text-sm text-gray-600 bg-white rounded-2xl border border-gray-200 p-6 text-center">Nothing for sale right now.</p>
        <article v-for="p in store.products" :key="p.id" class="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-summit-700">{{ KIND_LABELS[p.kind].name }}</p>
            <h2 class="font-display text-lg font-bold text-gray-900">{{ p.title }}</h2>
          </div>
          <p v-if="p.description" class="text-sm text-gray-700 whitespace-pre-line">{{ p.description }}</p>
          <div class="flex items-center justify-between gap-3">
            <p class="text-xl font-bold text-gray-900">{{ priceLabel(p) }}</p>
            <button v-if="!isOwner && (canBuy || !authStore.isAuthenticated)" type="button"
              :disabled="!store.open || buying !== null"
              :class="['btn-primary min-h-[44px] px-5 disabled:opacity-50', btnFocus]"
              @click="buy(p)">{{ buying === p.id ? 'Opening checkout…' : !authStore.isAuthenticated ? `Sign up to ${cta(p).toLowerCase()}` : cta(p) }}</button>
          </div>
          <p v-if="authStore.isAuthenticated && !canBuy && !isOwner" class="text-xs text-gray-500">Purchases need an athlete account.</p>
        </article>
      </section>

      <footer class="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex flex-col gap-1 text-center">
        <p v-if="!authStore.isAuthenticated" class="text-sm text-gray-700">Already have an account? <button type="button" class="font-semibold text-summit-700 underline min-h-[32px]" @click="signIn">Log in</button></p>
        <p class="text-xs text-gray-600">Payments are processed securely by Stripe. You pay {{ store.coach.display_name }} directly.</p>
      </footer>
    </template>
  </div>
</template>
