# Vumation (CoachHub) — Complete Database Schema

> **Generated:** 2026-02-16 | **Supabase Project:** `mzrmivqwywinsffkaimw` (us-west-2)
> **Source of truth:** Live database introspection + migration files + TypeScript types

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Custom Enum Types](#custom-enum-types)
3. [Domain: Identity & Auth](#domain-identity--auth)
4. [Domain: Coach-Athlete Relationships](#domain-coach-athlete-relationships)
5. [Domain: Training Content](#domain-training-content)
6. [Domain: Training Planner & AI](#domain-training-planner--ai)
7. [Domain: Workout Execution & Progress](#domain-workout-execution--progress)
8. [Domain: Social Feed](#domain-social-feed)
9. [Domain: Groups & Teams](#domain-groups--teams)
10. [Domain: Notifications](#domain-notifications)
11. [Domain: Messaging](#domain-messaging)
12. [Domain: Smart Import & Philosophy](#domain-smart-import--philosophy)
13. [Domain: Methodology Detection](#domain-methodology-detection)
14. [Storage Buckets](#storage-buckets)
15. [Database Functions & Triggers](#database-functions--triggers)
16. [Future Schema (Planned)](#future-schema-planned)
17. [Entity Relationship Diagram](#entity-relationship-diagram)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VUMATION / COACHHUB                         │
├─────────────┬───────────────┬──────────────┬───────────────────────┤
│  Identity   │   Training    │    Social    │     Intelligence      │
│  & Auth     │   Design      │    Layer     │     & AI              │
├─────────────┼───────────────┼──────────────┼───────────────────────┤
│ profiles    │ plans         │ posts        │ coach_philosophy      │
│ coach_prof  │ training_     │ post_media   │ methodology_profiles  │
│ athlete_    │   blocks      │ likes        │ coach_methodology_    │
│   prof      │ block_weeks   │ comments     │   matches             │
│ sports      │ plan_sessions │ follows      │ coach_extracted_      │
│ coach_      │ workouts      │              │   metrics             │
│   athletes  │ exercises     │              │ methodology_          │
│ invite_     │ programs      │              │   learning_log        │
│   codes     │ exercise_     │              │ import_history        │
│             │   library     │              │ ai_plan_logs          │
│             │ periodization_│              │ ai_chat_sessions      │
│             │   templates   │              │ ai_chat_messages      │
├─────────────┼───────────────┼──────────────┼───────────────────────┤
│  Execution  │  Organization │  Comms       │                       │
├─────────────┼───────────────┼──────────────┤                       │
│ workout_    │ teams         │ conversations│                       │
│  assignments│ groups        │ messages     │                       │
│ workout_    │ group_members │ notifications│                       │
│  completions│ plan_athletes │              │                       │
│ exercise_   │               │              │                       │
│   results   │               │              │                       │
│ personal_   │               │              │                       │
│   bests     │               │              │                       │
│ user_streaks│               │              │                       │
│ readiness_  │               │              │                       │
│   logs      │               │              │                       │
│ session_    │               │              │                       │
│   feedback  │               │              │                       │
│ athlete_    │               │              │                       │
│  assessments│               │              │                       │
└─────────────┴───────────────┴──────────────┴───────────────────────┘
```

**Total app tables:** 44 | **Indexes:** 120+ | **RLS policies:** 37+

---

## Custom Enum Types

| Enum Name | Values | Used By |
|-----------|--------|---------|
| `user_type` | `coach`, `athlete`, `follower` | profiles.user_type |
| `coach_athlete_status` | `pending`, `active`, `inactive` | coach_athletes.status |
| `invite_method` | `link`, `application`, `purchase` | coach_athletes.invited_via |
| `difficulty_level` | `beginner`, `intermediate`, `advanced` | programs.difficulty |
| `assignment_status` | `pending`, `completed`, `skipped` | workout_assignments.status |
| `pb_type` | `weight`, `reps`, `time`, `distance` | personal_bests.pb_type |
| `post_type` | `manual`, `workout`, `achievement` | posts.post_type |
| `media_type` | `image`, `video`, `workout_card` | post_media.media_type |
| `visibility` | `public`, `followers`, `private` | posts.visibility |
| `follow_status` | `pending`, `active` | follows.status |

---

## Domain: Identity & Auth

### `profiles`
Central user identity table. FK from `auth.users.id`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | — | FK → auth.users |
| username | `text` | NO | — | UNIQUE |
| display_name | `text` | NO | — | |
| avatar_url | `text` | YES | — | |
| bio | `text` | YES | — | |
| user_type | `user_type` | NO | — | coach / athlete / follower |
| is_private | `boolean` | YES | `false` | |
| sport_ids | `uuid[]` | YES | `'{}'` | Array of sport references |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `profiles_pkey`, `profiles_username_key` (UNIQUE)

---

### `coach_profiles`
Extended profile data for coaches. 1:1 with profiles.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | — | FK → profiles |
| qualifications | `text` | YES | — | |
| is_verified | `boolean` | YES | `false` | |
| verification_docs | `text[]` | YES | `'{}'` | |
| specialties | `text[]` | YES | `'{}'` | |
| experience_years | `integer` | YES | — | |
| location | `text` | YES | — | |
| website_url | `text` | YES | — | |
| accepts_athletes | `boolean` | YES | `true` | |

---

### `athlete_profiles`
Extended profile data for athletes. 1:1 with profiles.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | — | FK → profiles |
| date_of_birth | `date` | YES | — | |
| height_cm | `numeric` | YES | — | |
| weight_kg | `numeric` | YES | — | |
| primary_sport_id | `uuid` | YES | — | FK → sports |
| competition_level | `text` | YES | — | |
| injury_notes | `text` | YES | — | |

---

### `sports`
Reference table of sports.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| name | `text` | NO | — | UNIQUE |
| category | `text` | YES | — | |
| icon | `text` | YES | — | |
| is_approved | `boolean` | YES | `true` | |
| created_at | `timestamptz` | YES | `now()` | |

---

## Domain: Coach-Athlete Relationships

### `coach_athletes`
Manages the coach-athlete relationship lifecycle.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| athlete_id | `uuid` | YES | — | FK → profiles |
| status | `coach_athlete_status` | YES | `'pending'` | |
| invited_via | `invite_method` | YES | — | |
| invite_code | `text` | YES | — | |
| started_at | `timestamptz` | YES | — | |
| ended_at | `timestamptz` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(coach_id, athlete_id)
**Indexes:** `idx_coach_athletes_coach(coach_id, status)`, `idx_coach_athletes_athlete(athlete_id, status)`

---

### `invite_codes`
Shareable invite codes for coaches to onboard athletes.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK (no explicit table ref in schema) |
| code | `text` | NO | — | UNIQUE |
| created_at | `timestamptz` | YES | `now()` | |
| expires_at | `timestamptz` | YES | `now() + 30 days` | |
| is_active | `boolean` | YES | `true` | |

---

## Domain: Training Content

### `programs`
Multi-week training programs (legacy, predates AI Planner).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| name | `text` | NO | — | |
| description | `text` | YES | — | |
| sport_id | `uuid` | YES | — | FK → sports |
| duration_weeks | `integer` | YES | — | |
| difficulty | `difficulty_level` | YES | — | |
| is_template | `boolean` | YES | `false` | |
| is_published | `boolean` | YES | `false` | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_programs_coach(coach_id)`

---

### `program_weeks`
Week containers within a program.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| program_id | `uuid` | NO | — | FK → programs |
| week_number | `integer` | NO | — | |
| name | `text` | YES | — | |
| notes | `text` | YES | — | |

---

### `workouts`
Individual training sessions. Can belong to a program week, plan block week, or be standalone.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| program_week_id | `uuid` | YES | — | FK → program_weeks |
| block_week_id | `uuid` | YES | — | FK → block_weeks |
| plan_id | `uuid` | YES | — | FK → plans |
| name | `text` | NO | — | |
| description | `text` | YES | — | |
| day_of_week | `integer` | YES | — | 0-6 |
| day_index | `integer` | YES | — | Absolute day position |
| estimated_duration_min | `integer` | YES | — | |
| workout_type | `text` | YES | — | |
| session_type | `text` | YES | — | AI planner session type |
| session_focus | `text[]` | YES | `'{}'` | |
| target_rpe | `numeric` | YES | — | |
| energy_system | `text` | YES | — | |
| is_template | `boolean` | YES | `false` | |
| is_library | `boolean` | YES | `false` | true = visible in WorkoutsView (Sprint 12) |
| is_evolving | `boolean` | YES | `false` | Evolving session flag (Sprint 12) |
| evolution_weeks | `integer` | YES | — | Number of weeks for evolving sessions (Sprint 12) |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_workouts_coach`, `idx_workouts_program_week`, `idx_workouts_block_week_id`, `idx_workouts_plan_id`, `idx_workouts_library`

---

### `exercises`
Individual exercises within a workout.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| workout_id | `uuid` | NO | — | FK → workouts |
| name | `text` | NO | — | |
| description | `text` | YES | — | |
| order_index | `integer` | NO | — | |
| sets | `text` | YES | — | Can be range "3-4" |
| reps | `text` | YES | — | Can be range "8-12" |
| weight_kg | `numeric` | YES | — | |
| duration_seconds | `integer` | YES | — | |
| distance_meters | `numeric` | YES | — | |
| rpe | `numeric` | YES | — | |
| intensity_percent | `numeric` | YES | — | % of 1RM |
| intensity_prescription | `text` | YES | — | e.g. "moderate", "75% 1RM" |
| intensity_value | `numeric` | YES | — | |
| target_time_seconds | `integer` | YES | — | |
| rest_seconds | `integer` | YES | — | |
| tempo | `text` | YES | — | e.g. "3-1-2-0" |
| superset_group | `integer` | YES | — | Group exercises together |
| category | `text` | YES | — | |
| movement_pattern | `text` | YES | — | |
| video_url | `text` | YES | — | |
| notes | `text` | YES | — | |
| is_section_header | `boolean` | NO | `false` | Visual section divider (Warm-Up, Main Set, etc.) — not an actual exercise |

**Indexes:** `idx_exercises_workout(workout_id, order_index)`

---

### `exercise_library`
Reusable exercise definitions with metadata.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| name | `text` | NO | — | GIN full-text index |
| coach_id | `uuid` | YES | — | FK → profiles (NULL = global) |
| sport_id | `uuid` | YES | — | FK → sports |
| category | `text` | YES | — | |
| movement_pattern | `text` | YES | — | |
| equipment | `text[]` | YES | `'{}'` | |
| muscle_groups | `text[]` | YES | `'{}'` | |
| video_url | `text` | YES | — | |
| cues | `text` | YES | — | |
| is_approved | `boolean` | YES | `true` | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_exercise_library_name` (GIN tsvector), `idx_exercise_library_category`, `idx_exercise_library_movement`, `idx_exercise_library_coach_id`, `idx_exercise_library_sport_id`

---

### `favorite_exercises`
Coach-specific saved exercise presets.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| exercise_name | `text` | NO | — | |
| exercise_defaults | `jsonb` | YES | `'{}'` | |
| created_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(coach_id, exercise_name)

---

### `periodization_templates`
Reusable periodization structures for plan creation.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | YES | — | FK → profiles (NULL = system) |
| name | `text` | NO | — | |
| sport_id | `uuid` | YES | — | FK → sports |
| duration_weeks | `integer` | NO | — | |
| structure | `jsonb` | NO | `'{}'` | Block definitions |
| difficulty | `text` | YES | — | |
| is_public | `boolean` | YES | `false` | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_periodization_templates_coach`, `idx_periodization_templates_sport`, `idx_periodization_templates_public` (partial: is_public = true)

---

## Domain: Training Planner & AI

### `plans`
Top-level training plans. The primary training design entity.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| name | `text` | NO | — | |
| sport_id | `uuid` | YES | — | FK → sports |
| start_date | `date` | NO | — | |
| end_date | `date` | NO | — | |
| goal_description | `text` | YES | — | |
| periodization_model | `text` | YES | `'custom'` | |
| status | `text` | YES | `'draft'` | draft/active/completed/archived |
| version | `integer` | YES | `1` | |
| ai_generated | `boolean` | YES | `false` | |
| plan_type | `text` | YES | `'block_plan'` | single_session/evolving_session/block_plan/season_plan (Sprint 12) |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**RLS:** Coach can CRUD own plans (coach_id = auth.uid())
**Indexes:** `idx_plans_coach_id`, `idx_plans_sport_id`, `idx_plans_status`, `idx_plans_type`

---

### `training_blocks`
Mesocycle blocks within a plan (e.g., "Accumulation", "Intensification").

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| plan_id | `uuid` | NO | — | FK → plans |
| name | `text` | NO | — | |
| block_type | `text` | YES | — | e.g., accumulation, intensification, realization |
| focus_tags | `text[]` | YES | `'{}'` | |
| order_index | `integer` | NO | — | |
| duration_weeks | `integer` | YES | — | |
| volume_target | `text` | YES | — | |
| intensity_target | `text` | YES | — | |
| ai_generated | `boolean` | YES | `false` | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**RLS:** Via plans.coach_id = auth.uid()
**Indexes:** `idx_training_blocks_plan_id`, `idx_training_blocks_order(plan_id, order_index)`

---

### `block_weeks`
Individual weeks within a training block.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| training_block_id | `uuid` | NO | — | FK → training_blocks |
| week_number | `integer` | NO | — | |
| name | `text` | YES | — | |
| volume_modifier | `numeric` | YES | `1.0` | |
| intensity_modifier | `numeric` | YES | `1.0` | |
| is_deload | `boolean` | YES | `false` | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**RLS:** Via training_blocks → plans.coach_id = auth.uid()
**Indexes:** `idx_block_weeks_training_block_id`, `idx_block_weeks_block_week(training_block_id, week_number)`

---

### `plan_sessions`
Scheduled session slots within a block week. Since Sprint 12, sessions can be self-contained (no workout_id) with exercise data in session_data JSONB.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| block_week_id | `uuid` | NO | — | FK → block_weeks |
| day_of_week | `integer` | NO | — | 0 = Monday |
| workout_id | `uuid` | **YES** | — | FK → workouts. NULL for self-contained sessions (Sprint 12) |
| order_index | `integer` | YES | `0` | |
| session_data | `jsonb` | YES | `'[]'` | SessionExercise[] — self-contained exercise data (Sprint 12) |
| session_name | `text` | YES | — | Display name for self-contained sessions (Sprint 12) |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(block_week_id, day_of_week, order_index)
**Indexes:** `idx_plan_sessions_week`, `idx_plan_sessions_day`, `idx_plan_sessions_workout`

---

### `plan_athletes`
Athletes assigned to a plan.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| plan_id | `uuid` | NO | — | FK → plans |
| athlete_id | `uuid` | NO | — | FK → profiles |
| group_id | `uuid` | YES | — | FK → groups |
| individual_notes | `text` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(plan_id, athlete_id)

---

### `plan_changelog`
Version history for plan modifications.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| plan_id | `uuid` | NO | — | FK → plans |
| version | `integer` | NO | `1` | |
| changed_by | `uuid` | NO | — | FK → auth.users |
| change_type | `text` | NO | `'manual'` | manual/ai_suggested/auto |
| change_summary | `text` | YES | — | |
| metadata | `jsonb` | YES | `'{}'` | |
| created_at | `timestamptz` | NO | `now()` | |

---

### `ai_plan_logs`
Audit log for all AI interactions with the planner.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| plan_id | `uuid` | YES | — | FK → plans |
| context_type | `text` | YES | — | |
| context_id | `uuid` | YES | — | |
| tier | `text` | YES | — | 1/2/3 AI tier |
| action | `text` | YES | — | |
| prompt | `text` | YES | — | |
| prompt_summary | `text` | YES | — | |
| response | `text` | YES | — | |
| suggestion | `jsonb` | YES | — | |
| action_taken | `text` | YES | — | |
| coach_notes | `text` | YES | — | |
| model | `text` | YES | — | |
| tokens_used | `integer` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_ai_plan_logs_coach`, `idx_ai_plan_logs_coach_created`, `idx_ai_plan_logs_context`, `idx_ai_plan_logs_action`

---

### `ai_chat_sessions`
Conversational AI sessions scoped to a plan.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| plan_id | `uuid` | NO | — | FK → plans |
| coach_id | `uuid` | NO | — | FK → profiles |
| title | `text` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_chat_sessions_coach`, `idx_chat_sessions_plan`

---

### `ai_chat_messages`
Individual messages in an AI chat session.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| session_id | `uuid` | NO | — | FK → ai_chat_sessions |
| role | `text` | NO | — | user/assistant/system |
| content | `text` | NO | — | |
| plan_data | `jsonb` | YES | — | Plan state snapshot |
| session_data | `jsonb` | YES | — | Session state snapshot |
| tokens_used | `integer` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_chat_messages_session`, `idx_chat_messages_session_created`

---

## Domain: Workout Execution & Progress

### `workout_assignments`
Coach assigns a workout to an athlete for a specific date.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| workout_id | `uuid` | NO | — | FK → workouts |
| athlete_id | `uuid` | NO | — | FK → profiles |
| coach_id | `uuid` | NO | — | FK → profiles |
| assigned_date | `date` | NO | — | |
| status | `assignment_status` | YES | `'pending'` | |
| notes | `text` | YES | — | |
| load_modifier | `numeric` | YES | `1.0` | Scale factor |
| source | `text` | YES | `'manual'` | manual/plan |
| plan_id | `uuid` | YES | — | FK → plans |
| block_week_id | `uuid` | YES | — | FK → block_weeks |
| created_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_assignments_athlete_date`, `idx_assignments_status`, `idx_workout_assignments_plan_id`

---

### `workout_completions`
Athlete completion record for an assigned workout.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| assignment_id | `uuid` | NO | — | FK → workout_assignments |
| athlete_id | `uuid` | NO | — | FK → profiles |
| completed_at | `timestamptz` | YES | `now()` | |
| duration_minutes | `integer` | YES | — | |
| athlete_notes | `text` | YES | — | |
| overall_rpe | `numeric` | YES | — | |
| has_pb | `boolean` | YES | `false` | |
| caption | `text` | YES | — | For social sharing |
| shared_exercise_ids | `uuid[]` | YES | `'{}'` | |
| share_settings | `jsonb` | YES | `'{}'` | |
| coach_feedback | `text` | YES | — | |
| feedback_at | `timestamptz` | YES | — | |

**Indexes:** `idx_completions_assignment`, `idx_completions_athlete(athlete_id, completed_at DESC)`

---

### `exercise_results`
Per-exercise results within a completion.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| completion_id | `uuid` | NO | — | FK → workout_completions |
| exercise_id | `uuid` | NO | — | FK → exercises |
| sets_completed | `integer` | YES | — | |
| reps_completed | `text` | YES | — | |
| weight_used_kg | `numeric` | YES | — | |
| duration_seconds | `integer` | YES | — | |
| distance_meters | `numeric` | YES | — | |
| rpe | `numeric` | YES | — | |
| is_pb | `boolean` | YES | `false` | |
| notes | `text` | YES | — | |

**Indexes:** `idx_exercise_results_completion`

---

### `personal_bests`
Per-exercise personal bests tracked per athlete.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| athlete_id | `uuid` | NO | — | FK → profiles |
| exercise_name | `text` | NO | — | |
| pb_type | `pb_type` | NO | — | weight/reps/time/distance |
| value | `numeric` | NO | — | |
| achieved_at | `timestamptz` | NO | — | |
| exercise_result_id | `uuid` | YES | — | FK → exercise_results |

**Constraints:** UNIQUE(athlete_id, exercise_name, pb_type)

---

### `user_streaks`
Daily workout streak tracking.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| user_id | `uuid` | NO | — | FK → profiles, UNIQUE |
| current_streak | `integer` | YES | `0` | |
| longest_streak | `integer` | YES | `0` | |
| last_workout_date | `date` | YES | — | |
| updated_at | `timestamptz` | YES | `now()` | |

---

### `readiness_logs`
Daily athlete readiness/wellness check-in.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| athlete_id | `uuid` | NO | — | FK → profiles |
| log_date | `date` | NO | — | |
| subjective_score | `integer` | YES | — | 1-10 |
| sleep_quality | `integer` | YES | — | 1-5 |
| sleep_hours | `numeric` | YES | — | |
| muscle_soreness | `integer` | YES | — | 1-5 |
| energy_level | `integer` | YES | — | 1-5 |
| stress_level | `integer` | YES | — | 1-5 |
| hrv | `numeric` | YES | — | Heart rate variability |
| resting_hr | `numeric` | YES | — | |
| source | `text` | YES | `'manual'` | manual/garmin/whoop/oura |
| raw_data | `jsonb` | YES | — | Wearable raw payload |
| created_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(athlete_id, log_date)
**Indexes:** `idx_readiness_logs_athlete_id`, `idx_readiness_logs_date(athlete_id, log_date DESC)`

---

### `session_feedback`
Post-session athlete feedback (1:1 with workout_completions).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| completion_id | `uuid` | NO | — | FK → workout_completions, UNIQUE |
| session_rpe | `integer` | YES | — | |
| soreness_post | `integer` | YES | — | |
| energy_post | `integer` | YES | — | |
| notes | `text` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |

---

### `athlete_assessments`
Coach-administered assessments for athletes.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| athlete_id | `uuid` | NO | — | FK → profiles |
| coach_id | `uuid` | NO | — | FK → profiles |
| assessment_type | `text` | NO | — | e.g., "1RM", "FMS", "beep_test" |
| data | `jsonb` | NO | `'{}'` | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_athlete_assessments_athlete`, `idx_athlete_assessments_coach`

---

## Domain: Social Feed

### `posts`
Social feed posts.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| author_id | `uuid` | NO | — | FK → profiles |
| content | `text` | YES | — | |
| post_type | `post_type` | NO | — | manual/workout/achievement |
| workout_completion_id | `uuid` | YES | — | FK → workout_completions |
| visibility | `visibility` | YES | `'public'` | |
| is_pinned | `boolean` | YES | `false` | |
| likes_count | `integer` | YES | `0` | Denormalized counter |
| comments_count | `integer` | YES | `0` | Denormalized counter |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_posts_created`, `idx_posts_author_created`, `idx_posts_visibility`, `idx_posts_type_workout` (partial)

---

### `post_media`
Media attachments on posts.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| post_id | `uuid` | NO | — | FK → posts |
| media_type | `media_type` | NO | — | image/video/workout_card |
| url | `text` | YES | — | |
| thumbnail_url | `text` | YES | — | |
| display_order | `integer` | YES | `0` | |
| alt_text | `text` | YES | — | |

**Indexes:** `idx_post_media_post(post_id, display_order)`

---

### `likes`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| user_id | `uuid` | NO | — | FK → profiles |
| post_id | `uuid` | NO | — | FK → posts |
| created_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(user_id, post_id)

---

### `comments`
Threaded comments on posts.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| post_id | `uuid` | NO | — | FK → posts |
| author_id | `uuid` | NO | — | FK → profiles |
| parent_id | `uuid` | YES | — | FK → comments (self-ref) |
| content | `text` | NO | — | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_comments_post(post_id, created_at)`

---

### `follows`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| follower_id | `uuid` | NO | — | FK → profiles |
| following_id | `uuid` | NO | — | FK → profiles |
| status | `follow_status` | YES | `'active'` | pending/active |
| created_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(follower_id, following_id)

---

## Domain: Groups & Teams

### `teams`
Top-level organizational unit (e.g., "Track & Field Team").

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| name | `text` | NO | — | |
| sport_id | `uuid` | YES | — | FK → sports |
| description | `text` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**RLS:** Coach can CRUD own; athletes see via is_team_athlete()

---

### `groups`
Subgroups within a team (e.g., "Sprinters", "Distance").

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| name | `text` | NO | — | |
| team_id | `uuid` | YES | — | FK → teams (ON DELETE SET NULL) |
| sport_id | `uuid` | YES | — | FK → sports |
| description | `text` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**RLS:** Coach can CRUD own; members see via is_group_member()

---

### `group_members`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| group_id | `uuid` | NO | — | FK → groups (ON DELETE CASCADE) |
| athlete_id | `uuid` | NO | — | FK → profiles |
| joined_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE(group_id, athlete_id)

---

## Domain: Notifications

### `notifications`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| user_id | `uuid` | NO | — | FK → profiles |
| actor_id | `uuid` | YES | — | FK → profiles |
| type | `text` | NO | — | e.g., like, comment, assignment, pb |
| entity_type | `text` | YES | — | post, workout, plan, etc. |
| entity_id | `uuid` | YES | — | |
| title | `text` | NO | — | |
| message | `text` | YES | — | |
| action_url | `text` | YES | — | |
| is_read | `boolean` | YES | `false` | |
| created_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_notifications_user_created`, `idx_notifications_user_unread(user_id, is_read, created_at DESC)`, `idx_notifications_entity`

---

## Domain: Messaging

### `conversations`
1:1 direct message threads.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| participant_1_id | `uuid` | NO | — | FK → profiles |
| participant_2_id | `uuid` | NO | — | FK → profiles |
| last_message_at | `timestamptz` | YES | — | |
| created_at | `timestamptz` | YES | `now()` | |

**Constraints:** UNIQUE pair via `idx_unique_conversation_pair(LEAST(p1, p2), GREATEST(p1, p2))`
**Indexes:** `idx_conversations_participant_1`, `idx_conversations_participant_2`, `idx_conversations_last_message`

---

### `messages`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| conversation_id | `uuid` | NO | — | FK → conversations |
| sender_id | `uuid` | NO | — | FK → profiles |
| content | `text` | NO | — | |
| attachment_url | `text` | YES | — | |
| attachment_type | `text` | YES | — | |
| is_read | `boolean` | YES | `false` | |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_messages_conversation(conversation_id, created_at DESC)`, `idx_messages_sender`, `idx_messages_unread` (partial: NOT is_read)

---

## Domain: Smart Import & Philosophy

### `import_history`
Log of all file imports processed by the smart-import Edge Function.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| file_name | `text` | NO | — | |
| file_type | `text` | NO | — | |
| file_size_bytes | `integer` | YES | — | |
| storage_path | `text` | YES | — | |
| ai_model_used | `text` | YES | — | |
| processing_cost_usd | `numeric` | YES | — | |
| processing_time_ms | `integer` | YES | — | |
| programs_imported | `integer` | YES | `0` | |
| workouts_imported | `integer` | YES | `0` | |
| exercises_imported | `integer` | YES | `0` | |
| detected_periodization | `text` | YES | — | |
| detected_duration_weeks | `integer` | YES | — | |
| detected_sport | `text` | YES | — | |
| detected_plan_type | `text` | YES | — | single_session/evolving_session/block_plan/season_plan (Sprint 12) |
| plan_type_confidence | `numeric(4,3)` | YES | — | 0-1 confidence score (Sprint 12) |
| status | `text` | NO | `'processing'` | processing/completed/error |
| error_message | `text` | YES | — | |
| ai_result | `jsonb` | YES | — | Full AI response payload |
| created_at | `timestamptz` | YES | `now()` | |

**Indexes:** `idx_import_history_coach(coach_id, created_at DESC)`, `idx_import_history_status`

---

### `coach_philosophy`
AI-derived coaching philosophy profile.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles, UNIQUE |
| programs_analyzed | `integer` | NO | `0` | |
| last_analysis_at | `timestamptz` | YES | — | |
| next_analysis_threshold | `integer` | NO | `10` | |
| primary_periodization | `text[]` | YES | — | |
| avg_mesocycle_length_weeks | `numeric` | YES | — | |
| typical_deload_frequency | `integer` | YES | — | |
| volume_progression_pattern | `text` | YES | — | |
| intensity_distribution | `jsonb` | YES | — | |
| top_exercises | `jsonb` | YES | — | |
| movement_patterns | `jsonb` | YES | — | |
| coaching_style_summary | `text` | YES | — | |
| recommendations | `text[]` | YES | — | |
| primary_methodology_id | `text` | YES | — | FK → methodology_profiles |
| methodology_confidence | `real` | YES | `0` | |
| secondary_methodologies | `jsonb` | YES | `'[]'` | |
| methodology_confirmed | `boolean` | YES | — | |
| extracted_metrics_id | `uuid` | YES | — | FK → coach_extracted_metrics |
| created_at | `timestamptz` | YES | `now()` | |
| updated_at | `timestamptz` | YES | `now()` | |

---

## Domain: Methodology Detection

### `methodology_profiles`
Reference library of training methodologies (read-only for coaches).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `text` PK | NO | — | e.g., 'charlie_francis', 'lydiard' |
| name | `text` | NO | — | |
| short_name | `text` | NO | — | |
| category | `text` | NO | — | speed_power/endurance/periodization/strength/hybrid |
| sport_context | `text[]` | YES | `'{}'` | |
| intensity_distribution | `jsonb` | NO | `'{}'` | |
| session_type_mix | `jsonb` | NO | `'{}'` | |
| volume_intensity_relationship | `text` | NO | `'inverse'` | |
| deload_pattern | `jsonb` | NO | `'{}'` | |
| recovery_spacing | `jsonb` | NO | `'{}'` | |
| progression_model | `text` | NO | `'linear'` | |
| typical_block_structure | `jsonb` | NO | `'[]'` | |
| sessions_per_week | `jsonb` | NO | `'{}'` | |
| primary_markers | `jsonb` | NO | `'[]'` | |
| secondary_markers | `jsonb` | NO | `'[]'` | |
| exclusion_rules | `jsonb` | NO | `'[]'` | |
| ai_guardrails | `jsonb` | NO | `'{}'` | |
| diagnostic_questions | `jsonb` | NO | `'{}'` | |
| total_weight | `integer` | NO | `100` | |
| created_at | `timestamptz` | NO | `now()` | |
| updated_at | `timestamptz` | NO | `now()` | |

**RLS:** SELECT for all authenticated users (reference data).

---

### `coach_methodology_matches`
Detected methodology matches per coach.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| methodology_id | `text` | NO | — | FK → methodology_profiles |
| confidence | `real` | NO | `0` | 0-100 score |
| status | `text` | NO | `'detected'` | detected/confirmed/rejected/modified |
| extracted_metrics | `jsonb` | NO | `'{}'` | |
| marker_scores | `jsonb` | NO | `'{}'` | |
| coach_confirmed | `boolean` | YES | — | |
| coach_notes | `text` | YES | — | |
| confirmed_at | `timestamptz` | YES | — | |
| programs_analyzed | `integer` | NO | `0` | |
| last_analysis_at | `timestamptz` | NO | `now()` | |
| created_at | `timestamptz` | NO | `now()` | |
| updated_at | `timestamptz` | NO | `now()` | |

**Constraints:** UNIQUE(coach_id, methodology_id)
**Indexes:** `idx_coach_methodology_matches_coach`, `idx_coach_methodology_matches_methodology`, `idx_coach_methodology_matches_confidence`

---

### `coach_extracted_metrics`
Aggregated training metrics extracted from a coach's programs (1 per coach).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles, UNIQUE |
| intensity_distribution | `jsonb` | NO | `'{}'` | |
| session_type_mix | `jsonb` | NO | `'{}'` | |
| volume_intensity_correlation | `real` | YES | — | -1.0 to 1.0 |
| deload_frequency_weeks | `real` | YES | — | |
| deload_volume_reduction | `real` | YES | — | percentage |
| sessions_per_week_avg | `real` | YES | — | |
| high_intensity_gap_hours | `real` | YES | — | |
| progression_pattern | `text` | YES | — | |
| volume_progression_slope | `real` | YES | — | |
| top_exercises | `jsonb` | YES | `'[]'` | |
| movement_pattern_distribution | `jsonb` | YES | `'{}'` | |
| exercise_rotation_frequency | `real` | YES | — | |
| avg_block_duration_weeks | `real` | YES | — | |
| block_type_distribution | `jsonb` | YES | `'{}'` | |
| programs_analyzed | `integer` | NO | `0` | |
| workouts_analyzed | `integer` | NO | `0` | |
| exercises_analyzed | `integer` | NO | `0` | |
| total_weeks_analyzed | `integer` | NO | `0` | |
| last_extraction_at | `timestamptz` | NO | `now()` | |
| created_at | `timestamptz` | NO | `now()` | |
| updated_at | `timestamptz` | NO | `now()` | |

---

### `methodology_learning_log`
Coach feedback on methodology detections for improving accuracy.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| **id** | `uuid` PK | NO | `gen_random_uuid()` | |
| coach_id | `uuid` | NO | — | FK → profiles |
| methodology_id | `text` | NO | — | FK → methodology_profiles |
| action | `text` | NO | — | confirmed/rejected/corrected/suggested_alternative |
| confidence_at_action | `real` | YES | — | |
| coach_feedback | `text` | YES | — | |
| alternative_methodology_id | `text` | YES | — | FK → methodology_profiles |
| extracted_metrics_snapshot | `jsonb` | YES | — | |
| created_at | `timestamptz` | NO | `now()` | |

---

## Storage Buckets

| Bucket | Purpose | Access Policy |
|--------|---------|---------------|
| `post-media` | Social post images/videos | Owner read/write via auth.uid() |
| `program-imports` | Uploaded training files (Excel, CSV, PDF, images) | Coach upload/read via folder = auth.uid() |
| `message-attachments` | Chat file attachments | Participant read/write |

---

## Database Functions & Triggers

### Security Definer Functions

| Function | Returns | Purpose |
|----------|---------|---------|
| `is_group_member(group_id, user_id)` | `boolean` | Check group membership for RLS |
| `is_group_coach(group_id, user_id)` | `boolean` | Check group ownership for RLS |
| `is_team_athlete(team_id, user_id)` | `boolean` | Check team membership for RLS |
| `check_philosophy_trigger()` | `trigger` | Auto-notify when analysis threshold reached |

### Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `trigger_philosophy_check` | `programs` | AFTER INSERT | `check_philosophy_trigger()` |

---

## Future Schema (Planned)

These tables represent planned future features. Column definitions are proposals — finalize during sprint planning.

### Sprint 12+: Analytics & Reporting

```sql
-- Aggregated athlete performance snapshots (materialized weekly)
CREATE TABLE athlete_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  period_type     text NOT NULL DEFAULT 'week',  -- week/month/block
  workouts_completed   integer DEFAULT 0,
  workouts_assigned    integer DEFAULT 0,
  compliance_rate      numeric(5,2),              -- 0-100%
  avg_session_rpe      numeric(3,1),
  total_volume_load    numeric,                    -- sets x reps x weight
  pbs_achieved         integer DEFAULT 0,
  avg_readiness_score  numeric(3,1),
  sport_specific_data  jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  UNIQUE(athlete_id, period_start, period_type)
);

-- Coach dashboard aggregates
CREATE TABLE coach_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  total_athletes       integer DEFAULT 0,
  active_plans         integer DEFAULT 0,
  avg_athlete_compliance numeric(5,2),
  workouts_designed    integer DEFAULT 0,
  ai_interactions      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(coach_id, period_start)
);
```

### Sprint 13+: Wearable Integrations

```sql
-- Connected wearable accounts
CREATE TABLE wearable_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  provider        text NOT NULL,  -- garmin/whoop/oura/apple_health/strava
  access_token    text,           -- encrypted
  refresh_token   text,           -- encrypted
  token_expires_at timestamptz,
  external_user_id text,
  sync_enabled    boolean DEFAULT true,
  last_sync_at    timestamptz,
  sync_config     jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(athlete_id, provider)
);

-- Raw synced data from wearables
CREATE TABLE wearable_data (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   uuid NOT NULL REFERENCES wearable_connections ON DELETE CASCADE,
  data_type       text NOT NULL,  -- sleep/hrv/activity/recovery/strain
  recorded_at     timestamptz NOT NULL,
  data            jsonb NOT NULL DEFAULT '{}',
  processed       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_wearable_data_type_date ON wearable_data(connection_id, data_type, recorded_at DESC);
```

### Sprint 14+: Billing & Subscriptions

```sql
-- Coach subscription tiers
CREATE TABLE subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES profiles ON DELETE CASCADE UNIQUE,
  plan_tier       text NOT NULL DEFAULT 'free',  -- free/starter/pro/enterprise
  stripe_customer_id    text,
  stripe_subscription_id text,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  status          text DEFAULT 'active',  -- active/past_due/canceled/trialing
  athlete_limit   integer DEFAULT 5,
  ai_credits_remaining integer DEFAULT 50,
  ai_credits_reset_at  timestamptz,
  features        jsonb DEFAULT '{}',     -- feature flags per tier
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Usage tracking for metered billing
CREATE TABLE usage_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  event_type      text NOT NULL,  -- ai_plan_generation/ai_import/ai_chat/storage
  quantity        integer DEFAULT 1,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_usage_events_coach_type ON usage_events(coach_id, event_type, created_at DESC);
```

### Sprint 15+: Competition & Event Calendar

```sql
-- Competitions / Events
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid REFERENCES profiles,
  name            text NOT NULL,
  event_type      text NOT NULL,  -- competition/meet/race/game/practice/camp
  sport_id        uuid REFERENCES sports,
  location        text,
  start_date      date NOT NULL,
  end_date        date,
  priority        text DEFAULT 'b',  -- a/b/c priority rating
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Link events to plans for periodization anchoring
CREATE TABLE plan_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES plans ON DELETE CASCADE,
  event_id        uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  is_target_event boolean DEFAULT false,  -- peak for this event?
  created_at      timestamptz DEFAULT now(),
  UNIQUE(plan_id, event_id)
);

-- Athlete event registrations & results
CREATE TABLE event_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events ON DELETE CASCADE,
  athlete_id      uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  discipline      text,          -- e.g., "100m", "Clean & Jerk"
  result_value    numeric,
  result_unit     text,          -- seconds/meters/kg/points
  placement       integer,
  is_pb           boolean DEFAULT false,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
```

### Sprint 16+: Group Messaging & Channels

```sql
-- Extend messaging to support group chats
CREATE TABLE group_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text,
  created_by      uuid NOT NULL REFERENCES profiles,
  group_id        uuid REFERENCES groups,  -- optional link to training group
  team_id         uuid REFERENCES teams,   -- optional link to team
  avatar_url      text,
  last_message_at timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE group_conversation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES group_conversations ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  role            text DEFAULT 'member',  -- admin/member
  muted_until     timestamptz,
  last_read_at    timestamptz,
  joined_at       timestamptz DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Extend messages table: add group_conversation_id column
-- ALTER TABLE messages ADD COLUMN group_conversation_id uuid REFERENCES group_conversations;
```

### Sprint 17+: Marketplace / Program Sharing

```sql
-- Published programs available for purchase/download
CREATE TABLE marketplace_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES profiles,
  program_id      uuid REFERENCES programs,
  plan_template_id uuid REFERENCES periodization_templates,
  title           text NOT NULL,
  description     text,
  price_cents     integer DEFAULT 0,       -- 0 = free
  currency        text DEFAULT 'USD',
  sport_id        uuid REFERENCES sports,
  difficulty      text,
  preview_data    jsonb DEFAULT '{}',
  is_published    boolean DEFAULT false,
  download_count  integer DEFAULT 0,
  avg_rating      numeric(3,2) DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE marketplace_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES marketplace_listings,
  buyer_id        uuid NOT NULL REFERENCES profiles,
  price_paid_cents integer NOT NULL,
  stripe_payment_id text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE marketplace_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES marketplace_listings,
  reviewer_id     uuid NOT NULL REFERENCES profiles,
  rating          integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text     text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(listing_id, reviewer_id)
);
```

---

## Entity Relationship Diagram

```
                                    ┌──────────┐
                                    │  sports   │
                                    └─────┬────┘
                                          │ referenced by many tables
                         ┌────────────────┼────────────────────────┐
                         │                │                        │
                    ┌────┴─────┐   ┌──────┴──────┐         ┌──────┴──────┐
                    │ profiles │   │  programs    │         │   teams     │
                    └──┬───┬───┘   └──────┬──────┘         └──────┬──────┘
                       │   │              │                        │
          ┌────────────┤   ├──────────────┤              ┌────────┴────────┐
          │            │   │              │              │   groups        │
   ┌──────┴──────┐     │   │       ┌──────┴──────┐      └────────┬────────┘
   │coach_profile│     │   │       │program_weeks │               │
   └─────────────┘     │   │       └──────┬──────┘      ┌────────┴────────┐
   ┌──────────────┐    │   │              │              │ group_members   │
   │athlete_      │    │   │       ┌──────┴──────┐      └─────────────────┘
   │  profile     │    │   │       │  workouts   │──┐
   └──────────────┘    │   │       └──────┬──────┘  │
                       │   │              │         │
   ┌──────────────┐    │   │       ┌──────┴──────┐  │   ┌───────────────┐
   │coach_athletes├────┤   │       │  exercises   │  │   │    plans      │
   └──────────────┘    │   │       └─────────────┘  │   └───────┬───────┘
   ┌──────────────┐    │   │                        │           │
   │invite_codes  ├────┘   │                        │   ┌───────┴───────┐
   └──────────────┘        │                        │   │training_blocks│
                           │                        │   └───────┬───────┘
   ┌──────────────┐        │                        │           │
   │    posts     ├────────┤               ┌────────┘   ┌───────┴───────┐
   └───┬──┬───┬───┘        │               │           │  block_weeks   │
       │  │   │             │               │           └───────┬───────┘
       │  │   │      ┌─────┴──────────┐    │                   │
       │  │   │      │workout_        │    │           ┌───────┴───────┐
       │  │   │      │ assignments    ├────┘           │ plan_sessions │
       │  │   │      └───────┬────────┘                └───────────────┘
       │  │   │              │
       │  │   │      ┌───────┴────────┐    ┌─────────────────────────┐
       │  │   │      │workout_        │    │ AI & Intelligence       │
       │  │   │      │ completions    │    ├─────────────────────────┤
       │  │   │      └───┬───┬────────┘    │ coach_philosophy        │
       │  │   │          │   │             │ methodology_profiles    │
  ┌────┘  │   │   ┌──────┘   └────────┐   │ coach_methodology_      │
  │       │   │   │                    │   │   matches               │
┌─┴──┐ ┌──┴┐ │ ┌─┴────────────┐  ┌───┴─┐ │ coach_extracted_metrics │
│post│ │   │ │ │exercise_      │  │sess.│ │ methodology_learning_log│
│med.│ │lks│ │ │results        │  │fdbk │ │ ai_plan_logs            │
└────┘ └───┘ │ └──────┬───────┘  └─────┘ │ ai_chat_sessions        │
          ┌──┴──┐     │                   │ ai_chat_messages        │
          │cmnts│  ┌───┴──────┐           │ import_history          │
          └─────┘  │personal_ │           └─────────────────────────┘
   ┌──────────┐    │  bests   │
   │ follows  │    └──────────┘   ┌──────────────┐   ┌──────────────┐
   └──────────┘                   │notifications │   │conversations │
   ┌──────────────┐               └──────────────┘   └──────┬───────┘
   │readiness_logs│                                          │
   └──────────────┘               ┌──────────────┐   ┌──────┴───────┐
   ┌──────────────┐               │athlete_      │   │  messages    │
   │user_streaks  │               │ assessments  │   └──────────────┘
   └──────────────┘               └──────────────┘
```

---

> **Last updated:** 2026-02-16 — auto-generated from live Supabase introspection
