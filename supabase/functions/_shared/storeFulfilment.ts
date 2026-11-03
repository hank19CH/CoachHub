// Storefront fulfilment — what a buyer gets once Stripe confirms payment.
// Runs with the service role (webhook). Idempotent: safe if Stripe retries the event.
//
//   every purchase → buyer joins the coach's roster (coach_athletes, invited_via = 'purchase')
//   program        → plan_athletes + the WHOLE plan delivered to the buyer's calendar,
//                    starting the coming Monday (same delivery rules as Publish Week)
//   coaching       → plan_athletes for the starting plan (if any); the coach publishes weekly
//   squad          → group_members (the coach publishes to the group)
//
// Revocation (subscription ended) removes squad membership and ends the roster link when the
// buyer has no other active purchase from that coach. Delivered program sessions are kept.

import {
  exerciseRowsFromSession,
  nextMonday,
  orderedWeekIds,
  sessionDate,
  sortSessions,
  type DeliveryBlock,
  type DeliverySession,
} from './planDelivery.ts'

// deno-lint-ignore no-explicit-any
type Admin = any

export const PLATFORM_FEE_PERCENT = 10

export function applicationFeeCents(amountCents: number): number {
  return Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100)
}

async function notify(admin: Admin, row: Record<string, unknown>) {
  const { error } = await admin.from('notifications').insert(row)
  if (error) console.error('notify failed:', error.message)
}

/** Deliver every week of a plan to one athlete, starting `startIso`. Returns sessions delivered. */
export async function deliverWholePlan(admin: Admin, planId: string, coachId: string, athleteId: string, startIso: string): Promise<number> {
  const { data: plan, error: pErr } = await admin
    .from('plans')
    .select('id, training_blocks(id, order_index, block_weeks(id, week_number))')
    .eq('id', planId)
    .single()
  if (pErr || !plan) throw new Error(`plan ${planId} not found: ${pErr?.message ?? ''}`)

  const weekIds = orderedWeekIds((plan.training_blocks ?? []) as DeliveryBlock[])
  if (weekIds.length === 0) return 0

  const { data: sessions, error: sErr } = await admin
    .from('plan_sessions')
    .select('id, block_week_id, day_of_week, order_index, session_name, session_data, workout_id')
    .in('block_week_id', weekIds)
  if (sErr) throw new Error(sErr.message)

  const assignments: Record<string, unknown>[] = []
  for (const [offset, weekId] of weekIds.entries()) {
    const weekSessions = sortSessions(((sessions ?? []) as DeliverySession[]).filter(s => s.block_week_id === weekId))
    for (const s of weekSessions) {
      let workoutId = s.workout_id
      if (!workoutId) {
        const { data: w, error: wErr } = await admin
          .from('workouts')
          .insert({
            coach_id: coachId,
            name: s.session_name || 'Session',
            plan_id: planId,
            block_week_id: weekId,
            day_index: s.day_of_week,
            is_library: false,
            is_template: false,
          })
          .select('id')
          .single()
        if (wErr || !w) throw new Error(`workout snapshot failed: ${wErr?.message ?? ''}`)
        workoutId = w.id as string
        const rows = exerciseRowsFromSession(workoutId, s.session_data)
        if (rows.length) {
          const { error: exErr } = await admin.from('exercises').insert(rows)
          if (exErr) console.error('exercises insert failed:', exErr.message)
        }
      }
      assignments.push({
        workout_id: workoutId,
        athlete_id: athleteId,
        coach_id: coachId,
        assigned_date: sessionDate(startIso, offset, s.day_of_week),
        status: 'pending',
        load_modifier: 1.0,
        source: 'store_purchase',
        plan_id: planId,
        block_week_id: weekId,
      })
    }
  }

  if (assignments.length) {
    const { error } = await admin.from('workout_assignments').insert(assignments)
    if (error) throw new Error(`assignments insert failed: ${error.message}`)
  }
  return assignments.length
}

