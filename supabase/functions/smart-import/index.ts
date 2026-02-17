// smart-import Edge Function (v13 - sport-context-aware parsing)
// Two-pass: detect sport first, then parse with sport-specific rules
// Pre-parsed spreadsheets (SheetJS on frontend) -> Haiku 4.5 for JSON structuring
// PDF/Images -> Sonnet 4.5 for vision/document parsing

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-5'

// ── CORS ────────────────────────────────────────────────────────────────
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

// ── Sport Detection ─────────────────────────────────────────────────────
// Quick local detection from content keywords before sending to AI.
// Returns a sport category that unlocks sport-specific parsing rules.

interface SportSignal {
  sport: string
  category: string // broad category for rule selection
  confidence: number
}

const SPORT_SIGNATURES: Array<{
  category: string
  sport: string
  signals: RegExp[]
  weight: number
}> = [
  // Sprint / Track & Field
  {
    category: 'sprint_track',
    sport: 'Track & Field (Sprints)',
    signals: [
      /\b\d+x\d+x\d+m\b/i,                    // 4x3x60m
      /\b\d+x\d+m\b/i,                          // 3x200m
      /\bblock\s*start/i, /\bflying\s*start/i,  // start types
      /\bwicket/i, /\bsled\s*(pull|drag)/i,
      /\bspeed\s*endurance/i, /\bSE\d?\b/,
      /\bsprint\s*(float|power|bound)/i,
      /\b(GPP|SPP)\b/,
      /\baccel(eration)?\s*(zone|dev)/i,
      /\b(3[- ]?point|4[- ]?point)\s*start/i,
      /\bin[- ]?and[- ]?out/i, /\bSFS\b/,       // sprint-float-sprint
      /\bfly\s*\d+/i,                            // fly 30, flying 20
      /\btempo\s*run/i,
      /\b\d+m\s*(sprint|dash|run)\b/i,
    ],
    weight: 2,
  },
  // Distance Running / XC
  {
    category: 'distance_running',
    sport: 'Distance Running',
    signals: [
      /\b\d+x\d+k?m?\s*@\s*\d+:\d+/i,          // 6x1km @ 3:45
      /\btempo\s*\d+k?m?\b/i,                    // tempo 5km
      /\bfartlek\b/i,
      /\b(easy|recovery)\s*run\b/i,
      /\blong\s*run\b/i,
      /\bstride/i,
      /\b(LT|lactate\s*threshold)\b/i,
      /\bmarathon\s*pace\b/i, /\bMP\b/,
      /\bVO2\s*max\b/i,
      /\b\d+:\d+\/(km|mi)\b/i,                   // pace notation: 4:00/km
      /\bneg(ative)?\s*split/i,
      /\bhill\s*rep/i,
    ],
    weight: 2,
  },
  // Swimming
  {
    category: 'swimming',
    sport: 'Swimming',
    signals: [
      /\b\d+x\d+\s*(FR|BK|BR|FL|IM|Free|Back|Breast|Fly|Stroke|Choice)\b/i,
      /\b(FR|BK|BR|FL|IM)\b/,
      /\b(f\/s|f\/c|b\/c|b\/s)\b/,               // stroke abbreviations
      /\bsendoff\b/i, /\bon\s*\d+:\d+/i,         // on 1:30
      /\b(pull|kick|drill)\s*(set|&|buoy)/i,
      /\b(paddle|fin|snorkel|buoy)\b/i,
      /\bIMO\b/, /\bRIMO\b/,                      // IM Order / Reverse
      /\bdesc(end)?\s*\d/i,                        // desc 1-4
      /\bwarm\s*(up|down)\s*\d+/i,
      /\byard|SCY|SCM|LCM\b/i,                    // pool formats
      /\bDPS\b/i,                                  // distance per stroke
    ],
    weight: 2,
  },
  // Cycling / Triathlon
  {
    category: 'cycling',
    sport: 'Cycling',
    signals: [
      /\bFTP\b/i,
      /\bwatt|W\/kg\b/i,
      /\bTSS\b/i,
      /\bsweet\s*spot\b/i,
      /\bZ[1-7]\s*(interval|ride|effort)/i,
      /\bcadence|RPM\b/i,
      /\btrain(er|erroad)\b/i,
      /\bbrick\b/i,                                // triathlon
      /\bT1\b.*\bT2\b/i,                           // transitions
      /\b(swim|bike|run)\s*->\s*(swim|bike|run)/i, // triathlon sequence
      /\bOWS\b/i,                                  // open water swim
    ],
    weight: 2,
  },
  // Weightlifting / Powerlifting / Strength
  {
    category: 'strength',
    sport: 'Strength Training',
    signals: [
      /\b\d+x\d+\s*@\s*\d+%/i,                   // 5x5 @ 80%
      /\b1RM\b/i, /\b[35]RM\b/i,
      /\bRPE\s*[6-9]\b/i, /\bRIR\b/i,
      /\b(back|front)\s*squat/i,
      /\bdeadlift\b/i, /\bbench\s*press/i,
      /\b(snatch|clean\s*(&|and)\s*jerk)\b/i,
      /\bEMOM\b/i,
      /\btempo\s*\d+-\d+-\d+-\d+/i,               // tempo notation 3-1-2-0
      /\bsuperset\b/i,
      /\b(A1|A2|B1|B2)\b/,                         // superset grouping
      /\baccumulation|intensification\b/i,
      /\bdeload\b/i,
    ],
    weight: 2,
  },
  // CrossFit / Functional Fitness
  {
    category: 'crossfit',
    sport: 'CrossFit',
    signals: [
      /\bAMRAP\b/i, /\bRFT\b/i,
      /\bWOD\b/i, /\bMetCon\b/i,
      /\bFor\s*Time\b/i,
      /\bTabata\b/i,
      /\b21-15-9\b/, /\b15-12-9\b/,               // descending rep schemes
      /\b(T2B|TTB|C2B|CTB|HSPU|MU|DU)\b/,
      /\b(wall\s*ball|thrusters?\s*\/\s*pull)/i,
      /\bRx'?d?\b/i,
      /\bchipper\b/i,
      /\bKBS\b/i,                                   // kettlebell swings
    ],
    weight: 2,
  },
  // Rowing / Erging
  {
    category: 'rowing',
    sport: 'Rowing',
    signals: [
      /\b\d+x\d+m\s*@\s*\d+:\d+\s*split/i,       // 4x2000m @ 2:00 split
      /\bsplit\s*\d+:\d+/i,
      /\bSPM\b/i, /\br\d+\b/,                      // rate / strokes per min
      /\bsteady\s*state\b/i,
      /\b(UT1|UT2|AT|TR|AN)\b/,                     // rowing zones
      /\b2k\b/i, /\b6k\b/i,                         // test distances
      /\b(erg|ergometer|C2|concept\s*2)\b/i,
      /\bdrag\s*factor\b/i,
    ],
    weight: 2,
  },
  // Combat Sports
  {
    category: 'combat',
    sport: 'Combat Sports',
    signals: [
      /\b\d+x\d+\s*min\s*(round|spar)/i,          // 5x3min rounds
      /\bround/i,
      /\bspar(ring)?\b/i,
      /\bpad\s*work\b/i, /\bmitt/i,
      /\bshadow\s*(box|work)/i,
      /\bbag\s*work\b/i, /\bheavy\s*bag\b/i,
      /\bclinch\b/i,
      /\b(boxing|muay\s*thai|MMA|wrestling|BJJ|jiu[- ]?jitsu)\b/i,
    ],
    weight: 2,
  },
  // Team Sports
  {
    category: 'team_sport',
    sport: 'Team Sport',
    signals: [
      /\bSSG\b/i, /\bsmall[- ]?sided\s*game/i,
      /\b\d+v\d+\b/i,                              // 4v4
      /\bCOD\b/i, /\bchange\s*of\s*direction/i,
      /\bRST\b/i,                                   // repeated sprint training
      /\bSAQ\b/i,
      /\b(soccer|football|basketball|rugby|hockey|lacrosse)\b/i,
      /\bpossession\s*drill/i,
      /\bsmall[- ]?game/i,
    ],
    weight: 2,
  },
  // Gymnastics / Calisthenics
  {
    category: 'gymnastics',
    sport: 'Gymnastics / Calisthenics',
    signals: [
      /\b(planche|front\s*lever|back\s*lever|iron\s*cross)\b/i,
      /\bhandstand\b/i, /\bHSPU\b/,
      /\bmuscle[- ]?up/i,
      /\bL[- ]?sit\b/i, /\bV[- ]?sit\b/i,
      /\b(tuck|straddle|full)\s*(planche|lever)/i,
      /\bskin\s*the\s*cat\b/i,
      /\bring\s*(dip|row|work)/i,
      /\bmax\s*hold\b/i, /\b\d+s\s*hold\b/i,
    ],
    weight: 2,
  },
]

