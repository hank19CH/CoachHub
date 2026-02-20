# Vumation (CoachHub) Project Memory

## Tech Stack
- Vue 3 + TypeScript + Vite + Tailwind CSS
- Supabase (untyped client - requires manual relation normalization with Array.isArray checks)
- Supabase Edge Functions (Deno runtime) for AI API calls
- Pinia for state management (auth store, plans store, notifications store)
- Chart.js + vue-chartjs for analytics charts
- Claude Sonnet 4.5 (claude-sonnet-4-5-20250929) for AI features (plan/session generation, PDF/image import)
- Claude Haiku 4.5 (claude-haiku-4-5-20250929) for structured JSON extraction (spreadsheet smart-import)
- SheetJS (`xlsx` npm package) for client-side Excel/CSV pre-parsing before AI processing
- Mobile-first design with fixed bottom nav
- Stripe for payments (planned: checkout, webhooks, subscription management)
- Supabase project: `mzrmivqwywinsffkaimw` (us-west-2)

## Key Patterns
- Components use `<script setup lang="ts">` composition API
- Supabase FK relations may return as arrays - always normalize: `Array.isArray(x) ? x[0] ?? null : x ?? null`
- Custom color palette: summit (teal/purple), valencia (red/orange), emerald, peak (orange)
- Modals use bottom-sheet pattern on mobile (`items-end sm:items-center`)
- Use `as any` casts on supabase `.from()` and `.insert()` for untyped client
- Pinia stores use composition API pattern: `defineStore('name', () => { ... })`
- Edge Functions use JWT verification via `supabase.auth.getUser(token)`
- AI methodology guardrails: `getMethodologyContext(coachId)` injected into generate-plan/generate-session Edge Functions
- Smart Import SheetJS pre-parsing: frontend parses Excel/CSV via `xlsx` before sending structured JSON to Edge Function

## UI Components
- `src/components/ui/ConfirmDialog.vue` - Reusable confirm dialog (replaces native confirm())
- `src/components/ui/Toast.vue` - Animated toast notification (replaces native alert())
- `src/components/social/` - LikeButton, CommentInput, CommentsList, FollowButton
- `src/components/planner/MethodologyConfirmationCard.vue` - Coach confirms/rejects detected methodology

## Architecture Notes
- Services in `src/services/` handle Supabase queries
- Coach routes require `meta: { requiresAuth: true, requiresCoach: true }`
- Athlete routes require `meta: { requiresAuth: true, requiresAthlete: true }`
- Bottom nav NOT modified - hub pages accessed via coach/athlete hub views
- Groups/Teams accessed through hub pages, not bottom nav
- Types manually maintained in `src/types/database.ts` (not auto-generated)
- **Training Design:** AI Planner is the primary training design tool; Workouts kept for one-off sessions. Programs card removed from Coach Hub (files/DB/routes retained, just hidden from UI)
- **Plans table is `plans`**, NOT `training_plans`. training_blocks FK is `plan_id`.
- **Methodology Detection Pipeline:** Local JS feature extraction → weighted fingerprint matching → DB storage → coach confirmation → AI guardrail injection ($0/call)
- **Four Plan Types** (Sprint 12): `single_session`, `evolving_session`, `block_plan`, `season_plan` — auto-detected by AI during import
- **Self-contained sessions** (Sprint 12): `plan_sessions.session_data` JSONB stores exercises; `workout_id` is nullable. Sessions stay lightweight until coach "promotes" to Workout Library.
- **WorkoutsView** filters to `is_library = true` only. Import creates self-contained sessions by default.
- **WorkoutBuilder session mode**: `route.query.sessionMode=true` + `sessionId` loads/saves from `plan_sessions.session_data` JSONB instead of exercises table.
- **Smart Import v28:** Pre-import context dropdowns (Sport, Plan Type, Training Focus). Payload compaction (strip Volume columns + drop nulls = 30-50% size reduction). Truncation 80K→150K. Complete block extraction rule. Exercise naming = activity type only ("Sprint" not "60m Sprint"). SessionExercise JSONB maps all structured fields (distance_meters, rpe, tempo, category). Anti-column-shifting guardrails + unified JSON + section headers + raw_name dual fields + bulk exercise name review.

## Common Gotchas
- **PRICING**: Never use old placeholder pricing ($25/$50/$100). Confirmed pricing is Coach $19/$29, Team $59/$79 (beta/standard). See Sprint 13 section.
- Edit tool requires file to be read first in current session
- Build command: `npx vite build`
- File at `src/utils/analytics.ts` exports `trackEvent` function
- Plans table = `plans`, block_weeks FK = `training_block_id`
- coach_philosophy needs upsert (not update) since row may not exist
- `sport_context` column is PostgreSQL `text[]` array, NOT JSONB — use `ARRAY['x','y']` not `'[\"x\",\"y\"]'::jsonb`
- Smart Import: `cancelActiveImport()` in aiImport.ts uses AbortController for 2-minute timeout
- Smart Import blocks[] vs weeks[]: AI returns `blocks[].weeks[]` format (backward-compatible with legacy `weeks[]`)
- **plan_sessions.workout_id is NOW NULLABLE** (Sprint 12). Self-contained sessions have no workout_id.
- **workouts.is_library** column: `true` = show in WorkoutsView, `false` = plan instance only
- `saveImportedProgram()` takes optional `libraryFlags?: Set<string>` param (key: `"blockIdx-weekIdx-workoutIdx"`)
- WorkoutBuilder session mode: `route.query.sessionMode=true` + `sessionId` → loads/saves from session_data JSONB
- Evolving session AI response returns `exercises[].weeks[]` format — normalized to `blocks[]` by `normalizeEvolvingSession()` in aiImport.ts
- **`exercises.sets` is NOW TEXT** (was integer) — supports ranges like "3-4". Use `parseInt(String(ex.sets))` for arithmetic.
- **`exercises.is_section_header`** boolean column — visual section dividers (Warm-Up, Main Set, etc.), NOT actual exercises
- Default avatar is `/default-avatar.svg` (NOT .png or placeholder URLs)
- WorkoutBuilder `numOrNull()` helper coerces empty strings to null for numeric DB columns
- **Exercise naming rule**: Name = activity type ("Sprint", "Run"), NOT prescription ("60m Sprint"). Distance→`distance_meters` field.
- **Pre-import context**: Coach can select Sport/PlanType/Focus before upload; overrides AI detection. Passed as `coachSport/coachPlanType/coachTrainingFocus` to edge function.
- **JSON payload compaction** (v28): Volume columns stripped, null values dropped from rows. Truncation limit 150K (was 80K).
- **Complete Block Extraction**: AI prompt rule #3 says "scan ENTIRE document, extract ALL blocks". Prevents late phases from being missed.

