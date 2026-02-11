<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { assignmentsService } from '@/services/assignments'
import { supabase } from '@/lib/supabase'

const authStore = useAuthStore()

const loading = ref(true)
const stats = ref<{
  thisWeek: number
  completed: number
  pending: number
  completionRate: number
} | null>(null)
const streakData = ref<{ current_streak: number; longest_streak: number } | null>(null)
const totalCompleted = ref(0)

onMounted(async () => {
  if (!authStore.user) return

  try {
    loading.value = true

    // Fetch stats and streak in parallel
    const [statsResult, streakResult, totalResult] = await Promise.all([
      assignmentsService.getAssignmentStats(authStore.user.id),
      supabase
        .from('user_streaks')
        .select('current_streak, longest_streak')
        .eq('user_id', authStore.user.id)
        .single(),
      supabase
        .from('workout_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('athlete_id', authStore.user.id)
        .eq('status', 'completed')
    ])

    stats.value = statsResult

    if (streakResult.data) {
      streakData.value = streakResult.data as any
    }

    totalCompleted.value = totalResult.count || 0
  } catch (e) {
    console.error('Error loading progress stats:', e)
  } finally {
    loading.value = false
  }
})

const currentStreak = computed(() => streakData.value?.current_streak || 0)
const longestStreak = computed(() => streakData.value?.longest_streak || 0)

const motivationMessage = computed(() => {
  if (currentStreak.value >= 7) return 'Incredible streak! Keep it going!'
  if (currentStreak.value >= 3) return 'Great momentum! Stay consistent!'
  if (currentStreak.value >= 1) return 'Good start! Build your streak!'
  if (stats.value && stats.value.pending > 0) return 'You have workouts waiting - let\'s go!'
  return 'Ready for your next workout?'
})
</script>

<template>
  <div class="space-y-4">
    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-2 gap-3">
      <div v-for="i in 4" :key="i" class="animate-pulse card p-4">
        <div class="h-4 bg-gray-200 rounded w-20 mb-2"></div>
        <div class="h-8 bg-gray-200 rounded w-12"></div>
      </div>
    </div>

    <template v-else-if="stats">
      <!-- Stats Grid -->
      <div class="grid grid-cols-2 gap-3">
        <!-- This Week Completion -->
        <div class="card p-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">This Week</div>
          <div class="text-2xl font-bold text-gray-900">
            {{ stats.completed }}<span class="text-sm font-normal text-gray-500">/{{ stats.thisWeek }}</span>
          </div>
          <div class="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="stats.completionRate >= 80 ? 'bg-green-500' : stats.completionRate >= 50 ? 'bg-yellow-500' : 'bg-red-400'"
              :style="{ width: `${stats.completionRate}%` }"
            ></div>
          </div>
          <div class="text-xs text-gray-500 mt-1">{{ stats.completionRate }}% complete</div>
        </div>

        <!-- Current Streak -->
        <div class="card p-4" :class="currentStreak >= 3 ? 'bg-gradient-to-br from-valencia-50 to-white border-valencia-200' : ''">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Streak</div>
          <div class="text-2xl font-bold text-gray-900 flex items-center gap-1">
            {{ currentStreak }}
            <span v-if="currentStreak >= 3" class="text-lg">🔥</span>
          </div>
          <div class="text-xs text-gray-500 mt-1">
            Best: {{ longestStreak }}
          </div>
        </div>

        <!-- Pending Workouts -->
        <div class="card p-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Pending</div>
          <div class="text-2xl font-bold" :class="stats.pending > 0 ? 'text-valencia-600' : 'text-gray-900'">
            {{ stats.pending }}
          </div>
          <div class="text-xs text-gray-500 mt-1">workout{{ stats.pending !== 1 ? 's' : '' }} to do</div>
        </div>

        <!-- Total Completed (all time) -->
        <div class="card p-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">All Time</div>
          <div class="text-2xl font-bold text-gray-900">{{ totalCompleted }}</div>
          <div class="text-xs text-gray-500 mt-1">workouts done</div>
        </div>
      </div>

      <!-- Motivation Banner -->
      <div v-if="currentStreak > 0 || (stats.pending > 0)"
        class="card p-3 flex items-center gap-3"
        :class="currentStreak >= 3 ? 'bg-gradient-to-r from-summit-500 to-summit-600 text-white border-summit-500' : 'bg-summit-50 border-summit-200'"
      >
        <span class="text-2xl flex-shrink-0">
          {{ currentStreak >= 7 ? '🏆' : currentStreak >= 3 ? '🔥' : currentStreak >= 1 ? '💪' : '🎯' }}
        </span>
        <span class="text-sm font-medium" :class="currentStreak >= 3 ? 'text-white' : 'text-summit-800'">
          {{ motivationMessage }}
        </span>
      </div>
    </template>
  </div>
</template>
