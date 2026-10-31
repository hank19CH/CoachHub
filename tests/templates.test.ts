import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WEEK_TEMPLATES } from '../src/data/weekTemplates'
import { generateBlock, SHAPES, type ShapeSlug, type DeloadCadence } from '../src/services/programEngine'

const shapes = Object.keys(SHAPES) as ShapeSlug[]
const cadences: DeloadCadence[] = ['none', 'every_3', 'every_4', 'final']

test('every template × shape × cadence × 4–8 weeks produces sane output', () => {
  let runs = 0
  for (const t of WEEK_TEMPLATES) for (const shape of shapes) for (const deload of cadences) for (let weeks = 4; weeks <= 8; weeks++) {
    const block = generateBlock(t.days, { shape, weeks, deload })
    assert.equal(block.length, weeks)
    const json = JSON.stringify(block)
    assert.ok(!/NaN|Infinity|undefined/.test(json), `${t.slug}/${shape}/${deload}/${weeks} has bad values`)
    for (const w of block) for (const s of w.sessions) for (const e of s.exercises) {
      const pct = Number(e.intensity_percent ?? 0)
      assert.ok(pct <= 100, `${t.slug} ${e.name} ${pct}%`)
      if (e.sets !== '' && e.sets != null && /^\d+$/.test(String(e.sets))) assert.ok(Number(e.sets) >= 1)
    }
    // Week 1 must equal the template exactly (minus the canonical_ref tag)
    const w1 = block[0].sessions.map(s => ({ ...s, exercises: s.exercises.map(({ canonical_ref, ...rest }) => rest) }))
    assert.deepEqual(w1, t.days)
    runs++
  }
  assert.equal(runs, WEEK_TEMPLATES.length * shapes.length * cadences.length * 5)
})

test('recommended configs show the intended pattern', () => {
  const pick = (slug: string) => WEEK_TEMPLATES.find(t => t.slug === slug)!
  const gpp = pick('sprint-gpp-high-low')
  const b = generateBlock(gpp.days, { shape: gpp.shape, weeks: gpp.weeks, deload: gpp.deload })
  console.log('Sprint GPP meters by week:', b.map(w => w.totals.meters).join(' / '))
  console.log('Sprint GPP rel. load by week:', b.map(w => w.totals.relativeLoad).join(' / '))
  const spp = pick('sprint-spp-short-to-long')
  const s = generateBlock(spp.days, { shape: spp.shape, weeks: spp.weeks, deload: spp.deload })
  console.log('SPP fly distance by week:', s.map(w => w.sessions[2].exercises[1].distance_meters + 'm×' + w.sessions[2].exercises[1].reps).join(' / '))
  console.log('SPP squat by week:', s.map(w => w.sessions[0].exercises[2].sets + '×' + w.sessions[0].exercises[2].reps + '@' + w.sessions[0].exercises[2].intensity_percent).join(' / '))
  const en = pick('endurance-polarized-5day')
  const e = generateBlock(en.days, { shape: en.shape, weeks: en.weeks, deload: en.deload })
  console.log('Endurance km by week:', e.map(w => (w.totals.meters / 1000).toFixed(1)).join(' / '))
})