## Test Accounts
- **Coach:** hencoach (user_id: `fa45c5af-741a-4356-aa3a-85dd64b142e4`)
- **Athlete:** testbob (user_id: `f2badc53-ae8b-4c78-b8df-24a6bd99d376`)

---

## Sprint 1: Auth System & Profile Management (Completed)

### Features
- User authentication (Signup/Login/Logout) via Supabase Auth
- Three user types: Coach, Athlete, Follower
- Profile management with display names, usernames, avatars, bios
- Coach profiles with qualifications, specialties, experience, verification status
- Athlete profiles with DOB, height, weight, primary sport, injury notes
- Role-based access control via useAuthStore (isCoach, isAthlete, isFollower)

### Database Tables
- `profiles` (id, username, display_name, avatar_url, bio, user_type, is_private, sport_ids)
- `coach_profiles` (id, qualifications, is_verified, verification_docs, specialties, experience_years, location, website_url, accepts_athletes)
- `athlete_profiles` (id, date_of_birth, height_cm, weight_kg, primary_sport_id, competition_level, injury_notes)
- `sports` (id, name, category, icon, is_approved)

### Key Files
- `src/stores/auth.ts` - Pinia auth store (signin, signup, fetchProfile, isCoach, isAthlete, isFollower)
- `src/views/LoginView.vue` - Email/password login
- `src/views/SignupView.vue` - Registration with user type selection
- `src/lib/supabase.ts` - Supabase client setup
- `src/types/database.ts` - All type definitions

### Routes
- `/login` (requiresGuest), `/signup` (requiresGuest)

---

## Sprint 2: Coach-Athlete Relationships & Invitations (Completed)

### Features
- Coach generates 8-character invite codes for athletes
- Athletes accept invitations and join coach roster
- Coach roster management with connected athletes
- Invite code expiration and deactivation
- Invite methods tracked (link, application, purchase)
- Coach-athlete relationship status (pending, active, inactive)

### Database Tables
- `coach_athletes` (id, coach_id, athlete_id, status, invited_via, invite_code, started_at, ended_at)
- `invite_codes` (id, coach_id, code, created_at, expires_at, is_active)

### Key Files
- `src/services/athletes.ts` - Athlete management and invite operations
- `src/services/invites.ts` - Invite code generation and redemption
- `src/components/InviteAthleteModal.vue` - Invite code generator UI
- `src/views/coach/AthletesView.vue` - Coach's athlete roster
- `src/views/InviteAcceptanceView.vue` - Invitation acceptance flow

### Routes
- `/coach/athletes` (requiresCoach), `/coach/athletes/:id` (requiresCoach), `/invite/:code` (public)

---

## Sprint 3: Programs & Workouts (Completed)

### Features
- Coaches create and manage training programs (multi-week plans)
- Programs organized into weeks, each week contains workouts
- Workouts with exercises, duration, RPE targets
- Exercise library with reps, sets, weights, duration, distance, RPE
- Exercise categories (primary, accessory, warmup, cooldown, drill, plyometric)
- Movement patterns (squat, hinge, push, pull, carry, locomotion, rotation, skill)
- Intensity prescriptions (percentage-based, RPE-based)
- Superset support via superset_group field
- Template system for reusable programs/workouts

### Database Tables
- `programs` (id, coach_id, name, description, sport_id, duration_weeks, difficulty, is_template, is_published)
- `program_weeks` (id, program_id, week_number, name, notes)
- `workouts` (id, coach_id, program_week_id, name, description, day_of_week, estimated_duration_min, workout_type, session_type, session_focus[], target_rpe, energy_system, is_template)
- `exercises` (id, workout_id, name, description, order_index, sets, reps, weight_kg, duration_seconds, distance_meters, rpe, intensity_percent, rest_seconds, video_url, category, movement_pattern, intensity_prescription, tempo, superset_group)
- `favorite_exercises` (id, coach_id, exercise_name, exercise_defaults JSONB)

### Key Files
- `src/services/workouts.ts` - Workout CRUD and management
- `src/views/coach/ProgramsView.vue` - Programs list
- `src/views/coach/ProgramEditorView.vue` - Program editor with weeks/workouts
- `src/views/coach/ProgramDetailView.vue` - Program detail
- `src/views/coach/WorkoutsView.vue` - Workouts list
- `src/views/coach/WorkoutBuilderView.vue` - Workout builder with exercise picker
- `src/views/coach/ExerciseLibraryView.vue` - Coach's exercise library

### Routes
- `/coach/programs`, `/coach/programs/new`, `/coach/programs/:id`, `/coach/programs/:id/edit` (requiresCoach)
- `/coach/workouts`, `/workouts/new`, `/workouts/:id/edit` (requiresCoach)
- `/coach/exercises` (requiresCoach)

---

## Sprint 4: Workout Assignment & Hub Dashboards (Completed)

### Features
- Coaches assign workouts to specific athletes on specific dates
- Assignment status tracking (pending, completed, skipped)
- Athlete dashboard showing assigned workouts
- Pre-workout modal showing full workout details
- Assignment notes/coaching cues from coach
- Coach Hub interface aggregating all coaching tools
- Athlete Hub interface for navigating training features

### Database Tables
- `workout_assignments` (id, workout_id, athlete_id, coach_id, assigned_date, status, notes, created_at)

### Key Files
- `src/services/assignments.ts` - Assignment CRUD and operations
- `src/components/AssignWorkoutModal.vue` - Assign workout to athlete
- `src/views/athlete/AthleteHubView.vue` - Athlete's main hub
- `src/views/athlete/AthleteDashboardView.vue` - Dashboard with assigned workouts
- `src/views/coach/CoachHubView.vue` - Coach's main hub with tool grid
- `src/components/athlete/AssignmentCard.vue` - Assignment display card
- `src/components/athlete/WorkoutPreviewModal.vue` - Pre-workout details

### Layout Components
- `src/components/layout/AppLayout.vue` - Main layout wrapper with nav and routing
- `src/components/layout/BottomNav.vue` - Fixed bottom navigation (feed/explore/create/messages/profile)
- `src/components/layout/TopHeader.vue` - Header with branding and actions

### Routes
- `/athlete/hub` (requiresAthlete), `/athlete/dashboard` (requiresAthlete), `/coach/hub` (requiresCoach)

---

