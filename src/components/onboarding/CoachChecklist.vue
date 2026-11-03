<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getCoachChecklist, type ChecklistItem } from '@/services/onboarding'

const authStore = useAuthStore()
const items = ref<ChecklistItem[]>([])
const loaded = ref(false)

const DISMISSED = 'checklist:dismissed'
const doneCount = computed(() => items.value.filter(i => i.done).length)
const visible = computed(() =>
  loaded.value && items.value.length > 0 && doneCount.value < items.value.length && !authStore.onboardingFlags.includes(DISMISSED))

onMounted(async () => {
  const p = authStore.profile
  if (!p || authStore.onboardingFlags.includes(DISMISSED)) return
  try {
    items.value = await getCoachChecklist(p.id, !!p.bio && (p.sport_ids?.length ?? 0) > 0)
  } catch {
    items.value = []
  }
  loaded.value = true
})
</script>

<template>
  <section v-if="visible" aria-label="Getting started" data-tour="checklist" class="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <h2 class="font-display text-lg font-semibold text-gray-900">Getting started · {{ doneCount }} of {{ items.length }}</h2>
      <button type="button" class="text-sm text-gray-500 hover:text-gray-800 min-h-[40px] px-2" @click="authStore.addOnboardingFlag(DISMISSED)">Hide</button>
    </div>
    <div role="progressbar" :aria-valuenow="doneCount" aria-valuemin="0" :aria-valuemax="items.length" aria-label="Setup progress" class="h-2 rounded-full bg-summit-100 overflow-hidden">
      <div class="h-full bg-summit-800 transition-all" :style="{ width: `${(doneCount / items.length) * 100}%` }"></div>
    </div>
    <ul class="flex flex-col">
      <li v-for="item in items" :key="item.key">
        <router-link :to="item.to" class="flex items-center gap-3 min-h-[44px] rounded-lg px-1 hover:bg-gray-50">
          <span v-if="item.done" class="w-5 h-5 rounded-full bg-summit-800 text-white flex items-center justify-center" aria-hidden="true">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          <span v-else class="w-5 h-5 rounded-full border-2 border-gray-300" aria-hidden="true"></span>
          <span :class="['text-sm', item.done ? 'text-gray-500 line-through' : 'text-gray-900 font-medium']">{{ item.label }}<span class="sr-only">{{ item.done ? ' (done)' : ' (to do)' }}</span></span>
        </router-link>
      </li>
    </ul>
  </section>
</template>
