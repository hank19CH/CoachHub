# CoachHub — Build Plan (for approval)

> Approved 2026-11-03 (storefront pulled ahead of testing). Drafted 2026-11-03 after a full repo + live-database audit. Each sprint lists scope, what's already in the repo, and the decisions it needs. See `VISION.md` for the why.
> Sprint numbers continue from Notion's tracker; the old "Sprint 15: Key Metric" candidate moves to Sprint 20 (post-beta feedback, as its brief says).

## Guiding order

1. **Ship the beta** (Layer 0) — real coaches using it is worth more than any feature.
2. **Coach storefront** (Layer 2, pulled forward — approved 2026-11-03) — coaches earning on the platform makes them stay.
3. **Testing + leaderboards** (Layer 1) — the founding insight and the moat; protocols researched first (`TESTING_PROTOCOLS.md`).
4. **Multi-sport, devices, partners, centres** (Layers 3–4) — built on the same testing and session foundations.

---

## Sprint 14.5 — Beta launch (finish) · ~1 sprint
**Goal:** 50 Australian coaches can sign up, onboard and run a squad.

Done on branch `claude/relaxed-planck-ps3xp9`: onboarding flows, tours, checklist, Google sign-in, error boundaries, rate limits, npm audit.

Remaining:
- [ ] Henry: run migrations `20261102_social_rate_limits.sql`, `20261103_onboarding.sql`
- [ ] Henry: Google OAuth (Google Cloud client + Supabase provider + redirect URLs)
- [ ] Merge branch → `main` (PR) → production
- [ ] Tester access: attach custom domain (or turn off Vercel Deployment Protection) + set Supabase Site URL
- [ ] Audit fixes:
  - Coach on desktop keeps the sidebar on Feed / Notifications / Messages / Profile / 404
  - Remove "AI" from the Hub's AI Planner / Smart Import / Philosophy card labels where AI is parked
  - Remove dead route `/coach/programs/new`
  - Block Modeler title truncation
  - `.single()` → `.maybeSingle()` where "no row yet" is normal (console noise)
  - Trial length 9 → 14 days (approved)
- [ ] xlsx security patch (needs `cdn.sheetjs.com` allowed in the environment, or done locally)
- [ ] PB notifications ("you hit a PB" / "your athlete hit a PB") — the one missing piece of the habit loop

## Sprint 15 — Coach storefront v1 · ~2 sprints
**Goal:** a coach sells a program and gets paid.

- Stripe Connect (Express) onboarding for coaches; platform fee %
- Products: **program-only** (one-off), **virtual coaching** (monthly subscription), **squad membership** (monthly)
- Public coach page / storefront (shareable link), checkout, receipt
- Purchase → athlete account auto-linked to coach + program auto-assigned
- Coach sales dashboard (revenue, active clients)
- Note: existing `programs` and `plans` overlap — storefront sells **plans** (Block Modeler output); the older `programs` system gets retired or folded in

## Sprint 16 — Testing & verified results · ~1.5 sprints
**Goal:** a coach runs a testing day in CoachHub; results land on athlete profiles with a verification badge and post to the feed.

Already there: `athlete_assessments` table (live, unused), `personal_bests.source`, PB feed posts.

- Test catalogue with fixed protocols (`test_protocols`) — seeded from the research in `TESTING_PROTOCOLS.md`: speed, jumps/power, strength, aerobic/conditioning, plus HYROX and CrossFit benchmarks
- Testing sessions: coach picks tests + athletes → fast grid entry on tablet (multiple attempts, best-of)
- Results stored with **verification tier** (self_reported / coach_logged; lab_verified + pro_partner reserved)
- Athlete profile "Testing" tab: latest, best, history chart per test, badge per tier
- Auto feed post for PBs from testing ("New 20m best — coach-verified")
- Athletes can self-report tests (shown as self-reported)
- Migration + RLS (athlete owns visibility; coach writes for own athletes)

## Sprint 17 — Leaderboards + Explore · ~1 sprint
**Goal:** "How do I measure up?" — the Explore tab becomes the discovery home.

- Leaderboards per test, filterable by sport/position, age band, sex, region, tier
- Scopes: my squad → my club → region → everyone
- Privacy (approved): **opt-in public** — squad boards visible to teammates by default, public/regional boards only after the athlete opts in; under-18s hidden from public boards unless guardian consent; coach can restrict squad boards
- Explore page: leaderboards, people/coaches to follow, teams
- Profile fields needed: birth year, sex, region (collected in onboarding, editable in settings)

## Sprint 18 — Virtual coaching + squads · ~1.5 sprints
- Weekly athlete check-in (readiness, notes, photos/video) → coach review queue
- Coach adjusts next week from check-in (reuses Block Modeler levers)
- Squad sessions: schedule, location, attendance, capacity
- Messaging tie-ins (check-in threads)

## Sprint 19 — Multi-sport sessions · ~1.5 sprints
- Endurance session types: distance, duration, pace, HR/power zones, intervals (swim / run / bike / row)
- Zones per athlete (thresholds), session load (e.g. TSS-style)
- Block Modeler levers for endurance (volume = distance/time, intensity = zone mix)

## Sprint 20 — Key Metric + training-mode roles (existing brief) · ~1 sprint
- Per Notion: engine already in repo (`channels.ts`, 23 tests). Remaining: migration, wire `generateChannelBlock()`, `KeyMetricPanel.vue`, per-exercise Mode override. Scheduled after beta feedback.

## Later (sequenced, not yet sized)
- **Device data:** Strava + Garmin first (web OAuth) → Whoop, Oura → Apple Health (requires a native app) → `readiness_logs` already has HRV / resting HR / sleep / source / raw_data columns
- **Native app shell** (Capacitor) — push notifications, Apple Health, camera
- **Data-informed Block Modeler** — readiness and load suggest lever changes
- **Pro partner portal** — bulk import of team testing data, display rules (named / anonymised / averages), partner-verified tier
- **Testing Centre mode** — operator check-in, kiosk entry, device integrations (force plate, timing gates, VO2 cart), booking + payment, lab-verified tier
- **Creator subscriptions + The Locker** (kit, affiliate)
- **Club / brand accounts + marketplace**
- **Phase 2 program engine migration** (held until beta feedback)
- **AI Assist + Plan Analytics** (parked — refine and return)

## Decisions
- ✅ Order: beta → storefront → testing → leaderboards → virtual coaching → multi-sport → key metric
- ✅ Test battery: all four categories + HYROX + CrossFit, after protocol research
- ✅ Leaderboards opt-in public; under-18s off public boards without guardian consent
- ✅ Trial 14 days
- ⏳ Final name (CoachHub vs Ascend vs other) — blocks the domain and storefront branding, not the build
- ⏳ Platform fee % on coach sales (Sprint 15)