function detectSport(content: string): SportSignal | null {
  const scores: Record<string, { sport: string; score: number }> = {}

  for (const sig of SPORT_SIGNATURES) {
    let matchCount = 0
    for (const rx of sig.signals) {
      const matches = content.match(new RegExp(rx.source, rx.flags + 'g'))
      if (matches) matchCount += matches.length
    }
    if (matchCount > 0) {
      scores[sig.category] = {
        sport: sig.sport,
        score: matchCount * sig.weight,
      }
    }
  }

  // Find highest-scoring category
  let best: SportSignal | null = null
  for (const [cat, { sport, score }] of Object.entries(scores)) {
    if (!best || score > best.confidence) {
      best = { sport, category: cat, confidence: score }
    }
  }

  // Require minimum confidence (at least 3 signal matches)
  if (best && best.confidence >= 3) {
    console.log(`[sport-detect] Detected: ${best.sport} (${best.category}) confidence=${best.confidence}`)
    return best
  }

  console.log('[sport-detect] No confident sport detection, using general rules')
  return null
}

// ── Sport-Specific Parsing Rules ─────────────────────────────────────────
// These get injected into the AI prompt when a sport is detected

const SPORT_RULES: Record<string, string> = {
  sprint_track: `
SPORT DETECTED: Sprint / Track & Field.
CRITICAL PARSING RULES FOR THIS SPORT:
- Every distance-based prescription IS an exercise. "4x3x60m" is an exercise, not a label.
- Decompose multi-part notation: "AxBxCm" → name: "Cm Sprint" (or "Cm Dash"), sets: A, reps: "B", distance_meters: C.
  Examples:
    "4x3x60m" → { name: "60m Sprint", sets: 4, reps: "3", distance_meters: 60 }
    "3x200m @ 95%" → { name: "200m Sprint", sets: 3, reps: "1", distance_meters: 200, intensity_percent: 95 }
    "6x150m w/ 8min rest" → { name: "150m Sprint", sets: 6, reps: "1", distance_meters: 150, rest_seconds: 480 }
    "2x3x30m sled pull" → { name: "30m Sled Pull", sets: 2, reps: "3", distance_meters: 30 }
- When only distance + reps given with no "x sets": assume sets=1.
  "3x60m" → { name: "60m Sprint", sets: 1, reps: "3", distance_meters: 60 }
  Unless context clearly shows sets (e.g. grouped with rest between sets).
- Start types become exercise name prefixes: "B 3x60m" → "Block Start 60m Sprint"; "F 3x30m" → "Flying 30m Sprint".
- Drills ARE exercises: "Wickets", "A-Skip", "B-Skip", "Power Pole", "High Start", "3 Point Start", "Falling Starts" → extract as exercises with sets/reps.
- Effort/intensity guides: "95%", "90%", "sub-max" → intensity_percent field. If no explicit intensity on a sprint prescription, assume the coach wants 95%+ effort (do NOT fill in intensity_percent, leave it null to indicate unspecified).
- Rest notation: "3'/8'" means 3min rep rest / 8min set rest → rest_seconds: 180 (rep rest). Include set rest in notes.
  "R=5'" or "r5min" → rest_seconds: 300.
- Speed Endurance (SE) sessions often have longer distances (150m-600m) with incomplete rest.
- Tempo runs in sprint context = low-intensity runs (60-75%), NOT lactate threshold.
- Session types: use "speed" for max velocity, "speed_endurance" for SE, "power" for sled/hills, "technique" for drill-only sessions, "conditioning" for tempo/circuits.
- If there is no explicit "exercise" keyword but there IS a distance prescription, ALWAYS extract it as an exercise. Track coaches write prescriptions, not exercise names.`,

  distance_running: `
SPORT DETECTED: Distance Running / Cross Country.
CRITICAL PARSING RULES FOR THIS SPORT:
- Interval notation: "RepsxDistance @ Pace" → decompose fully.
  Examples:
    "6x1km @ 3:45" → { name: "1km Interval", sets: 1, reps: "6", distance_meters: 1000, notes: "@ 3:45/km pace" }
    "10x400m @ 72s / 90s jog" → { name: "400m Repeat", sets: 1, reps: "10", distance_meters: 400, target_time_seconds: 72, rest_seconds: 90 }
    "4x(4min @ 5K pace / 2min easy)" → { name: "5K Pace Interval", sets: 4, reps: "1", duration_seconds: 240, rest_seconds: 120, notes: "at 5K pace" }
- Continuous runs: "tempo 5km @ 4:00/km" → { name: "Tempo Run", sets: 1, reps: "1", distance_meters: 5000, notes: "@ 4:00/km" }
- Fartlek: "fartlek 8x(2min on/1min off)" → { name: "Fartlek", sets: 8, reps: "1", duration_seconds: 120, rest_seconds: 60 }
- Pyramid/ladder: "400-800-1200-800-400" → each distance is a separate exercise, or a single exercise with notes describing the ladder.
- Easy/recovery runs: "Easy 8km" → { name: "Easy Run", distance_meters: 8000 }
- Long runs: "Long Run 20km" → { name: "Long Run", distance_meters: 20000 }
- Strides: "6x100m strides" → { name: "Strides", sets: 1, reps: "6", distance_meters: 100 }
- Hill reps: "8x200m hill @ hard" → { name: "Hill Repeat", sets: 1, reps: "8", distance_meters: 200, notes: "uphill, hard effort" }
- Pace references ("@ 5K pace", "@ MP") → notes field. Do NOT guess times.
- WU/CD are exercises too: "WU: 2km easy" → { name: "Warm Up Jog", distance_meters: 2000 }`,

  swimming: `
SPORT DETECTED: Swimming.
CRITICAL PARSING RULES FOR THIS SPORT:
- Standard notation: "RepsxDistance Stroke @ Sendoff" → decompose fully.
  Examples:
    "8x100 FR @ 1:30" → { name: "100m Freestyle", sets: 1, reps: "8", distance_meters: 100, notes: "on 1:30 sendoff" }
    "4x200 IM @ 3:00" → { name: "200m IM", sets: 1, reps: "4", distance_meters: 200, notes: "on 3:00 sendoff" }
    "6x50 Fly @ :50" → { name: "50m Butterfly", sets: 1, reps: "6", distance_meters: 50, notes: "on 0:50 sendoff" }
- Nested sets: "4x(4x25 on :25) @ 2:00" → { name: "25m Sprint Set", sets: 4, reps: "4", distance_meters: 25, rest_seconds: 120, notes: "on :25 within set, 2:00 between sets" }
- Stroke abbreviations → full names: FR/Free/f/s→Freestyle, BK/Back/b/c→Backstroke, BR/Breast/b/s→Breaststroke, FL/Fly→Butterfly, IM→Individual Medley, CH/Choice→Choice.
- Kick/Pull/Drill sets ARE exercises: "4x100 Pull @ 1:40" → { name: "100m Pull", ... }; "8x50 Kick @ :55" → { name: "50m Kick", ... }
- Equipment in notes: "w/ paddles", "w/ fins", "pull buoy" → notes field.
- Descend/hold instructions: "desc 1-4, hold 5-8" → notes field.
- WU/MS/CD labels indicate set purpose, not exercise names.
- Sendoff (@ 1:30) is NOT rest. It's the interval clock. Put in notes.
- Distance: use meters unless the program explicitly says yards (SCY/yd).`,

  cycling: `
SPORT DETECTED: Cycling / Triathlon.
CRITICAL PARSING RULES FOR THIS SPORT:
- Interval notation: "RepsxDuration @ Power/Zone" → decompose.
  Examples:
    "3x20min @ FTP" → { name: "FTP Interval", sets: 3, reps: "1", duration_seconds: 1200, intensity_percent: 100, notes: "at FTP" }
    "5x5min @ 110% FTP / 5min easy" → { name: "VO2max Interval", sets: 5, reps: "1", duration_seconds: 300, intensity_percent: 110, rest_seconds: 300 }
    "Z2 2hr" → { name: "Endurance Ride", duration_seconds: 7200, notes: "Zone 2" }
- Power zones: Z1=<55%, Z2=56-75%, Z3=76-90%, Z4=91-105%, Z5=106-120%, Z6=121-150%, Z7=max → put zone in notes AND intensity_percent as midpoint.
- Sweet Spot (SS) = 88-93% FTP → intensity_percent: 90.
- Cadence drills: "4x3min @ 110rpm Z2" → notes: "110rpm cadence, Zone 2".
- Triathlon brick workouts: "45min bike Z2 -> 15min run easy" → TWO exercises: the bike leg and the run leg.
- TSS/IF are training load metrics → notes field if mentioned.
- Duration-based sport: most exercises use duration_seconds, not distance_meters.`,

  strength: `
SPORT DETECTED: Weightlifting / Powerlifting / Strength Training.
CRITICAL PARSING RULES FOR THIS SPORT:
- Standard notation: "SetsxReps @ Load" → decompose fully.
  Examples:
    "5x5 @ 80%" → { name: "Back Squat" (from context), sets: 5, reps: "5", intensity_percent: 80 }
    "3x8-10 @ RPE 8" → { name: "...", sets: 3, reps: "8-10", rpe: 8 }
    "4x6 @ 75%, 90s rest" → { name: "...", sets: 4, reps: "6", intensity_percent: 75, rest_seconds: 90 }
- Olympic lifting notation (Catalyst style): "Exercise - Intensity x Reps x Sets"
    "Snatch - 75% x 2 x 5" → { name: "Snatch", sets: 5, reps: "2", intensity_percent: 75 }
    "C&J - 80% x (1+1) x 3" → { name: "Clean & Jerk", sets: 3, reps: "1+1", intensity_percent: 80, notes: "1 clean + 1 jerk" }
- Complexes: "2+1" means 2 of first movement + 1 of second → reps: "2+1", put explanation in notes.
- Tempo notation (Poliquin): "3-1-X-0" → tempo field. Digits = eccentric-pause-concentric-pause. "X" means explosive.
- Superset pairs: "A1: Pull-ups 3x8 / A2: Dips 3x8" → two separate exercises. Use superset_group or notes to indicate pairing.
- EMOM: "EMOM 10: 2 Clean @ 80%" → { name: "Clean", sets: 10, reps: "2", intensity_percent: 80, notes: "EMOM format" }
- Wave loading: "5,3,1,5,3,1" → reps: "5,3,1,5,3,1" with appropriate sets count.
- Weight can be absolute ("225lbs", "100kg") → weight field. Or percentage ("80%") → intensity_percent.
- RPE scale: 6-10 typically. RIR (Reps In Reserve) = 10 - RPE.
- Common abbreviations: SN=Snatch, C&J=Clean&Jerk, PSn=Power Snatch, PC=Power Clean, FS=Front Squat, BS=Back Squat, OHS=Overhead Squat, DL=Deadlift, PP=Push Press, SLDL=Stiff-Leg Deadlift, RDL=Romanian Deadlift. EXPAND these into full names.`,

  crossfit: `
SPORT DETECTED: CrossFit / Functional Fitness.
CRITICAL PARSING RULES FOR THIS SPORT:
- AMRAP: "AMRAP 12: 10 T2B, 15 WB, 200m Run" → single workout with each movement as an exercise:
    { name: "Toes to Bar", reps: "10" }, { name: "Wall Balls", reps: "15" }, { name: "Run", distance_meters: 200 }
    Set the workout name to "AMRAP 12" and notes on each exercise as needed.
- For Time: "21-15-9 Thrusters/Pull-ups" → each round can be one exercise with reps as the scheme:
    { name: "Thrusters", reps: "21-15-9" }, { name: "Pull-ups", reps: "21-15-9" }
- RFT: "5 RFT: 12 DL, 9 Hang PC, 6 PP" → sets: 5 on each exercise, reps as listed.
- EMOM: "EMOM 10: 2 C&J" → { name: "Clean & Jerk", sets: 10, reps: "2", notes: "EMOM" }
- Tabata: "Tabata Air Squats" → { name: "Air Squats", sets: 8, reps: "max", duration_seconds: 20, rest_seconds: 10, notes: "Tabata: 20s on/10s off" }
- Chipper: long list → each movement is its own exercise, sets: 1, reps as prescribed.
- EXPAND abbreviations: T2B→Toes to Bar, C2B→Chest to Bar Pull-up, WB→Wall Balls, HSPU→Handstand Push-up, MU→Muscle-up, DU→Double Unders, KBS→Kettlebell Swings, DL→Deadlift, PC→Power Clean, PP→Push Press, BJ→Box Jump, S2OH→Shoulder to Overhead, SDHP→Sumo Deadlift High Pull, TGU→Turkish Get-up, GHD→GHD Sit-up.
- Rx weights: "(20/14)" means 20lb for men/14lb for women → notes field.
- "For Time" workouts: set time_cap in workout notes if mentioned.`,

  rowing: `
SPORT DETECTED: Rowing / Erging.
CRITICAL PARSING RULES FOR THIS SPORT:
- Interval notation: "RepsxDistance @ Pace split, Rest"
  Examples:
    "4x2000m @ 2:00 split, r5'" → { name: "2000m Piece", sets: 4, reps: "1", distance_meters: 2000, notes: "@ 2:00/500m split, 5min rest", rest_seconds: 300 }
    "6x500m r3:00" → { name: "500m Interval", sets: 6, reps: "1", distance_meters: 500, rest_seconds: 180 }
    "8x500 / 3'30\" rest" → { name: "500m Repeat", sets: 8, reps: "1", distance_meters: 500, rest_seconds: 210 }
- Time-based: "4x20' / 1'r" → { name: "20min Steady State", sets: 4, duration_seconds: 1200, rest_seconds: 60 }
- Pace is always per 500m: "2:00 split" → notes: "2:00/500m pace".
- Rate (SPM): "r18" or "@ 18spm" → notes field.
- Training zones: UT2 (easy base), UT1 (moderate), AT (threshold), TR (VO2max), AN (anaerobic) → map to notes.
- Distance shorthand: "2k" = 2000m, "6k" = 6000m, "HM" = 21097m.
- Steady State (SS) sessions: "SS 60min r18-20" → { name: "Steady State", duration_seconds: 3600, notes: "rate 18-20 spm" }`,

  combat: `
SPORT DETECTED: Combat Sports (Boxing / MMA / Martial Arts).
CRITICAL PARSING RULES FOR THIS SPORT:
- Round-based training: "RoundsxDuration / Rest"
  Examples:
    "5x3min / 1min rest" → { name: "Rounds" (from context: sparring, bag work, etc.), sets: 5, duration_seconds: 180, rest_seconds: 60 }
    "3x5min sparring / 1min" → { name: "Sparring", sets: 3, duration_seconds: 300, rest_seconds: 60 }
    "8x3min shadow / 1min" → { name: "Shadowboxing", sets: 8, duration_seconds: 180, rest_seconds: 60 }
- Training components → exercise names: "Shadowboxing", "Heavy Bag", "Speed Bag", "Pad Work", "Sparring", "Clinch Work", "Ground Work", "Technique Drill".
- Conditioning circuits: parse like CrossFit/strength (sets x reps).
- Combination drills: "3x3min: jab-cross-hook-cross" → { name: "Jab-Cross-Hook-Cross Combo", sets: 3, duration_seconds: 180 }
- If rounds are the primary unit, use sets for round count and duration_seconds for round length.`,

  team_sport: `
SPORT DETECTED: Team Sport.
CRITICAL PARSING RULES FOR THIS SPORT:
- Sprint drills with distance: "6x40m sprint w/ COD" → { name: "40m Sprint with COD", sets: 6, reps: "1", distance_meters: 40, notes: "change of direction" }
- Small-sided games: "4v4 SSG 4x4min / 3min rest" → { name: "4v4 Small-Sided Game", sets: 4, duration_seconds: 240, rest_seconds: 180 }
- Repeated sprint training: "6x(6x20m) / 30s/4min" → { name: "20m Repeated Sprint", sets: 6, reps: "6", distance_meters: 20, rest_seconds: 30, notes: "30s between reps, 4min between sets" }
- Agility/SAQ drills: extract as exercises with descriptive names.
- Possession drills, tactical exercises: use descriptive names, duration_seconds for timed work.
- Fitness testing: "Yo-Yo IR1", "Beep Test", "30-15 IFT" → exercise names.
- Warm-up protocols (FIFA 11+, RAMP) → individual components as exercises.`,

  gymnastics: `
SPORT DETECTED: Gymnastics / Calisthenics.
CRITICAL PARSING RULES FOR THIS SPORT:
- Timed holds: "4x20s L-sit hold" → { name: "L-Sit Hold", sets: 4, reps: "1", duration_seconds: 20 }
- Max reps: "5x max HSPU" → { name: "Handstand Push-up", sets: 5, reps: "max" }
- Skill progressions: note the progression level: "Tuck Planche Hold 4x10s" → { name: "Tuck Planche Hold", sets: 4, duration_seconds: 10 }
- Ring work: "3x8 Ring Muscle-ups" → { name: "Ring Muscle-up", sets: 3, reps: "8" }
- EXPAND abbreviations: HSPU→Handstand Push-up, MU→Muscle-up, FL→Front Lever, BL→Back Lever, HS→Handstand, P2HS→Press to Handstand.
- Combination of holds + reps common: "3x(5 strict MU + 15s ring support hold)" → two exercises or compound notes.
- BW (bodyweight) exercises: don't put weight unless external load is specified (e.g., "weighted pull-up +20kg").`,
}

