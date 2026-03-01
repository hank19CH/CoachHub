// Sport detection — regex banks, detectSport(), and sport-specific parsing rules
// Extracted verbatim from smart-import v33

export interface SportSignal {
  sport: string
  category: string // broad category for rule selection
  confidence: number
}

export const SPORT_SIGNATURES: Array<{
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

export function detectSport(content: string): SportSignal | null {
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

export const SPORT_RULES: Record<string, string> = {
  sprint_track: `
SPORT DETECTED: Sprint / Track & Field.

SIMPLE NAMING RULE FOR SPRINT/TRACK EXERCISES:
The exercise "name" should be the ACTIVITY TYPE, NOT the full prescription. Distance goes in distance_meters, sets in sets, reps in reps. Do NOT bake distance into the exercise name.

- If the Note column has a drill/start code (e.g. "PP", "HS", "B", "F", "3P", "SFS"), use that code as BOTH raw_name AND name. Do NOT expand it — the coach's abbreviation is the exercise name.
- If the Note column is null/empty AND distance <= 400m, name is "Sprint" (no raw_name — coach didn't write one).
- If the Note column is null/empty AND distance > 400m, name is "Run" (no raw_name).
- If the Note has a descriptive modifier (e.g. "sled pull", "wickets"), use that text as-is for both raw_name and name.
- Distance ALWAYS goes in the distance_meters field, NOT in the exercise name. Never write "60m Sprint" — write name: "Sprint", distance_meters: 60.

DECOMPOSITION RULES:
- "AxBxCm" → sets: A, reps: "B", distance_meters: C. Example: "4x3x60m" → sets: 4, reps: "3", distance_meters: 60
- "AxCm" with no middle multiplier → reps: "A", distance_meters: C. (sets null unless context says otherwise)
- "3x200m @ 95%" → reps: "3", distance_meters: 200, intensity_percent: 95

CONCRETE EXAMPLES:
  {"Set": null, "Rep": 4, "Distance": 10, "Note": "PP"}
  → { "raw_name": "PP", "name": "PP", "reps": "4", "distance_meters": 10 }

  {"Set": 4, "Rep": 4, "Distance": 40, "Note": null}
  → { "name": "Sprint", "sets": "4", "reps": "4", "distance_meters": 40 }

  {"Set": null, "Rep": 2, "Distance": 60, "Note": "20EFE"}
  → { "raw_name": "20EFE", "name": "20EFE", "reps": "2", "distance_meters": 60 }

  {"Set": null, "Rep": 3, "Distance": 60, "Note": null}
  → { "name": "Sprint", "reps": "3", "distance_meters": 60 }

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
- Standard notation: "RepsxDistance Stroke @ Sendoff" → decompose fully. The stroke abbreviation IS the exercise name — preserve it as-is in both raw_name and name.
  Examples:
    "8x100 FR @ 1:30" → { raw_name: "FR", name: "FR", reps: "8", distance_meters: 100, notes: "on 1:30 sendoff" }
    "4x200 IM @ 3:00" → { raw_name: "IM", name: "IM", reps: "4", distance_meters: 200, notes: "on 3:00 sendoff" }
    "6x50 Fly @ :50" → { raw_name: "Fly", name: "Fly", reps: "6", distance_meters: 50, notes: "on 0:50 sendoff" }
- Nested sets: "4x(4x25 on :25) @ 2:00" → { name: "Sprint Set", sets: 4, reps: "4", distance_meters: 25, rest_seconds: 120, notes: "on :25 within set, 2:00 between sets" }
- Stroke codes are exercise identifiers: FR, Free, f/s = freestyle stroke; BK, Back, b/c = backstroke; BR, Breast, b/s = breaststroke; FL, Fly = butterfly; IM = individual medley; CH, Choice = choice. Preserve the code the coach used — do NOT expand.
- Kick/Pull/Drill sets ARE exercises: "4x100 Pull @ 1:40" → { name: "Pull", distance_meters: 100, ... }; "8x50 Kick @ :55" → { name: "Kick", distance_meters: 50, ... }
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
- Common abbreviations in strength training: SN, C&J, PSn, PC, FS, BS, OHS, DL, PP, SLDL, RDL. These are standard but do NOT expand them — preserve in both raw_name and name as the coach wrote them. Only the coach's personal glossary can override.`,

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
- Common CrossFit abbreviations: T2B, C2B, WB, HSPU, MU, DU, KBS, DL, PC, PP, BJ, S2OH, SDHP, TGU, GHD. These are standard but do NOT expand them — preserve in both raw_name and name as the coach wrote them. Only the coach's personal glossary can override.
- Rx weights: "(20/14)" means 20lb for men/14lb for women → notes field.
- "For Time" workouts: set time_cap in workout notes if mentioned.`,

  rowing: `
SPORT DETECTED: Rowing / Erging.
CRITICAL PARSING RULES FOR THIS SPORT:
- Interval notation: "RepsxDistance @ Pace split, Rest"
  Examples:
    "4x2000m @ 2:00 split, r5'" → { name: "2000m Piece", sets: 4, reps: "1", distance_meters: 2000, notes: "@ 2:00/500m split, 5min rest", rest_seconds: 300 }
    "6x500m r3:00" → { name: "500m Interval", sets: 6, reps: "1", distance_meters: 500, rest_seconds: 180 }
    "8x500 / 3'30" rest" → { name: "500m Repeat", sets: 8, reps: "1", distance_meters: 500, rest_seconds: 210 }
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
- Common gymnastics abbreviations: HSPU, MU, FL, BL, HS, P2HS. Do NOT expand — preserve in both raw_name and name as the coach wrote them. Only the coach's personal glossary can override.
- Combination of holds + reps common: "3x(5 strict MU + 15s ring support hold)" → two exercises or compound notes.
- BW (bodyweight) exercises: don't put weight unless external load is specified (e.g., "weighted pull-up +20kg").`,
}

// General rules used when no sport is detected
export const GENERAL_SPORT_RULES = `
NO SPECIFIC SPORT DETECTED. Use these general rules:
- Look for context clues to identify the sport: distances suggest running/swimming/sprints, percentages suggest strength, rounds suggest combat, zones suggest cycling.
- When you see "AxBxCm" patterns (e.g., "4x3x60m"), decompose: sets=A, reps=B, distance_meters=C, name="Cm [activity]".
- When you see "AxB @ C%" patterns, decompose: sets=A, reps=B, intensity_percent=C.
- Preserve exercise names/abbreviations EXACTLY as the coach wrote them in BOTH raw_name and name. Do NOT expand abbreviations — only the coach's personal glossary can override.
- Every prescription that describes physical activity IS an exercise — extract it.`
