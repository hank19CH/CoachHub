# CoachHub Testing Protocols: research and starter catalogue

> Research compiled 2026-11-03 to seed the `test_protocols` catalogue (Roadmap Sprint 16). See `VISION.md` §5 for why this matters: **two results can be compared only if they were measured the same way.**
>
> Numbers marked **(verify)** came from secondary sources or could not be checked against the governing body's own document during this research. Confirm them before seeding production data. HYROX rulebook PDFs and some sites were outside this session's network allow-list. A list of what to verify is in §6.

---

## 0. Design principles (TL;DR)

1. **A protocol is a fixed recipe, and it has versions.** The recipe covers distance, start, attempts, scoring rule, load and division. If the recipe changes, create a new version. For example, HYROX Women Open went from 75 to 100 wall balls in Sept 2024. Leaderboards never mix versions unless they are marked equivalent.
2. **Measurement method is separate from verification tier.**
   - *Method* is **how** the result was measured: hand stopwatch, dual-beam gates, force plate, Vertec, and so on. It decides whether two results can be compared.
   - *Tier* is **who vouches for it**: self_reported, coach_logged, lab_verified or pro_partner. It decides how much the result is trusted.
   - A coach with a stopwatch is `coach_logged` + `hand_timed`. That result must still never sit on the same board as `timing_gates` results.
3. **Each method belongs to a comparability class.** Leaderboards are built on the key `(protocol_slug, protocol_version, comparability_class, division)`. Tier, sex, age band, sport, region and bodyweight class are filters on top of that key.
4. **Conversions are for display only, never for ranking.** An example is "≈ electronic equivalent: hand +0.24 s". The published corrections are population averages, and individual errors are large. Results that come from a conversion never enter the board of the target method.
5. **Store canonical SI values and format them for display.** Store seconds, metres, kg, N, W and ml·kg⁻¹·min⁻¹. Show inches or feet for NFL-style tests, mm:ss for runs, and level.shuttle for the beep test.
6. **Record conditions.** Surface, footwear, indoor or outdoor, wind (for flying sprints), pool length, bar or handle type and bodyweight on the day all change results. If a test needs a condition to be comparable, that condition is required.
7. **Test order on a testing day (NSCA).** Run non-fatiguing tests first, in this order: anthropometrics, then agility, then max power and strength, then sprints, then local muscular endurance, then anaerobic capacity, then aerobic. The testing-session UI should suggest this order.

---

## 1. Recommended starter catalogue (39 tests + anthropometrics)

**Key:**
- **Dir:** ↓ = lower is better, ↑ = higher is better.
- **Tier:** **SR** self_reported · **CL** coach_logged · **LV** lab_verified · **PP** pro_partner.
- **"Self-report OK?"** means the test can be done honestly alone, with the listed evidence. **"Min tier (public board)"** is the lowest tier shown on the *default* public leaderboard view. All tiers still appear on the athlete profile with a badge.

### 1a. Speed & agility

| # | slug | Test (aliases) | Unit | Dir | Method options → comparability class | Self-report OK? | Min tier (public board) | Pro / normative data |
|---|---|---|---|---|---|---|---|---|
| 1 | `sprint_10m` | 10 m sprint (acceleration) | s | ↓ | dual-beam gates · single-beam gates · laser/radar · high-speed video app (≥240 fps) · hand stopwatch (each its own class) | Only via validated video app (flagged class) | CL (electronic class) | Peer-reviewed team-sport data (rugby, soccer, AFL); no single pro registry |
| 2 | `sprint_20m` | 20 m sprint, 10 m split | s | ↓ | as above | Video app only | CL | AFL Draft Combine (20 m), rugby/soccer literature |
| 3 | `sprint_40m` | 40 m sprint, 10/20/30 m splits | s | ↓ | as above + FAT | Video app only | CL | Rugby league/union literature (RLAP battery), track split analyses |
| 4 | `dash_40yd` | 40-yard dash, 10/20-yd splits ("the 40") | s | ↓ | touch-pad/hand-release + gates · gates only · *NFL-combine hybrid* (pro import only) · hand | No | CL | **NFL Combine** (public; record 4.21 s, X. Worthy 2024) |
| 5 | `flying_30m` | Flying 30 m (max-velocity sprint; also flying 10/20) | s (+ m/s) | ↓ | dual-beam gates · laser · FAT | No | CL (LV for laser/FAT) | Track split data (world-class men ≈ 2.45–2.6 s) |
| 6 | `pro_agility` | Pro-agility, 5-10-5, 20-yard short shuttle | s | ↓ | electronic (pad/gate) · hand | No | CL | **NFL Combine**, NBA Combine ("shuttle run") |
| 7 | `three_cone` | 3-cone drill, L-drill | s | ↓ | hand · electronic | No | CL | **NFL Combine** (record 6.28 s, J. Thomas 2018) |
| 8 | `cod_505` | 505 change-of-direction test (+ COD deficit) | s | ↓ | gates | No | CL | Peer-reviewed (Nimphius 2016 + many sport cohorts) |

### 1b. Jumps & power

| # | slug | Test (aliases) | Unit | Dir | Method options → comparability class | Self-report OK? | Min tier | Pro / normative data |
|---|---|---|---|---|---|---|---|---|
| 9 | `cmj` | Countermovement jump, hands on hips (CMJ, "Sparta jump scan") | cm (+ RSI-mod, W/kg, etc.) | ↑ | **force plate impulse-momentum** · force plate flight-time · contact mat (flight-time) · phone app (flight-time from video) · linear position transducer | Yes, via validated app (own class) | CL; force-plate class = LV | Very large literature; NCAA RSI-mod reference values; vendor databases (Sparta, Hawkin, VALD) |
| 10 | `vertical_jump_reach` | Standing vertical jump, jump-and-reach, Vertec, "vert" | cm (display in) | ↑ | Vertec · wall/chalk mark | Wall-mark w/ video (flagged) | CL | **NFL** (45–46 in), **NBA**, **AFL** combines |
| 11 | `broad_jump` | Standing broad jump, standing long jump (SLJ) | cm (display ft-in) | ↑ | tape measure | Yes, with video | SR (video) | **NFL Combine** (record 12′3″ / 373 cm, B. Jones 2015); school/youth norms |
| 12 | `drop_jump_rsi` | Drop jump reactive strength index (DJ-RSI), 30 cm box | m/s (JH/GCT) | ↑ | contact mat · force plate · phone app | No | CL | Peer-reviewed; sparse pro norms |
| 13 | `bench_throw` | Smith-machine bench throw (fixed load) | W (+ peak m/s) | ↑ | linear position transducer · force plate + LPT | No | LV (CL with LPT allowed) | Rugby league/union literature |

### 1c. Strength

| # | slug | Test (aliases) | Unit | Dir | Method options → comparability class | Self-report OK? | Min tier | Pro / normative data |
|---|---|---|---|---|---|---|---|---|
| 14 | `back_squat_1rm` | Back squat 1RM | kg (+ kg/BW) | ↑ | direct 1RM · estimated from 2–5RM (separate class) | Yes, with video | CL | NSCA tables; OpenPowerlifting (raw) for context; rugby literature |
| 15 | `bench_press_1rm` | Bench press 1RM (touch-and-go default; paused variant) | kg (+ kg/BW) | ↑ | direct · estimated | Yes, with video | CL | NSCA tables; rugby literature |
| 16 | `deadlift_1rm` | Barbell deadlift 1RM (conventional/sumo) | kg | ↑ | direct · estimated | Yes, with video | CL | Powerlifting records; CrossFit Total |
| 17 | `trap_bar_deadlift_1rm` | Trap-bar / hex-bar deadlift 1RM (3RM variant = US Army AFT) | kg | ↑ | direct · estimated; **handle height is part of the variant** | Yes, with video | CL | US Army AFT scoring tables (3RM) |
| 18 | `power_clean_1rm` | Power clean 1RM | kg | ↑ | direct | Yes, with video | CL | Rugby/AFL/NFL S&C literature |
| 19 | `pull_ups_max` | Strict pull-ups max reps (chin-up = variant) | reps | ↑ | count | Yes, with video | SR (video) | USMC PFT tables; school/military norms |
| 20 | `bench_225_reps` | NFL 225-lb bench press reps (102.1 kg) | reps | ↑ | count | Yes, with video | CL | **NFL Combine** (49, S. Paea 2011; 51 in 1999) |
| 21 | `imtp` | Isometric mid-thigh pull (IMTP) peak force | N (+ N/kg) | ↑ | force plate(s) ≥1000 Hz (+ load-cell rigs as separate class) | No | LV | Peer-reviewed across rugby, AFL, soccer, weightlifting |

### 1d. Aerobic / conditioning