// General rules used when no sport is detected
const GENERAL_SPORT_RULES = `
NO SPECIFIC SPORT DETECTED. Use these general rules:
- Look for context clues to identify the sport: distances suggest running/swimming/sprints, percentages suggest strength, rounds suggest combat, zones suggest cycling.
- When you see "AxBxCm" patterns (e.g., "4x3x60m"), decompose: sets=A, reps=B, distance_meters=C, name="Cm [activity]".
- When you see "AxB @ C%" patterns, decompose: sets=A, reps=B, intensity_percent=C.
- EXPAND all common abbreviations into full exercise names.
- Every prescription that describes physical activity IS an exercise — extract it.`

// ── Prompts ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a training program parser. Output ONLY valid JSON. No markdown, no code fences, no commentary.
CRITICAL: You must extract EVERY exercise from EVERY workout/session. Never return an empty exercises array when training prescriptions exist in the data. A "prescription" is ANY instruction that tells an athlete what physical activity to perform — this includes distances, intervals, drills, rounds, holds, and traditional exercises.`

function buildSchema(sportContext: string): string {
  return `Return a JSON object with this structure:
{
  "programName": "string",
  "durationWeeks": number,
  "periodization": "linear"|"undulating"|"block"|"conjugate"|"mixed",
  "sport": "string or null",
  "blocks": [{
    "name": "string",
    "blockType": "string or null",
    "weeks": [{
      "weekNumber": number,
      "name": "string",
      "workouts": [{
        "name": "string",
        "dayOfWeek": 1-7,
        "sessionType": "speed"|"strength"|"power"|"hypertrophy"|"conditioning"|"endurance"|"recovery"|"technique"|"competition"|"mixed"|null,
        "exercises": [{
          "name": "string (REQUIRED - use a clear, descriptive name)",
          "sets": number,
          "reps": "string",
          "distance_meters": number,
          "duration_seconds": number,
          "intensity_percent": number,
          "rest_seconds": number,
          "target_time_seconds": number,
          "tempo": "string",
          "rpe": number,
          "weight": "string",
          "category": "string",
          "notes": "string"
        }]
      }]
    }]
  }]
}

