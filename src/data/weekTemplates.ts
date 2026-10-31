/**
 * weekTemplates.ts — system "Start from a template" library
 * ------------------------------------------------------------------
 * Each template = ONE canonical week (engine Session[] format) + a recommended
 * shape. The coach picks one, edits Week 1, picks weeks/shape, generates.
 *
 * Source of truth for the seed SQL (scripts/buildSeed.ts emits INSERTs from this
 * file) and for tests (every template is run through every shape before seeding).
 *
 * Prescriptions use plan_sessions.session_data vocabulary on purpose:
 * string sets/reps, numeric distance_meters, category ∈ sprint | compound_lift |
 * isolation | plyometric | warm_up | mobility | conditioning.
 * Percentages are starting points for Week 1, not prescriptions for any athlete.
 */
import type { Session, ShapeSlug, DeloadCadence, Prescription } from '../services/programEngine'

export interface WeekTemplate {
  slug: string
  name: string
  coachLine: string
  sportTags: string[]
  methodology: string | null       // methodology_profiles.short_name
  level: 'beginner' | 'intermediate' | 'advanced'
  shape: ShapeSlug
  deload: DeloadCadence
  weeks: number
  days: Session[]
}

// tiny builders keep the data readable
let o = 0
const reset = () => { o = 0 }
const ex = (name: string, category: string, f: Partial<Prescription>): Prescription =>
  ({ name, order: o++, category, sets: '', reps: '', ...f })
/** Authored as ISO weekday (1 = Mon … 7 = Sun) for readability; stored as
 *  plan_sessions.day_of_week (0 = Mon … 6 = Sun — verified against production data). */
const day = (isoDay: number, session_name: string, ...exs: Prescription[]): Session => {
  const s = { day_of_week: isoDay - 1, session_name, exercises: exs }
  reset()
  return s
}
const warm = (name: string, sets = '1', reps = '20m') => ex(name, 'warm_up', { sets, reps })