| # | slug | Test (aliases) | Unit | Dir | Method options → comparability class | Self-report OK? | Min tier | Pro / normative data |
|---|---|---|---|---|---|---|---|---|
| 22 | `vo2max_lab` | VO₂max (VO₂peak), graded exercise test | ml·kg⁻¹·min⁻¹ (+ L/min) | ↑ | metabolic cart: treadmill · cycle (separate classes); field/watch estimates **excluded** | No | LV | FRIEND registry (age/sex percentiles), ACSM; elite sport literature |
| 23 | `yoyo_ir1` | Yo-Yo Intermittent Recovery Level 1 (YYIR1) | m | ↑ | audio-paced, line judging | No | CL | Bangsbo et al. 2008 (by sport/level); soccer, AFL, rugby |
| 24 | `msft_beep` | 20 m multistage fitness test, beep test, bleep test, PACER, Léger | level.shuttle (stored as shuttles + km/h) | ↑ | audio-paced; **audio version is part of the protocol** | No (group test needs line judge) | CL | Huge school/military/police norm sets; rugby/AFL history |
| 25 | `ift_30_15` | 30-15 Intermittent Fitness Test (VIFT) | km/h | ↑ | audio-paced | No | CL | Buchheit et al. (team sports) |
| 26 | `bronco` | Bronco (1.2 km shuttle: 20-40-60 m × 5) | s | ↓ | stopwatch fine (long test) | Yes, flagged | CL | Rugby (union/league) practice; secondary normative bands |
| 27 | `run_2km_tt` | 2 km time trial | s | ↓ | track (5 × 400 m) · measured course · GPS-only (own class) | Yes (track) | SR (track/measured) | **AFL Draft Combine** (since 2017) |
| 28 | `run_2_4km_tt` | 2.4 km run (≈1.5 mile; tactical) | s | ↓ | track (6 × 400 m) · GPS-only (own class) | Yes (track) | SR | Military/police entry standards (UK, NZ, Australia; verify per service) |
| 29 | `run_5km` | 5 km run (parkrun / road race / track) | s | ↓ | official chip (net) · parkrun result · track · GPS-only (own class) | Yes, via result link | SR; **event-verified** for official results | parkrun; World Athletics records; WMA age-grading tables |
| 30 | `row_2k` | 2000 m indoor row (2k erg) | s | ↓ | Concept2 RowErg + PM5 (static); verified logbook upload; other ergs/dynamic/slides = separate classes | Yes, via Concept2 verified logbook | SR (verified upload) | **Concept2 world rankings** (by age/weight); WR 5:35.8 (men HWT, 2018) |
| 31 | `swim_css` | Critical swim speed (400 m + 200 m freestyle TT) | s/100 m (+ raw 400 m time) | ↓ | pool clock/stopwatch · touchpads; **pool length is part of the variant** | Yes (pool clock) | CL | Peer-reviewed (Wakayoshi); squad norms |
| 32 | `ftp_cycling` | Functional threshold power (20-min test × 0.95; ramp variant) | W, W/kg | ↑ | power meter (crank/pedal/hub) · smart trainer · **.fit upload**; virtual/estimated power excluded | Yes, with .fit file | SR (file) | Allen & Coggan power-profile tables; pro cycling data |

### 1e. Fitness racing / functional

| # | slug | Test (aliases) | Unit | Dir | Method options → comparability class | Self-report OK? | Min tier | Pro / normative data |
|---|---|---|---|---|---|---|---|---|
| 33 | `hyrox_race` | HYROX race (Singles; division = Open/Pro × sex; season = version) | s (+ 16 splits + Roxzone) | ↓ | **official chip result** · gym simulation (separate class, not on race boards) | Via results link | event-verified (official) | Official HYROX results; Pro records ≈ 51:59 (M) / 54:25 (W) **(verify)** |
| 34 | `cf_fran` | Fran: 21-15-9 thrusters 43/29 kg + pull-ups | s | ↓ | Rx · Scaled (divisions) | Yes, with video | SR (video) / CL (judged) | Community data (BTWB, WODprep); no peer-reviewed norms |
| 35 | `cf_grace` | Grace: 30 clean & jerks 61/43 kg | s | ↓ | Rx · Scaled | Yes, with video | SR/CL | Community |
| 36 | `cf_helen` | Helen: 3 RFT 400 m run, 21 KB swings 24/16 kg, 12 pull-ups | s | ↓ | Rx · Scaled | Yes, with video | SR/CL | Community |
| 37 | `cf_cindy` | Cindy: 20-min AMRAP 5 pull-ups, 10 push-ups, 15 squats | rounds+reps (stored as reps) | ↑ | Rx · Scaled | Yes, with video | SR/CL | Community |
| 38 | `cf_murph` | Murph (Hero WOD) | s | ↓ | Rx (vest, unpartitioned) · vest-partitioned · no-vest | Yes, with video | SR/CL | Community; CrossFit Games events |
| 39 | `cf_total` | CrossFit Total (back squat + shoulder press + deadlift, 1RM each) | kg | ↑ | judged · self | Yes, with video | CL | CrossFit Journal (Rippetoe 2006); community |

### 1f. Anthropometrics / body composition (profile & normalisation; **not ranked by default**)

| slug | Measure | Unit | Method options | Self-report OK? | Notes |
|---|---|---|---|---|---|
| `height` | Stature | cm | stadiometer · tape | Yes | Needed for age-grading and growth (PHV) in juniors |
| `body_mass` | Body mass | kg | calibrated scale (morning, fasted, minimal clothing) · home scale | Yes | **Required** for every relative metric. Capture on test day |
| `standing_reach` | Standing reach | cm | wall/Vertec | CL | Needed for jump-and-reach; NFL/NBA measure it |
| `wingspan` | Arm span | cm | tape | CL | NBA/NFL combine measurement |
| `skinfolds_sum7` | Sum of 7 (or 8) skinfolds (ISAK) | mm | ISAK-accredited anthropometrist + Harpenden calipers | No | Australian sport standard (AFL, rugby, AIS). Do **not** convert to %fat |
| `dxa` | DXA lean mass / fat mass / %fat | kg, % | DXA (Nana et al. 2015 protocol) | No (LV) | Testing-centre product. Machine and software vary, so record the device |
| `bia` | Bioimpedance %fat | % | smart scale / InBody | Yes | Hydration-sensitive. Show on profile only; never ranked |

### 1g. Wave 2 (not in starter set)

**Speed/agility**
- Squat jump (SJ)
- 100 m / 60 m (FAT, block start)
- AFL agility test
- NBA lane agility and ¾-court sprint
- Max (running/approach) vertical jump
- Repeated-sprint ability (e.g. 6 × 30 m)

**Power/strength**
- Seated or standing medicine-ball chest throw (RLAP)
- Weighted chin-up 1/3RM
- Strict press 1RM
- Snatch and clean & jerk 1RM

**Aerobic**
- Yo-Yo IR2
- Prone Yo-Yo IR1 (rugby league, RLAP)
- 1.2 km TT (rugby league)
- Cooper 12-min
- 2-mile run (AFT)
- 1 mile
- 10 km
- 500 m row
- 1000 m SkiErg
- Lab lactate threshold
- Wingate 30 s

**Tactical (US Army AFT)**
- Hand-release push-ups
- Plank
- Sprint-drag-carry

**CrossFit**
- Diane
- Isabel
- Karen
- Annie
- Jackie
- Open workouts (one protocol per year/workout, e.g. `cf_open_25_1`)

**HYROX**
- Standalone station tests: SkiErg 1000 m, Row 1000 m, 100 wall balls

---

## 2. Verification tiers: operational definitions

| Tier | Who / what | Minimum evidence the app should require | Notes |
|---|---|---|---|
| `self_reported` | Athlete enters own result | Method + conditions declared. Video or device file **required** for public boards on tests marked "with video/file" | Profile shows the badge. Excluded from default boards for tests that need an operator (sprints, Yo-Yo, IMTP) |
| `coach_logged` | A CoachHub coach entered it during a testing session | Coach account + session + method + conditions | Tier ≠ precision: a coach with a stopwatch is still in the `hand` class |
| `lab_verified` | CoachHub Testing Centre / certified partner | Calibrated device (gates, force plate, VO₂ cart, DXA), operator ID, device ID, ideally a raw-data file | Only tier that can produce force-plate, IMTP, VO₂max and DXA results for public boards |
| `pro_partner` | Bulk import from a professional team/organisation | Partner agreement + declared method per column | Partner methods vary, so the **method must be declared per dataset**. Example: NFL combine 40 = hybrid timing |
| *(recommend)* `event_verified` | Result imported from an official timed event (HYROX, parkrun, chip-timed race, Concept2-verified piece, CrossFit Open validated score) | Link to the official result page/ID | Decision for founder: either a 5th tier or a `source = official_event` attribute that ranks like `lab_verified` for those tests |

---

## 3. Per-test protocol detail

Every test entry has the same fields:
- **Aliases**
- **Sports**
- **Unit / direction**
- **Standard protocol**: what CoachHub fixes
- **Methods**: allowed measurement methods and how each maps to comparability classes
- **Conversions**
- **Benchmarks**
- **Tier suitability**

### 3.1 Speed & agility

**Common to all linear sprints (tests 1–5)**

*Start (CoachHub standard)*
- Standing two-point split stance.
- Front foot on a line **0.5 m behind the first timing gate**.
- The athlete starts in their own time. There is no command, and no rocking or false step is allowed.

*Why the start is fixed*
- Different start positions and trigger methods produce systematically different times.
- Haugen's work reports differences of **more than 0.6 s over 40 m** between common start/trigger set-ups: block + gun FAT vs hand-release vs photocell vs foot-release.
- So `start_type` and `start_offset_m` are part of the protocol, not free text.

*Gates*
- Use dual-beam gates if available.
- Single-beam gates should be at about hip height. Arms and swinging limbs can trigger single beams early.
- Haugen & Buchheit (2016) recommend fully automatic timing, dual-beam photocells, laser or high-speed video. They say manual timing and single-beam photocells should be **avoided for 10–20 m**.

*Attempts and scoring*
- 2–3 trials with ≥2–3 min rest. Use ≥4 min for 40 m and flying sprints.
- Score = **best** time. Store all attempts.

*Conditions to record*
- **Required:** surface (synthetic track / natural grass / artificial turf / indoor hard court) and footwear (spikes / boots / trainers).
- **Optional:** wind, outdoors only, and required for flying sprints.

*Hand vs electronic timing*
- Hand times are systematically **faster** because the timer starts the watch late and stops it early.
- 40 yd: hand is about **0.22 s** faster (Mann et al. 2015, NCAA DI football, 4.90 vs 5.12 s). Another JSCR study found about **0.225 s**, roughly 4%.
- Athletics statisticians add **0.24 s** to hand-timed 100/200 m marks and 0.14 s for 400 m+. This is a convention, not a World Athletics rule.
- The absolute error stays about the same at 10–20 m, so it is a much larger share of the result. At 10 m it is about 0.2 s on a 1.7–1.9 s time.
- **Rule:** hand-timed sprints ≤40 m go in their own `hand` class. The app may show "≈ +0.24 s electronic" for information only.

*Units*
- **Yards ≠ metres.** 40 yd = 36.576 m and 20 yd = 18.288 m.
- Never relabel or convert between `dash_40yd` and `sprint_40m`. They are different protocols.

*Video apps*
- High-speed phone video apps (e.g. MySprint-type, 240 fps) are validated in research against photocells.
- They can be an accepted self-report class (`video_app`), but they stay in their **own class** until CoachHub validates them against its gates.