## Sprint 5: Workout Execution & Personal Best Tracking (Completed)

### Features
- Full workout execution interface with exercise-by-exercise progression
- Real-time personal best detection during exercise logging
- PB tracking with type (weight, reps, time, distance)
- Rest timer with pause/resume and circular countdown
- Workout completion confirmation modal
- Exit confirmation to prevent data loss
- Per-exercise result logging (actual vs prescribed)
- PB badges highlighting achievements
- Debounced PB detection to prevent database spam

### Database Tables
- `workout_completions` (id, assignment_id, athlete_id, completed_at, duration_minutes, athlete_notes, overall_rpe, has_pb, caption, shared_exercise_ids[], share_settings, coach_feedback, feedback_at)
- `exercise_results` (id, completion_id, exercise_id, sets_completed, reps_completed, weight_used_kg, duration_seconds, distance_meters, rpe, is_pb, notes)
- `personal_bests` (id, athlete_id, exercise_name, pb_type, value, achieved_at, exercise_result_id)
- `user_streaks` (id, user_id, current_streak, longest_streak, last_workout_date, updated_at)

### Key Files
- `src/views/athlete/WorkoutExecutionView.vue` - Main execution orchestrator
- `src/components/athlete/ExerciseLogger.vue` - Dynamic logging with real-time PB detection
- `src/components/athlete/RestTimer.vue` - Circular countdown timer
- `src/components/athlete/WorkoutCompleteModal.vue` - Success celebration screen
- `src/utils/streaks.ts` - Streak calculation and tracking

### Routes
- `/athlete/workout/:id` (requiresAthlete)

---

## Sprint 6: Social Sharing & Feed (Completed)

### Features
- Athletes share workout completions as social posts
- Two-step share flow: compose (edit details) -> preview (see final post)
- Media upload (images, videos) with drag-and-drop
- Dynamic workout card component showing exercises, duration, RPE, PBs
- Privacy control (public, followers-only, private)
- Share settings per post (show duration, RPE, workout name, exercises, PBs only)
- Exercise selection for what appears on workout card
- Feed with infinite scroll pagination (20 posts per page)
- Like and comment system on posts
- Follow/unfollow system for social connections
- Public profile viewing with post history

### Database Tables
- `posts` (id, author_id, content, post_type, workout_completion_id, visibility, is_pinned, likes_count, comments_count)
- `post_media` (id, post_id, media_type, url, thumbnail_url, display_order, alt_text)
- `follows` (id, follower_id, following_id, status ['active'|'pending'])
- `likes` (id, user_id, post_id)
- `comments` (id, post_id, author_id, parent_id, content)
- Storage: `post-media` bucket with RLS

### Post Types
`'workout'`, `'pr'`, `'streak_milestone'`, `'achievement'`, `'text'`

### Key Files
- `src/services/posts.ts` - Post creation, retrieval, management
- `src/services/social.ts` - Follows, likes, comments, feed queries
- `src/views/FeedView.vue` - Dual-tab feed ("For You" / "Following") with infinite scroll
- `src/views/ExploreView.vue` - Public post discovery
- `src/views/CreatePostView.vue` - Manual post creation
- `src/views/PostDetailView.vue` - Single post detail with comments
- `src/views/ProfileView.vue` - Authenticated profile (own or other user)
- `src/views/PublicProfileView.vue` - Public profile (no auth)
- `src/components/feed/PostCard.vue` - Post display with actions
- `src/components/feed/MediaCarousel.vue` - Swipeable media carousel
- `src/components/posts/WorkoutCard.vue` - Dynamic workout summary card
- `src/components/athlete/MediaUploadZone.vue` - Drag-and-drop file upload
- `src/components/athlete/WorkoutShareModal.vue` - Share flow UI
- `src/components/social/LikeButton.vue` - Like toggle with count
- `src/components/social/CommentsList.vue` - Comments thread
- `src/components/social/CommentInput.vue` - Comment composer
- `src/components/social/FollowButton.vue` - Follow/unfollow toggle

### Routes
- `/` (Feed, requiresAuth), `/explore` (requiresAuth), `/create` (requiresAuth)
- `/@:username` (public profile), `/profile` (own profile, requiresAuth)
- `/profile/:username` (other user, requiresAuth), `/post/:id` (requiresAuth)

---

## Sprint 7: Groups/Teams (Completed)

### Features
- Coaches organize athletes into groups for bulk management
- Groups can be associated with teams and sports
- Add/remove athletes from groups
- Bulk program assignment to entire groups
- Athlete view showing their team/group memberships
- Creates individual workout_assignment records for each workout x each group member
- Batch insertion (100 records per batch) for bulk assignments

### Database Tables
- `groups` (id, coach_id, name, sport_id, team_id, description)
- `group_members` (id, group_id, athlete_id, joined_at)
- `teams` (id, coach_id, name, sport_id, description)

### Key Files
- `src/services/groups.ts` - Group CRUD, member management, bulk program assignment, team CRUD, sports lookup
- `src/views/coach/GroupsView.vue` - Groups list with create/edit/delete
- `src/views/coach/GroupDetailView.vue` - Group detail, member management, program assignment
- `src/views/athlete/TeamsView.vue` - Athlete's team/group memberships
- `src/views/athlete/TeamDetailView.vue` - Team detail (athlete perspective)

### Routes
- `/coach/groups` (requiresCoach), `/coach/groups/:id` (requiresCoach)
- `/athlete/teams` (requiresAthlete), `/athlete/teams/:id` (requiresAthlete)

---

## Sprint 8: Notifications System (Completed)

### Features
- Real-time notification system for all user interactions
- Notification types: follow, like, comment, workout_assigned, workout_completed, message
- Unread count badge in bottom nav and top header
- Notification list view with read/unread state
- Click-to-navigate from notification to relevant content
- Mark individual or all notifications as read

### Database Tables
- `notifications` (id, user_id, type, title, body, link, is_read, actor_id, created_at)

### Key Files
- `src/stores/notifications.ts` - Pinia store with unreadCount, fetchNotifications, markAsRead, markAllAsRead
- `src/services/notifications.ts` - Notification CRUD and queries
- `src/views/NotificationsView.vue` - Notification list with read/unread states
- `src/services/coaching.ts` - Coach monitoring queries

### Routes
- `/notifications` (requiresAuth)

---

## Sprint 9: Training Planner & AI Periodization (Completed)

### Training Hierarchy
Plan -> Training Blocks -> Block Weeks -> Workouts (Sessions) -> Exercises

