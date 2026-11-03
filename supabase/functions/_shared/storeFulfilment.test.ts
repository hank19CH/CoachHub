// Deno test (run: deno test supabase/functions/_shared/storeFulfilment.test.ts): storefront fulfilment against an in-memory fake of the Supabase query builder.
import { assertEquals } from 'jsr:@std/assert@1'
import { fulfilOrder, revokeOrder, applicationFeeCents } from './storeFulfilment.ts'
import { nextMonday, addDays } from './planDelivery.ts'

type Row = Record<string, any>
function splitTop(s: string) { const out: string[] = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = '' } else cur += ch } if (cur) out.push(cur); return out.map(x => x.trim()).filter(Boolean) }
function embeds(sel: string) { return splitTop(sel).map(i => i.match(/^(?:(\w+):)?(\w+)\((.*)\)$/s)).filter(Boolean).map(m => ({ alias: m![1] || m![2]!, table: m![2]!, sub: m![3]! })) }
const singular = (t: string) => t.replace(/s$/, '')

class FakeDb {
  t: Record<string, Row[]> = {}
  from(table: string) { return new Q(this, table) }
  rows(table: string) { return (this.t[table] ??= []) }
  resolve(table: string, row: Row, sel: string): Row {
    const r = { ...row }
    for (const e of embeds(sel)) {
      const fk = `${singular(e.table)}_id`
      if (fk in r || `${e.alias}_id` in r) {
        const key = `${e.alias}_id` in r ? `${e.alias}_id` : fk
        const hit = this.rows(e.table).find(x => x.id === r[key])
        r[e.alias] = hit ? this.resolve(e.table, hit, e.sub) : null
      } else {
        const back = table === 'training_blocks' ? 'training_block_id' : `${singular(table)}_id`
        r[e.alias] = this.rows(e.table).filter(x => x[back] === r.id).map(x => this.resolve(e.table, x, e.sub))
      }
    }
    return r
  }
}
class Q {
  f: ((r: Row) => boolean)[] = []; op = 'select'; sel = '*'; head = false; one: 'single' | 'maybe' | null = null; vals: any; opts: any = {}
  constructor(public db: FakeDb, public table: string) {}
  select(sel = '*', o: any = {}) { if (this.op === 'select') this.sel = sel; this.head = !!o.head; return this }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this }
  neq(k: string, v: any) { this.f.push(r => r[k] !== v); return this }
  in(k: string, vs: any[]) { this.f.push(r => vs.includes(r[k])); return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybe'; return this }
  insert(v: any) { this.op = 'insert'; this.vals = v; return this }
  upsert(v: any, o: any = {}) { this.op = 'upsert'; this.vals = v; this.opts = o; return this }
  update(v: any) { this.op = 'update'; this.vals = v; return this }
  delete() { this.op = 'delete'; return this }
  then(res: any, rej: any) { try { res(this.run()) } catch (e) { rej(e) } }
  run() {
    const rows = this.db.rows(this.table)
    const hit = () => rows.filter(r => this.f.every(fn => fn(r)))
    if (this.op === 'insert') {
      const list = (Array.isArray(this.vals) ? this.vals : [this.vals]).map((v: Row) => ({ id: v.id ?? crypto.randomUUID(), ...v }))
      rows.push(...list)
      const out = list.map((r: Row) => this.db.resolve(this.table, r, this.sel))
      return { data: this.one ? out[0] : out, error: null }
    }
    if (this.op === 'upsert') {
      const keys = String(this.opts.onConflict).split(',')
      for (const v of Array.isArray(this.vals) ? this.vals : [this.vals]) {
        const ex = rows.find(r => keys.every(k => r[k] === v[k]))
        if (ex) { if (!this.opts.ignoreDuplicates) Object.assign(ex, v) } else rows.push({ id: crypto.randomUUID(), ...v })
      }
      return { data: null, error: null }
    }
    if (this.op === 'update') { hit().forEach(r => Object.assign(r, this.vals)); return { data: null, error: null } }
    if (this.op === 'delete') { for (const r of hit()) rows.splice(rows.indexOf(r), 1); return { data: null, error: null } }
    const found = hit().map(r => this.db.resolve(this.table, r, this.sel))
    if (this.head) return { data: null, count: found.length, error: null }
    if (this.one) return found.length ? { data: found[0], error: null } : { data: null, error: this.one === 'single' ? { message: 'no rows' } : null }
    return { data: found, error: null }
  }
}