#### 1. `sprint_10m`: 10 m sprint
- **Sports:** rugby league/union, AFL, soccer, basketball, NFL (as 10-yd split), track.
- **Unit / dir:** s, 0.01 s; ↓.
- **Protocol:** standard start (above). Gates at 0 m (start offset 0.5 m behind) and 10 m.
- **Benchmarks:**
  - Published team-sport cohorts: Gabbett junior/sub-elite/pro rugby league; Darrall-Jones academy rugby union; RLAP battery.
  - Values depend on the start set-up, so compare only to studies with the same start.
- **Tier:** CL with gates. SR only via video-app class.

#### 2. `sprint_20m`: 20 m sprint (10 m split)
- **Sports:** AFL (Draft Combine), soccer, rugby, netball.
- **Protocol:** as 10 m, gates at 0/10/20 m. Store the 10 m split as a secondary metric. It has the same comparability as `sprint_10m` if the start is identical.
- **AFL combine:** uses a 20 m sprint from a standing start with electronic timing. Import AFL combine data under a method class that matches its start set-up **(verify AFL start offset)**.
- **Tier:** CL.

#### 3. `sprint_40m`: 40 m sprint (10/20/30 m splits)
- **Sports:** rugby league (RLAP uses 10 & 40 m), rugby union, soccer, track.
- **Protocol:** gates at 0/10/20/30/40 m.
- **Derived:** max velocity from the 30–40 m split (m/s).
- **Tier:** CL; LV with laser/FAT.

#### 4. `dash_40yd`: 40-yard dash
- **Sports:** NFL, US college football; marketing value globally ("run the NFL 40").
- **Unit / dir:** s; ↓. Splits at 10 yd and 20 yd.
- **Protocol (CoachHub standard):**
  - **Three-point stance.** Start timing on hand release (touch-pad) or from first gate at the start line. Record which one.
  - 2 trials, best.
- **NFL methodology caveat:**
  - The combine's "official" 40 has historically been **hybrid**: started by hand at first movement, with an electronic/laser finish, and adjusted afterwards. The adjustment is not published.
  - Pro-day times are often fully hand-timed and are widely considered "fast".
  - Treat NFL combine results as their own `nfl_combine_hybrid` class for "you vs pro" display. Treat pro-day times as `hand`.
- **20-yard dash:**
  - Testing-centre product. Offer it as a standalone `dash_20yd` protocol with the same start.
  - It is comparable to the 20-yd split of a 40-yd run with an identical start, so mark it as an equivalent class.
- **Benchmarks:**
  - NFL combine record 4.21 s (Xavier Worthy, 2024). The previous record was 4.22 s (John Ross, 2017).
  - Full combine results by player are public (NFL.com, Pro-Football-Reference). Check licensing before displaying named pro data.
- **Tier:** CL; PP for imported combine data.

#### 5. `flying_30m`: flying 30 m (max velocity)
- **Sports:** track & field, rugby/AFL speed programs.
- **Protocol:**
  - 30 m acceleration zone (standing or crouch start, not timed), then timed 30–60 m between gates.
  - 2 trials, full recovery (≥5–6 min). Best time; also store m/s.
  - Variants are separate protocols: flying 10 m and flying 20 m (often after a 20 m run-in).
- **Conditions:** wind (outdoors: record m/s; flag > +2.0 m/s as wind-aided), surface, spikes yes/no.
- **Benchmarks:**
  - World-class male sprinters hit ≈ 11.5–12.4 m/s peak.
  - Published 10 m splits from Bolt's 9.58 s (Berlin 2009 biomechanics report) give ≈ 2.45 s for 60–90 m.
- **Tier:** CL; LV with laser/FAT.

