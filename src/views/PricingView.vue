<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { PRICING, createCheckoutSession, getBetaSlotsRemaining } from '@/services/billing'
import type { BillingInterval } from '@/types/database'

const router = useRouter()
const authStore = useAuthStore()

const billingInterval = ref<BillingInterval>('monthly')
const loading = ref<string | null>(null) // tracks which tier is loading
const betaSlotsRemaining = ref<number | null>(null)

const betaOpen = computed(() => betaSlotsRemaining.value !== null && betaSlotsRemaining.value > 0)

// Show beta pricing when beta is open, standard when closed
const coachPrice = computed(() => {
  const tier = betaOpen.value ? PRICING.coach.beta : PRICING.coach.standard
  return billingInterval.value === 'monthly' ? tier.monthly : Math.round(tier.annual / 12)
})
const teamPrice = computed(() => {
  const tier = betaOpen.value ? PRICING.team.beta : PRICING.team.standard
  return billingInterval.value === 'monthly' ? tier.monthly : Math.round(tier.annual / 12)
})
const coachAnnualTotal = computed(() =>
  betaOpen.value ? PRICING.coach.beta.annual : PRICING.coach.standard.annual
)
const teamAnnualTotal = computed(() =>
  betaOpen.value ? PRICING.team.beta.annual : PRICING.team.standard.annual
)

// Standard prices for strikethrough display during beta
const coachStandardPrice = computed(() =>
  billingInterval.value === 'monthly'
    ? PRICING.coach.standard.monthly
    : Math.round(PRICING.coach.standard.annual / 12)
)
const teamStandardPrice = computed(() =>
  billingInterval.value === 'monthly'
    ? PRICING.team.standard.monthly
    : Math.round(PRICING.team.standard.annual / 12)
)

onMounted(async () => {
  betaSlotsRemaining.value = await getBetaSlotsRemaining()
})

const tiers = computed(() => [
  {
    name: 'Free',
    key: 'free' as const,
    price: 0,
    description: 'Get started with the basics',
    features: [
      'Up to 3 athletes',
      'Workout builder',
      'Basic assignment',
      'Social feed',
      'Messaging',
    ],
    cta: authStore.isAuthenticated ? 'Current Plan' : 'Get Started',
    highlighted: false,
    disabled: authStore.isAuthenticated,
  },
  {
    name: 'Coach',
    key: 'coach' as const,
    price: coachPrice.value,
    description: 'For serious coaches growing their roster',
    features: [
      'Up to 20 athletes (+3 bonus)',
      'AI Training Planner',
      'Smart Import (spreadsheets, PDFs)',
      'Coaching Philosophy Detection',
      'Calendar & scheduling',
      'Priority support',
    ],
    cta: authStore.subscriptionTier === 'coach' ? 'Current Plan' : 'Start 9-Day Trial',
    highlighted: true,
    disabled: authStore.subscriptionTier === 'coach' || authStore.subscriptionTier === 'team',
  },
  {
    name: 'Team',
    key: 'team' as const,
    price: teamPrice.value,
    description: 'For coaches with large rosters or multiple teams',
    features: [
      'Unlimited athletes',
      'Everything in Coach',
      'Team management',
      'Group workouts',
      'Advanced analytics',
      'Dedicated support',
    ],
    cta: authStore.subscriptionTier === 'team' ? 'Current Plan' : 'Start 9-Day Trial',
    highlighted: false,
    disabled: authStore.subscriptionTier === 'team',
  },
])