const C = 'coach', B = 'buyer'
function seed() {
  const db = new FakeDb()
  db.t = {
    profiles: [{ id: C, display_name: 'Jordan' }, { id: B, display_name: 'Alex' }],
    plans: [{ id: 'pl1', coach_id: C }],
    training_blocks: [{ id: 'tb2', plan_id: 'pl1', order_index: 1 }, { id: 'tb1', plan_id: 'pl1', order_index: 0 }],
    block_weeks: [{ id: 'w2', training_block_id: 'tb1', week_number: 2 }, { id: 'w1', training_block_id: 'tb1', week_number: 1 }, { id: 'w3', training_block_id: 'tb2', week_number: 1 }],
    plan_sessions: [
      { id: 's1', block_week_id: 'w1', day_of_week: 0, order_index: 0, session_name: 'Speed', session_data: [], workout_id: 'lib1' },
      { id: 's2', block_week_id: 'w1', day_of_week: 2, order_index: 0, session_name: 'Strength', session_data: [{ name: 'Back Squat', order: 0, sets: '4', reps: '5', weight: '120kg' }], workout_id: null },
      { id: 's3', block_week_id: 'w2', day_of_week: 0, order_index: 0, session_name: 'Speed 2', session_data: [{ name: 'Fly 30', order: 0, sets: '4', reps: '1', distance_meters: 30 }], workout_id: null },
      { id: 's4', block_week_id: 'w3', day_of_week: 4, order_index: 0, session_name: 'Block 2 Fri', session_data: [{ name: 'Tempo', order: 0, sets: '6', reps: '1', distance_meters: 200 }], workout_id: null },
    ],
    workouts: [{ id: 'lib1', coach_id: C, name: 'Speed (library)' }],
    groups: [{ id: 'g1', coach_id: C }],
    store_products: [
      { id: 'prog', coach_id: C, kind: 'program', title: '8-Week Speed', plan_id: 'pl1', group_id: null },
      { id: 'squad', coach_id: C, kind: 'squad', title: 'Summit Squad', plan_id: null, group_id: 'g1' },
      { id: 'coach', coach_id: C, kind: 'coaching', title: '1:1', plan_id: 'pl1', group_id: null },
    ],
    store_orders: [], coach_athletes: [], plan_athletes: [], group_members: [], exercises: [], workout_assignments: [], notifications: [],
  }
  return db
}
const order = (db: FakeDb, id: string, product: string, kind: string, status: string) =>
  db.t.store_orders.push({ id, product_id: product, coach_id: C, buyer_id: B, kind, title: product, amount_cents: 4900, currency: 'aud', status, fulfilled_at: null })

Deno.test('10% application fee, rounded to the cent', () => {
  assertEquals(applicationFeeCents(4900), 490)
  assertEquals(applicationFeeCents(14999), 1500)
})

Deno.test('program purchase: roster + whole plan delivered from next Monday, idempotent', async () => {
  const db = seed(); order(db, 'o1', 'prog', 'program', 'paid')
  await fulfilOrder(db, 'o1')
  const mon = nextMonday(new Date())
  assertEquals(db.t.coach_athletes.map(r => [r.athlete_id, r.status, r.invited_via]), [[B, 'active', 'purchase']])
  assertEquals(db.t.plan_athletes.length, 1)
  const a = db.t.workout_assignments.map(r => [r.block_week_id, r.assigned_date, r.source]).sort()
  assertEquals(a, [['w1', mon, 'store_purchase'], ['w1', addDays(mon, 2), 'store_purchase'], ['w2', addDays(mon, 7), 'store_purchase'], ['w3', addDays(mon, 18), 'store_purchase']].sort())
  assertEquals(db.t.workout_assignments.find(r => r.block_week_id === 'w1' && r.assigned_date === mon)!.workout_id, 'lib1') // library session reused
  assertEquals(db.t.exercises.map(e => [e.name, e.weight_kg ?? e.distance_meters]).sort(), [['Back Squat', 120], ['Fly 30', 30], ['Tempo', 200]])
  assertEquals(db.t.notifications.map(n => n.type).sort(), ['store_purchase', 'store_sale'])
  assertEquals(!!db.t.store_orders[0]!.fulfilled_at, true)
  await fulfilOrder(db, 'o1') // Stripe retry
  assertEquals(db.t.workout_assignments.length, 4)
  assertEquals(db.t.notifications.length, 2)
})

Deno.test('squad: join on purchase, leave on cancel; roster ends when nothing else is live', async () => {
  const db = seed(); order(db, 'o2', 'squad', 'squad', 'active')
  await fulfilOrder(db, 'o2')
  assertEquals(db.t.group_members.map(m => [m.group_id, m.athlete_id]), [['g1', B]])
  assertEquals(db.t.workout_assignments.length, 0)
  db.t.store_orders[0]!.status = 'canceled'
  await revokeOrder(db, 'o2')
  assertEquals(db.t.group_members.length, 0)
  assertEquals(db.t.coach_athletes[0]!.status, 'inactive')
})

Deno.test('cancelling coaching keeps the roster link while a program is still owned', async () => {
  const db = seed(); order(db, 'o3', 'prog', 'program', 'paid'); order(db, 'o4', 'coach', 'coaching', 'active')
  await fulfilOrder(db, 'o3'); await fulfilOrder(db, 'o4')
  db.t.store_orders[1]!.status = 'canceled'
  await revokeOrder(db, 'o4')
  assertEquals(db.t.coach_athletes.map(r => r.status), ['active'])
})

Deno.test('roster link made by an invite is never ended by a cancelled purchase', async () => {
  const db = seed(); db.t.coach_athletes.push({ id: 'x', coach_id: C, athlete_id: B, status: 'active', invited_via: 'link' })
  order(db, 'o5', 'squad', 'squad', 'active')
  await fulfilOrder(db, 'o5')
  db.t.store_orders[0]!.status = 'canceled'
  await revokeOrder(db, 'o5')
  assertEquals(db.t.coach_athletes[0]!.status, 'active')
})
