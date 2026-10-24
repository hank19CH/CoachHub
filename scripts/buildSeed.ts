/**
 * buildSeed.ts — emits the Sprint 14 migration from weekTemplates.ts
 * Run: npx tsx scripts/buildSeed.ts  (re-run whenever templates change)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { WEEK_TEMPLATES } from '../src/data/weekTemplates'

const q = (s: string | null) => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`)
const arr = (a: string[]) => `array[${a.map(q).join(',')}]::text[]`

const rows = WEEK_TEMPLATES.map(t =>
  `(${q(t.slug)}, null, ${q(t.name)}, ${q(t.coachLine)}, ${arr(t.sportTags)}, ${q(t.methodology)}, ${q(t.level)}, ` +
  `${q(t.shape)}, ${q(t.deload)}, ${t.weeks}, $json$${JSON.stringify(t.days)}$json$::jsonb, true)`)

const sql = readFileSync('scripts/sprint14_head.sql', 'utf8') + `
insert into public.week_templates
  (slug, coach_id, name, coach_line, sport_tags, methodology_short_name, level, shape, deload, weeks, days, is_public)
values
${rows.join(',\n')}
on conflict (slug) do update set
  name = excluded.name, coach_line = excluded.coach_line, sport_tags = excluded.sport_tags,
  methodology_short_name = excluded.methodology_short_name, level = excluded.level,
  shape = excluded.shape, deload = excluded.deload, weeks = excluded.weeks,
  days = excluded.days, updated_at = now();

commit;
`
writeFileSync('supabase/migrations/20261005_sprint14_block_modeler.sql', sql)
console.log(`wrote ${WEEK_TEMPLATES.length} templates, ${sql.length} bytes`)