async function handleSelectPlan(tierKey: 'free' | 'coach' | 'team') {
  if (tierKey === 'free') {
    if (!authStore.isAuthenticated) {
      router.push('/signup')
    }
    return
  }

  if (!authStore.isAuthenticated) {
    router.push(`/signup?plan=${tierKey}&interval=${billingInterval.value}`)
    return
  }

  if (!authStore.isCoach) {
    return
  }

  loading.value = tierKey

  const result = await createCheckoutSession({
    tier: tierKey,
    interval: billingInterval.value,
    successUrl: `${window.location.origin}/coach/billing?checkout=success`,
    cancelUrl: `${window.location.origin}/pricing`,
  })

  if ('url' in result) {
    window.location.href = result.url
  } else {
    console.error('Checkout error:', result.error)
    loading.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-20">
    <!-- Beta Banner -->
    <div v-if="betaOpen" class="bg-peak-500 text-white text-center py-2.5 px-4">
      <p class="text-sm font-medium">
        <span class="inline-block animate-pulse mr-1">&#x1F525;</span>
        Early access pricing — <strong>{{ betaSlotsRemaining }} of 50 spots left!</strong>
        Lock in lower rates forever.
      </p>
    </div>
    <div v-else-if="betaSlotsRemaining === 0" class="bg-gray-700 text-white text-center py-2.5 px-4">
      <p class="text-sm font-medium">
        Beta pricing is closed. Thanks to our first 50 coaches!
      </p>
    </div>

    <!-- Hero Header -->
    <div class="bg-gradient-to-br from-summit-600 to-summit-800 text-white">
      <div class="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 class="text-3xl sm:text-4xl font-bold mb-3">
          Simple, transparent pricing
        </h1>
        <p class="text-summit-100 text-lg max-w-xl mx-auto">
          Start free, upgrade when you grow. 9-day trial on all paid plans.
        </p>

        <!-- Billing Toggle -->
        <div class="mt-8 inline-flex items-center gap-3 bg-white/10 rounded-full p-1">
          <button
            @click="billingInterval = 'monthly'"
            :class="billingInterval === 'monthly'
              ? 'bg-white text-summit-700 shadow-sm'
              : 'text-white/80 hover:text-white'"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all"
          >
            Monthly
          </button>
          <button
            @click="billingInterval = 'annual'"
            :class="billingInterval === 'annual'
              ? 'bg-white text-summit-700 shadow-sm'
              : 'text-white/80 hover:text-white'"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all"
          >
            Annual
            <span class="ml-1 text-xs bg-peak-500 text-white px-2 py-0.5 rounded-full">
              Save 17%
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Pricing Cards -->
    <div class="max-w-4xl mx-auto px-4 -mt-8">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          v-for="tier in tiers"
          :key="tier.key"
          :class="[
            'bg-white rounded-xl border-2 p-6 flex flex-col transition-all',
            tier.highlighted
              ? 'border-summit-500 ring-2 ring-summit-500/20 shadow-lg relative'
              : 'border-gray-200 shadow-sm'
          ]"
        >
          <!-- Most Popular Badge -->
          <div
            v-if="tier.highlighted"
            class="absolute -top-3 left-1/2 -translate-x-1/2 bg-summit-600 text-white text-xs font-semibold px-3 py-1 rounded-full"
          >
            Most Popular
          </div>

          <!-- Tier Name -->
          <h3 class="text-lg font-bold text-gray-900">{{ tier.name }}</h3>
          <p class="text-sm text-gray-500 mt-1">{{ tier.description }}</p>

          <!-- Price -->
          <div class="mt-4 mb-6">
            <span v-if="tier.price === 0" class="text-3xl font-bold text-gray-900">Free</span>
            <template v-else>
              <div v-if="betaOpen" class="flex items-baseline gap-2">
                <span class="text-sm text-gray-400 line-through">${{ tier.key === 'coach' ? coachStandardPrice : teamStandardPrice }}</span>
                <span class="text-3xl font-bold text-emerald-600">${{ tier.price }}</span>
                <span class="text-gray-500 text-sm">/mo</span>
              </div>
              <div v-else>
                <span class="text-3xl font-bold text-gray-900">${{ tier.price }}</span>
                <span class="text-gray-500 text-sm">/mo</span>
              </div>
              <div v-if="billingInterval === 'annual'" class="text-xs text-gray-400 mt-1">
                ${{ tier.key === 'coach' ? coachAnnualTotal : teamAnnualTotal }} billed annually
              </div>
              <div v-if="betaOpen" class="text-xs text-emerald-600 font-medium mt-1">
                Beta price — locked in forever
              </div>
            </template>
          </div>

          <!-- Features -->
          <ul class="flex-1 space-y-3 mb-6">
            <li v-for="feature in tier.features" :key="feature" class="flex items-start gap-2">
              <svg class="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span class="text-sm text-gray-700">{{ feature }}</span>
            </li>
          </ul>

          <!-- CTA Button -->
          <button
            @click="handleSelectPlan(tier.key)"
            :disabled="tier.disabled || loading === tier.key"
            :class="[
              'w-full py-3 px-4 rounded-lg font-semibold text-sm transition-all',
              tier.highlighted && !tier.disabled
                ? 'bg-summit-600 text-white hover:bg-summit-700 active:scale-95'
                : tier.disabled
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border-2 border-gray-300 text-gray-700 hover:border-summit-400 hover:text-summit-600 active:scale-95'
            ]"
          >
            <template v-if="loading === tier.key">
              <svg class="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </template>
            <template v-else>{{ tier.cta }}</template>
          </button>
        </div>
      </div>
    </div>

    <!-- Trial Info -->
    <div class="max-w-4xl mx-auto px-4 mt-12 text-center">
      <p class="text-sm text-gray-500">
        All paid plans include a 9-day free trial. Coach plan: no credit card required.
        Cancel anytime.
      </p>
    </div>

    <!-- FAQ Section -->
    <div class="max-w-2xl mx-auto px-4 mt-16">
      <h2 class="text-xl font-bold text-gray-900 text-center mb-8">Frequently Asked Questions</h2>

      <div class="space-y-6">
        <div>
          <h3 class="font-semibold text-gray-900">What happens when I hit my athlete limit?</h3>
          <p class="text-sm text-gray-600 mt-1">
            On the Coach plan, you get 20 athlete slots. When you reach 20, we automatically add 3 bonus slots as a thank you. At 23 athletes, you'll need to upgrade to Team for unlimited athletes.
          </p>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900">Can I switch plans later?</h3>
          <p class="text-sm text-gray-600 mt-1">
            Absolutely. Upgrade or downgrade anytime from your billing settings. When upgrading, you'll be prorated for the remaining time on your current billing cycle.
          </p>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900">What's included in the free trial?</h3>
          <p class="text-sm text-gray-600 mt-1">
            Full access to every feature in your chosen plan for 9 days. The Coach plan trial doesn't even require a credit card.
          </p>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900">What does "AI Planner" include?</h3>
          <p class="text-sm text-gray-600 mt-1">
            The AI Training Planner generates periodized training plans, suggests exercise prescriptions, and adapts to your coaching methodology. It learns your style over time.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