#### 6. `pro_agility`: pro-agility shuttle (5-10-5, 20-yard short shuttle)
- **Sports:** NFL, NBA ("shuttle run"), US college, many S&C programs.
- **Unit / dir:** s; ↓.
- **Protocol:**
  - Three lines 5 yd apart. Start straddling the middle line in a three-point stance.
  - Sprint 5 yd to one side and touch the line **with the hand**, sprint 10 yd to the far line and touch it, then sprint 5 yd back through the middle line.
  - 2 trials (one starting each direction, or athlete's choice, so record it). Best.
- **Metric 5-10-5 m:** a different protocol (`pro_agility_m`). Do not mix.
- **Timing:**
  - Mostly hand-timed in practice, because the athlete passes the start line three times.
  - Electronic needs a touch-pad start plus a gate on the middle line that ignores the first pass.
  - The hand/electronic gap is similar to the 40 (≈0.2 s), which is huge relative to the spread between athletes.
- **Benchmarks:**
  - NFL best ≈ 3.73 s (Kevin Kasper, 2001, hand era) or 3.81 s (Brandin Cooks, 2014). Sources disagree; the difference is likely electronic-era only.
- **Tier:** CL.

#### 7. `three_cone`: 3-cone drill (L-drill)
- **Sports:** NFL combine; American football.
- **Protocol:**
  - Three cones in an L, 5 yd apart. Start in a three-point stance at cone 1.
  - Sprint to cone 2, touch the line, return to cone 1 and touch.
  - Sprint back to cone 2, go around it on the inside, weave around cone 3, come back around cone 2, and finish past cone 1.
  - 2 trials, best.
- **Timing:** hand or electronic (start pad + finish gate), each its own class.
- **Benchmarks:** NFL combine record 6.28 s (Jordan Thomas, 2018). Some lists still show 6.42 s (Jeff Maehl, 2011).
- **Tier:** CL.

#### 8. `cod_505`: 505 change-of-direction test
- **Sports:** AFL, rugby, soccer, netball, cricket, basketball. Widely used in Australian sport science.
- **Protocol:**
  - Start line, 10 m run-in, timing gate at 10 m, turn line at 15 m.
  - The athlete accelerates through the gate, plants on the 15 m line (foot on or over), turns 180° and sprints back through the gate.
  - Time = the 10 m from gate → turn → gate.
  - 2–3 trials **per side** (left-foot and right-foot plant). Best per side.
  - Leaderboard metric = better side. Store both sides and the asymmetry.
- **Variants:**
  - Modified 505 (start 5 m from the turn) is a separate protocol.
  - Some use a 15 m run-in. Fix 10 m.
- **COD deficit:**
  - = 505 time − 10 m sprint time, both from the same session (Nimphius et al. 2016).
  - Correlated with 505 time (r ≈ 0.74–0.81) but not with sprint time. A useful derived metric, but not for ranking.
- **Reliability:** only about 31% of 505 time is the actual turn. Some youth cohorts show poor reliability for COD deficit.
- **Tier:** CL.

### 3.2 Jumps & power

**Jump-height measurement methods are not interchangeable.**

*Force-plate methods*
- **Impulse-momentum (take-off velocity)** is the lab criterion. Height = v²/2g, from the centre-of-mass rise after take-off.
- **Flight-time** methods (force plate, contact mat, phone apps) compute height from airtime: h = g·t²/8. Tucking the knees or landing in a different posture lengthens airtime, so flight-time heights read high.

*Size of the differences*
- A 2023 systematic review in Sports Medicine found height can differ by **up to ~15 cm** depending on the equation used on the same jump.
- **Vertec / jump-and-reach** measures something else: reach with **arm swing**, minus standing reach. Reported Vertec vs force-plate differences point in both directions:
  - +27% (Petushek et al.)
  - 0.55 m vs 0.36 m (Cheah et al.)
  - Lower than criterion in another validity study.

*Rule*
- Hands-on-hips CMJ and jump-and-reach are **separate tests**.
- Within CMJ, `force_plate_impulse`, `flight_time` (plate/mat) and `video_app` are separate classes.
- **No conversion factors.** Inches ↔ cm is an exact unit change, not a method conversion.

#### 9. `cmj`: countermovement jump, hands on hips
- **Aliases:** CMJ, akimbo CMJ, Sparta jump scan (vendor protocol), Bosco CMJ.
- **Sports:** universal. Rugby, AFL, soccer, NBA/NFL S&C, track, combat. The standard force-plate monitoring test.
- **Unit / dir:** jump height cm (0.1); ↑.
- **Protocol:**
  - Hands on hips. A PVC dowel on the back is accepted as a variant, so record it.
  - Stand still ≥1 s for body-weight measurement (force plate). Self-selected countermovement depth, then maximal jump.
  - Land on the same spot with legs extended until touchdown. This is required for flight-time methods.
  - 3 trials, 30–60 s rest. **Leaderboard = best. Monitoring = mean of best 2.**
- **Force-plate secondary metrics** (lab class only; store raw values and vendor):
  - Jump height (TOV)
  - **RSI-mod** = jump height ÷ time to take-off (m/s; Ebben & Petushek 2010)
  - Peak and mean concentric power (W, W/kg)
  - Concentric impulse (N·s)
  - Eccentric braking RFD (N/s)
  - Countermovement depth (cm)
  - Left/right asymmetries (dual plates)
- **Sparta Science-style metrics.** Sparta reports three variables from a CMJ on a 1000 Hz plate:
  - **Load** = average eccentric (braking) rate of force development, N/s
  - **Explode** = average concentric force ÷ body mass, N/kg
  - **Drive** = concentric impulse ÷ body mass, N·s/kg
  - They are shown as T-scores (50 = population mean, typical range 40–60) and combined into a proprietary "Sparta Score". **T-scores depend on the vendor's population and cannot be compared with other vendors**, so CoachHub should store raw metrics and rank only on raw values.
- **Methods → classes:**
  - `force_plate_impulse` (LV)
  - `flight_time` (force plate or contact mat; CL)
  - `video_app` (e.g. My Jump; SR/CL)
  - `lpt` (linear position transducer; CL)
  - `imu` (wearable; own class, wave 2)
- **Benchmarks:**
  - Extensive cohort data. NCAA D-I RSI-mod reference values (Sole et al. 2018).
  - Vendor databases are large but proprietary.
- **Tier:** SR (app), CL, LV.

#### 10. `vertical_jump_reach`: standing vertical jump (jump-and-reach / Vertec)
- **Sports:** NFL combine ("vertical"), NBA combine ("standing vertical" + separate "max vertical" with approach), AFL combine (standing + running vertical), volleyball, basketball.
- **Unit / dir:** cm (store) / inches (display, ½-in resolution on Vertec); ↑.
- **Protocol:**
  - Measure standing reach: dominant arm fully extended, feet flat.
  - From a standstill (no step), countermove with free arm swing and jump off two feet. Touch the highest vane.
  - Score = jump reach − standing reach. 3 trials (NFL usually 2–3), best.
- **Methods:** Vertec (CL), chalk/wall mark (SR with video; own class).
- **Benchmarks:**
  - NFL combine top marks ≈ 45 in (Chris Conley 2015; Donald Washington 2009). Some lists credit 46 in (Gerald Sensabaugh 2005).
  - NBA max-vertical bests ≈ 43–46 in.
  - AFL combine publishes standing and running vertical results.
- **Tier:** CL.

#### 11. `broad_jump`: standing broad jump
- **Aliases:** standing long jump (SLJ), horizontal jump.
- **Sports:** NFL combine, track (standing jumps), school fitness batteries (Eurofit), rugby/AFL S&C.
- **Unit / dir:** cm (display ft-in for NFL); ↑.
- **Protocol:**
  - Toes behind the line, feet parallel, shoulder width. Countermovement with arm swing.
  - Two-foot take-off and **two-foot landing that must be held**. Falling backwards, stepping back or hand touch = fail.
  - Measure from the line to the **rear-most heel**. 3 trials, best.
- **Surface:** record it (turf/track/gym floor). A no-slip surface is needed.
- **Benchmarks:** NFL record 12′3″ = 373 cm (Byron Jones, 2015). 12′2″ (Tyler Owens, 2024) is next.
- **Tier:** SR with video (tape visible); CL.

#### 12. `drop_jump_rsi`: drop jump reactive strength index
- **Sports:** track (jumps/sprints), rugby, AFL, soccer return-to-play, basketball.
- **Unit / dir:** RSI = jump height (m) ÷ ground contact time (s), unit m/s; ↑. Also store jump height and GCT.
- **Protocol:**
  - Drop from a **30 cm** box. 40 cm is a separate variant.
  - Hands on hips. Step off (no hop) and land on two feet. "Jump as high and as fast as possible, minimal ground contact".
  - 3 trials, 60 s rest, best RSI.
  - Contacts > 250 ms are flagged as a slow SSC (stretch-shortening cycle) strategy.
- **Formula caution:** some systems report RSI as flight time ÷ contact time (dimensionless). That is a **different number**, so fix the formula per protocol version.
- **Methods:** contact mat (flight time), force plate, app; separate classes.
- **Benchmarks:** peer-reviewed but heavily box-height-dependent. No standard pro registry.
- **Tier:** CL.

#### 13. `bench_throw`: Smith-machine bench throw
- **Sports:** rugby league/union, AFL, NFL S&C, combat sports.
- **Unit / dir:** peak power W (or peak bar velocity m/s); ↑.
- **Protocol:**
  - Smith machine. **Fixed absolute load per division** (e.g. 40 kg men / 20 kg women; final loads to be decided). Loads as %1RM are not comparable unless the 1RM is verified.
  - Touch-and-go from chest, maximal throw, bar caught (or brakes).
  - 3 reps, best.
- **Methods:** linear position transducer (GymAware-type) or force plate + LPT. Vendor algorithms differ, so record the device.
- **Tier:** LV (or CL with LPT).

### 3.3 Strength

**Common 1RM protocol (NSCA)**
- Warm-up: 5–10 reps at 40–60% of the estimated 1RM, then 1 min rest.
- 3–5 reps at 60–80%, 2 min rest.
- Then single attempts with 2–4 min rest. Reach the 1RM within **3–5 attempts**.
- Increments: about 5–10% (upper body) or 10–20% (lower body), getting smaller near the max.

**What to record**
- Equipment: **raw** (no suits, wraps or sleeves = default; record belt yes/no), bar type, collars.
- Body mass on the day.
- Video URL for SR.

**Estimated 1RM**
- Estimated from 2–5RM with Epley (w·(1 + r/30)) or Brzycki (w·36/(37 − r)).
- Store as `estimated_1rm`, a separate class. Never mix it with direct 1RM.

**Relative boards**
- kg ÷ BW (simple).
- Allometric kg ÷ BW^0.67 (fairer across sizes).
- For powerlifting-style totals, IPF GL points.
- Always show the absolute value alongside.

**Youth**
- Supervised 1RM testing is considered safe for youth by the NSCA youth position statement.
- CoachHub rule: under-18 1RMs need `coach_logged` or higher.

#### 14. `back_squat_1rm`
- **Sports:** rugby, AFL, NFL, soccer S&C, track, powerlifting, CrossFit.
- **Unit / dir:** kg (0.5); ↑.
- **Standard:**
  - High- or low-bar (record it). Depth = **hip crease below top of knee** (IPF standard).
  - Stand to full extension. Spotters/safeties required.
  - Box squats and half squats are not valid.
- **Benchmarks:**
  - NSCA normative tables (relative to BW, by sport/level).
  - Rugby union/league literature.
  - OpenPowerlifting for raw context (different depth judging and equipment).
- **Tier:** SR (video showing depth from the side), CL.

#### 15. `bench_press_1rm`
- **Standard (default):**
  - **Touch-and-go**, no bounce. Head, shoulders and buttocks on the bench, feet on the floor. Full lockout.
  - **Paused** (powerlifting) = separate variant.
- **Grip:** ≤81 cm between index fingers (IPF).
- **Benchmarks:** NSCA tables; rugby literature (absolute and relative).
- **Tier:** SR (video), CL.

#### 16. `deadlift_1rm`
- **Standard:**
  - Barbell from the floor, conventional or sumo (record it). Lockout with knees and hips extended and shoulders back.
  - No hitching. Straps are a variant (record them).
- **Use:** part of `cf_total`.
- **Tier:** SR (video), CL.

#### 17. `trap_bar_deadlift_1rm`
- **Variant fields:** **handle height (high/low)** and bar model. High handles shorten the range of motion and allow more load, so they are a separate class.
- **US Army AFT:** uses a **3RM** hex-bar deadlift. Seed `trap_bar_deadlift_3rm` as a variant for the tactical audience.
- **Tier:** SR (video), CL.

#### 18. `power_clean_1rm`
- **Standard:**
  - From the floor, caught in a **quarter squat (thighs above parallel)**, then stand to full extension under control.
  - A catch below parallel = squat clean (different test). Hang variants are separate.
- **Sports:** rugby, AFL, NFL, track throws/sprints.
- **Tier:** CL (technique judgement needed); SR with video.

#### 19. `pull_ups_max`: strict pull-ups
- **Standard:**
  - Pronated grip ≈ shoulder width. Start from a **dead hang with elbows fully extended**. Chin clearly over the bar. Return to full extension every rep.
  - No kipping or swinging. Continuous; dropping off the bar ends the set.
- **Chin-up (supinated):** separate variant.
- **CrossFit pull-ups:** kipping allowed. They belong only to the WOD protocols.
- **Benchmarks:** USMC PFT scoring tables; military/school norms.
- **Tier:** SR (video), CL.

#### 20. `bench_225_reps`: NFL 225-lb bench reps
- **Protocol:**
  - 102.1 kg (225 lb) bar, touch-and-go, full lockout, reps to failure.
  - No pausing at the top longer than a breath **(verify combine wording)**.
- **Benchmarks:** NFL combine: 49 reps (Stephen Paea, 2011) since 2000; 51 reps (Justin Ernest, 1999).
- **Tier:** SR (video), CL.

#### 21. `imtp`: isometric mid-thigh pull
- **Sports:** rugby league/union (very common in Australian and UK academies), AFL, soccer, weightlifting, sprint.
- **Unit / dir:** peak force N (gross); also store net force (− body weight) and N/kg; ↑. Secondary: force at 100/200/250 ms (RFD).
- **Protocol (Comfort et al. 2019 standardisation):**
  - Rigid bar at **mid-thigh** (halfway between knee and hip crease).
  - Joint angles commonly recommended: **knee ≈ 125–145°, hip ≈ 140–150°**. Self-selected within range, recorded and reused at retest.
  - Lifting straps. Pre-tension without a countermovement. Pull "as hard and fast as possible" for 3–5 s.
  - 2–3 trials, 1–2 min rest. Do another trial if trials differ by >250 N.
  - Force plate sampling ≥1000 Hz.
- **Methods:** dual force plates (LV); single plate / load-cell rigs as a separate class.
- **Benchmarks:** wide peer-reviewed data (e.g. Darrall-Jones academy rugby union reports IMTP). Note gross vs net force before comparing.
- **Tier:** LV.

### 3.4 Aerobic / conditioning

**General rules**

*Measured vs estimated*
- Measured VO₂max (lab) and field-test *estimates* of VO₂max are **never mixed**.
- Field tests are ranked on their own raw score (distance, level, speed, time).
- Estimated VO₂max can be shown as information only. Watch-estimated VO₂max (Garmin/Apple) is never ranked.

*Conditions*
- For outdoor runs, record surface and conditions.
- Flag altitude above roughly 1000 m and heat.

*Timing*
- Hand timing is fine for tests longer than about 60 s (error < 0.5%). Long time trials can merge `hand` and `electronic` into one class.

#### 22. `vo2max_lab`: VO₂max graded exercise test
- **Sports:** all endurance sports; testing-centre headline product.
- **Unit / dir:** ml·kg⁻¹·min⁻¹ (relative, primary); L·min⁻¹ (absolute, secondary); ↑.
- **Protocol:**
  - Calibrated metabolic cart (gas + volume calibration before each test).
  - Treadmill incremental protocol to volitional exhaustion in about 8–12 min. CoachHub should fix one, e.g. constant 1% grade with speed +1 km/h per min, or a fixed speed with incline steps.
  - Cycle-ergometer protocol = separate class. Non-cyclists typically score about 5–10% lower on a bike.
  - Record the **averaging window** (e.g. 30 s, or 15-breath rolling), because it changes peak values.
  - Report VO₂max if criteria are met: plateau, RER ≥ 1.10, HR near age-max, RPE ≥ 19, blood lactate ≥ 8 mmol/L. Otherwise report VO₂peak and flag it.
- **Benchmarks:**
  - FRIEND registry (Kaminsky et al. 2015), the best everyday-person percentile reference by age/sex.
  - ACSM tables.
  - Elite endurance athletes typically 70–85+ ml/kg/min (men).
- **Tier:** LV only.

#### 23. `yoyo_ir1`: Yo-Yo Intermittent Recovery Level 1
- **Sports:** soccer (standard), AFL (combine), rugby, basketball, hockey, handball.
- **Unit / dir:** distance m (store); level reported too; ↑.
- **Protocol (Bangsbo):**
  - 2 × 20 m shuttles at increasing audio-paced speed, starting at 10 km/h.
  - **10 s active recovery** (2 × 5 m jog) between shuttles.
  - The athlete is out on the second failure to reach the line in time. Score = total distance at the last successful shuttle.
  - Surface (grass/turf/court) and footwear recorded. Use the official audio.
- **Variants (separate protocols):**
  - IR2 (starts at 13 km/h; elite soccer)
  - IE1/IE2 (5 s recovery)
  - **Prone Yo-Yo IR1** (rugby league RLAP)
- **VO₂max estimate:**
  - IR1 = d × 0.0084 + 36.4. IR2 = d × 0.0136 + 45.3.
  - Validity is **contested**: R² ≈ 0.2 in professional soccer, and about 18% under-estimation in women. Display only.
- **Benchmarks:** Bangsbo, Iaia & Krustrup 2008 (Sports Med) compiles results by sport and level. Elite men's soccer is roughly 2000–2500 m+ **(verify per position/level)**.
- **Tier:** CL.

#### 24. `msft_beep`: 20 m multistage fitness test (beep test)
- **Aliases:** beep test, bleep test, Léger test, PACER (US school version), Course Navette.
- **Sports:** schools, military/police (incl. Australian Defence Force pre-entry **(verify current ADF standard)**), rugby league, AFL (historically at the combine), netball, community.
- **Unit / dir:** level.shuttle display. **Store as total shuttles + final speed (km/h)** so it sorts correctly (level 10.11 > 10.9).
- **Protocol:**
  - 20 m course, audio-paced. A foot must touch or cross the line on each beep.
  - Warning on the first miss, out on the second consecutive miss.
- **Versions matter:**
  - Léger et al. 1988: 8.5 km/h start, +0.5 km/h per ~1-min stage.
  - Ramsbottom 1988 (UK/AU "bleep test").
  - Other versions start at 8.0 km/h, and some use 2-min stages.
  - **Stage counts differ between versions**, so the audio track is part of the protocol version.
- **Benchmarks:** large school, military and police norm sets; many rugby/AFL historical data.
- **Tier:** CL. SR with an app is possible but unverifiable, so keep SR results off public boards.

#### 25. `ift_30_15`: 30-15 Intermittent Fitness Test
- **Sports:** soccer, rugby, handball, basketball, AFL. Used to prescribe interval running speeds.
- **Unit / dir:** VIFT km/h (0.5 resolution); ↑.
- **Protocol (Buchheit):**
  - 40 m shuttle, audio-paced, with 3 m tolerance zones at each end and the middle.
  - 30 s running + 15 s walking recovery. Start 8 km/h, +0.5 km/h per stage.
  - Out when the athlete fails to reach a zone on 3 consecutive beeps. VIFT = last **completed** stage.
- **Reliability:** typical error about 0.3 km/h (≈ one stage). Ties are common, so leaderboards need a tie display.
- **Benchmarks:** Buchheit's team-sport cohorts. Elite male team-sport players are commonly about 19–21+ km/h **(verify)**.
- **Tier:** CL.

#### 26. `bronco`: Bronco test
- **Sports:** rugby union and league (Australia, NZ, UK, SA), now cricket and other team sports.
- **Unit / dir:** s; ↓.
- **Protocol:**
  - Lines at 0, 20, 40, 60 m. One set = 0→20→0→40→0→60→0 (240 m).
  - **5 continuous sets = 1200 m.** A foot must touch or cross each line.
  - Stopwatch is acceptable. Record surface and footwear (boots on grass is typical).
- **Benchmarks:**
  - Secondary sources only. Pro rugby forwards about 4:50–5:10, backs about 4:20–4:45; another source gives elite men 4:15–4:25 **(verify)**.
  - No peer-reviewed professional normative dataset was found.
  - The founder's own rugby academy data could become the first CoachHub reference set.
- **Tier:** CL (SR flagged).

#### 27. `run_2km_tt`: 2 km time trial
- **Sports:** AFL (Draft Combine since 2017, replacing 3 km), rugby league pre-season, soccer.
- **Protocol:** 400 m track, 5 laps, standing start, self-paced. Stopwatch acceptable. Group starts are allowed but record them, because pacing and drafting help.
- **Methods:** `track`, `measured_course`, and `gps_only` as its own class. GPS distance error of about 1–3% is the same size as the differences being ranked.
- **Benchmarks:** best AFL combine times are about 6:00 **(verify current record)**.
- **Tier:** SR (track), CL.

#### 28. `run_2_4km_tt`: 2.4 km run
- **Sports/use:** military and police entry tests, rugby pre-season.
- **Protocol:** track, 6 laps of 400 m. **1.5 mile (2414 m) is a different protocol**, about 3–4 s longer for a typical runner. Do not relabel.
- **Benchmarks:** each service publishes pass standards. Use them as "standard" lines, not as leaderboards **(verify per force)**.
- **Tier:** SR (track), CL.

#### 29. `run_5km`: 5 km
- **Sports:** running, triathlon, general population (parkrun is the biggest everyday-athlete dataset there is).
- **Unit / dir:** s; ↓.
- **Method classes:**
  - `chip_net` (official race, certified course)
  - `parkrun` (measured course; finish timed by volunteer timekeepers + barcode)
  - `track` (12.5 laps)
  - `gps_only` (own class; never on main boards)
  - Store **net vs gun** time. Chip net is the default.
- **Age-grading:** WMA/WAVA age-grading tables give an age-graded %. This is a ready-made, widely accepted way to compare across age and sex for running events. Strongly recommended as a board option.
- **Benchmarks:** World Athletics road 5 km records (verify current at worldathletics.org); parkrun age-category records.
- **Tier:** SR via result link → `event_verified` when linked to an official result.

#### 30. `row_2k`: 2000 m indoor row
- **Sports:** rowing (the standard selection test), CrossFit, HYROX athletes, rugby/AFL cross-training, general population.
- **Unit / dir:** s (0.1); ↓.
- **Protocol:**
  - Concept2 RowErg (Model D/E) with PM5, **static** (not dynamic, not on slides; those are separate classes).
  - Drag factor self-selected and recorded. The PM computes pace from flywheel deceleration, so time is valid across drag settings.
  - 2000 m from a standing (stationary flywheel) start.
- **Verification:** results uploaded via Concept2 ErgData/PM5 "verified" to the Concept2 Online Logbook can be accepted as SR+file. Concept2 rankings show verified status.
- **Bodyweight:**
  - Lightweight category: men ≤ 75 kg, women ≤ 61.5 kg (Concept2 rankings).
  - Concept2 weight adjustment: Wf = (body weight in lb ÷ 270)^0.222, corrected time = Wf × actual time. Concept2 does not accept adjusted times in its own rankings, so use it for display only.
- **Benchmarks:**
  - Concept2 world rankings (by age, sex, weight class; huge everyday dataset).
  - Men's heavyweight WR 5:35.8 (Josh Dunkley-Smith, 2018) **(verify current; check women's open HWT WR)**.