/** Give the buyer what they paid for. No-op if already fulfilled. */
export async function fulfilOrder(admin: Admin, orderId: string): Promise<void> {
  const { data: order, error } = await admin
    .from('store_orders')
    .select('*, product:store_products(plan_id, group_id, title)')
    .eq('id', orderId)
    .single()
  if (error || !order) throw new Error(`order ${orderId} not found`)
  if (order.fulfilled_at) return

  const now = new Date().toISOString()
  const product = order.product ?? {}

  // 1. Roster: the buyer becomes the coach's athlete. An existing ACTIVE link (e.g. from an
  //    invite) is left exactly as it is, so cancelling this purchase can never end it.
  const { data: link } = await admin
    .from('coach_athletes')
    .select('id, status')
    .eq('coach_id', order.coach_id)
    .eq('athlete_id', order.buyer_id)
    .maybeSingle()
  const rosterRow = { status: 'active', invited_via: 'purchase', started_at: now, ended_at: null }
  const { error: rosterErr } = !link
    ? await admin.from('coach_athletes').insert({ coach_id: order.coach_id, athlete_id: order.buyer_id, ...rosterRow })
    : link.status !== 'active'
      ? await admin.from('coach_athletes').update(rosterRow).eq('id', link.id)
      : { error: null }
  if (rosterErr) throw new Error(`roster: ${rosterErr.message}`)

  // 2. What the product delivers
  let delivered = 0
  if ((order.kind === 'program' || order.kind === 'coaching') && product.plan_id) {
    await admin.from('plan_athletes').upsert(
      { plan_id: product.plan_id, athlete_id: order.buyer_id },
      { onConflict: 'plan_id,athlete_id', ignoreDuplicates: true },
    )
    if (order.kind === 'program') {
      delivered = await deliverWholePlan(admin, product.plan_id, order.coach_id, order.buyer_id, nextMonday(new Date()))
    }
  }
  if (order.kind === 'squad' && product.group_id) {
    await admin.from('group_members').upsert(
      { group_id: product.group_id, athlete_id: order.buyer_id },
      { onConflict: 'group_id,athlete_id', ignoreDuplicates: true },
    )
  }

  await admin.from('store_orders').update({ fulfilled_at: now, updated_at: now }).eq('id', orderId)

  // 3. Tell both sides
  const { data: buyer } = await admin.from('profiles').select('display_name').eq('id', order.buyer_id).maybeSingle()
  const money = `${(order.amount_cents / 100).toFixed(2)} ${String(order.currency).toUpperCase()}`
  await notify(admin, {
    user_id: order.coach_id,
    actor_id: order.buyer_id,
    type: 'store_sale',
    entity_type: 'store_order',
    entity_id: order.id,
    title: `New sale: ${order.title}`,
    message: `${buyer?.display_name ?? 'Someone'} bought ${order.title} (${money}).`,
    action_url: '/coach/store',
  })
  await notify(admin, {
    user_id: order.buyer_id,
    actor_id: order.coach_id,
    type: 'store_purchase',
    entity_type: 'store_order',
    entity_id: order.id,
    title: `You're in: ${order.title}`,
    message: order.kind === 'program'
      ? `${delivered} sessions are on your calendar, starting Monday.`
      : order.kind === 'squad'
        ? 'You have joined the squad. Your coach will publish your sessions.'
        : 'Your coach has been notified and will set up your training.',
    action_url: '/athlete/dashboard',
  })
}

/** A recurring purchase ended: undo access that depends on it. */
export async function revokeOrder(admin: Admin, orderId: string): Promise<void> {
  const { data: order } = await admin
    .from('store_orders')
    .select('*, product:store_products(group_id)')
    .eq('id', orderId)
    .single()
  if (!order) return

  if (order.kind === 'squad' && order.product?.group_id) {
    await admin.from('group_members').delete().eq('group_id', order.product.group_id).eq('athlete_id', order.buyer_id)
  }

  // Keep the roster link if the buyer still has another live purchase from this coach
  const { count } = await admin
    .from('store_orders')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', order.coach_id)
    .eq('buyer_id', order.buyer_id)
    .neq('id', order.id)
    .in('status', ['active', 'past_due', 'paid'])
  if (!count) {
    await admin
      .from('coach_athletes')
      .update({ status: 'inactive', ended_at: new Date().toISOString() })
      .eq('coach_id', order.coach_id)
      .eq('athlete_id', order.buyer_id)
      .eq('invited_via', 'purchase')
  }
}