### Database Tables (Sprint 9)
- `plans` (coach_id, name, sport, periodization_model, goal_description, status)
- `training_blocks` (plan_id, name, block_type, order_index, duration_weeks, focus_tags, notes)
- `block_weeks` (block_id, week_number, is_deload, volume_modifier, theme)
- `plan_templates` (coach_id, name, is_public, plan_snapshot JSONB)
- `plan_changelog` (plan_id, changed_by, change_type, change_summary, snapshot)
- `athlete_readiness_logs` (athlete_id, date, sleep_quality, soreness, motivation, stress, energy, notes, rpe)
- `session_feedback` (workout_id, athlete_id, perceived_rpe, notes, completed_exercises JSONB)
- `ai_plan_logs` (plan_id, coach_id, tier, action, prompt, response, model, tokens_used)
- `plan_sessions` (block_week_id, day_of_week, order_index, workout_id) - links workouts to plan week days
- Supabase RLS policies + SECURITY DEFINER functions for all tables

### Sprint 9.1 - Plan CRUD & Structure
**Services:**
- `src/services/plans.ts` - Full CRUD for plans, blocks, weeks + template support (save/load/apply)

**Store:**
- `src/stores/plans.ts` - Pinia store: activePlan, selectedBlockId, selectedWeekId, loadPlan, refreshPlan, selectBlock, selectWeek, clearPlan

**Components:**
- `src/components/planner/PlansList.vue` - Plans listing with create button
- `src/components/planner/CreatePlanModal.vue` - Create new plan form
- `src/components/planner/PlanTimeline.vue` - Left panel: block timeline with week pills
- `src/components/planner/AddBlockModal.vue` - Add training block to plan
- `src/components/planner/BlockEditor.vue` - Right panel: edit block details
- `src/components/planner/TemplateBrowser.vue` - Browse/apply plan templates

### Sprint 9.2 - Week Editor & Sessions
**Components:**
- `src/components/planner/WeekEditor.vue` - Center panel: 7-day grid with session slots
- `src/components/planner/WeekNavigation.vue` - Week selector strip
- `src/components/planner/ExerciseCard.vue` - Exercise display within sessions
- `src/components/planner/ExerciseLibrary.vue` - Exercise picker for sessions

### Sprint 9.3 - Athlete Feedback & Readiness
**Services:**
- `src/services/readiness.ts` - Readiness log CRUD + session feedback CRUD

**Components:**
- `src/components/planner/ReadinessCheckIn.vue` - Morning readiness form
- `src/components/planner/SessionFeedback.vue` - Post-workout feedback form

### Sprint 9.4 - Publishing, Changelog & Analytics
**Services:**
- `src/services/planPublish.ts` - Publish weeks to athlete calendars, create assignments, changelog entries
- `src/services/planAnalytics.ts` - Volume/intensity analytics, compliance tracking, readiness trends
- `src/services/planSessions.ts` - CRUD for plan sessions with workout data normalization

**Components:**
- `src/components/planner/PublishWeekModal.vue` - Publish week: select athletes, preview, confirm
- `src/components/planner/PlanChangelog.vue` - Version history viewer with diff snapshots
- `src/components/planner/PlanAnalytics.vue` - Charts: volume over time, compliance rates, readiness trends (Chart.js)

### Sprint 9.5 - AI Assist Layer
**Three-tier AI architecture:**
- Tier 1: Deterministic rules engine ($0 cost) - adaptive.ts
- Tier 2: AI plan modifications (~500-2k tokens) - generate-plan Edge Function
- Tier 3: Full AI plan generation (~3-8k tokens) - generate-plan Edge Function

**Services:**
- `src/services/adaptive.ts` - Tier 1 rules engine (ACWR, progressive overload, deload detection, readiness adjustments, compliance alerts)
- `src/services/athleteHistory.ts` - 10-week athlete summary for AI context (volume trends, ACWR, RPE, top exercises)
- `src/services/aiPeriodization.ts` - Frontend AI service (getTier1Suggestions, modifyPlan, generatePlan, generateSession)
- `src/services/smartImport.ts` - Sprint 10 stub types + placeholder methods

**Supabase Edge Functions:**
- `generate-plan` (ACTIVE) - Claude Sonnet 4.5, Tier 2/3, JWT-verified, logs to ai_plan_logs
- `generate-session` (ACTIVE) - Claude Sonnet 4.5, exercise prescriptions, JWT-verified

**Components:**
- `src/components/planner/AiAssistPanel.vue` - Two-tab AI panel (Suggestions + Chat)
- `src/components/planner/SessionApprovalModal.vue` - Coach review/approval for AI sessions (Sprint 9.6)

### Planner View Integration
- `src/views/coach/PlannerView.vue` - Three-panel desktop layout (PlanTimeline | WeekEditor | Right Panel)
  - Desktop right panel tabs: Details, History, Analytics, AI
  - Mobile tabbed single-panel: Plan, Week, Analytics, AI, Session
  - Route: `/coach/planner` (list) and `/coach/planner/:planId`

### Sprint 9.6 - AI Session Approval Workflow
- AI generates sessions -> preview card in chat -> "Create Workout" button
- SessionApprovalModal: select days, edit name/RPE, adjust volume/intensity multipliers, preview exercises
- Creates separate workouts per day with plan_sessions links, navigates to workout builder

---

## Sprint 10: Smart Import + Philosophy Detection (Completed)

### Database Tables
- `coach_philosophy` (coach_id UNIQUE, programs_analyzed, primary_periodization[], avg_mesocycle_length_weeks, typical_deload_frequency, volume_progression_pattern, intensity_distribution JSONB, top_exercises JSONB, movement_patterns JSONB, coaching_style_summary, recommendations[])
- `import_history` (coach_id, file_name, file_type, file_size_bytes, storage_path, ai_model_used, processing_cost_usd, processing_time_ms, programs_imported, workouts_imported, exercises_imported, detected_periodization, detected_duration_weeks, detected_sport, status, error_message, ai_result JSONB)
- `program-imports` storage bucket with coach-scoped RLS
- `check_philosophy_trigger()` - DB trigger on `programs` INSERT, auto-triggers analysis via `pg_net`
- Vault secrets: `trigger_secret`, `supabase_anon_key`

### Smart Import - File Type Routing
- **Excel (.xlsx/.xls)** -> Claude Code Execution sandbox (openpyxl/pandas)
- **CSV** -> Direct text parsing
- **PDF** -> Native document parsing (base64 document block)
- **Images** -> Vision OCR (base64 image block)