- **Tier:** SR with verified upload; CL.

#### 31. `swim_css`: critical swim speed
- **Sports:** swimming, triathlon, open water.
- **Unit / dir:** CSS pace in s per 100 m; ↓. Also store raw 400 m and 200 m times; the **400 m TT can be its own board**.
- **Protocol:**
  - Freestyle, **push start in the water** (no dive), same session.
  - 400 m all-out → 10–15 min easy recovery → 200 m all-out.
  - CSS (m/s) = 200 ÷ (T400 − T200). Pace/100 m = 100 ÷ CSS.
- **Variants:** pool length (25 m vs 50 m; short course is faster because of turns) is part of the variant. Yards pools are a separate protocol.
- **Benchmarks:** peer-reviewed (Wakayoshi 1992 onward). 200/400 CS values are slightly higher than multi-distance models.
- **Tier:** CL; SR with pool clock.

#### 32. `ftp_cycling`: functional threshold power
- **Sports:** cycling, triathlon.
- **Unit / dir:** W (store) and W/kg (board); ↑.
- **Protocol (Allen & Coggan 20-min):**
  - Standard warm-up (≈20 min including a short all-out effort), then a 20-min maximal steady effort.
  - FTP = 0.95 × 20-min average power.
- **Variants (separate classes):**
  - Ramp test (FTP ≈ 0.75 × best 1-min power; individual error is large)
  - 8-min test (×0.9)
  - 60-min test
- **Methods:** direct-force power meter (crank/pedal/hub; zero-offset before test) vs smart trainer. These can differ by a few %, so record the device. **Virtual/estimated power is excluded.**
- **Verification:** require a `.fit` upload. Power, cadence and HR traces allow automated plausibility checks.
- **Benchmarks:** Allen & Coggan power-profile tables (W/kg by category). Male World Tour riders roughly 5.5–6.5 W/kg FTP **(verify)**.
- **Tier:** SR with file.

### 3.5 Fitness racing: HYROX

#### 33. `hyrox_race`: HYROX (Singles)

**Format**
- **8 × (1 km run + 1 station)**, always in this order:
  1. SkiErg 1000 m
  2. Sled Push 50 m
  3. Sled Pull 50 m
  4. Burpee Broad Jumps 80 m
  5. Row 1000 m
  6. Farmers Carry 200 m
  7. Sandbag Lunges 100 m
  8. Wall Balls 100 reps
- Transitions happen in the "Roxzone" and count toward total time.
- Chip-timed. Official results give total time, 8 run splits, 8 station splits and Roxzone time.

**Divisions = protocol variants.** Load by division (2025/26 per secondary sources; 26/27 rulebook appears to keep the same loads, **verify**):

| Station | Women Open | Men Open / Women Pro | Men Pro |
|---|---|---|---|
| Sled push (incl. sled) | 102 kg | 152 kg | 202 kg |
| Sled pull (incl. sled) | 78 kg | 103 kg | 153 kg |
| Farmers carry | 2 × 16 kg | 2 × 24 kg | 2 × 32 kg |
| Sandbag lunges | 10 kg | 20 kg | 30 kg |
| Wall balls | 4 kg → 9 ft (2.70 m) | 6 kg → 10 ft (Men Open) / 6 kg → 9 ft (Women Pro) | 9 kg → 10 ft |

