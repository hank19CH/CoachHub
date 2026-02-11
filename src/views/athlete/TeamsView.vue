<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getAthleteGroups } from '@/services/groups'

const router = useRouter()
const authStore = useAuthStore()

const groups = ref<any[]>([])
const loading = ref(true)

onMounted(async () => {
  if (!authStore.user) return
  groups.value = await getAthleteGroups(authStore.user.id)
  loading.value = false
})

function getInitials(name: string) {
  return name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'
}
</script>

<template>
  <div class="pb-20">
    <!-- Header -->
    <div class="sticky top-0 bg-white/90 backdrop-blur-sm z-10 border-b border-gray-100">
      <div class="flex items-center justify-between p-4">
        <button @click="router.back()" class="text-gray-600 hover:text-gray-900 p-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="font-display text-lg font-semibold text-gray-900">My Teams</h1>
        <div class="w-8"></div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="p-6 space-y-4">
      <div v-for="i in 3" :key="i" class="animate-pulse">
        <div class="bg-gray-200 rounded-2xl h-24"></div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="groups.length === 0" class="p-8 text-center">
      <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <h2 class="font-display text-xl font-bold text-gray-900 mb-2">No Teams Yet</h2>
      <p class="text-gray-600 text-sm">You're not part of any teams yet. Ask your coach to add you to a group.</p>
    </div>

    <!-- Teams list -->
    <div v-else class="p-4 space-y-3">
      <div
        v-for="group in groups"
        :key="group.id"
        class="card-hover p-4 cursor-pointer"
        @click="router.push(`/athlete/teams/${group.id}`)"
      >
        <div class="flex items-start gap-3">
          <!-- Group icon -->
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            <span v-if="group.sport?.icon">{{ group.sport.icon }}</span>
            <span v-else>{{ getInitials(group.name) }}</span>
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-gray-900 truncate">{{ group.name }}</h3>
            <p v-if="group.team" class="text-xs text-purple-600 font-medium">{{ group.team.name }}</p>
            <div class="flex items-center gap-2 mt-1">
              <div v-if="group.coach" class="flex items-center gap-1.5">
                <img
                  v-if="group.coach.avatar_url"
                  :src="group.coach.avatar_url"
                  class="w-4 h-4 rounded-full object-cover"
                />
                <span class="text-xs text-gray-500">Coach {{ group.coach.display_name }}</span>
              </div>
              <span v-if="group.sport" class="text-xs text-gray-400">{{ group.sport.name }}</span>
            </div>
          </div>

          <!-- Arrow -->
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>
