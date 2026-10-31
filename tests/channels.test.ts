import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WEEK_TEMPLATES } from '../src/data/weekTemplates'
import { generateChannelBlock, classifyChannel, roleTarget, metricValue, channelTotals, SPORT_PRESETS, MIN_VOLUME } from '../src/services/channels'
import { buildWeekTargets, generateBlock } from '../src/services/programEngine'

const gpp = WEEK_TEMPLATES.find(t => t.slug === 'sprint-gpp-high-low')!
const pct = (a: number, b: number) => Math.round((a / b - 1) * 100)

test('classification + coach override', () => {
  const [mon, tue] = gpp.days
  assert.deepEqual(mon.exercises.map(classifyChannel), ['other', 'other', 'speed', 'strength', 'plyo'])
  assert.deepEqual(tue.exercises.map(classifyChannel), ['tempo', 'strength'])
  assert.equal(classifyChannel({ name: 'x', order: 0, category: 'sprint', channel: 'tempo' }), 'tempo')
})

test('roles: build → focus grows, maintain holds; taper → focus cut least, intensity held', () => {
  const t = buildWeekTargets({ shape: 'peak', weeks: 6, deload: 'none' })
  const build = { ...t[1], volume: 1.2, intensity: 1 }
  assert.equal(roleTarget(build, 'focus').volume, 1.2)
  assert.equal(roleTarget(build, 'support').volume, 1.1)
  assert.equal(roleTarget(build, 'maintain').volume, 1)
  const taper = t[5]
  const [f, s, m] = (['focus', 'support', 'maintain'] as const).map(r => roleTarget(taper, r).volume)
  assert.ok(f > s && s > m && m >= MIN_VOLUME, `${f} > ${s} > ${m}`)
  assert.equal(roleTarget(taper, 'focus').intensity, taper.intensity)
})

test('speed peak: final week speed drops LESS than every other mode', () => {
  const block = generateChannelBlock(gpp.days, { shape: 'peak', weeks: 6, deload: 'none' }, SPORT_PRESETS.sprinter_speed)
  const w1 = block[0].channels, w6 = block[5].channels
  const d = { speed: pct(w6.speed.meters, w1.speed.meters), tempo: pct(w6.tempo.meters, w1.tempo.meters),
    plyo: pct(w6.plyo.contacts, w1.plyo.contacts), strength: pct(w6.strength.relLoad, w1.strength.relLoad) }
  console.log('WITH roles   — W6 vs W1 %:', JSON.stringify(d))
  for (const k of ['tempo', 'plyo', 'strength'] as const) assert.ok(d.speed > d[k], `speed ${d.speed} vs ${k} ${d[k]}`)
  const plain = generateBlock(gpp.days, { shape: 'peak', weeks: 6, deload: 'none' })
  const c0 = channelTotals(plain[0].sessions), c5 = channelTotals(plain[5].sessions)
  console.log('WITHOUT roles — W6 vs W1 %:', JSON.stringify({ speed: pct(c5.speed.meters, c0.speed.meters), tempo: pct(c5.tempo.meters, c0.tempo.meters), plyo: pct(c5.plyo.contacts, c0.plyo.contacts), strength: pct(c5.strength.relLoad, c0.strength.relLoad) }))
})

test('coach-typed key-metric targets are hit within rounding', () => {
  const w1 = metricValue(channelTotals(gpp.days), 'speed.meters')
  const typed = [null, 1.1, 1.2, 0.6, 1.3, 0.8].map(f => f && Math.round(w1 * f))
  const block = generateChannelBlock(gpp.days, { shape: 'accumulate', weeks: 6, deload: 'every_4' }, { ...SPORT_PRESETS.sprinter_speed, focusTargets: typed })
  const got = block.map(w => w.channels.speed.meters)
  console.log(`Typed speed m: ${w1}/${typed.slice(1).join('/')}  →  generated: ${got.join('/')}`)
  got.slice(1).forEach((g, i) => assert.ok(Math.abs(g - typed[i + 1]!) / typed[i + 1]! <= 0.2, `wk${i + 2} ${g} vs ${typed[i + 1]}`))
})

test('middle-zone warnings', () => {
  const b = generateChannelBlock([{ day_of_week: 0, session_name: 'Mon', exercises: [
    { name: 'Intensive tempo', order: 0, category: 'sprint', reps: '6', distance_meters: 150, intensity_percent: '85' }] }],
    { shape: 'maintain', weeks: 4, deload: 'none' }, { roles: {} })
  assert.equal(b[0].warnings.length, 1)
})

test('all templates × presets × shapes are clean', () => {
  for (const t of WEEK_TEMPLATES) for (const p of Object.values(SPORT_PRESETS))
    for (const shape of ['steady_build', 'accumulate', 'intensify', 'peak', 'maintain'] as const)
      assert.ok(!/NaN|Infinity/.test(JSON.stringify(generateChannelBlock(t.days, { shape, weeks: 8, deload: 'every_4' }, p))))
})

test('typed targets are hit even with the short-to-long lever', () => {
  const spp = WEEK_TEMPLATES.find(t => t.slug === 'sprint-spp-short-to-long')!
  const typed = [null, 600, 400, 300, 600, 450]
  const b = generateChannelBlock(spp.days, { shape: 'peak', weeks: 6, deload: 'none' }, { ...SPORT_PRESETS.sprinter_speed, focusTargets: typed })
  const got = b.map(w => w.channels.speed.meters)
  console.log('SPP typed', typed.slice(1).join('/'), '→', got.slice(1).join('/'))
  // Whole reps: the honest limit is about one rep of the longest speed distance in the week.
  const maxRep = (w: typeof b[number]) => Math.max(...w.sessions.flatMap(s => s.exercises).filter(e => e.category === 'sprint' && Number(e.intensity_percent ?? 100) >= 90).map(e => Number(e.distance_meters) || 0))
  got.slice(1).forEach((g, i) => assert.ok(Math.abs(g - typed[i + 1]!) <= maxRep(b[i + 1]), `wk${i + 2}: ${g} vs ${typed[i + 1]} (1 rep = ${maxRep(b[i + 1])} m)`))
})