- **Wall-ball reps:** Women Open went from 75 to 100 reps in Sept 2024. This is a textbook protocol-version change: results before and after are **not** on the same board.
- **Other divisions:** Doubles, Relay and Adaptive are separate protocols.
- **Age groups:** HYROX runs its own (16–24, 25–29, 30–34 …).

**Comparability caveats**
- Even official times vary by venue: Roxzone length, run-course accuracy, sled-lane surface friction, and indoor vs outdoor.
- HYROX itself ranks across venues within a season, so CoachHub can follow suit but should show venue and season.
- **Gym "HYROX sims" are not comparable.** Sled friction alone changes push times hugely. They are a separate `hyrox_sim` protocol with no public race board.

**Benchmarks**
- Official results at results.hyrox.com.
- Elite Pro Singles records (2026, per Hyranking / Red Bull): **men ≈ 51:59** (Alexander Rončević, Warsaw Apr 2026), **women ≈ 54:25** (Joanna Wietrzyk, Warsaw Apr 2026). **Verify against official results.**

**Tier:** `event_verified` via result link (official). SR without a link is shown on the profile only.

### 3.6 Fitness racing: CrossFit

**General CrossFit rules**
- **Division is mandatory.** Rx (as prescribed), Scaled (CrossFit's published scaled version), or a custom scaled entry (profile only, never ranked).
- **Movement standards follow CrossFit Open standards** for that season. Examples:
  - Thruster: hip crease below knee at bottom, full lockout overhead.
  - Pull-up: chin over bar; kipping allowed.
  - Wall ball: hip crease below knee, ball centre hits target.
- **Loads:** stored in kg, with the lb original kept (CrossFit prescribes in lb).
- **Verification:**
  - Judged at an affiliate = `coach_logged`.
  - Video = SR+video.
  - CrossFit Open validated scores can be imported as `event_verified`.
- **Benchmarks:**
  - No peer-reviewed norms. Community datasets (BTWB, WODprep, BoxRox percentile guides) and Games performances exist.
  - CrossFit Open leaderboards (games.crossfit.com) are the largest public dataset, but each Open workout is unique to its year.

| # | slug | Workout (Rx, men / women) | Score |
|---|---|---|---|
| 34 | `cf_fran` | 21-15-9 reps for time: thrusters 95/65 lb (43/29 kg), pull-ups | time ↓ |
| 35 | `cf_grace` | 30 clean & jerks for time, 135/95 lb (61/43 kg); any clean (power or squat), any jerk | time ↓ |
| 36 | `cf_helen` | 3 rounds for time: 400 m run, 21 American KB swings 1.5/1 pood (24/16 kg), 12 pull-ups | time ↓ |
| 37 | `cf_cindy` | AMRAP 20 min: 5 pull-ups, 10 push-ups, 15 air squats | rounds + reps ↑ (store total reps = rounds×30 + extra) |
| 38 | `cf_murph` | For time: 1 mile run, 100 pull-ups, 200 push-ups, 300 air squats, 1 mile run; Rx = 20 lb (9 kg) vest (14 lb / 6 kg women is the common Games standard, **verify**) | time ↓ |
| 39 | `cf_total` | Best 1RM each of back squat, shoulder press (strict), deadlift; 3 attempts per lift; score = sum | kg ↑ (+ relative) |

- **Murph partitioning** (e.g. 20 × Cindy in a vest) is a **separate variant**. The "unpartitioned" Rx standard is the board default.
- **Time caps:** Benchmark workouts have no official cap. CoachHub can add display caps.
- **Wave 2 Girls:**
  - Diane (21-15-9 deadlift 225/155 lb + handstand push-ups)
  - Isabel (30 snatches 135/95 lb)
  - Karen (150 wall balls 20/14 lb to 10/9 ft)
  - Annie (50-40-30-20-10 double-unders + sit-ups)
  - Jackie (1000 m row, 50 thrusters 45 lb, 30 pull-ups)

### 3.7 Sport-by-sport cross-reference (what each sport actually tests)

| Sport | Typical battery (→ catalogue slugs) |
|---|---|
| Rugby league | 10/20/40 m sprint, CMJ, med-ball throw, 505/agility, prone Yo-Yo IR1 or MSFT, 1.2 km TT/Bronco, 1–3RM squat/bench, chin-ups, IMTP, skinfolds (RLAP battery; Gabbett) |
| Rugby union | 10/40 m sprint, CMJ, Bronco, 3RM squat/bench, chin-ups, IMTP, skinfolds (Darrall-Jones/Till academy work) |
| AFL | 20 m sprint, AFL agility, standing + running vertical, 2 km TT, Yo-Yo IR1 (Draft Combine), skinfolds |
| Soccer | 10/20/30 m sprint, CMJ, 505, Yo-Yo IR1/IR2, 30-15 IFT, VO₂max |
| NFL | 40 yd (10/20 splits), vertical, broad jump, 225-lb bench reps, pro-agility, 3-cone, height/weight/arm/hand |
| Basketball (NBA) | Lane agility, shuttle, ¾-court sprint, standing + max vertical, height/wingspan/reach/hand, body fat |
| Track & field | Block 30/60 m (FAT), flying 30 m, standing long/triple jump, overhead shot throw, power clean/squat |
| Swimming | CSS (400/200), 7 × 200 step test (lab lactate), VO₂ |
| Rowing | 2k erg (primary), 6k/5k erg, VO₂max lab, weight class |
| Cycling | FTP/CP, ramp MAP, VO₂max lab, Wingate |
| Triathlon / running | 5 km/10 km, CSS, FTP, VO₂max, lactate threshold |
| Military / tactical | US Army AFT (3RM hex deadlift, hand-release push-up, sprint-drag-carry, plank, 2-mile run; replaced ACFT June 2025); USMC PFT (pull-ups, plank, 3-mile run); UK/NZ/AU services (MSFT or 2.4 km + push-ups/sit-ups; **verify per service**) |
| HYROX / CrossFit | See §3.5–3.6; plus 2k row, 1000 m SkiErg, 1RM lifts |

---

## 4. Comparability rules → data model

### 4.1 Comparability rules

| Factor | Rule | Modelled as |
|---|---|---|
| **Timing method** | Hand, single-beam, dual-beam, laser, FAT, video-app, NFL hybrid are separate classes for tests < ~60 s. For tests > 60 s, hand and electronic merge | `measurement_methods.comparability_class` + `protocol_methods.merge_into_class` |
| **Start procedure** | Fixed per protocol (stance, offset behind first gate, trigger) | `setup.start_type`, `setup.start_offset_m` (versioned) |
| **Jump measurement** | Impulse-momentum ≠ flight-time ≠ jump-and-reach ≠ app. No conversions | Separate classes; jump-and-reach is a separate protocol |
| **Units** | Yards ≠ metres; 1.5 mi ≠ 2.4 km; 25 m ≠ 50 m ≠ 25 yd pools. Different protocols, never converted | Separate slugs/variants |
| **Surface** | Track vs grass vs turf vs indoor court vs treadmill changes sprint, COD and run times | Required `conditions.surface` for speed/COD/run tests; boards can filter on it |
| **Footwear** | Spikes vs boots vs trainers (sprints, Bronco) | `conditions.footwear` |
| **Environment** | Wind (flying sprints), altitude (aerobic), heat, indoor/outdoor | `conditions.*`; flag wind > +2.0 m/s, altitude > 1000 m |
| **Equipment variant** | Trap-bar handle height, Smith vs free bar, erg model/static vs dynamic, power-meter vs trainer, Vertec vs wall | Variant field on protocol or required condition |
| **Load / division** | HYROX Open/Pro × sex; CrossFit Rx/Scaled × sex; fixed loads (bench throw, 225 reps) | `protocol_divisions` with loads |
| **Season / rule version** | HYROX season rulebooks, CrossFit standards changes | `version`, `effective_from/to`; new version = new board |
| **Bodyweight relativity** | Strength, power, FTP, rowing: show absolute **and** relative (kg/BW, BW^0.67, IPF GL, W/kg; Concept2 lightweight class) | `relative_metrics[]`; result stores `body_mass_kg` (same day; required where flagged) |
| **Age bands** | Default: U12, U14, U16, U18, U20, Open (20–34), then 5-yr masters bands (35–39, 40–44 …, WMA style). Fitness racing uses its own scheme (HYROX, CrossFit). Running: offer WMA age-grading % | `age_band_scheme` per protocol; compute from DOB at `tested_at` |
| **Sex** | Separate boards; for HYROX/CrossFit, sex is baked into the division (load) | `sex_category` on result; `division` on protocol |
| **Attempts / scoring rule** | Best vs mean vs best-per-side vs sum | `scoring_rule`; store all attempts |
| **Estimated vs measured** | Estimated 1RM, field-estimated VO₂max and watch VO₂max are never ranked against measured values | `is_estimated` flag / separate class |
| **Juniors** | Under-18s off public boards without guardian consent (roadmap decision); under-18 1RM needs CL+ | Board query filter + consent flag |

### 4.2 Proposed tables

#### `test_protocols`

One row per protocol **version**.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text | Stable key, e.g. `sprint_20m`; unique with `version` |
| version | int | Bump when anything that affects comparability changes |
| supersedes_id | uuid FK → test_protocols | Previous version |
| name | text | "20 m sprint" |
| aliases | text[] | Search: "beep test", "bleep", "PACER" |
| category | enum | `speed`, `agility`, `jump_power`, `strength`, `aerobic`, `fitness_race`, `benchmark_wod`, `anthropometric` |
| sports | text[] | For discovery and sport/position boards |
| description_md | text | Athlete-facing summary |
| protocol_md | text | Coach/operator instructions (the fixed recipe) |
| score_type | enum | `time`, `distance`, `height`, `load`, `reps`, `rounds_reps`, `level_shuttle`, `speed`, `power`, `force`, `ratio`, `pace` |
| primary_metric | jsonb | `{key, unit_canonical, display_unit, direction: 'lower_better'\|'higher_better', precision, display_format}` |
| secondary_metrics | jsonb | e.g. splits, RSI-mod, W/kg; each `{key, unit, direction, derived_formula?, rankable}` |
| attempts_default / attempts_max | int | |
| rest_between_attempts_s | int | |
| scoring_rule | enum | `best`, `mean`, `mean_best_2`, `best_per_side`, `sum`, `single` |
| setup | jsonb | Distances, splits, start_type, start_offset_m, box_height_cm, cone layout, gate heights, audio_track_version, pool_length |
| equipment | text[] | |
| required_conditions | text[] | e.g. `['surface','footwear']`, `['wind']`, `['pool_length']`, `['handle_height']` |
| requires_body_mass | bool | Forces same-day body mass on entry |
| relative_metrics | text[] | `per_kg`, `allometric_0_67`, `ipf_gl`, `c2_weight_adjusted`, `w_per_kg`, `age_graded_wma` |
| age_band_scheme | text | `coachhub_default`, `wma_5yr`, `hyrox`, `crossfit` |
| self_report_allowed | bool | |
| self_report_evidence | enum | `none`, `video`, `device_file`, `result_link` |
| min_tier_public_board | enum | Default board visibility threshold |
| plausible_min / plausible_max | numeric (per sex in jsonb) | Catch typos/unit errors (e.g. 10 m < 1.4 s, CMJ > 90 cm, 2k row < 5:30) |
| youth_restrictions | jsonb | e.g. `{min_tier_under_18: 'coach_logged'}` |
| governing_rulebook_url | text | HYROX/CrossFit/World Athletics/AFT |
| benchmark_refs | jsonb | `[{label, url, kind: 'pro_record'\|'norms'\|'peer_reviewed'\|'community', notes}]` |
| effective_from / effective_to | date | Seasons (HYROX 26/27, CrossFit standards) |
| is_leaderboard_enabled / is_active | bool | Anthropometrics: leaderboard off |
| created_at / updated_at | timestamptz | |

#### `measurement_methods`

Shared lookup table.

| Column | Notes |
|---|---|
| key | `hand_stopwatch`, `gates_single_beam`, `gates_dual_beam`, `laser`, `fat`, `video_app`, `nfl_combine_hybrid`, `force_plate_impulse`, `flight_time_plate`, `contact_mat`, `jump_app`, `vertec`, `wall_mark`, `tape`, `lpt`, `metabolic_cart_treadmill`, `metabolic_cart_cycle`, `erg_pm5`, `power_meter`, `smart_trainer`, `chip_timing`, `parkrun`, `gps_watch`, `audio_paced_judged`, `count`, `judged_lift`, `isak_skinfold`, `dxa`, `bia` |
| name, description | |
| requires_device | bool (lab equipment) |
| typical_error | text/numeric, e.g. "hand vs electronic ≈ 0.2–0.3 s" |

#### `protocol_methods`

Join table: which methods each protocol accepts and how they group.

| Column | Notes |
|---|---|
| protocol_id, method_key | PK |
| comparability_class | text, e.g. `electronic_gates`; a board is per class |
| merge_into_class | Optional; e.g. for Bronco, `hand_stopwatch` → `timed` |
| min_tier | Lowest tier allowed with this method |
| self_report_allowed | Per method (e.g. CMJ via `jump_app` yes, via `force_plate_impulse` no) |
| evidence_required | `video`, `device_file`, `result_link`, `operator_id` |

#### `protocol_conversions`

**Display only.**

| Column | Notes |
|---|---|
| protocol_id, from_method, to_method | |
| offset / multiplier / formula | e.g. `+0.24 s` (hand → electronic, 40 yd: 0.22–0.24) |
| source_url | |
| applies_to_ranking | Always `false` in v1 |

#### `protocol_divisions`

| Column | Notes |
|---|---|
| protocol_id, key | `rx_men`, `rx_women`, `scaled_men`, `hyrox_open_women`, `hyrox_pro_men`, … |
| sex_category | |
| loads | jsonb, e.g. `{sled_push_kg:152, wall_ball_kg:6, wall_ball_target_m:3.0, wall_ball_reps:100}` |

#### Result table additions

The existing `athlete_assessments` stores free-form `assessment_type` + `data` jsonb. Plan to supersede it with a typed `test_results` table:

| Field group | Fields |
|---|---|
| Who and what | `athlete_id`, `protocol_id` (exact version), `division_key`, `method_key`, `comparability_class` (denormalised for board queries) |
| Score | `value` (canonical SI), `attempts` (jsonb array of raw attempts + side), `secondary` (jsonb: splits, RSI-mod, …) |
| Conditions and body | `conditions` (jsonb: surface, footwear, wind, venue, indoor/outdoor, pool length, handle height, device id/model), `body_mass_kg`, `body_mass_source` |
| Trust | `tier`, `recorded_by`, `verified_by`, `testing_session_id`, `evidence_url` / `device_file_path` / `external_result_url` |
| Estimates and conversions | `is_estimated`, `converted_from` (jsonb, if a conversion was shown) |
| Context | `tested_at`, `age_at_test` (computed), `sex_category` |
| Board status | `public_consent` (junior gating), `flagged_reason` (plausibility) |

**Leaderboard query key:** `slug + version (or declared-equivalent versions) + comparability_class + division_key`, then filters for tier ≥ X, sex, age band, sport/position, region, bodyweight class and surface.

### 4.3 Example seed row (abridged)

```json
{
  "slug": "sprint_20m",
  "version": 1,
  "name": "20 m sprint",
  "aliases": ["20m dash", "20 m acceleration"],
  "category": "speed",
  "sports": ["afl", "rugby_league", "rugby_union", "soccer", "netball"],
  "score_type": "time",
  "primary_metric": {"key": "time_20m", "unit_canonical": "s", "direction": "lower_better", "precision": 2},
  "secondary_metrics": [{"key": "split_10m", "unit": "s", "direction": "lower_better", "rankable": true}],
  "attempts_default": 3,
  "rest_between_attempts_s": 180,
  "scoring_rule": "best",
  "setup": {"start_type": "standing_split_2pt", "start_offset_m": 0.5, "trigger": "first_gate", "gates_m": [0, 10, 20]},
  "required_conditions": ["surface", "footwear"],
  "self_report_allowed": true,
  "self_report_evidence": "video",
  "min_tier_public_board": "coach_logged",
  "plausible_min": {"male": 2.6, "female": 2.8},
  "methods": [
    {"method_key": "gates_dual_beam", "comparability_class": "electronic", "min_tier": "coach_logged"},
    {"method_key": "gates_single_beam", "comparability_class": "electronic_single", "min_tier": "coach_logged"},
    {"method_key": "laser", "comparability_class": "electronic", "min_tier": "lab_verified"},
    {"method_key": "video_app", "comparability_class": "video_app", "min_tier": "self_reported"},
    {"method_key": "hand_stopwatch", "comparability_class": "hand", "min_tier": "coach_logged"}
  ]
}
```

---

## 5. Key caveats & open decisions for the founder

1. **Start set-up for sprints.** This doc proposes a 0.5 m offset, two-point, self-start. The founder's own academy standard may differ (0.3 m, or front foot on the line with a gate at hip height). Pick one, publish it, and never change it without a version bump. It is the single biggest comparability lever for 10–40 m.
2. **Pro benchmarks will use other methods.** NFL combine (hybrid timing), AFL combine (its own start set-up), Sparta (vendor T-scores) and partner teams each measured their own way. "You vs pro" must compare within the same class, or display the pro data **clearly labelled as a different method**. Never silently mix them.
3. **Rights to pro data.** Combine and HYROX/CrossFit/Concept2/parkrun results are publicly visible, but scraping or re-displaying named athletes may breach terms of service or image rights. Use partner agreements or display aggregate benchmark bands.
4. **Add an `event_verified` provenance.** Official event results (HYROX, chip races, parkrun, Concept2 verified, CrossFit Open) are more trustworthy than coach_logged, but they are not "lab". They do not fit the four planned tiers cleanly.
5. **Self-report fraud surface.** Require evidence (video, device file or result link) for public boards. Run plausibility checks. Let coaches and lab results override.
6. **Field VO₂max estimates.** Do not rank them, and do not show them next to lab VO₂max without a label. The Yo-Yo equations correlate poorly with measured VO₂max in recent studies.
7. **Force-plate vendors differ.** Hawkin, VALD, Sparta and Kistler differ in filtering, take-off detection and RSI-mod definitions. For lab boards, store the vendor and treat a vendor switch as a method change until cross-validated.
8. **Body composition is sensitive.** Skinfolds, DXA and BIA should be private by default, with no public boards, especially for juniors.

---

## 6. Verify before seeding (could not confirm from primary source in this session)

- **HYROX 26/27:** station loads, Women Open wall-ball reps (100 vs 75 conflict in secondary sources), and current Pro records (51:59 / 54:25). Use the official 26/27 Singles Rulebook (hyrox.com; regional PDFs were blocked by this session's network allow-list) and results.hyrox.com.
- **NFL combine:** current 40-yd timing methodology (fully electronic vs historical hybrid); vertical-jump record (45 vs 46 in); 20-yd shuttle record (3.73 vs 3.81 s).
- **AFL Draft Combine:** 20 m sprint start set-up; current 2 km TT and test-battery details (afl.com.au).
- **Concept2:** current 2k open heavyweight records (men and women).
- **CrossFit:** Murph women's vest standard; current Open movement standards.
- **Bronco** pro normative bands; **30-15 IFT** and **Yo-Yo** elite ranges; **FTP** pro W/kg ranges.
- **Military:** current ADF, UK and NZ entry standards (MSFT level / 2.4 km times) per service.

---

## 7. Sources

**Sprint timing & speed**
- Haugen T, Buchheit M. Sprint running performance monitoring: methodological and practical considerations. *Sports Med* 2016. https://link.springer.com/doi/10.1007/s40279-015-0446-0 (preprint: https://athleticswaikatobayofplenty.org.nz/wp-content/uploads/2020/05/haugen-buchheit-sprint-monitoring-sports-med-review-in-press.pdf)
- Haugen T, Tønnessen E, Seiler S. The difference is in the start: impact of timing and start procedure on sprint running performance. *JSCR* 2012;26(2):473–479. https://journals.lww.com/nsca-jscr/Abstract/2012/02000/The_Difference_Is_in_the_Start__Impact_of_Timing.21.aspx ; Haugen PhD thesis: https://uia.brage.unit.no/uia-xmlui/bitstream/11250/218331/1/80%20Thomas%20Haugen%20avhandling.pdf
- Mann JB, et al. Validity and reliability of hand and electronic timing for 40-yd sprint in college football players. *JSCR* 2015. https://pubmed.ncbi.nlm.nih.gov/?term=Mann+hand+electronic+timing+40-yd+sprint+college+football
- Determining the source of temporal differences between electronic and hand timing systems in the 40 yard dash (JSCR abstract). https://atsu.academia.edu/JeremyHouser
- Hand vs FAT conversion conventions: https://en.wikipedia.org/wiki/Fully_automatic_time ; https://support.athletic.net/article/4sjokyho13-hand-time-conversion-standards ; https://lavic.com.au/competition/victorian-best-performances/
- Weakley J, et al. Comparison of sprint timing methods on performance, and displacement and velocity at timing initiation. https://eprints.leedsbeckett.ac.uk/id/eprint/9733
- Nimphius S, et al. Change of direction deficit: a more isolated measure of change of direction performance than total 505 time. *JSCR* 2016;30(11):3024–3032. https://ro.ecu.edu.au/ecuworkspost2013/2635

**Combines & pro benchmarks**
- NFL combine records: https://www.nbcwashington.com/news/sports/nfl/nfl-scouting-combine-records-40-yard-dash-bench-press-vertical-broad-jump/ ; https://www.foxsports.com/stories/nfl/nfl-scouting-combine-event-records ; https://www.espn.in/nfl/story/_/id/28774721/nfl-combine-records-best-worst-performances ; https://www.si.com/nfl/2024/03/05/2024-nfl-combine-results-top-performers-all-time-records-each-drill
- NFL 40 timing methodology: https://bleacherreport.com/articles/1543670-how-are-40-yard-dash-times-recorded ; https://www.si.com/nfl/2017/02/23/40-yard-dash-times-nfl-combine-history ; https://www.milesplit.com/articles/445650/how-accurate-is-the-40-yard-dash-at-the-nfl-combine
- AFL Draft Combine: https://www.afl.com.au/draft/combine ; https://www.topendsports.com/sport/afl/combine/index.htm ; https://www.topendsports.com/sport/afl/combine/results-top.htm
- NBA Draft Combine: https://fallback.topendsports.com/sport/basketball/testing-nba-draft.htm ; https://www.topendsports.com/sport/basketball/testing-draft-results-2025.htm
- US Army Fitness Test (AFT): https://www.army.mil/aft/ ; https://www.army.mil/article/284799

**Jumps / force plates**
- Sparta Science Load/Explode/Drive: https://success.spartascience.com/en/knowledge/what-are-the-movement-panel-raw-metrics ; https://success.spartascience.com/en/knowledge/load-explode-and-drive ; https://spartascience.com/sparta-101-load-explode-and-drive/
- Ebben WP, Petushek EJ. Using the reactive strength index modified to evaluate plyometric performance. *JSCR* 2010;24(8):1983–1987. https://scinapse.io/papers/2020361469
- Sole CJ, et al. Preliminary scale of reference values for evaluating RSI-mod in NCAA D-I athletes. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6315647/
- Systematic review of jump-height calculation methods (CMJ & DJ), *Sports Med* 2023. https://link.springer.com/10.1007/s40279-023-01828-x ; https://salford-repository.worktribe.com/output/1562077
- Vertec vs force plate: Ferreira et al., Reach height and jump displacement. https://digitalcommons.memphis.edu/facpubs/9976 ; Comparison of jump height from force platform and Vertec: https://lida.sport-iat.de/ta/Record/4020461?lng=en ; Validity of vertical jump measurement devices: https://lida.sport-iat.de/ta/Record/4024091 ; https://www.scienceforsport.com/vertec-jump-test/
- Comfort P, et al. Standardization and methodological considerations for the isometric mid-thigh pull. *Strength Cond J* 2019;41(2):57–79. https://e-space.mmu.ac.uk/626030/ ; setup guide: https://learning.hawkindynamics.com/knowledge/isometric-mid-thigh-pull-setup-guide

**Team-sport testing batteries**
- Gabbett TJ (rugby league physiological characteristics): https://bjsm.bmj.com/content/34/4/303 ; https://bjsm.bmj.com/content/36/5/334 ; https://bjsm.bmj.com/content/39/9/675
- Reliable testing battery for elite academy rugby league (RLAP): https://e-space.mmu.ac.uk/621560/
- Darrall-Jones J, Jones B, Till K. Anthropometric and physical profiles of English academy rugby union players. https://eprints.leedsbeckett.ac.uk/id/eprint/1270/ ; positional profiles (JSCR 2016): https://lida.sport-iat.de/ta/Record/4039687

**Aerobic / conditioning**
- Bangsbo J, Iaia FM, Krustrup P. The Yo-Yo intermittent recovery test. *Sports Med* 2008. https://pubmed.ncbi.nlm.nih.gov/?term=Bangsbo+Iaia+Krustrup+Yo-Yo+intermittent+recovery+test+2008 ; equations: https://theyoyotest.com/conversion-vo2max-yyir1.htm ; https://theyoyotest.com/formula.htm ; norms: https://www.topendsports.com/testing/norms/yo-yo.htm
- Buglione et al. 2025 (Yo-Yo VO₂max equation validity in pro soccer): https://oars.uos.ac.uk/5329/1/sports-13-00424-v3.pdf
- Léger LA, et al. The multistage 20 metre shuttle run test for aerobic fitness. *J Sports Sci* 1988;6(2):93–101. https://pubmed.ncbi.nlm.nih.gov/3184250/ ; overview: https://en.wikipedia.org/wiki/Multi-stage_fitness_test
- 30-15 IFT (Buchheit): https://www.jssm.org/jssm-10-346.xml-Fulltext ; https://www.scienceforsport.com/30-15-intermittent-fitness-test ; https://pubmed.ncbi.nlm.nih.gov/?term=Buchheit+30-15+intermittent+fitness+test+2008
- Bronco / 1200 m shuttle: https://www.topendsports.com/testing/tests/shuttle-1200m.htm ; World Rugby Passport: https://passport.world.rugby/conditioning-for-rugby/advanced-conditioning-for-female-rugby-players/conditioning/monitoring-and-evaluating-fitness-levels/
- Kaminsky LA, et al. Reference standards for cardiorespiratory fitness (FRIEND registry). *Mayo Clin Proc* 2015. https://pubmed.ncbi.nlm.nih.gov/?term=Kaminsky+FRIEND+registry+reference+standards+cardiorespiratory+fitness+2015
- Cooper KH. A means of assessing maximal oxygen intake. *JAMA* 1968;203:201–204. https://pubmed.ncbi.nlm.nih.gov/?term=Cooper+1968+means+of+assessing+maximal+oxygen+intake
- Critical swim speed: https://www.topendsports.com/testing/tests/critical-swim-speed.htm ; stroke-specific CS reliability (2023): https://jhk.termedia.pl/Stroke-Specific-Swimming-Critical-Speed-Testing-nBalancing-Feasibility-and-Scientific,170882,0,2.html
- FTP testing: https://trainright.com/ftp-tests-how-to-perform-20-minute-8-minute-and-ramp-tests/ ; Allen H, Coggan A, *Training and Racing with a Power Meter* (VeloPress).
- Concept2: 2k WR https://www.concept2.com/blog/new-2k-world-record-5358 ; record rules https://www.concept2.com/records/individual-requirements ; weight adjustment https://www.concept2.co.uk/training/weight-adjustment-calculator ; https://concept2.com/blog/why-use-weight-adjustment-calculator

**HYROX & CrossFit**
- HYROX rulebooks: 25/26 Singles (EN) https://hyroxdach.com/wp-content/uploads/2025/06/25_26-Singles-Rulebook_en_R1.pdf ; 26/27 Singles (EN) https://hyroxbenelux.com/wp-content/uploads/2026/06/26_27_HYROX_RulebookSingles_EN_FINAL.pdf ; 26/27 Relay (EN) https://hyroxfrance.com/wp-content/uploads/2026/06/26_27_HYROX_RulebookRelay_EN_Final_240626.pdf
- HYROX weights/divisions (secondary): https://fitnessvolt.com/roxrace/weights/ ; https://www.roxfit.app/blog/hyrox-divisions-explained ; https://rundida.com/tools/hyrox-weights/ ; Women Open 100 wall balls change: https://roxlyfe.com/hyrox-world-records-womens-open-75-wallballs
- HYROX records: https://www.redbull.com/int-en/hyrox-world-records-rankings ; https://hyranking.com/hyrox-world-record
- CrossFit benchmark workouts (CrossFit Journal 2003): https://library.crossfit.com/free/pdf/13_03_Benchmark_Workouts.pdf ; "New Girls": https://library.crossfit.com/free/pdf/27_04_new_girls.pdf ; community benchmark times: https://wodprep.com/blog/crossfit-benchmark-workouts-girls-best-times/ ; https://www.boxrox.com/crossfit-benchmark-workouts-the-girls/
- Murph: https://theconversation.com/the-murph-challenge-what-to-know-about-this-crossfit-workout-207149 ; https://marathonhandbook.com/murph-workout/

**Body composition & general references**
- Nana A, Slater GJ, Burke LM, Stewart AD. Methodology review: using DXA for the assessment of body composition in athletes and active people. *IJSNEM* 2015;25(2):198–215. https://acuresearchbank.acu.edu.au/item/85w93/methodology-review-using-dual-energy-x-ray-absorptiometry-dxa-for-the-assessment-of-body-composition-in-athletes-and-active-people
- ISAK (International Society for the Advancement of Kinanthropometry): https://www.isak.global
- Haff GG, Triplett NT (eds). *Essentials of Strength Training and Conditioning*, 4th ed. NSCA / Human Kinetics, 2016 (1RM protocol, test order, normative tables).
- Tanner RK, Gore CJ (eds). *Physiological Tests for Elite Athletes*, 2nd ed. Australian Institute of Sport / Human Kinetics, 2013 (Australian sport-specific protocols and norms).
- Science for Sport test library: https://www.scienceforsport.com