### Auto-Analysis via Database Webhook
- `programs INSERT -> trigger -> pg_net -> analyze-philosophy Edge Function`
- Dual auth: `x-trigger-secret` for server calls, `Authorization: Bearer <JWT>` for user calls
- Threshold: First analysis at >= 10 programs, re-analysis every `next_analysis_threshold` (default 10)

### Supabase Edge Functions
- `smart-import` (ACTIVE, v2) - Routes by file type, JWT-verified internally, logs to ai_plan_logs
- `analyze-philosophy` (ACTIVE, v2) - Dual auth, fetches all coach programs, Claude analysis, upserts to coach_philosophy

### Key Files
- `src/services/aiImport.ts` - importProgram, saveImportedProgram, getImportHistory
- `src/services/philosophyDetection.ts` - getCoachPhilosophy, triggerPhilosophyAnalysis, getCoachProgramCount
- `src/config/ai.ts` - AI_CONFIG (maxFileSize 10MB, supportedTypes, estimatedCostPerImport)
- `src/types/import.ts` - ImportResult, ImportHistoryRecord, CoachPhilosophy types
- `src/views/coach/SmartImportView.vue` - Drag & drop upload, processing stages, preview, import history
- `src/views/coach/PhilosophyInsightsView.vue` - Philosophy insights dashboard with charts

### Routes
- `/coach/import` (smart-import, requiresCoach)
- `/coach/philosophy` (philosophy-insights, requiresCoach)

### Coach Hub Navigation Updates
- "Smart Import" in Programming section, "Philosophy" in new Insights section

---

## Sprint 10.5: Methodology Detection + Smart Import v12 + Workouts UX (Completed)

### Methodology Detection
Local pattern matching replaces expensive AI philosophy detection ($0.015/call -> $0/call).
10 coaching methodology fingerprints with weighted markers, exclusion rules, and AI guardrails.

**Pipeline:** Load Programs -> Extract Metrics (local JS) -> Match Against Profiles (DB) -> Store Results -> Coach Confirmation UX -> Inject Guardrails into AI

**10 Methodologies:** charlie_francis, lydiard, polarized_seiler, norwegian_model, block_periodization, linear_periodization, daily_undulating, westside_conjugate, wendler_531, triphasic_dietz

**Three-Tier Integration:**
- **Feature Extraction** (`featureExtraction.ts`): Pure JS/TS, no API calls. Keyword-based exercise/workout classification.
- **Fingerprint Matching** (`fingerprintMatcher.ts`): Weighted scoring against DB methodology profiles.
- **AI Guardrails**: Compact MUST/MUST NOT strings injected into AI prompts (~100-200 tokens). Generated from fingerprint `ai_guardrails` field + confirmed methodology data.
- **Integration Point**: `aiPeriodization.ts` calls `getMethodologyContext(coachId)` in parallel with athlete context, passes `methodologyContext` string to Edge Functions `generate-plan` and `generate-session`.

**Confidence Thresholds:** <20% not stored, 20-39% stored but not displayed, 40-79% needs confirmation (diagnostic question), 80%+ auto-applied.

### Database Tables (Sprint 10.5)
- `methodology_profiles` (10 rows seeded) - id, name, intensity_distribution, session_type_mix, markers, guardrails
- `coach_methodology_matches` - per-coach detection results, status (detected/confirmed/rejected)
- `coach_extracted_metrics` - cached extracted metrics per coach (UNIQUE on coach_id)
- `methodology_learning_log` - coach feedback for future model improvement
- `coach_philosophy` - added columns: primary_methodology_id, methodology_confidence, methodology_confirmed, secondary_methodologies, extracted_metrics_id

### Smart Import v12 Rewrite
- Frontend now pre-parses Excel/CSV via SheetJS (`xlsx`) before sending to Edge Function
- Edge Function rewritten: uses Haiku 4.5 for spreadsheet JSON structuring (cheaper), Sonnet 4.5 for PDF/images
- Block-aware output format: `blocks[]` with `weeks[]` inside (backward-compatible with legacy `weeks[]`)
- Added AbortController with 2-minute timeout + `cancelActiveImport()` utility
- Duplicate import detection (same file_name + file_size while status='processing')
- Navigation guard warns user before leaving during active import
- SmartImportView: block-aware preview, total week count, improved error handling
- Import result caching via `getCachedImportResult()`
- `import_history` table gained `ai_result` JSONB column for full AI response storage

### Workouts View Enhancements
- Added type filter chips (workout_type) and duration range filters (< 30min, 30-60, 60-90, 90+)
- Search now matches workout_type and session_type in addition to name/description
- Toggle-based filter UX with clear-all button

### Other Sprint 10.5 Changes
- `aiPeriodization.ts`: All 3 AI methods (modifyPlan, generatePlan, generateSession) now use Promise.all() for parallel athlete+methodology context fetching
- Edge Functions `generate-plan` and `generate-session` accept and forward `methodologyContext` param
- PhilosophyInsightsView expanded: detection trigger, top/secondary matches, confidence bars, diagnostic questions, extracted metrics display

### Key Files (Sprint 10.5)
- `src/data/methodologyFingerprints.ts` - Research-backed fingerprint data (1516 lines)
- `src/services/featureExtraction.ts` - Keyword-based exercise/workout classification
- `src/services/fingerprintMatcher.ts` - Weighted scoring algorithm
- `src/services/methodologyDetection.ts` - Full pipeline orchestrator (DB queries, storage, coach actions)
- `src/services/methodologyAdapter.ts` - Converts research format -> DB format
- `src/types/methodology.ts` - All TS types for methodology detection
- `src/components/planner/MethodologyConfirmationCard.vue` - Coach confirmation UX
- Migration: `20250216_methodology_fingerprints.sql`

---

## Sprint 11: Real-Time Messaging System (Completed)

### Database Tables
- `conversations` (participant_1_id, participant_2_id, last_message_at)
  - Unique index on LEAST/GREATEST pair to prevent duplicate conversations
  - Trigger `update_conversation_on_message` auto-updates last_message_at
- `messages` (conversation_id, sender_id, content, attachment_url, attachment_type, is_read)
  - Realtime enabled via `supabase_realtime` publication
- `message-attachments` storage bucket (public, authenticated upload)
- RLS: Users can only see/send in conversations they participate in

### Key Files
- `src/services/messages.ts` - Full messaging service (getOrCreateConversation, getUserConversations, getConversationMessages, sendMessage, markMessagesAsRead, uploadMessageAttachment, subscribeToConversation, getTotalUnreadCount)
- `src/views/MessagesView.vue` - Conversation list with "+" new message button, user search modal with debounced search
- `src/views/MessageThreadView.vue` - Full-screen chat: message bubbles, date dividers, file attachments, auto-scroll, realtime updates, auto-resize textarea

