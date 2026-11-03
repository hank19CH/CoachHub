import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database'
import {
  exerciseRowsFromSession,
  isoDate,
  orderedWeekIds,
  sessionDate,
  sortSessions,
  type DeliveryBlock,
  type DeliverySession,
} from '../../supabase/functions/_shared/planDelivery'

type WorkoutAssignment = Database['public']['Tables']['workout_assignments']['Row']

export interface PublishOptions {
  planId: string
  coachId: string
  blockWeekId: string
  /** Athletes to assign to with optional load modifiers */
  athletes: { athleteId: string; loadModifier?: number }[]
  /** Optional: assign to a group's members automatically */
  groupId?: string
}

export interface PublishResult {
  workoutsCreated: number
  assignmentsCreated: number
  errors: string[]
}

export const planPublishService = {
  /**
   * Bulk publish a week: creates workout_assignments for all sessions in the week
   * for all specified athletes (or group members).
   */
  async publishWeek(options: PublishOptions): Promise<PublishResult> {
    const result: PublishResult = {
      workoutsCreated: 0,
      assignmentsCreated: 0,
      errors: [],
    }

    try {
      // 1. Resolve athletes first (group members merged in) so nothing is created for nobody
      let athletes = [...options.athletes]
      if (options.groupId) {
        const { data: members, error: mErr } = await supabase
          .from('group_members')
          .select('athlete_id')
          .eq('group_id', options.groupId)

        if (mErr) {
          result.errors.push('Failed to load group members')
        } else if (members) {
          // Merge group members (avoid duplicates)
          const existingIds = new Set(athletes.map(a => a.athleteId))
          for (const m of members) {
            if (!existingIds.has(m.athlete_id)) {
              athletes.push({ athleteId: m.athlete_id, loadModifier: 1.0 })
            }
          }
        }
      }

      if (athletes.length === 0) {
        result.errors.push('No athletes to assign to')
        return result
      }

      // 2. The week's sessions live in plan_sessions (Block Modeler, week editor, Smart Import).
      //    Each one is delivered as a workout: its linked workout_id, or a snapshot built from
      //    session_data. Dates match the Planner: start + weekOffset × 7 + day_of_week (0 = Mon).
      const [{ data: planRow, error: pErr }, { data: sessionRows, error: sErr }] = await Promise.all([
        supabase.from('plans')
          .select('start_date, training_blocks(id, order_index, block_weeks(id, week_number))')
          .eq('id', options.planId)
          .single(),
        supabase.from('plan_sessions')
          .select('id, block_week_id, day_of_week, order_index, session_name, session_data, workout_id')
          .eq('block_week_id', options.blockWeekId),
      ]) as [{ data: any; error: any }, { data: DeliverySession[] | null; error: any }]
      if (pErr) throw pErr
      if (sErr) throw sErr

      const weekOffset = Math.max(0, orderedWeekIds((planRow?.training_blocks ?? []) as DeliveryBlock[]).indexOf(options.blockWeekId))
      const start: string = planRow?.start_date ?? isoDate(new Date())

      const weekWorkouts: { id: string; date: string }[] = []
      for (const session of sortSessions(sessionRows ?? [])) {
        const date = sessionDate(start, weekOffset, session.day_of_week)
        if (session.workout_id) {
          weekWorkouts.push({ id: session.workout_id, date })
          continue
        }
        const { data: workout, error: wErr } = (await (supabase.from('workouts') as any)
          .insert({
            coach_id: options.coachId,
            name: session.session_name || 'Session',
            plan_id: options.planId,
            block_week_id: options.blockWeekId,
            day_index: session.day_of_week,
            is_library: false,
            is_template: false,
          })
          .select('id')
          .single()) as { data: { id: string } | null; error: any }
        if (wErr || !workout) {
          result.errors.push(`Could not create "${session.session_name || 'Session'}": ${wErr?.message ?? 'unknown error'}`)
          continue
        }
        const rows = exerciseRowsFromSession(workout.id, session.session_data)
        if (rows.length) {
          const { error: exErr } = await (supabase.from('exercises') as any).insert(rows)
          if (exErr) result.errors.push(`Exercises for "${session.session_name || 'Session'}": ${exErr.message}`)
        }
        weekWorkouts.push({ id: workout.id, date })
      }

      // Older plans may have workouts tagged with the week directly (pre plan_sessions).
      if (weekWorkouts.length === 0) {
        const { data: legacy } = (await supabase
          .from('workouts')
          .select('id, day_index')
          .eq('block_week_id', options.blockWeekId)
          .eq('coach_id', options.coachId)
          .order('day_index', { ascending: true })) as { data: { id: string; day_index: number | null }[] | null }
        for (const w of legacy ?? []) weekWorkouts.push({ id: w.id, date: sessionDate(start, weekOffset, w.day_index ?? 0) })
      }

      if (weekWorkouts.length === 0) {
        result.errors.push('This week has no sessions yet — add sessions before publishing.')
        return result
      }

      // 3. Create assignments for each workout × each athlete
      const assignments: any[] = []

      for (const workout of weekWorkouts) {
        for (const athlete of athletes) {
          assignments.push({
            workout_id: workout.id,
            athlete_id: athlete.athleteId,
            coach_id: options.coachId,
            assigned_date: workout.date,
            status: 'pending',
            load_modifier: athlete.loadModifier ?? 1.0,
            source: options.groupId ? 'group_publish' : 'plan_publish',
            plan_id: options.planId,
            block_week_id: options.blockWeekId,
          })
        }
      }

      // 4. Insert all assignments in batch
      if (assignments.length > 0) {
        const { data: inserted, error: aErr } = (await (supabase
          .from('workout_assignments') as any)
          .insert(assignments)
          .select()) as { data: any; error: any }

        if (aErr) {
          result.errors.push(`Assignment error: ${aErr.message}`)
        } else {
          result.assignmentsCreated = inserted?.length || 0
        }
      }

      result.workoutsCreated = weekWorkouts.length

      // 5. Create notifications for each athlete
      for (const athlete of athletes) {
        try {
          await (supabase.from('notifications') as any).insert({
            user_id: athlete.athleteId,
            type: 'workout_assigned',
            entity_type: 'plan',
            entity_id: options.planId,
            title: 'New workouts assigned',
            message: `Your coach has published ${weekWorkouts.length} session${weekWorkouts.length !== 1 ? 's' : ''} for you this week.`,
          })
        } catch (e) {
          // Non-critical — don't fail publish for notification errors
          console.error('Error sending notification:', e)
        }
      }

      // 6. Log to plan_changelog
      await planChangelogService.addEntry({
        plan_id: options.planId,
        changed_by: options.coachId,
        change_type: 'published',
        change_summary: `Published week with ${weekWorkouts.length} sessions to ${athletes.length} athlete${athletes.length !== 1 ? 's' : ''}`,
        metadata: {
          block_week_id: options.blockWeekId,
          athlete_count: athletes.length,
          workout_count: weekWorkouts.length,
        } as unknown as Json,
      })

      return result
    } catch (e) {
      console.error('Error publishing week:', e)
      result.errors.push(e instanceof Error ? e.message : 'Unknown error')
      return result
    }
  },

  /**
   * Get published assignments for a plan week
   */
  async getWeekAssignments(blockWeekId: string, coachId: string): Promise<WorkoutAssignment[]> {
    const { data, error } = await supabase
      .from('workout_assignments')
      .select('*')
      .eq('block_week_id', blockWeekId)
      .eq('coach_id', coachId)
      .order('assigned_date', { ascending: true })

    if (error) {
      console.error('Error fetching week assignments:', error)
      return []
    }
    return data || []
  },

  /**
   * Check if a week has been published
   */
  async isWeekPublished(blockWeekId: string, coachId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('workout_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('block_week_id', blockWeekId)
      .eq('coach_id', coachId)

    if (error) return false
    return (count || 0) > 0
  },
}

// ============================================
// Plan Changelog Service
// ============================================
export const planChangelogService = {
  /**
   * Add a changelog entry and auto-increment plan version
   */
  async addEntry(entry: {
    plan_id: string
    changed_by: string
    change_type: string
    change_summary?: string | null
    metadata?: Json | null
  }): Promise<void> {
    try {
      // Get current plan version
      const { data: plan } = await supabase
        .from('plans')
        .select('version')
        .eq('id', entry.plan_id)
        .single()

      const currentVersion = (plan?.version || 1)
      const shouldBump = ['block_added', 'block_removed', 'block_reordered', 'published'].includes(entry.change_type)
      const newVersion = shouldBump ? currentVersion + 1 : currentVersion

      // Insert changelog entry
      await (supabase.from('plan_changelog') as any).insert({
        plan_id: entry.plan_id,
        version: newVersion,
        changed_by: entry.changed_by,
        change_type: entry.change_type,
        change_summary: entry.change_summary || null,
        metadata: entry.metadata || {},
      })

      // Update plan version if bumped
      if (shouldBump) {
        await (supabase.from('plans') as any)
          .update({ version: newVersion, updated_at: new Date().toISOString() })
          .eq('id', entry.plan_id)
      }
    } catch (e) {
      console.error('Error adding changelog entry:', e)
    }
  },

  /**
   * Get changelog for a plan
   */
  async getChangelog(planId: string, limit = 50): Promise<any[]> {
    const { data, error } = await supabase
      .from('plan_changelog')
      .select('*, changed_by_profile:profiles!plan_changelog_changed_by_fkey(display_name, avatar_url)')
      .eq('plan_id', planId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching changelog:', error)
      // Fallback: try without the join if FK not recognized
      const { data: fallback } = await supabase
        .from('plan_changelog')
        .select('*')
        .eq('plan_id', planId)
        .order('created_at', { ascending: false })
        .limit(limit)
      return fallback || []
    }

    // Normalize FK relations
    return (data || []).map((entry: any) => ({
      ...entry,
      changed_by_profile: Array.isArray(entry.changed_by_profile)
        ? entry.changed_by_profile[0] ?? null
        : entry.changed_by_profile ?? null,
    }))
  },
}