RULES:
1. Extract ALL exercises for every workout. Each exercise MUST have a descriptive "name". If sets/reps are not clear, use reasonable defaults (sets: 1, reps: "1").
2. DECOMPOSE compact notation into structured fields. "4x3x60m" is NOT a name — it must be parsed into name + sets + reps + distance_meters. See sport-specific rules below.
3. Group weeks into training blocks/phases if detectable (GPP, SPP, Competition, Accumulation, Intensification, Peaking, Hypertrophy, Strength, Power, Taper). If no phases are detectable, use one block.
4. blockType examples: "hypertrophy", "strength", "power", "peaking", "gpp", "spp", "competition", "recovery".
5. weekNumber must be sequential within each block starting at 1.
6. dayOfWeek: 1=Monday, 7=Sunday. If specific days aren't clear, assign workouts sequentially starting from Monday.
7. sessionType: classify each workout's primary focus based on the sport context.
8. Exercise fields — include ONLY when data exists (omit null/empty fields):
   - name: REQUIRED. Clear, human-readable name. EXPAND abbreviations. Never use raw notation as the name.
   - sets: number of sets (default 1)
   - reps: string for rep count or range ("5", "8-10", "max", "3", "2+1")
   - distance_meters: numeric distance in meters (60, 200, 1000, 5000)
   - duration_seconds: time-based work in seconds (180 for 3min)
   - intensity_percent: percentage of max (80 for 80%, 95 for 95%)
   - rest_seconds: rest between sets/reps in seconds
   - target_time_seconds: target completion time in seconds
   - tempo: lifting tempo notation ("3-1-X-0")
   - rpe: rate of perceived exertion (1-10 scale)
   - weight: absolute load ("225lbs", "100kg")
   - category: movement category ("sprint", "drill", "interval", "compound_lift", "isolation", "plyometric", "mobility", "warm_up", "cool_down")
   - notes: additional context (pace targets, equipment, sendoff intervals, coaching cues)