### Routes
- `/messages` (requiresAuth), `/messages/:id` (message-thread, requiresAuth)
- message-thread hides both BottomNav and TopHeader (full-screen chat)

### Navigation
- TopHeader.vue - Messages icon (chat bubble) with unread badge, polls every 30s
- ProfileView.vue & PublicProfileView.vue - "Message" button creates/opens conversation

### Types Added
- `conversations` and `messages` table types in database.ts
- `'message'` added to NotificationType union
- `AttachmentType = 'image' | 'video'`

### Implementation Details
- Deduplication: local optimistic add + realtime subscription both check for existing message ID
- Notifications: sendMessage creates notification type 'message', links to /messages/{conversationId}
- Message thread has own fixed header (not using AppLayout TopHeader)
- Uses safe-bottom class for input area padding on iOS

---

## All Routes Summary

### Public Routes
- `/login`, `/signup` (requiresGuest)
- `/@:username` (public profile)
- `/invite/:code` (invitation acceptance)
- `/pricing` (planned - Sprint 13)

### Authenticated Routes (requiresAuth)
- `/` (Feed), `/explore`, `/create` (post creation)
- `/profile`, `/profile/:username`, `/post/:id`
- `/notifications`, `/messages`, `/messages/:id`

### Coach Routes (requiresCoach)
- `/coach/hub`, `/coach/athletes`, `/coach/athletes/:id`
- `/coach/programs`, `/coach/programs/new`, `/coach/programs/:id`, `/coach/programs/:id/edit`
- `/coach/workouts`, `/workouts/new`, `/workouts/:id/edit`
- `/coach/exercises`
- `/coach/groups`, `/coach/groups/:id`
- `/coach/planner`, `/coach/planner/:planId`
- `/coach/import`, `/coach/philosophy`

### Athlete Routes (requiresAthlete)
- `/athlete/hub`, `/athlete/dashboard`
- `/athlete/workout/:id`
- `/athlete/teams`, `/athlete/teams/:id`

---

## Complete Database Table Reference

### Auth & Profiles
- `profiles`, `coach_profiles`, `athlete_profiles`, `sports`

### Coach-Athlete Relationships
- `coach_athletes`, `invite_codes`

### Programs & Workouts
- `programs`, `program_weeks`, `workouts`, `exercises`, `favorite_exercises`

### Assignments & Execution
- `workout_assignments`, `workout_completions`, `exercise_results`, `personal_bests`, `user_streaks`

### Social
- `posts`, `post_media`, `likes`, `comments`, `follows`

### Groups/Teams
- `groups`, `group_members`, `teams`

### Notifications
- `notifications`

### Training Planner (Sprint 9)
- `plans`, `training_blocks`, `block_weeks`, `plan_sessions`
- `plan_templates`, `plan_changelog`
- `athlete_readiness_logs`, `session_feedback`
- `ai_plan_logs`

### Smart Import & Philosophy (Sprint 10)
- `import_history`, `coach_philosophy`

### Methodology Detection (Sprint 10.5)
- `methodology_profiles`, `coach_methodology_matches`, `coach_extracted_metrics`, `methodology_learning_log`

### Messaging (Sprint 11)
- `conversations`, `messages`

### Training Document Intelligence (Sprint 12)
- `plans` additions: plan_type
- `workouts` additions: is_library, is_evolving, evolution_weeks
- `plan_sessions` changes: workout_id now nullable; additions: session_data, session_name
- `import_history` additions: detected_plan_type, plan_type_confidence

### Pricing & Seat Management (Sprint 13 - Planned)
- `upgrade_prompts`
- `coach_profiles` additions: athlete_limit, bonus_seats_granted, bonus_seats_granted_at, bonus_seats_count, peak_athlete_count

### Storage Buckets
- `post-media` - Social post media uploads
- `program-imports` - Smart import file uploads
- `message-attachments` - Message file attachments

---

## Supabase Edge Functions (All 4)
1. `generate-plan` - Claude Sonnet 4.5, Tier 2/3 AI plan modifications & generation, accepts `methodologyContext` for guardrail injection
2. `generate-session` - Claude Sonnet 4.5, exercise prescription generation, accepts `methodologyContext` for guardrail injection
3. `smart-import` (v28) - Pre-import context dropdowns, payload compaction, complete block extraction, anti-column-shifting, exercise naming rules. Plan type classification (4 types), file type routing: Haiku 4.5 for spreadsheets, Sonnet 4.5 for PDF/images; evolving session schema; accepts pre-parsed SheetJS data
4. `analyze-philosophy` - Coaching philosophy analysis, dual auth (JWT + trigger secret)

All functions: `verify_jwt = false` at gateway level (see Technical Debt), internal JWT verification via `supabase.auth.getUser(token)`

---

## Post-Sprint Bug Fixes & Improvements

### RLS Error Handling (Post-Sprint 9)
- All 20+ `throw new Error()` in plans.ts now pass through Supabase error.message
- AddBlockModal.vue & BlockEditor.vue: Added errorMessage ref + red error banner UI

### PostCard TransitionGroup Fix
- Moved `<Teleport to="body">` inside `<article>` root for single root node

### Responsive Design Fix - Full Desktop Support
- `AppLayout.vue`: Added `needsFullWidth` computed for planner routes
- Planner pages use full browser width, other pages remain centered at 512px

### Workout Builder Integration with Planner
- Added `plan_sessions` table linking workouts to plan week days
- WeekEditor loads sessions via watcher, click-to-create
- WorkoutBuilderView detects plan context from query params

### Navigation & Data Loading Fixes
- Fixed 404 errors when clicking days in planner week grid
- Fixed 400 Bad Request from athleteHistory queries (session_feedback -> workout_completions)

### Coach Hub Simplification (2026-02-16)
- Removed Programs card from CoachHubView.vue Programming section
- AI Planner is now the primary training design tool (handles 4-12+ week blocks)
- Workouts card remains for one-off session builds
- Programs files, DB tables, and routes all retained — just not surfaced in Coach Hub UI

---

## Technical Debt / Cleanup Backlog

### Edge Function JWT: `verify_jwt` disabled (gateway-level)
- **Date:** 2026-02-14
- All four Edge Functions deployed with `--no-verify-jwt`
- Gateway-level JWT was returning 401 before function code ran
- Internal verification via `supabase.auth.getUser(token)` still rejects unauthenticated requests
- **Ideal fix:** Debug gateway JWT failure, re-enable `verify_jwt = true`

