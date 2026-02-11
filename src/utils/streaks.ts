import { supabase } from '@/lib/supabase'
import type { UserStreak } from '@/types/database'

export async function updateStreak(userId: string) {
  try {
    const { data: streak } = (await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .single()) as { data: UserStreak | null; error: any }

    const today = new Date().toISOString().split('T')[0] as string

    if (!streak) {
      await (supabase.from('user_streaks') as any).insert({
        user_id: userId,
        current_streak: 1,
        longest_streak: 1,
        last_workout_date: today,
      })
      return
    }

    const lastDate = new Date(streak.last_workout_date + 'T00:00:00')
    const todayDate = new Date(today + 'T00:00:00')
    const diffDays = Math.floor(
      (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffDays === 0) {
      // Already logged today
      return
    } else if (diffDays === 1) {
      // Consecutive day
      const newStreak = streak.current_streak + 1
      await (supabase
        .from('user_streaks') as any)
        .update({
          current_streak: newStreak,
          longest_streak: Math.max(newStreak, streak.longest_streak),
          last_workout_date: today,
        })
        .eq('user_id', userId)
    } else {
      // Streak broken
      await (supabase
        .from('user_streaks') as any)
        .update({
          current_streak: 1,
          last_workout_date: today,
        })
        .eq('user_id', userId)
    }
  } catch (error) {
    console.error('Error updating streak:', error)
  }
}

export async function getStreak(userId: string): Promise<UserStreak | null> {
  try {
    const { data } = (await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .single()) as { data: UserStreak | null; error: any }

    return data
  } catch {
    return null
  }
}
