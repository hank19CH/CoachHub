// smart-import Edge Function (v27 - Anti-column-shifting guardrails, literal cell reading)
// Step 1: Classify document type (single_session / evolving_session / block_plan / season_plan)
// Step 2: Sport detection → sport-specific parsing rules
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

SIMPLE NAMING RULE FOR SPRINT/TRACK EXERCISES:
The exercise "name" should be the ACTIVITY TYPE, NOT the full prescription. Distance goes in distance_meters, sets in sets, reps in reps. Do NOT bake distance into the exercise name.

- If the Note column has a drill/start code (e.g. "PP", "HS", "B", "F", "3P", "SFS"), the exercise name is the EXPANDED drill name: "Push-up Position Start", "High Start", "Block Start", "Flying Start", "3-Point Start", "Sprint-Float-Sprint". The raw_name is the code ("PP", "HS", etc.).
- If the Note column is null/empty AND distance <= 400m, the exercise name is "Sprint". raw_name is null.
- If the Note column is null/empty AND distance > 400m, the exercise name is "Run". raw_name is null.
- If the Note has a descriptive modifier (e.g. "sled pull", "wickets"), the exercise name is that modifier expanded: "Sled Pull", "Wickets".
- Distance ALWAYS goes in the distance_meters field, NOT in the exercise name. Never write "60m Sprint" — write name: "Sprint", distance_meters: 60.

DECOMPOSITION RULES:
- "AxBxCm" → sets: A, reps: "B", distance_meters: C. Example: "4x3x60m" → sets: 4, reps: "3", distance_meters: 60
- "AxCm" with no middle multiplier → reps: "A", distance_meters: C. (sets null unless context says otherwise)
- "3x200m @ 95%" → reps: "3", distance_meters: 200, intensity_percent: 95

CONCRETE EXAMPLES:
  {"Set": null, "Rep": 4, "Distance": 10, "Note": "PP"}
  → { "raw_name": "PP", "name": "Push-up Position Start", "reps": "4", "distance_meters": 10 }

  {"Set": 4, "Rep": 4, "Distance": 40, "Note": null}
  → { "raw_name": null, "name": "Sprint", "sets": "4", "reps": "4", "distance_meters": 40 }

  {"Set": null, "Rep": 2, "Distance": 60, "Note": "20EFE"}
  → { "raw_name": "20EFE", "name": "20m Easy-Fast-Easy", "reps": "2", "distance_meters": 60 }

  {"Set": null, "Rep": 3, "Distance": 60, "Note": null}
  → { "raw_name": null, "name": "Sprint", "reps": "3", "distance_meters": 60 }

OTHER RULES:
- Every distance-based prescription IS an exercise. Track coaches write prescriptions, not exercise names.
- Drills ARE exercises: "Wickets", "A-Skip", "B-Skip" → extract as exercises with sets/reps.
- Rest notation: "3'/8'" → rest_seconds: 180 (rep rest). Set rest in notes.
- Session types: "speed" for max velocity, "speed_endurance" for SE, "power" for sled/hills, "technique" for drill-only, "conditioning" for tempo/circuits.
- Tempo runs in sprint context = low-intensity runs (60-75%), NOT lactate threshold.
- CRITICAL: Sprint data is intentionally sparse. When a field is null/empty, leave it null. Do NOT shift values between columns. A sprinter doing "2 reps of 60m" is valid. "60 reps" is NOT valid.`,

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
- Common abbreviations: SN=Snatch, C&J=Clean&Jerk, PSn=Power Snatch, PC=Power Clean, FS=Front Squat, BS=Back Squat, OHS=Overhead Squat, DL=Deadlift, PP=Push Press, SLDL=Stiff-Leg Deadlift, RDL=Romanian Deadlift. Put the abbreviation in raw_name, the expanded name in name.`,

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
- EXPAND abbreviations in "name", preserve original in "raw_name": T2B→Toes to Bar, C2B→Chest to Bar Pull-up, WB→Wall Balls, HSPU→Handstand Push-up, MU→Muscle-up, DU→Double Unders, KBS→Kettlebell Swings, DL→Deadlift, PC→Power Clean, PP→Push Press, BJ→Box Jump, S2OH→Shoulder to Overhead, SDHP→Sumo Deadlift High Pull, TGU→Turkish Get-up, GHD→GHD Sit-up.
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
- EXPAND abbreviations in "name", preserve original in "raw_name": HSPU→Handstand Push-up, MU→Muscle-up, FL→Front Lever, BL→Back Lever, HS→Handstand, P2HS→Press to Handstand.
- Combination of holds + reps common: "3x(5 strict MU + 15s ring support hold)" → two exercises or compound notes.
- BW (bodyweight) exercises: don't put weight unless external load is specified (e.g., "weighted pull-up +20kg").`,
}