### Frontend AI service uses `supabase.functions.invoke()`
- Switched from raw `fetch()` in aiPeriodization.ts during JWT debugging
- This is the better pattern (handles auth automatically)

---

## Key Project Docs
- `docs/DATABASE_SCHEMA.md` - Comprehensive database schema (44 tables, 10 enums, 120+ indexes, RLS policies, Sprint 12 columns, future proposals)
- `docs/PROJECT_MEMORY.md` - This file

---

## Sprint 12: Training Document Intelligence + Planner Fixes (Completed)

### Overview
AI-powered document type classification for Smart Import, self-contained plan sessions that don't require backing workout records, WorkoutBuilder session mode for editing plan sessions in-place, and WeekEditor rewrite for direct session editing.

### Database Changes (Migration: `20250218_sprint12_training_intelligence.sql`)
- `plans.plan_type` — `text DEFAULT 'block_plan'` CHECK (`single_session`, `evolving_session`, `block_plan`, `season_plan`)
- `workouts.is_library` — `boolean DEFAULT false` (true = show in WorkoutsView, false = plan instance only)
- `workouts.is_evolving` — `boolean DEFAULT false`
- `workouts.evolution_weeks` — `integer`
- `plan_sessions.workout_id` — **NOW NULLABLE** (was NOT NULL)
- `plan_sessions.session_data` — `jsonb DEFAULT '[]'` (self-contained exercise data)
- `plan_sessions.session_name` — `text`
- `import_history.detected_plan_type` — `text` CHECK (same 4 types)
- `import_history.plan_type_confidence` — `numeric(4,3)`
- Indexes: `idx_plans_type`, `idx_workouts_library`
- Backfill: existing workouts → `is_library = true`, existing plans → `plan_type = 'block_plan'`

### Sprint 12.1 — DB Migration
- Additive migration with IF NOT EXISTS, safe to re-run
- All existing workouts backfilled as library items
- All existing plans backfilled as block_plan type

### Sprint 12.2 — Edge Function Plan Type Classification
- Smart Import Edge Function (v14/deployed as v18): SYSTEM prompt includes 4 plan type definitions + classification instructions
- AI response includes `detected_plan_type` and `plan_type_confidence` fields
- Evolving session schema: `exercises[].weeks[]` with per-week `sets/reps/weight/load_percent`
- Stored in `import_history` alongside AI result

### Sprint 12.3 — Coach Abbreviation Glossary (in prior commit)
- Auto-learns shorthand exercise names from import corrections

### Sprint 12.4 — WeekEditor Rewrite
- `WeekEditor.vue` completely rewritten for self-contained sessions
- Session cards show exercises from `session_data` JSONB
- Direct session name editing, click-to-edit in WorkoutBuilder session mode
- Handles both legacy (workout_id-backed) and new (session_data) sessions

### Sprint 12.5 — Smart Import UI
- **Plan Type Selector**: 4 cards (`single_session`, `evolving_session`, `block_plan`, `season_plan`)
- Auto-selects from AI detection with confidence badge (green ≥0.7, yellow 0.4-0.69, gray <0.4)
- Coach can override AI selection
- **Adaptive Preview**: Different preview layouts per plan type
- **Library Flags**: Per-session toggle to save to Workout Library (default off)
- `saveImportedProgram()` accepts `libraryFlags?: Set<string>` with `"blockIdx-weekIdx-workoutIdx"` keys

### Sprint 12.6 — WorkoutBuilder Session Mode + Planner Fix
- `WorkoutBuilderView.vue`: New session mode via `route.query.sessionMode=true` + `sessionId`
- Loads/saves from `plan_sessions.session_data` JSONB instead of `exercises` table
- `PlannerView.vue`: Click-to-edit routes to WorkoutBuilder in session mode
- `planSessions.ts`: Added `getSessionById()`, `updateSessionData()`, `promoteSessionToLibrary()`

### Sprint 12.7 — Evolving Session Normalization + Edge Function Deploy
- `normalizeEvolvingSession()` in `aiImport.ts` converts `exercises[].weeks[]` → `blocks[].weeks[].workouts[].exercises[]`
- Called after import and on cached result retrieval
- Ensures evolving sessions work with existing preview UI and save logic
- Edge Function deployed as v18 with plan type classification

### Sprint 12.8 — Section Headers, Sets-as-Text, Default Avatars
- **WorkoutBuilderView**: Section header support (add/display/skip in numbering/load calculations), preview modal with full exercise grid, `numOrNull()` helper, sets form field changed to text (supports ranges like "3-4")
- **WorkoutExecutionView**: Section headers filtered from trackable exercises, `currentSectionHeader` computed shows section label above current exercise
- **ExerciseLogger**: `parseInt(String(ex.sets))` for sets initialization (text → number)
- **SessionApprovalModal**: Same `parseInt()` fix for volume multiplier calculation
- **featureExtraction.ts / planAnalytics.ts**: All `ex.sets` references wrapped with `parseInt(String())` for sets-as-text
- **database.ts**: `exercises.sets` type changed from `number | null` to `string | null`, `is_section_header: boolean` added
- **Default avatars**: All `default-avatar.png` and `via.placeholder.com` references replaced with `/default-avatar.svg`
- **CoachHubView**: Removed "Invite Athlete" card (redundant with Athletes view)
- **DATABASE_SCHEMA.md**: `exercises.sets` documented as `text`, `is_section_header` added
- **supabase/config.toml**: Added `smart-import` and `analyze-philosophy` function configs

### Sprint 12.9 — Smart Import v28 (Anti-shifting, Field Mapping, Block Extraction)
- **Pre-import context dropdowns**: 3 optional dropdowns (Sport, Plan Type, Training Focus) on SmartImportView
- **Exercise naming fix**: AI now uses "Sprint" (≤400m) / "Run" (>400m) instead of embedding distance in name
- **SessionExercise JSONB field mapping**: Added `distance_meters`, `duration_seconds`, `rpe`, `tempo`, `category`, `intensity_percent`, `target_time_seconds` to SessionExercise type; save path maps each field individually instead of collapsing into notes string
- **Payload compaction**: Strip `*_Volume` columns + drop null values from JSON rows (30-50% size reduction)
- **Truncation limit**: 80K → 150K characters to prevent late training blocks from being cut off
- **Complete Block Extraction rule**: AI prompt reinforced to scan entire column A for all phases before extracting
- **Anti-column-shifting** (v27): ANTI-SHIFTING RULE + 4 WRONG examples in Haiku prompt