export const WEEK_TEMPLATES: WeekTemplate[] = [
  {
    slug: 'sprint-gpp-high-low',
    name: 'Sprint GPP — High/Low',
    coachLine: 'Three high-CNS days separated by tempo days. Build work capacity without grey-zone running.',
    sportTags: ['athletics', 'sprints', 'team-sport-speed'],
    methodology: 'Francis', level: 'intermediate',
    shape: 'accumulate', deload: 'every_4', weeks: 6,
    days: [
      day(1, 'High — Acceleration + Strength',
        warm('A-Skip', '2'), warm('B-Skip', '2'),
        ex('Acceleration Sprint', 'sprint', { reps: '6', distance_meters: 30, intensity_percent: '95' }),
        ex('Back Squat', 'compound_lift', { sets: '4', reps: '5', intensity_percent: '75', load_percent: '75' }),
        ex('Hurdle Hop', 'plyometric', { sets: '4', reps: '5' })),
      day(2, 'Low — Extensive Tempo',
        ex('Tempo 200m', 'sprint', { reps: '10', distance_meters: 200, intensity_percent: '70' }),
        ex('Bird Dog', 'isolation', { sets: '3', reps: '8-12' })),
      day(3, 'High — Max Velocity + Power',
        warm('A-Skip', '2'), warm('High Knees', '2'),
        ex('Flying Sprint', 'sprint', { reps: '4', distance_meters: 30, intensity_percent: '97' }),
        ex('Bounding', 'plyometric', { sets: '4', reps: '1', distance_meters: 30 }),
        ex('Barbell Bench Press', 'compound_lift', { sets: '4', reps: '5', intensity_percent: '75', load_percent: '75' })),
      day(4, 'Low — Tempo + Core',
        ex('Tempo 100m', 'sprint', { reps: '16', distance_meters: 100, intensity_percent: '70' }),
        ex('Ab Wheel Rollout', 'isolation', { sets: '3', reps: '8-12' })),
      day(5, 'High — Acceleration + Strength',
        warm('A-Skip', '2'),
        ex('Falling Start', 'sprint', { reps: '5', distance_meters: 40, intensity_percent: '95' }),
        ex('Conventional Deadlift', 'compound_lift', { sets: '4', reps: '4', intensity_percent: '78', load_percent: '78' }),
        ex('Box Jump', 'plyometric', { sets: '4', reps: '4' })),
      day(6, 'Low — Extensive Tempo',
        ex('Tempo 200m', 'sprint', { reps: '8', distance_meters: 200, intensity_percent: '68' })),
    ],
  },
  {
    slug: 'sprint-spp-short-to-long',
    name: 'Sprint SPP — Short-to-Long',
    coachLine: 'Speed distances grow week to week while total meters come down. Gym intensifies.',
    sportTags: ['athletics', 'sprints'],
    methodology: 'Francis', level: 'advanced',
    shape: 'intensify', deload: 'every_4', weeks: 6,
    days: [
      day(1, 'Acceleration + Strength',
        warm('A-Skip', '2'),
        ex('Block Start', 'sprint', { reps: '6', distance_meters: 30, intensity_percent: '98', progression: { lever: 'distance', step: 10 } }),
        ex('Back Squat', 'compound_lift', { sets: '4', reps: '3', intensity_percent: '82', load_percent: '82' })),
      day(2, 'Tempo',
        ex('Tempo 100m', 'sprint', { reps: '12', distance_meters: 100, intensity_percent: '70' })),
      day(3, 'Max Velocity',
        warm('A-Skip', '2'),
        ex('Flying Sprint', 'sprint', { reps: '4', distance_meters: 20, intensity_percent: '98', progression: { lever: 'distance', step: 10 } }),
        ex('Depth Jump', 'plyometric', { sets: '3', reps: '5' })),
      day(5, 'Speed Endurance + Strength',
        ex('Speed Endurance', 'sprint', { reps: '4', distance_meters: 80, intensity_percent: '95', progression: { lever: 'distance', step: 10 } }),
        ex('Power Clean', 'compound_lift', { sets: '5', reps: '2', intensity_percent: '80', load_percent: '80' })),
    ],
  },
  {
    slug: 'strength-linear-3day',
    name: 'Linear Strength — 3 Day Full Body',
    coachLine: 'Same lifts, a bit heavier every week. The right start for newer lifters.',
    sportTags: ['general', 'strength'],
    methodology: 'Linear', level: 'beginner',
    shape: 'steady_build', deload: 'every_4', weeks: 8,
    days: [
      day(1, 'Full Body A',
        ex('Back Squat', 'compound_lift', { sets: '3', reps: '5', intensity_percent: '70', load_percent: '70' }),
        ex('Barbell Bench Press', 'compound_lift', { sets: '3', reps: '5', intensity_percent: '70', load_percent: '70' }),
        ex('Barbell Row', 'isolation', { sets: '3', reps: '8-10' })),
      day(3, 'Full Body B',
        ex('Conventional Deadlift', 'compound_lift', { sets: '2', reps: '5', intensity_percent: '72', load_percent: '72' }),
        ex('Dumbbell Shoulder Press', 'isolation', { sets: '3', reps: '8-10' }),
        ex('Chin-Up', 'isolation', { sets: '3', reps: '5-8' })),
      day(5, 'Full Body A',
        ex('Back Squat', 'compound_lift', { sets: '3', reps: '5', intensity_percent: '70', load_percent: '70' }),
        ex('Barbell Bench Press', 'compound_lift', { sets: '3', reps: '5', intensity_percent: '70', load_percent: '70' }),
        ex('Back Extension', 'isolation', { sets: '3', reps: '10-15' })),
    ],
  },
  {
    slug: 'hypertrophy-upper-lower',
    name: 'Hypertrophy — Upper/Lower 4 Day',
    coachLine: 'Reps climb inside each range, sets build across the block, then deload.',
    sportTags: ['general', 'bodybuilding'],
    methodology: null, level: 'intermediate',
    shape: 'accumulate', deload: 'every_4', weeks: 4,
    days: [
      day(1, 'Upper',
        ex('Barbell Bench Press', 'compound_lift', { sets: '3', reps: '6-10', rpe: '7' }),
        ex('Barbell Row', 'isolation', { sets: '3', reps: '8-12' }),
        ex('Cable Lateral Raise', 'isolation', { sets: '3', reps: '12-15' })),
      day(2, 'Lower',
        ex('Back Squat', 'compound_lift', { sets: '3', reps: '6-10', rpe: '7' }),
        ex('Bulgarian Split Squat', 'isolation', { sets: '3', reps: '8-12' }),
        ex('Back Extension', 'isolation', { sets: '3', reps: '10-15' })),
      day(4, 'Upper',
        ex('Dumbbell Shoulder Press', 'isolation', { sets: '3', reps: '8-12' }),
        ex('Chin-Up', 'isolation', { sets: '3', reps: '6-10' }),
        ex('Cable Fly', 'isolation', { sets: '3', reps: '12-15' })),
      day(5, 'Lower',
        ex('Conventional Deadlift', 'compound_lift', { sets: '3', reps: '5-8', rpe: '7' }),
        ex('Cable Crunch', 'isolation', { sets: '3', reps: '10-15' })),
    ],
  },
  {
    slug: 'dup-3day',
    name: 'Daily Undulating — 3 Day',
    coachLine: 'Volume day, strength day, power day every week. All three get heavier together.',
    sportTags: ['general', 'strength', 'powerlifting'],
    methodology: 'DUP', level: 'intermediate',
    shape: 'steady_build', deload: 'every_4', weeks: 8,
    days: [
      day(1, 'Hypertrophy Day',
        ex('Back Squat', 'compound_lift', { sets: '4', reps: '10', intensity_percent: '68', load_percent: '68' }),
        ex('Barbell Bench Press', 'compound_lift', { sets: '4', reps: '10', intensity_percent: '68', load_percent: '68' }),
        ex('Barbell Row', 'isolation', { sets: '4', reps: '8-12' })),
      day(3, 'Strength Day',
        ex('Back Squat', 'compound_lift', { sets: '5', reps: '5', intensity_percent: '80', load_percent: '80' }),
        ex('Barbell Bench Press', 'compound_lift', { sets: '5', reps: '5', intensity_percent: '80', load_percent: '80' }),
        ex('Conventional Deadlift', 'compound_lift', { sets: '3', reps: '3', intensity_percent: '82', load_percent: '82' })),
      day(5, 'Power Day',
        ex('Back Squat', 'compound_lift', { sets: '5', reps: '3', intensity_percent: '86', load_percent: '86' }),
        ex('Barbell Bench Press', 'compound_lift', { sets: '5', reps: '2', intensity_percent: '88', load_percent: '88' }),
        ex('Box Jump', 'plyometric', { sets: '4', reps: '3' })),
    ],
  },
  {
    slug: 'wave-531-style-4day',
    name: 'Wave Loading — 5s/3s/1s + Deload',
    coachLine: 'Four-week waves on the main lift (5s, 3s, 1s, deload), steady volume on supplemental work.',
    sportTags: ['general', 'strength'],
    methodology: '5/3/1', level: 'intermediate',
    shape: 'maintain', deload: 'none', weeks: 8,
    days: ([
      [1, 'Squat Day', 'Back Squat'], [2, 'Bench Day', 'Barbell Bench Press'],
      [4, 'Deadlift Day', 'Conventional Deadlift'], [5, 'Press Day', 'Dumbbell Shoulder Press'],
    ] as const).map(([d, n, lift]) => day(d, n,
      ex(lift, 'compound_lift', { sets: '3', reps: '5', intensity_percent: '85', load_percent: '85',
        progression: { lever: 'ladder', ladder: [
          { reps: '5', intensity_percent: '85' }, { reps: '3', intensity_percent: '90' },
          { reps: '1', intensity_percent: '95' }, { reps: '5', intensity_percent: '60' } ] } }),
      ex(`${lift} (supplemental)`, 'compound_lift', { sets: '5', reps: '5', intensity_percent: '65', load_percent: '65',
        progression: { lever: 'hold' } }),
      ex('Barbell Row', 'isolation', { sets: '3', reps: '10-15' }))),
  },
  {
    slug: 'team-inseason-2day',
    name: 'Team Sport In-Season — 2 Day',
    coachLine: 'Short, heavy-ish, low-soreness. Keep strength and speed through the season.',
    sportTags: ['football', 'rugby', 'basketball', 'soccer', 'afl', 'netball'],
    methodology: null, level: 'intermediate',
    shape: 'maintain', deload: 'none', weeks: 8,
    days: [
      day(2, 'MD-4 Strength',
        warm('Leg Swing', '1', '10'),
        ex('Back Squat', 'compound_lift', { sets: '3', reps: '3', intensity_percent: '80', load_percent: '80' }),
        ex('Chin-Up', 'isolation', { sets: '3', reps: '5-8' }),
        ex('Broad Jump', 'plyometric', { sets: '3', reps: '3' })),
      day(4, 'MD-2 Speed + Primer',
        ex('Flying Sprint', 'sprint', { reps: '4', distance_meters: 20, intensity_percent: '95' }),
        ex('Barbell Bench Press', 'compound_lift', { sets: '2', reps: '3', intensity_percent: '75', load_percent: '75' })),
    ],
  },
  {
    slug: 'endurance-polarized-5day',
    name: 'Endurance Base — Polarized 5 Day',
    coachLine: 'Mostly easy, a little very hard, almost nothing in between. Volume builds 3 weeks, backs off 1.',
    sportTags: ['running', 'triathlon', 'middle-distance'],
    methodology: 'Polarized', level: 'intermediate',
    shape: 'accumulate', deload: 'every_4', weeks: 8,
    days: [
      day(1, 'Easy Run', ex('Easy Run', 'conditioning', { sets: '1', reps: '1', distance_meters: 8000, notes: 'Conversational pace' })),
      day(2, 'Intervals', ex('1km Repeats', 'conditioning', { reps: '5', distance_meters: 1000, intensity_percent: '92' })),
      day(3, 'Easy Run', ex('Easy Run', 'conditioning', { sets: '1', reps: '1', distance_meters: 6000 })),
      day(5, 'Strides + Easy', ex('Easy Run', 'conditioning', { sets: '1', reps: '1', distance_meters: 6000 }),
        ex('Strides', 'sprint', { reps: '6', distance_meters: 100, progression: { lever: 'hold' } })),
      day(6, 'Long Run', ex('Long Run', 'conditioning', { sets: '1', reps: '1', distance_meters: 14000 })),
    ],
  },
  {
    slug: 'youth-athletic-2day',
    name: 'Youth Athletic Development — 2 Day',
    coachLine: 'Movement quality first. Bodyweight progressions with gentle volume growth.',
    sportTags: ['youth', 'multi-sport'],
    methodology: null, level: 'beginner',
    shape: 'accumulate', deload: 'every_4', weeks: 6,
    days: [
      day(2, 'Movement + Speed',
        warm('A-Skip', '2'), warm('Carioca', '2'),
        ex('Acceleration Sprint', 'sprint', { reps: '5', distance_meters: 20 }),
        ex('Goblet Squat', 'isolation', { sets: '3', reps: '8-12' }),
        ex('Vertical Jump', 'plyometric', { sets: '3', reps: '4' })),
      day(4, 'Strength Skills',
        ex('Push-Up', 'isolation', { sets: '3', reps: '6-10' }),
        ex('Inverted Row', 'isolation', { sets: '3', reps: '6-10' }),
        ex('Single-Leg Hop', 'plyometric', { sets: '2', reps: '5' })),
    ],
  },
]