// General rules used when no sport is detected
const GENERAL_SPORT_RULES = `
NO SPECIFIC SPORT DETECTED. Use these general rules:
- Look for context clues to identify the sport: distances suggest running/swimming/sprints, percentages suggest strength, rounds suggest combat, zones suggest cycling.
- When you see "AxBxCm" patterns (e.g., "4x3x60m"), decompose: sets=A, reps=B, distance_meters=C, name="Cm [activity]".
- When you see "AxB @ C%" patterns, decompose: sets=A, reps=B, intensity_percent=C.
- EXPAND all common abbreviations into full exercise names in the "name" field.
- Put the coach's original exercise name/abbreviation (NOT the full prescription) in "raw_name".
- Every prescription that describes physical activity IS an exercise — extract it.`

// ── Prompts ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a training program parser. Output ONLY valid JSON. No markdown, no code fences, no commentary.
CRITICAL: You must extract EVERY exercise from EVERY workout/session. Never return an empty exercises array when training prescriptions exist in the data. A "prescription" is ANY instruction that tells an athlete what physical activity to perform — this includes distances, intervals, drills, rounds, holds, and traditional exercises.

MOST IMPORTANT RULE — LITERAL COLUMN READING:
When data comes from a spreadsheet, each column maps to EXACTLY ONE output field. Read each cell LITERALLY.
If a cell is null/empty, that field is null in the output. DO NOT shift values from adjacent columns.
Training data is intentionally sparse. Empty cells are VALID — they mean the coach chose not to specify that field, NOT that data shifted over. Do NOT try to be helpful by filling in gaps. Just read what is there.

STEP 1 — CLASSIFY THE DOCUMENT TYPE before extracting data.
Examine the structure and determine which of the four types it is:

single_session
  One workout. No week columns. One set of prescriptions for all exercises.

evolving_session
  A single named session where the same exercises appear with DIFFERENT
  prescriptions for each week. Key signals:
  - A "Week" column with integer values (1, 2, 3, 4) repeating per exercise
  - A "Duration: N Weeks" header
  - Set columns that change values across week groups
  IMPORTANT: This is ONE session run repeatedly, not multiple sessions.

block_plan
  Multiple distinct named sessions (e.g. Session A, Session B, or separate
  tabs/sheets), each potentially evolving across weeks.

season_plan
  Multiple named phases across many weeks or months (e.g. GPP, SPP, PreComp,
  Competition, Taper). Key signals:
  - Date-stamped weekly rows spanning months
  - Named competition events or meets
  - Multiple session types per day (Speed, Tempo, Weights, etc.)
  - Volume tracking across the full season

Include your classification in the output JSON:
  "detected_plan_type": "block_plan",
  "plan_type_confidence": 0.9,
  "classification_reasoning": "Brief explanation of why"

For evolving_session, use a DIFFERENT output format (see schema below).`

function buildSchema(sportContext: string): string {
  return `Return a JSON object. The structure DEPENDS on the detected_plan_type:

=== FOR single_session, block_plan, season_plan ===
{
  "detected_plan_type": "block_plan",
  "plan_type_confidence": 0.9,
  "classification_reasoning": "string",
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
        "description": "string (optional — coaching instructions, tips, or general notes for this workout session)",
        "dayOfWeek": 1-7,
        "sessionType": "speed"|"strength"|"power"|"hypertrophy"|"conditioning"|"endurance"|"recovery"|"technique"|"competition"|"mixed"|null,
        "exercises": [{
          "raw_name": "string (REQUIRED - the exercise NAME as written by the coach, NOT the full prescription line)",
          "name": "string (REQUIRED - your human-readable interpretation with abbreviations expanded)",
          "sets": "string (number or range like '3' or '3-4')",
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
          "notes": "string",
          "is_section_header": "boolean (default false — set true ONLY for section/group headings like 'Warm-Up', 'Core', 'Main Set', 'Cool-Down' that are NOT actual exercises)"
        }]
      }]
    }]
  }]
}

=== FOR evolving_session ONLY ===
{
  "detected_plan_type": "evolving_session",
  "plan_type_confidence": 0.95,
  "classification_reasoning": "string",
  "programName": "string",
  "durationWeeks": number,
  "periodization": "linear"|"undulating"|"block"|"conjugate"|"mixed",
  "sport": "string or null",
  "session_name": "string (name of the single session)",
  "evolution_weeks": number,
  "exercises": [{
    "order": number,
    "raw_name": "string (REQUIRED - exercise NAME as written by coach, not the full prescription)",
    "name": "string (REQUIRED - human-readable interpretation)",
    "rest_seconds": number,
    "superset_group": "string or null",
    "notes": "string",
    "is_section_header": "boolean (default false — set true ONLY for section/group headings like 'Warm-Up', 'Core', 'Main Set', 'Cool-Down' that are NOT actual exercises)",
    "weeks": [{
      "week_number": number,
      "sets": "string (number or range like '3' or '3-4')",
      "reps": "string",
      "load_percent": number,
      "weight": "string"
    }]
  }]
}

RULES:
1. DUAL NAME FIELDS: Every exercise MUST have both "raw_name" and "name".
   - "raw_name": The EXERCISE NAME as written by the coach — just the name/abbreviation, NOT the full prescription with sets, reps, distances, percentages, or rest periods. Strip out all numeric prescription data.
     Examples of correct raw_name values: "PP", "BB RDL", "HS", "FR", "DB B/O Row", "Back Squat", "Sled Pull", "A-Skip", "WU", "C&J".
     Examples of WRONG raw_name values: "3x60m Sprint" (too much — should be just the name part), "5x5 @ 80% Back Squat" (prescription data included), "8x100 FR @ 1:30" (full prescription).
   - "name": Your best interpretation as a clear, human-readable exercise name. Expand abbreviations, add distance context where helpful. Examples: "Push Press", "Barbell Romanian Deadlift", "60m Sprint", "100m Freestyle", "Dumbbell Bent-Over Row".
   - When the coach already wrote a clear, full exercise name (e.g., "Back Squat"), both raw_name and name should be the same: "Back Squat".
   - When the coach wrote an abbreviation (e.g., "PP"), raw_name is "PP" and name is "Push Press".
   - The prescription details (sets, reps, distance, intensity, rest) go into their respective structured fields, NOT into raw_name.
