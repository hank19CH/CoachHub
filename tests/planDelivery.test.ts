import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  orderedWeekIds,
  sessionDate,
  nextMonday,
  exerciseRowsFromSession,
  sortSessions,
  parseWeightToKg,
} from '../supabase/functions/_shared/planDelivery'

test('weeks are ordered across blocks (block order, then week number)', () => {
  const ids = orderedWeekIds([
    { id: 'b2', order_index: 1, block_weeks: [{ id: 'b2w2', week_number: 2 }, { id: 'b2w1', week_number: 1 }] },
    { id: 'b1', order_index: 0, block_weeks: [{ id: 'b1w1', week_number: 1 }, { id: 'b1w2', week_number: 2 }] },
  ])
  assert.deepEqual(ids, ['b1w1', 'b1w2', 'b2w1', 'b2w2'])
})

test('session dates match the Planner: start + weekOffset*7 + day (0 = Monday)', () => {
  assert.equal(sessionDate('2026-11-02', 0, 0), '2026-11-02') // Mon W1
  assert.equal(sessionDate('2026-11-02', 0, 2), '2026-11-04') // Wed W1
  assert.equal(sessionDate('2026-11-02', 2, 6), '2026-11-22') // Sun W3
  assert.equal(sessionDate('2026-12-28', 1, 3), '2027-01-07') // crosses year
  assert.equal(sessionDate('2026-11-02', 0, 9), '2026-11-08') // clamps bad day to Sunday
})

test('nextMonday starts a purchased program on the coming Monday (or today if Monday)', () => {
  assert.equal(nextMonday(new Date(2026, 10, 2)), '2026-11-02') // Monday
  assert.equal(nextMonday(new Date(2026, 10, 3)), '2026-11-09') // Tuesday
  assert.equal(nextMonday(new Date(2026, 10, 8)), '2026-11-09') // Sunday
})

test('session_data becomes exercises rows with the right column types', () => {
  const rows = exerciseRowsFromSession('w1', [
    { name: 'Back Squat', order: 2, sets: '4', reps: '5', load_percent: '75', weight: '140kg', superset_group: 'B' },
    { name: 'Flying 30m', order: 0, sets: 4, reps: '1', distance_meters: 30, rest_seconds: '180' },
    { name: '  ', order: 1 },    // ignored: blank name
    null,                        // ignored
    { order: 5, sets: '3' },     // ignored: no name
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(
    { sets: rows[0]!.sets, reps: rows[0]!.reps, intensity_percent: rows[0]!.intensity_percent, weight_kg: rows[0]!.weight_kg, superset_group: rows[0]!.superset_group, order_index: rows[0]!.order_index },
    { sets: '4', reps: '5', intensity_percent: 75, weight_kg: 140, superset_group: 2, order_index: 2 },
  )
  assert.equal(rows[1]!.sets, '4')
  assert.equal(rows[1]!.rest_seconds, 180)
  assert.equal(rows[1]!.distance_meters, 30)
  assert.equal(rows[1]!.workout_id, 'w1')
})

test('sessions deliver by day then order', () => {
  const s = sortSessions([
    { day_of_week: 2, order_index: 0 },
    { day_of_week: 0, order_index: 1 },
    { day_of_week: 0, order_index: 0 },
  ])
  assert.deepEqual(s.map(x => `${x.day_of_week}:${x.order_index}`), ['0:0', '0:1', '2:0'])
})

test('weights: kg, lb, percentages', () => {
  assert.equal(parseWeightToKg('100kg'), 100)
  assert.equal(parseWeightToKg('225 lbs'), 102.1)
  assert.equal(parseWeightToKg('80%'), null)
  assert.equal(parseWeightToKg(undefined), null)
})