9. Detect the sport and periodization from context. Set the "sport" field.
10. Be CONSISTENT: given the same input data, always produce the same output structure and the same number of workouts and exercises.
11. Only extract blocks/weeks that contain actual training content (sessions with exercises). Do NOT create blocks for placeholder/empty sections.

${sportContext}

Output ONLY the JSON.`
}

// ── Call Anthropic Messages API ─────────────────────────────────────────
async function callClaude(
  model: string,
  maxTokens: number,
  messages: Array<{ role: string; content: any }>,
): Promise<{ text: string; usage: any; stopReason: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system: SYSTEM,
      messages,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`Claude API ${res.status}:`, errBody.substring(0, 500))
    throw new Error(`Claude API ${res.status}: ${errBody.substring(0, 300)}`)
  }

  const data = await res.json()
  const stopReason = data.stop_reason
  const usage = data.usage

  console.log(`Claude response: model=${model}, stop_reason=${stopReason}, input=${usage?.input_tokens}, output=${usage?.output_tokens}`)

  if (stopReason === 'max_tokens') {
    throw new Error(
      `Response truncated at ${usage?.output_tokens ?? '?'} tokens (limit: ${maxTokens}). Program too large for single pass.`,
    )
  }

  const textBlock = data.content?.find((b: any) => b.type === 'text')
  if (!textBlock?.text) {
    throw new Error('No text in Claude response')
  }

  return { text: textBlock.text, usage, stopReason }
}

// ── Extract JSON from AI text ───────────────────────────────────────────
function extractJSON(raw: string): any {
  let text = raw.trim()

  // Strip markdown code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) text = fenced[1].trim()

  // Extract outermost { ... }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    text = text.substring(start, end + 1)
  }

  return JSON.parse(text) // throws on invalid JSON
}

// ── Main handler ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await sb.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ── Parse request ──
    const { fileContent: rawContent, fileType, fileName, preParsed, coachAbbreviations } = await req.json()
    if (!rawContent || !fileType || !fileName) {
      return json({ error: 'Missing fileContent, fileType, or fileName' }, 400)
    }
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    console.log(`[smart-import] file=${fileName} type=${fileType} preParsed=${preParsed} len=${rawContent.length}`)

    // ── Coach Abbreviation Pre-Expansion ──
    // Replace known coach shorthand in text BEFORE sending to AI
    let fileContent = rawContent
    const expandedAbbrs: string[] = []

    if (coachAbbreviations && typeof coachAbbreviations === 'object' && preParsed) {
      // Sort by length descending to prevent partial matches (e.g., "FEF60" before "FE")
      const sorted = Object.entries(coachAbbreviations as Record<string, string>)
        .sort((a, b) => b[0].length - a[0].length)

      for (const [abbr, expansion] of sorted) {
        const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
        if (regex.test(fileContent)) {
          fileContent = fileContent.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), expansion)
          expandedAbbrs.push(abbr)
        }
      }

      if (expandedAbbrs.length > 0) {
        console.log(`[smart-import] Pre-expanded ${expandedAbbrs.length} abbreviations: ${expandedAbbrs.join(', ')}`)
      }
    }

    // ── Build glossary prompt section (for AI context, especially PDFs/images) ──
    let glossaryPrompt = ''
    if (coachAbbreviations && Object.keys(coachAbbreviations).length > 0) {
      const entries = Object.entries(coachAbbreviations as Record<string, string>)
        .map(([a, e]) => `${a} = ${e}`)
        .join(', ')
      glossaryPrompt = `\n\nCOACH PERSONAL ABBREVIATIONS (OVERRIDE sport defaults — always use these expansions):\n${entries}\n`
    }

    // ── Sport Detection (local, fast) ──
    // For pre-parsed text we can detect sport directly from content.
    // For PDF/images, we rely on filename hints + let the AI detect.
    const sportSignal = preParsed ? detectSport(fileContent) : detectSport(fileName)
    const sportRules = sportSignal
      ? (SPORT_RULES[sportSignal.category] || GENERAL_SPORT_RULES)
      : GENERAL_SPORT_RULES
    const schema = buildSchema(sportRules)

    // ── Route to correct model ──
    let result: { text: string; usage: any; stopReason: string }
    let modelUsed: string

    if (preParsed) {
      // Spreadsheet text from SheetJS -> Haiku (fast, cheap)
      modelUsed = HAIKU
      result = await callClaude(HAIKU, 32000, [
        {
          role: 'user',
          content: `Parse this spreadsheet data from "${fileName}":\n\n${fileContent}\n\n${schema}${glossaryPrompt}`,
        },
      ])
    } else {
      // PDF or image -> Sonnet with vision/document blocks
      modelUsed = SONNET
      const contentBlocks: any[] = []

      if (fileType === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileContent },
        })
      } else if (fileType.startsWith('image/')) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: fileType, data: fileContent },
        })
      } else {
        contentBlocks.push({
          type: 'text',
          text: `File "${fileName}" (${fileType}), base64 preview:\n${fileContent.substring(0, 3000)}`,
        })
      }

      contentBlocks.push({
        type: 'text',
        text: `Extract the training program from "${fileName}".\n\n${schema}${glossaryPrompt}`,
      })

      result = await callClaude(SONNET, 32000, [
        { role: 'user', content: contentBlocks },
      ])
    }

    // ── Parse the JSON ──
    let importResult: any
    try {
      importResult = extractJSON(result.text)
    } catch (parseErr) {
      console.error('[smart-import] JSON parse failed. Raw (first 1000):', result.text.substring(0, 1000))
      return json({
        error: 'Failed to parse AI response as JSON',
        raw: result.text.substring(0, 500),
      }, 500)
    }

    // Validate required fields
    if (!importResult.programName) {
      return json({ error: 'AI response missing programName' }, 500)
    }
    if (!Array.isArray(importResult.blocks) || importResult.blocks.length === 0) {
      // Backward compat: if AI returned flat weeks[] instead of blocks[], wrap in a single block
      if (Array.isArray(importResult.weeks) && importResult.weeks.length > 0) {
        importResult.blocks = [{
          name: importResult.programName,
          blockType: null,
          weeks: importResult.weeks,
        }]
        delete importResult.weeks
      } else {
        return json({ error: 'AI response missing blocks[] or weeks[]' }, 500)
      }
    }

    // ── Log (non-blocking) ──
    const tokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
    try {
      await sb.from('ai_plan_logs').insert({
        coach_id: user.id,
        tier: 'import',
        action: 'smart_import',
        prompt: `${fileName} (${fileType}) [${preParsed ? 'Haiku' : 'Sonnet'}]`,
        response: JSON.stringify(importResult).substring(0, 5000),
        model: modelUsed,
        tokens_used: tokens,
      } as any)
    } catch (e) {
      console.warn('[smart-import] ai_plan_logs insert failed (non-fatal):', e)
    }

    return json({
      success: true,
      importResult,
      model: modelUsed,
      usage: result.usage,
      detectedSport: sportSignal?.sport ?? importResult.sport ?? null,
      sportCategory: sportSignal?.category ?? null,
      sportConfidence: sportSignal?.confidence ?? 0,
      expandedAbbreviations: expandedAbbrs,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[smart-import] ERROR:', msg)
    if (err instanceof Error && err.stack) console.error(err.stack)
    return json({ error: msg || 'Internal server error' }, 500)
  }
})