2. DECOMPOSE compact notation into structured fields. "4x3x60m" is NOT a name — it must be parsed into name + sets + reps + distance_meters. See sport-specific rules below.
3. COMPLETE BLOCK EXTRACTION: Group weeks into training blocks/phases if detectable. You MUST scan the ENTIRE document and extract ALL blocks/phases — do NOT stop after 2-3 blocks. Common phase names: GPP, SPP, Competition/Comp, All-Schools, Xmas/Holiday, Pre-Season, Accumulation, Intensification, Peaking, Hypertrophy, Strength, Power, Taper. If the data has 5 phases, you must output 5 blocks. If no phases are detectable, use one block.
4. blockType examples: "hypertrophy", "strength", "power", "peaking", "gpp", "spp", "competition", "recovery".
5. weekNumber must be sequential within each block starting at 1.
6. dayOfWeek: 1=Monday, 7=Sunday. If specific days aren't clear, assign workouts sequentially starting from Monday.
7. sessionType: classify each workout's primary focus based on the sport context.
8. Exercise fields — include ONLY when data exists (omit null/empty fields):
   - raw_name: REQUIRED. The exercise name/abbreviation as the coach wrote it (NOT the full prescription line).
   - name: REQUIRED. Clear, human-readable ACTIVITY TYPE. Expand abbreviations. Do NOT embed distances, sets, reps, or other prescription data in the name — those have their own fields. For sprint/running exercises with no modifier: "Sprint" (<=400m) or "Run" (>400m).
   - sets: string for set count or range ("3", "3-4", "4-5"). Preserve ranges when the coach wrote them.
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
12. SECTION HEADERS: If the document organizes exercises under section headings (e.g., "Warm-Up", "Core Work", "Cardio", "Resistance", "Main Set", "Cool-Down", "Mobility"), create an exercise entry for each section heading with is_section_header: true and name set to the heading text. All other fields should be omitted. Place section headers in the correct order among exercises to maintain the document's structure.
13. WORKOUT DESCRIPTION: If the document contains general instructions, coaching tips, notes, or guidelines that apply to the entire workout/session (not to a specific exercise), capture them in the workout's description field. Example: "Complete all exercises with proper form. Rest as needed between sections." goes into description.
14. SPREADSHEET COLUMN MAPPING: When data comes from a spreadsheet with labeled columns, each column maps to exactly ONE output field. NEVER shift values between columns. If a column has null, the corresponding output field is null/omitted. Training programs are intentionally sparse. A null "Set" column means the coach did not specify sets — do NOT borrow from the "Rep" column. A null "Note" column means no modifier — it is a plain exercise.
15. NEVER DEDUPLICATE EXERCISES: Each data row in the spreadsheet is a separate exercise that MUST appear in the output. If the same drill (e.g. "HS" / High Start) appears in BOTH Speed 1 and Speed 3 for the same week, output it in BOTH sessions — they are independent exercises. Do NOT skip, merge, or omit exercises because they look similar to exercises in another session. Count the data rows per session and verify your output has the same count.

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
    const { fileContent: rawContent, fileType, fileName, preParsed, coachAbbreviations, coachSport, coachPlanType, coachTrainingFocus } = await req.json()
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
      glossaryPrompt = `\n\nCOACH PERSONAL ABBREVIATIONS (OVERRIDE sport defaults — always use these expansions in the "name" field, preserve abbreviation in "raw_name"):\n${entries}\n`
    }

    // ── Sport Detection (local, fast — coach override wins) ──
    let sportSignal: SportSignal | null = null
    if (coachSport && coachSport !== 'auto' && SPORT_RULES[coachSport]) {
      // Coach told us the sport — skip regex detection, use directly
      const sportLabel = SPORT_SIGNATURES.find(s => s.category === coachSport)?.sport ?? coachSport
      sportSignal = { sport: sportLabel, category: coachSport, confidence: 100 }
      console.log(`[sport-detect] Coach override: ${coachSport} → ${sportLabel}`)
    } else {
      // Auto-detect from content
      sportSignal = preParsed ? detectSport(fileContent) : detectSport(fileName)
    }
    const sportRules = sportSignal
      ? (SPORT_RULES[sportSignal.category] || GENERAL_SPORT_RULES)
      : GENERAL_SPORT_RULES
    const schema = buildSchema(sportRules)

    // ── Coach Context Hints (injected into prompt) ──
    let coachContextHints = ''
    if (coachPlanType && coachPlanType !== 'auto') {
      coachContextHints += `\nCOACH INDICATED PLAN TYPE: "${coachPlanType}". Give this classification confidence >= 0.85 unless the document structure clearly contradicts it.\n`
    }
    if (coachTrainingFocus && coachTrainingFocus !== 'auto') {
      coachContextHints += `\nCOACH INDICATED TRAINING FOCUS: "${coachTrainingFocus}". Use this to guide sessionType classification for workouts.\n`
    }
    if (coachContextHints) {
      console.log(`[smart-import] Coach context: sport=${coachSport ?? 'auto'} planType=${coachPlanType ?? 'auto'} focus=${coachTrainingFocus ?? 'auto'}`)
    }

    // ── Route to correct model ──
    let result: { text: string; usage: any; stopReason: string }
    let modelUsed: string

    if (preParsed) {
      // Spreadsheet JSON from SheetJS -> Haiku (fast, cheap)
      modelUsed = HAIKU
      result = await callClaude(HAIKU, 32000, [
        {
          role: 'user',
          content: `Parse this training program spreadsheet: "${fileName}"

HOW TO READ THIS DATA:
The spreadsheet has been pre-parsed into JSON. Each row is a JSON object where keys are column headers and values are cell contents. A "Columns:" line lists all column headers in order.

CRITICAL RULES FOR READING THE JSON:
1. null = empty cell. It is INTENTIONALLY empty. DO NOT shift, borrow, or infer data from adjacent columns to fill it.
   {"Sets": null, "Reps": 4, "Distance": 10, "Note": "PP"} means: sets=null, reps=4, distance=10, note=PP.
   WRONG: moving Reps→Sets, Distance→Reps, Note→Distance. That destroys the data.
2. Each column has ONE fixed meaning. Read LITERALLY what is there. If a cell is null, output null for that field. Training data is intentionally sparse — coaches leave fields blank on purpose (e.g. no sets needed, or no modifier note for a plain sprint). Empty is valid, not an error.
3. Keys like "_col3", "_col5" are columns the coach left unlabeled. These often contain IMPORTANT exercise data (reps, distances, intensities, rest periods). You MUST figure out what each _col means by examining the data patterns.
4. The same column can serve different purposes in different rows. A column that holds a session type name in one row might hold an exercise prescription number in the next.

ANTI-SHIFTING RULE (THIS IS THE MOST IMPORTANT RULE):
NEVER move a value from one column into a different output field. The column-to-field mapping is FIXED:
- Set column → "sets" field ONLY
- Rep column → "reps" field ONLY
- Distance column → "distance_meters" field ONLY
- Note column → "raw_name" field ONLY
If Set is null, output sets as null. Do NOT put the Rep value into sets.
If Rep is null, output reps as null. Do NOT put the Distance value into reps.
If Note is null, output raw_name as null and name as the activity type (e.g. "Sprint" for <=400m, "Run" for >400m). Do NOT put the distance in the name — it belongs in distance_meters.
EVERY column maps to EXACTLY ONE output field. No exceptions. No "smart" inference.

PRE-GROUPED SEASON PLAN DATA:
If the data begins with "PRE-GROUPED SEASON PLAN DATA", exercises are ALREADY separated by week and session.
Each session lists its exercises with fields: Set, Rep, Distance, Note.
Map these fields EXACTLY:
- "Set" → output "sets". If absent, OMIT (do NOT guess or default to 1).
- "Rep" → output "reps". DO NOT put this into "sets".
- "Distance" → output "distance_meters". DO NOT put this into "reps".
- "Note" → output "raw_name". This is the drill/start type abbreviation. If absent, it's a plain sprint.
- The session name (e.g. "Speed 1") → output as the workout "name".
- The day in parentheses (e.g. "TUESDAY") → use for dayOfWeek mapping.

CRITICAL RULES for pre-grouped data:
1. Output EXACTLY the same number of exercises listed for each session. If it says "3 exercises", output 3.
2. NEVER move exercises between sessions. Each session's exercises are independent.
3. Each numbered exercise line maps to exactly ONE exercise object.
4. Expand abbreviations in "Note" to human-readable names. PP=Push-up Position Start, HS=High Start, 3P=Three-Point Start, B=Block Start, 20EFE=20m Easy-Fast-Easy, 20FEF=20m Fast-Easy-Fast, LA20/LA30/LA40/LA50=Limited Acceleration (20m/30m/40m/50m approach), FLY=Flying Sprint, BU=Build-Up, FD=Full Drive.

EXAMPLES from pre-grouped data:
  {"Rep":4,"Distance":10,"Note":"PP"}
  → { "raw_name": "PP", "name": "Push-up Position Start", "reps": "4", "distance_meters": 10 }

  {"Set":4,"Rep":4,"Distance":40}
  → { "raw_name": null, "name": "Sprint", "sets": "4", "reps": "4", "distance_meters": 40 }

  {"Rep":1,"Distance":50,"Note":"LA20"}
  → { "raw_name": "LA20", "name": "20m Limited Acceleration Sprint", "reps": "1", "distance_meters": 50 }

SEASON PLAN GRID LAYOUT (for non-pre-grouped data):
If the data is NOT pre-grouped, columns may be organized in day groups (TUESDAY_*, THURSDAY_*, SATURDAY_*).
- LEFT COLUMNS: Week identifiers (dates, week numbers, phase names). CRITICAL: Scan the ENTIRE first column for phase/block names. You MUST extract ALL phases/blocks.
- "*_Set" → "sets", "*_Rep" → "reps", "*_Distance" → "distance_meters", "*_Note" → "raw_name", "*_Volume" → IGNORE.
- Each day group maps to the session type for that day. NEVER shift values between columns.

MULTI-SHEET SEASON PLANS: If the data begins with "DOCUMENT STRUCTURE: Multi-sheet season plan", the WEEKLY SCHEDULE maps weeks to session types, and each detail sheet contains exercises for one session type. Extract exercises ONLY from detail sheets. Never treat session type names as exercises.

DATA:
${fileContent}

${schema}${glossaryPrompt}${coachContextHints}`,
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
        text: `Extract the training program from "${fileName}".\n\n${schema}${glossaryPrompt}${coachContextHints}`,
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

    // Extract plan type classification from AI response
    const detectedPlanType = importResult.detected_plan_type || 'block_plan'
    const planTypeConfidence = importResult.plan_type_confidence ?? 0.5
    console.log(`[smart-import] Plan type: ${detectedPlanType} (confidence: ${planTypeConfidence})`)

    // Validate required fields
    if (!importResult.programName) {
      return json({ error: 'AI response missing programName' }, 500)
    }

    // Evolving session uses a different structure (exercises[] with weeks[], no blocks[])
    const isEvolving = detectedPlanType === 'evolving_session'
      && Array.isArray(importResult.exercises)
      && importResult.exercises.length > 0

    if (!isEvolving) {
      // Standard block-based validation for single_session, block_plan, season_plan
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
    }

    // Ensure detectedPlanType and planTypeConfidence are on the importResult
    importResult.detectedPlanType = detectedPlanType
    importResult.planTypeConfidence = planTypeConfidence

    // ── Log (non-blocking) ──
    const tokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
    try {
      await sb.from('ai_plan_logs').insert({
        coach_id: user.id,
        tier: 'import',
        action: 'smart_import',
        prompt: `${fileName} (${fileType}) [${preParsed ? 'Haiku' : 'Sonnet'}] type=${detectedPlanType}${coachSport ? ' coach_sport=' + coachSport : ''}${coachPlanType ? ' coach_plan=' + coachPlanType : ''}${coachTrainingFocus ? ' coach_focus=' + coachTrainingFocus : ''}`,
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
      detectedPlanType,
      planTypeConfidence,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[smart-import] ERROR:', msg)
    if (err instanceof Error && err.stack) console.error(err.stack)
    return json({ error: msg || 'Internal server error' }, 500)
  }
})