### Key Files Modified
- `supabase/functions/smart-import/index.ts` — Plan type classification, sport rules, anti-shifting, complete block extraction, pre-import context
- `src/services/aiImport.ts` — Library flags, evolving normalization, plan type handling, JSONB field mapping, payload compaction
- `src/services/planSessions.ts` — getSessionById, updateSessionData, promoteSessionToLibrary
- `src/views/coach/SmartImportView.vue` — Plan type selector, adaptive preview, library flags, pre-import dropdowns
- `src/views/coach/WorkoutBuilderView.vue` — Session mode, section headers, preview modal, numOrNull, sets-as-text
- `src/views/coach/WorkoutsView.vue` — `is_library = true` filter
- `src/views/athlete/WorkoutExecutionView.vue` — Section header support in execution flow
- `src/components/planner/WeekEditor.vue` — Complete rewrite for self-contained sessions
- `src/views/coach/PlannerView.vue` — Session mode routing
- `src/types/database.ts` — Sprint 12 type additions + sets-as-text + is_section_header
- `src/types/import.ts` — PlanType, EvolvingExercise, SessionExercise with full structured fields

---

## Sprint 13 (Planned): Pricing & Seat Management

### Pricing Tiers

**Beta Pricing (First 50 Coaches - Grandfathered Forever)**
| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| Coach | $19/mo | $190/yr | $38 |
| Team | $59/mo | $590/yr | $118 |

**Post-Beta Standard Pricing**
| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| Coach | $29/mo | $290/yr | $58 |
| Team | $79/mo | $790/yr | $158 |

- Annual discount: ~17% (2 free months)

### Free Trial Strategy
- **Coach Tier**: 9-day trial, NO card required (lower friction, more signups)
- **Team Tier**: 9-day trial, CARD required (filters for serious users, prevents AI API abuse)
- 9 days is intentionally unusual (stands out vs 7/14-day norms)

**Trial Email Sequence:** Day 0 (welcome), Day 1 (onboarding), Day 3 (value stats), Day 6 (check-in), Day 8 (convert CTA), Day 9 (expires)

### Athlete Seat Limits & Bonus Seats Strategy
- Coach tier default: **20 athletes**
- At 18 athletes: soft nudge upgrade prompt
- At 20 athletes: auto-grant **3 bonus seats** (→ 23 cap), celebration modal
- At 23 athletes: hard gate, must upgrade to Team
- 14 days after bonus: follow-up upgrade offer if at 21-23 athletes
- Track `peak_athlete_count` to prevent gaming via delete/re-add
- Team tier: **unlimited athletes**

**Psychological triggers:** reciprocity (free bonus), loss aversion (don't lose progress), commitment escalation (sunk cost at 20+), delight > friction (surprise bonus vs hard paywall)

### Edge Cases
- Coach deletes athletes to stay under 20 → bonus eligibility based on peak_athlete_count
- Upgrades before hitting 20 → grant bonus as thanks
- Downgrade from Team to Coach with >23 athletes → 30-day grace period

### Database Changes (Sprint 12)
```sql
-- Add to coach_profiles
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS
  athlete_limit INTEGER DEFAULT 20,
  bonus_seats_granted BOOLEAN DEFAULT FALSE,
  bonus_seats_granted_at TIMESTAMP WITH TIME ZONE,
  bonus_seats_count INTEGER DEFAULT 0,
  peak_athlete_count INTEGER DEFAULT 0;

-- New table: upgrade_prompts
CREATE TABLE IF NOT EXISTS upgrade_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  prompt_type TEXT NOT NULL, -- 'soft_nudge', 'bonus_unlock', 'hard_gate', 'follow_up'
  athlete_count INTEGER NOT NULL,
  shown_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  action_taken TEXT, -- 'upgraded', 'dismissed', 'reminded_later', null
  action_taken_at TIMESTAMP WITH TIME ZONE
);

-- DB function
CREATE OR REPLACE FUNCTION can_add_athlete(coach_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
  limit_count INTEGER;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM coach_athletes WHERE coach_id = coach_user_id AND status = 'active'),
    (SELECT athlete_limit FROM coach_profiles WHERE id = coach_user_id)
  INTO current_count, limit_count;
  RETURN current_count < limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Implementation Phases
1. **Phase 1: Core Seat Logic (2-3 days)** — DB schema, RLS, `checkAthleteLimit()`, `grantBonusSeats()`
2. **Phase 2: UI Components (2-3 days)** — UpgradePrompt.vue, SeatLimitBanner.vue, BonusSeatsUnlock.vue, athlete counter
3. **Phase 3: Trigger Logic (1-2 days)** — invite checks, nudges at 18, bonus at 20, gate at 23, 14-day follow-up
4. **Phase 4: Stripe Integration (2-3 days)** — products (Coach/Team x Beta/Standard x Monthly/Annual), checkout, webhooks, proration, trials
5. **Phase 5: Pricing Page (1 day)** — `/pricing` with tier comparison, annual/monthly toggle, beta counter

### Planned Components
- `UpgradePrompt.vue` - Reusable upgrade modal
- `SeatLimitBanner.vue` - Dashboard warning banner
- `BonusSeatsUnlock.vue` - Celebration modal
- Pricing page view

### Planned Route
- `/pricing` - Public pricing page with tier comparison and beta spots counter

### Analytics Events
- `athlete_limit_warning`, `bonus_seats_granted`, `upgrade_prompt_shown`, `upgrade_completed`

### Target Metrics
- Coach → Team conversion: 15-25%
- Trial → Paid (Coach): 25-35%, (Team): 40-50%

### Competitive Positioning
- TrainHeroic: Hard limits, no grace period
- TrueCoach: Strict athlete caps
- CoachHub: "We grow with you" — bonus seats, delight moments, gradual nudges

---

## Future Plans (Decided, Not Yet Implemented)

### Gemini for Smart Import (Cost Optimization)
- Decision: implement when volume > 1000 imports/month (currently ~10-50/month)
- Route CSV/images to Gemini Flash (~20x cheaper), keep Claude for PDF/Excel
- Philosophy analysis to Gemini Pro (~2.4x cheaper)

### ~~Philosophy Detection -> Methodology Identification~~ **DONE (Sprint 10.5)**
- Implemented: 10 named methodology fingerprints (Charlie Francis, Westside Barbell, Lydiard, etc.)
- Confidence scoring, weighted marker matching, AI guardrail injection
- $0/call via local pattern matching (replaced $0.015/call AI approach)
