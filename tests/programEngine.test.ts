import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeekTargets, generateBlock, defaultLever, formatPrescription, applyLever, type Session } from '../src/services/programEngine'

// Fixtures mirror real plan_sessions.session_data (string-typed fields, mixed categories)
const week1: Session[] = [
  { day_of_week: 1, session_name: 'Monday Speed', exercises: [
    { name: 'A-Skip', order: 0, sets: '2', reps: '20m', category: 'warm_up' },
    { name: 'Acceleration', order: 1, sets: '', reps: '6', distance_meters: 30, category: 'sprint' },
    { name: 'Back Squat', order: 2, sets: '4', reps: '5', intensity_percent: '75', load_percent: '75', category: 'compound_lift' },
    { name: 'Hurdle Hop', order: 3, sets: '4', reps: '6', category: 'plyometric' },
  ]},
  { day_of_week: 3, session_name: 'Wednesday Tempo', exercises: [
    { name: 'Tempo 200s', order: 0, sets: '', reps: '10', distance_meters: 200, intensity_percent: '70', category: 'sprint' },
    { name: 'DB Row', order: 1, sets: '3', reps: '8-12', category: 'isolation' },
  ]},
]

test('week 1 is always the canonical week', () => {
  for (const shape of ['steady_build','accumulate','intensify','peak','maintain'] as const) {
    const [w1] = buildWeekTargets({ shape, weeks: 6, deload: 'every_4' })
    assert.equal(w1.volume, 1); assert.equal(w1.intensity, 0); assert.equal(w1.isDeload, false)
  }
})

test('3:1 cadence places deloads on weeks 4 and 8', () => {
  const t = buildWeekTargets({ shape: 'steady_build', weeks: 8, deload: 'every_4' })
  assert.deepEqual(t.filter(x => x.isDeload).map(x => x.week), [4, 8])
  assert.ok(t[4].intensity > t[2].intensity, 'progression continues after deload')
})

test('peak tapers the final third', () => {
  const t = buildWeekTargets({ shape: 'peak', weeks: 6, deload: 'none' })
  assert.deepEqual(t.filter(x => x.isTaper).map(x => x.week), [5, 6])
  assert.ok(t[5].volume < t[4].volume && t[4].volume < t[3].volume)
})

test('smart default levers', () => {
  const [mon, wed] = week1
  assert.deepEqual(mon.exercises.map(defaultLever), ['hold', 'volume', 'load', 'volume'])
  assert.deepEqual(wed.exercises.map(defaultLever), ['volume', 'reps'])
})

test('steady build: squat % climbs, sprint speed held, warmup untouched', () => {
  const block = generateBlock(week1, { shape: 'steady_build', weeks: 4, deload: 'every_4' })
  const sq = (w: number) => block[w - 1].sessions[0].exercises[2]
  assert.equal(sq(2).intensity_percent, '77.5'); assert.equal(sq(3).intensity_percent, '80')
  assert.equal(sq(3).load_percent, '80', 'both % fields stay in sync')
  assert.equal(sq(4).intensity_percent, '75', 'deload drops 2 steps'); assert.equal(sq(4).sets, '2', '4 sets → 2')
  assert.equal(block[2].sessions[0].exercises[0].reps, '20m')
  assert.equal(block[2].sessions[1].exercises[0].intensity_percent, '70', 'tempo stays 70%')
})

test('accumulate: sprint meters grow, deload cuts them', () => {
  const block = generateBlock(week1, { shape: 'accumulate', weeks: 4, deload: 'every_4' })
  const m = block.map(w => w.totals.meters)
  assert.ok(m[1] > m[0] && m[2] > m[1], `meters climb ${m}`)
  assert.ok(m[3] < m[0], 'deload below week 1')
})

test('double progression climbs the range then resets on deload', () => {
  const block = generateBlock(week1, { shape: 'steady_build', weeks: 4, deload: 'every_4' })
  const reps = block.map(w => w.sessions[1].exercises[1].reps)
  assert.deepEqual(reps, ['8-12', '9', '10', '8'])
})

test('distance lever: short-to-long grows distance, keeps reps', () => {
  const ex = { name: 'Fly', order: 0, reps: '6', distance_meters: 30, progression: { lever: 'distance' as const } }
  const out = applyLever(ex, { week: 3, volume: 1, intensity: 2, buildIndex: 2, isDeload: false, isTaper: false, label: '' })
  assert.equal(out.distance_meters, 50); assert.equal(out.reps, '6') // reps follow volume, meters grow
})

test('pinned coach edits survive regeneration', () => {
  const cfg = { shape: 'steady_build' as const, weeks: 4, deload: 'every_4' as const }
  const first = generateBlock(week1, cfg)
  const edited = structuredClone(first[2].sessions)
  edited[0].exercises[2] = { ...edited[0].exercises[2], intensity_percent: '85', load_percent: '85', pinned: true }
  const again = generateBlock(week1, { ...cfg, shape: 'intensify' }, { 3: edited })
  assert.equal(again[2].sessions[0].exercises[2].intensity_percent, '85')
  assert.equal(again[2].sessions[0].exercises[2].pinned, true)
})

test('chart overrides pin a week', () => {
  const t = buildWeekTargets({ shape: 'maintain', weeks: 4, deload: 'none', overrides: { 3: { volume: 1.3 } } })
  assert.equal(t[2].volume, 1.3); assert.equal(t[2].pinned, true)
})

test('formatPrescription', () => {
  assert.equal(formatPrescription(week1[0].exercises[2]), '4×5 @ 75%')
  assert.equal(formatPrescription(week1[0].exercises[1]), '6×30m')
  assert.equal(formatPrescription(week1[1].exercises[0]), '10×200m @ 70%')
})

test('garbage input does not throw', () => {
  const junk: Session[] = [{ day_of_week: 2, session_name: 'x', exercises: [
    { name: 'AMRAP', order: 0, sets: 'AMRAP', reps: 'max', intensity_percent: 'heavy' },
    { name: 'empty', order: 1 },
  ]}]
  assert.doesNotThrow(() => generateBlock(junk, { shape: 'intensify', weeks: 8, deload: 'every_3' }))
})

test('ladder lever: 5/3/1-style wave cycles and syncs both % fields', () => {
  const ex = { name: 'Bench', order: 0, sets: '3', reps: '5', intensity_percent: '65', load_percent: '65',
    progression: { lever: 'ladder' as const, ladder: [
      { reps: '5', intensity_percent: '65' }, { reps: '3', intensity_percent: '70' },
      { reps: '1', intensity_percent: '75' }, { reps: '5', intensity_percent: '40' } ] } }
  const block = generateBlock([{ day_of_week: 1, session_name: 'A', exercises: [ex] }], { shape: 'maintain', weeks: 8, deload: 'none' })
  assert.deepEqual(block.map(w => w.sessions[0].exercises[0].reps), ['5','3','1','5','5','3','1','5'])
  assert.equal(block[2].sessions[0].exercises[0].load_percent, '75')
})

test('accumulate adds sets on the reps lever (hypertrophy add-sets pattern)', () => {
  const ex = { name: 'Row', order: 0, sets: '3', reps: '8-12', category: 'isolation' }
  const block = generateBlock([{ day_of_week: 1, session_name: 'A', exercises: [ex] }], { shape: 'accumulate', weeks: 6, deload: 'every_4' })
  assert.deepEqual(block.map(w => w.sessions[0].exercises[0].sets), ['3','3','3','2','4','4'])
})
