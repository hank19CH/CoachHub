// ============================================
// CoachHub Database Types
// Auto-generated structure matching Supabase schema
// ============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Enum types
export type UserType = 'coach' | 'athlete' | 'follower'
export type PostType = 'manual' | 'workout' | 'achievement' | 'pr' | 'streak_milestone'
export type Visibility = 'public' | 'followers' | 'private'
export type FollowStatus = 'pending' | 'active'
export type CoachAthleteStatus = 'pending' | 'active' | 'inactive'
export type InviteMethod = 'link' | 'application' | 'purchase'
export type AssignmentStatus = 'pending' | 'completed' | 'skipped'
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'
export type PbType = 'weight' | 'reps' | 'time' | 'distance'
export type MediaType = 'image' | 'video' | 'workout_card'
export type NotificationType = 'like' | 'comment' | 'follow' | 'workout_assigned' | 'workout_completed' | 'personal_best' | 'system_announcement'

// Sprint 9 — Training Planner enums
export type PlanStatus = 'draft' | 'active' | 'completed' | 'archived'
export type VolumeTarget = 'low' | 'moderate' | 'high'
export type IntensityTarget = 'low' | 'moderate' | 'high' | 'peak'
export type ExerciseCategory = 'primary' | 'accessory' | 'warmup' | 'cooldown' | 'drill' | 'plyometric'
export type MovementPattern = 'squat' | 'hinge' | 'push' | 'pull' | 'carry' | 'locomotion' | 'rotation' | 'skill'
export type AiActionTaken = 'accepted' | 'modified' | 'rejected' | 'pending'
export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'elite'

// Share settings for workout posts
export interface ShareSettings {
  show_duration?: boolean
  show_rpe?: boolean
  show_workout_name?: boolean
  show_exercise_details?: boolean
  highlight_pbs_only?: boolean
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string
          avatar_url: string | null
          bio: string | null
          user_type: UserType
          is_private: boolean
          sport_ids: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name: string
          avatar_url?: string | null
          bio?: string | null
          user_type: UserType
          is_private?: boolean
          sport_ids?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string
          avatar_url?: string | null
          bio?: string | null
          user_type?: UserType
          is_private?: boolean
          sport_ids?: string[]
          updated_at?: string
        }
      }
      coach_profiles: {
        Row: {
          id: string
          qualifications: string | null
          is_verified: boolean
          verification_docs: string[]
          specialties: string[]
          experience_years: number | null
          location: string | null
          website_url: string | null
          accepts_athletes: boolean
        }
        Insert: {
          id: string
          qualifications?: string | null
          is_verified?: boolean
          verification_docs?: string[]
          specialties?: string[]
          experience_years?: number | null
          location?: string | null
          website_url?: string | null
          accepts_athletes?: boolean
        }
        Update: {
          qualifications?: string | null
          is_verified?: boolean
          verification_docs?: string[]
          specialties?: string[]
          experience_years?: number | null
          location?: string | null
          website_url?: string | null
          accepts_athletes?: boolean
        }
      }
      athlete_profiles: {
        Row: {
          id: string
          date_of_birth: string | null
          height_cm: number | null
          weight_kg: number | null
          primary_sport_id: string | null
          competition_level: string | null
          injury_notes: string | null
        }
        Insert: {
          id: string
          date_of_birth?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          primary_sport_id?: string | null
          competition_level?: string | null
          injury_notes?: string | null
        }
        Update: {
          date_of_birth?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          primary_sport_id?: string | null
          competition_level?: string | null
          injury_notes?: string | null
        }
      }
      sports: {
        Row: {
          id: string
          name: string
          category: string | null
          icon: string | null
          is_approved: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          category?: string | null
          icon?: string | null
          is_approved?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          category?: string | null
          icon?: string | null
          is_approved?: boolean
        }
      }
      posts: {
        Row: {
          id: string
          author_id: string
          content: string | null
          post_type: PostType
          workout_completion_id: string | null
          visibility: Visibility
          is_pinned: boolean
          likes_count: number
          comments_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          content?: string | null
          post_type: PostType
          workout_completion_id?: string | null
          visibility?: Visibility
          is_pinned?: boolean
          likes_count?: number
          comments_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          post_type?: PostType
          workout_completion_id?: string | null
          visibility?: Visibility
          is_pinned?: boolean
          likes_count?: number
          comments_count?: number
          updated_at?: string
        }
      }
      post_media: {
        Row: {
          id: string
          post_id: string
          media_type: MediaType
          url: string | null
          thumbnail_url: string | null
          display_order: number
          alt_text: string | null
        }
        Insert: {
          id?: string
          post_id: string
          media_type: MediaType
          url?: string | null
          thumbnail_url?: string | null
          display_order?: number
          alt_text?: string | null
        }
        Update: {
          media_type?: MediaType
          url?: string | null
          thumbnail_url?: string | null
          display_order?: number
          alt_text?: string | null
        }
      }
      follows: {
        Row: {
          id: string
          follower_id: string
          following_id: string
          status: FollowStatus
          created_at: string
        }
        Insert: {
          id?: string
          follower_id: string
          following_id: string
          status?: FollowStatus
          created_at?: string
        }
        Update: {
          status?: FollowStatus
        }
      }
      likes: {
        Row: {
          id: string
          user_id: string
          post_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          post_id: string
          created_at?: string
        }
        Update: never
      }
      comments: {
        Row: {
          id: string
          post_id: string
          author_id: string
          parent_id: string | null
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          post_id: string
          author_id: string
          parent_id?: string | null
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          content?: string
          updated_at?: string
        }
      }
      coach_athletes: {
        Row: {
          id: string
          coach_id: string
          athlete_id: string
          status: CoachAthleteStatus
          invited_via: InviteMethod | null
          invite_code: string | null
          started_at: string | null
          ended_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          athlete_id: string
          status?: CoachAthleteStatus
          invited_via?: InviteMethod | null
          invite_code?: string | null
          started_at?: string | null
          ended_at?: string | null
          created_at?: string
        }
        Update: {
          status?: CoachAthleteStatus
          invited_via?: InviteMethod | null
          invite_code?: string | null
          started_at?: string | null
          ended_at?: string | null
        }
      }
      invite_codes: {
        Row: {
          id: string
          coach_id: string
          code: string
          created_at: string
          expires_at: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          coach_id: string
          code: string
          created_at?: string
          expires_at?: string | null
          is_active?: boolean
        }
        Update: {
          code?: string
          expires_at?: string | null
          is_active?: boolean
        }
      }
      programs: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          sport_id: string | null
          duration_weeks: number | null
          difficulty: DifficultyLevel | null
          is_template: boolean
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          name: string
          description?: string | null
          sport_id?: string | null
          duration_weeks?: number | null
          difficulty?: DifficultyLevel | null
          is_template?: boolean
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          sport_id?: string | null
          duration_weeks?: number | null
          difficulty?: DifficultyLevel | null
          is_template?: boolean
          is_published?: boolean
          updated_at?: string
        }
      }
      program_weeks: {
        Row: {
          id: string
          program_id: string
          week_number: number
          name: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          program_id: string
          week_number: number
          name?: string | null
          notes?: string | null
        }
        Update: {
          week_number?: number
          name?: string | null
          notes?: string | null
        }
      }
      workouts: {
        Row: {
          id: string
          coach_id: string
          program_week_id: string | null
          block_week_id: string | null
          name: string
          description: string | null
          day_of_week: number | null
          estimated_duration_min: number | null
          workout_type: string | null
          session_type: string | null
          session_focus: string[]
          target_rpe: number | null
          energy_system: string | null
          is_template: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          program_week_id?: string | null
          block_week_id?: string | null
          name: string
          description?: string | null
          day_of_week?: number | null
          estimated_duration_min?: number | null
          workout_type?: string | null
          session_type?: string | null
          session_focus?: string[]
          target_rpe?: number | null
          energy_system?: string | null
          is_template?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          program_week_id?: string | null
          block_week_id?: string | null
          name?: string
          description?: string | null
          day_of_week?: number | null
          estimated_duration_min?: number | null
          workout_type?: string | null
          session_type?: string | null
          session_focus?: string[]
          target_rpe?: number | null
          energy_system?: string | null
          is_template?: boolean
          updated_at?: string
        }
      }
      exercises: {
        Row: {
          id: string
          workout_id: string
          name: string
          description: string | null
          order_index: number
          sets: number | null
          reps: string | null
          weight_kg: number | null
          duration_seconds: number | null
          distance_meters: number | null
          rpe: number | null
          intensity_percent: number | null
          target_time_seconds: number | null
          rest_seconds: number | null
          notes: string | null
          video_url: string | null
          category: string | null
          movement_pattern: string | null
          intensity_prescription: string | null
          intensity_value: number | null
          tempo: string | null
          superset_group: number | null
        }
        Insert: {
          id?: string
          workout_id: string
          name: string
          description?: string | null
          order_index: number
          sets?: number | null
          reps?: string | null
          weight_kg?: number | null
          duration_seconds?: number | null
          distance_meters?: number | null
          rpe?: number | null
          intensity_percent?: number | null
          target_time_seconds?: number | null
          rest_seconds?: number | null
          notes?: string | null
          video_url?: string | null
          category?: string | null
          movement_pattern?: string | null
          intensity_prescription?: string | null
          intensity_value?: number | null
          tempo?: string | null
          superset_group?: number | null
        }
        Update: {
          name?: string
          description?: string | null
          order_index?: number
          sets?: number | null
          reps?: string | null
          weight_kg?: number | null
          duration_seconds?: number | null
          distance_meters?: number | null
          rpe?: number | null
          intensity_percent?: number | null
          target_time_seconds?: number | null
          rest_seconds?: number | null
          notes?: string | null
          video_url?: string | null
          category?: string | null
          movement_pattern?: string | null
          intensity_prescription?: string | null
          intensity_value?: number | null
          tempo?: string | null
          superset_group?: number | null
        }
      }
      workout_assignments: {
        Row: {
          id: string
          workout_id: string
          athlete_id: string
          coach_id: string
          assigned_date: string
          status: AssignmentStatus
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workout_id: string
          athlete_id: string
          coach_id: string
          assigned_date: string
          status?: AssignmentStatus
          notes?: string | null
          created_at?: string
        }
        Update: {
          assigned_date?: string
          status?: AssignmentStatus
          notes?: string | null
        }
      }
      workout_completions: {
        Row: {
          id: string
          assignment_id: string
          athlete_id: string
          completed_at: string
          duration_minutes: number | null
          athlete_notes: string | null
          overall_rpe: number | null
          has_pb: boolean
          caption: string | null
          shared_exercise_ids: string[]
          share_settings: ShareSettings
          coach_feedback: string | null
          feedback_at: string | null
        }
        Insert: {
          id?: string
          assignment_id: string
          athlete_id: string
          completed_at?: string
          duration_minutes?: number | null
          athlete_notes?: string | null
          overall_rpe?: number | null
          has_pb?: boolean
          caption?: string | null
          shared_exercise_ids?: string[]
          share_settings?: ShareSettings
          coach_feedback?: string | null
          feedback_at?: string | null
        }
        Update: {
          completed_at?: string
          duration_minutes?: number | null
          athlete_notes?: string | null
          overall_rpe?: number | null
          has_pb?: boolean
          caption?: string | null
          shared_exercise_ids?: string[]
          share_settings?: ShareSettings
          coach_feedback?: string | null
          feedback_at?: string | null
        }
      }
      exercise_results: {
        Row: {
          id: string
          completion_id: string
          exercise_id: string
          sets_completed: number | null
          reps_completed: string | null
          weight_used_kg: number | null
          duration_seconds: number | null
          distance_meters: number | null
          rpe: number | null
          is_pb: boolean
          notes: string | null
        }
        Insert: {
          id?: string
          completion_id: string
          exercise_id: string
          sets_completed?: number | null
          reps_completed?: string | null
          weight_used_kg?: number | null
          duration_seconds?: number | null
          distance_meters?: number | null
          rpe?: number | null
          is_pb?: boolean
          notes?: string | null
        }
        Update: {
          sets_completed?: number | null
          reps_completed?: string | null
          weight_used_kg?: number | null
          duration_seconds?: number | null
          distance_meters?: number | null
          rpe?: number | null
          is_pb?: boolean
          notes?: string | null
        }
      }
      personal_bests: {
        Row: {
          id: string
          athlete_id: string
          exercise_name: string
          pb_type: PbType
          value: number
          achieved_at: string
          exercise_result_id: string | null
        }
        Insert: {
          id?: string
          athlete_id: string
          exercise_name: string
          pb_type: PbType
          value: number
          achieved_at: string
          exercise_result_id?: string | null
        }
        Update: {
          exercise_name?: string
          pb_type?: PbType
          value?: number
          achieved_at?: string
          exercise_result_id?: string | null
        }
      }
      user_streaks: {
        Row: {
          id: string
          user_id: string
          current_streak: number
          longest_streak: number
          last_workout_date: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          current_streak?: number
          longest_streak?: number
          last_workout_date?: string | null
          updated_at?: string
        }
        Update: {
          current_streak?: number
          longest_streak?: number
          last_workout_date?: string | null
          updated_at?: string
        }
      }
      favorite_exercises: {
        Row: {
          id: string
          coach_id: string
          exercise_name: string
          exercise_defaults: Record<string, any>
          created_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          exercise_name: string
          exercise_defaults?: Record<string, any>
          created_at?: string
        }
        Update: {
          exercise_name?: string
          exercise_defaults?: Record<string, any>
        }
      }
      teams: {
        Row: {
          id: string
          coach_id: string
          name: string
          sport_id: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          name: string
          sport_id?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          sport_id?: string | null
          description?: string | null
          updated_at?: string
        }
      }
      groups: {
        Row: {
          id: string
          coach_id: string
          team_id: string | null
          name: string
          sport_id: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          team_id?: string | null
          name: string
          sport_id?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          team_id?: string | null
          name?: string
          sport_id?: string | null
          description?: string | null
          updated_at?: string
        }
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          athlete_id: string
          joined_at: string
        }
        Insert: {
          id?: string
          group_id: string
          athlete_id: string
          joined_at?: string
        }
        Update: never
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          actor_id: string | null
          type: string
          entity_type: string | null
          entity_id: string | null
          title: string
          message: string | null
          action_url: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          actor_id?: string | null
          type: string
          entity_type?: string | null
          entity_id?: string | null
          title: string
          message?: string | null
          action_url?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          is_read?: boolean
        }
      }
      // ============================================
      // Sprint 9 — Training Planner Tables
      // ============================================
      plans: {
        Row: {
          id: string
          coach_id: string
          name: string
          sport_id: string | null
          start_date: string
          end_date: string
          goal_description: string | null
          periodization_model: string | null
          status: PlanStatus
          version: number
          ai_generated: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          name: string
          sport_id?: string | null
          start_date: string
          end_date: string
          goal_description?: string | null
          periodization_model?: string | null
          status?: PlanStatus
          version?: number
          ai_generated?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          sport_id?: string | null
          start_date?: string
          end_date?: string
          goal_description?: string | null
          periodization_model?: string | null
          status?: PlanStatus
          version?: number
          ai_generated?: boolean
          updated_at?: string
        }
      }
      plan_athletes: {
        Row: {
          id: string
          plan_id: string
          athlete_id: string
          group_id: string | null
          individual_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          athlete_id: string
          group_id?: string | null
          individual_notes?: string | null
          created_at?: string
        }
        Update: {
          group_id?: string | null
          individual_notes?: string | null
        }
      }
      training_blocks: {
        Row: {
          id: string
          plan_id: string
          name: string
          block_type: string | null
          focus_tags: string[]
          order_index: number
          duration_weeks: number | null
          volume_target: VolumeTarget | null
          intensity_target: IntensityTarget | null
          ai_generated: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          name: string
          block_type?: string | null
          focus_tags?: string[]
          order_index: number
          duration_weeks?: number | null
          volume_target?: VolumeTarget | null
          intensity_target?: IntensityTarget | null
          ai_generated?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          block_type?: string | null
          focus_tags?: string[]
          order_index?: number
          duration_weeks?: number | null
          volume_target?: VolumeTarget | null
          intensity_target?: IntensityTarget | null
          ai_generated?: boolean
          updated_at?: string
        }
      }
      block_weeks: {
        Row: {
          id: string
          training_block_id: string
          week_number: number
          name: string | null
          volume_modifier: number
          intensity_modifier: number
          is_deload: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          training_block_id: string
          week_number: number
          name?: string | null
          volume_modifier?: number
          intensity_modifier?: number
          is_deload?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          week_number?: number
          name?: string | null
          volume_modifier?: number
          intensity_modifier?: number
          is_deload?: boolean
          updated_at?: string
        }
      }
      plan_sessions: {
        Row: {
          id: string
          block_week_id: string
          day_of_week: number
          workout_id: string
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          block_week_id: string
          day_of_week: number
          workout_id: string
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          order_index?: number
          updated_at?: string
        }
      }
      exercise_library: {
        Row: {
          id: string
          name: string
          coach_id: string | null
          sport_id: string | null
          category: ExerciseCategory | null
          movement_pattern: MovementPattern | null
          equipment: string[]
          muscle_groups: string[]
          video_url: string | null
          cues: string | null
          is_approved: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          coach_id?: string | null
          sport_id?: string | null
          category?: ExerciseCategory | null
          movement_pattern?: MovementPattern | null
          equipment?: string[]
          muscle_groups?: string[]
          video_url?: string | null
          cues?: string | null
          is_approved?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          coach_id?: string | null
          sport_id?: string | null
          category?: ExerciseCategory | null
          movement_pattern?: MovementPattern | null
          equipment?: string[]
          muscle_groups?: string[]
          video_url?: string | null
          cues?: string | null
          is_approved?: boolean
          updated_at?: string
        }
      }
      readiness_logs: {
        Row: {
          id: string
          athlete_id: string
          log_date: string
          subjective_score: number | null
          sleep_quality: number | null
          sleep_hours: number | null
          muscle_soreness: number | null
          energy_level: number | null
          stress_level: number | null
          hrv: number | null
          resting_hr: number | null
          source: string
          raw_data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          log_date: string
          subjective_score?: number | null
          sleep_quality?: number | null
          sleep_hours?: number | null
          muscle_soreness?: number | null
          energy_level?: number | null
          stress_level?: number | null
          hrv?: number | null
          resting_hr?: number | null
          source?: string
          raw_data?: Json | null
          created_at?: string
        }
        Update: {
          log_date?: string
          subjective_score?: number | null
          sleep_quality?: number | null
          sleep_hours?: number | null
          muscle_soreness?: number | null
          energy_level?: number | null
          stress_level?: number | null
          hrv?: number | null
          resting_hr?: number | null
          source?: string
          raw_data?: Json | null
        }
      }
      session_feedback: {
        Row: {
          id: string
          completion_id: string
          session_rpe: number | null
          soreness_post: number | null
          energy_post: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          completion_id: string
          session_rpe?: number | null
          soreness_post?: number | null
          energy_post?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          session_rpe?: number | null
          soreness_post?: number | null
          energy_post?: number | null
          notes?: string | null
        }
      }
      athlete_assessments: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          assessment_type: string
          data: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          coach_id: string
          assessment_type: string
          data?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          assessment_type?: string
          data?: Json
          updated_at?: string
        }
      }
      ai_plan_logs: {
        Row: {
          id: string
          coach_id: string
          context_type: string
          context_id: string | null
          prompt_summary: string | null
          suggestion: Json | null
          action_taken: AiActionTaken | null
          coach_notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          context_type: string
          context_id?: string | null
          prompt_summary?: string | null
          suggestion?: Json | null
          action_taken?: AiActionTaken | null
          coach_notes?: string | null
          created_at?: string
        }
        Update: {
          action_taken?: AiActionTaken | null
          coach_notes?: string | null
        }
      }
      plan_changelog: {
        Row: {
          id: string
          plan_id: string
          version: number
          changed_by: string
          change_type: string
          change_summary: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          version?: number
          changed_by: string
          change_type?: string
          change_summary?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          change_summary?: string | null
          metadata?: Json | null
        }
      }
      periodization_templates: {
        Row: {
          id: string
          coach_id: string | null
          name: string
          sport_id: string | null
          duration_weeks: number
          structure: Json
          difficulty: TemplateDifficulty | null
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string | null
          name: string
          sport_id?: string | null
          duration_weeks: number
          structure: Json
          difficulty?: TemplateDifficulty | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          sport_id?: string | null
          duration_weeks?: number
          structure?: Json
          difficulty?: TemplateDifficulty | null
          is_public?: boolean
          updated_at?: string
        }
      }
      ai_chat_sessions: {
        Row: {
          id: string
          plan_id: string
          coach_id: string
          title: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          coach_id: string
          title?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string | null
          updated_at?: string
        }
      }
      ai_chat_messages: {
        Row: {
          id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          plan_data: Json | null
          session_data: Json | null
          tokens_used: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          plan_data?: Json | null
          session_data?: Json | null
          tokens_used?: number | null
          created_at?: string
        }
        Update: {
          content?: string
          plan_data?: Json | null
          session_data?: Json | null
        }
      }
    }
  }
}

// Convenience types for common use cases
export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type Post = Database['public']['Tables']['posts']['Row']
export type PostInsert = Database['public']['Tables']['posts']['Insert']

export type PostMedia = Database['public']['Tables']['post_media']['Row']

export type Sport = Database['public']['Tables']['sports']['Row']

export type CoachProfile = Database['public']['Tables']['coach_profiles']['Row']
export type AthleteProfile = Database['public']['Tables']['athlete_profiles']['Row']

export type Program = Database['public']['Tables']['programs']['Row']
export type ProgramWeek = Database['public']['Tables']['program_weeks']['Row']
export type Workout = Database['public']['Tables']['workouts']['Row']
export type Exercise = Database['public']['Tables']['exercises']['Row']
export type WorkoutCompletion = Database['public']['Tables']['workout_completions']['Row']
export type ExerciseResult = Database['public']['Tables']['exercise_results']['Row']

// Extended types with relations
export interface PostWithAuthor extends Post {
  author: Profile
  media: PostMedia[]
}

export interface PostWithDetails extends PostWithAuthor {
  workout_completion?: WorkoutCompletionWithDetails | null
  is_liked?: boolean
}

export interface WorkoutCompletionWithDetails extends WorkoutCompletion {
  exercise_results: ExerciseResultWithExercise[]
}

export interface ExerciseResultWithExercise extends ExerciseResult {
  exercise: Exercise
}

export type UserStreak = Database['public']['Tables']['user_streaks']['Row']
export type FavoriteExercise = Database['public']['Tables']['favorite_exercises']['Row']

export type Team = Database['public']['Tables']['teams']['Row']
export type TeamInsert = Database['public']['Tables']['teams']['Insert']
export type Group = Database['public']['Tables']['groups']['Row']
export type GroupInsert = Database['public']['Tables']['groups']['Insert']
export type GroupMember = Database['public']['Tables']['group_members']['Row']

export interface GroupWithDetails extends Group {
  team?: Team | null
  sport?: Sport | null
  members?: (GroupMember & { athlete: Profile })[]
  member_count?: number
}

export interface TeamWithGroups extends Team {
  sport?: Sport | null
  groups?: Group[]
}

// Sprint 9 — Training Planner convenience types
export type Plan = Database['public']['Tables']['plans']['Row']
export type PlanInsert = Database['public']['Tables']['plans']['Insert']
export type PlanUpdate = Database['public']['Tables']['plans']['Update']

export type PlanAthlete = Database['public']['Tables']['plan_athletes']['Row']
export type PlanAthleteInsert = Database['public']['Tables']['plan_athletes']['Insert']

export type TrainingBlock = Database['public']['Tables']['training_blocks']['Row']
export type TrainingBlockInsert = Database['public']['Tables']['training_blocks']['Insert']
export type TrainingBlockUpdate = Database['public']['Tables']['training_blocks']['Update']

export type BlockWeek = Database['public']['Tables']['block_weeks']['Row']
export type BlockWeekInsert = Database['public']['Tables']['block_weeks']['Insert']

export type ExerciseLibraryItem = Database['public']['Tables']['exercise_library']['Row']
export type ExerciseLibraryInsert = Database['public']['Tables']['exercise_library']['Insert']

export type ReadinessLog = Database['public']['Tables']['readiness_logs']['Row']
export type ReadinessLogInsert = Database['public']['Tables']['readiness_logs']['Insert']

export type SessionFeedback = Database['public']['Tables']['session_feedback']['Row']
export type SessionFeedbackInsert = Database['public']['Tables']['session_feedback']['Insert']

export type AthleteAssessment = Database['public']['Tables']['athlete_assessments']['Row']
export type AiPlanLog = Database['public']['Tables']['ai_plan_logs']['Row']

export type PeriodizationTemplate = Database['public']['Tables']['periodization_templates']['Row']
export type PeriodizationTemplateInsert = Database['public']['Tables']['periodization_templates']['Insert']

export type PlanChangelog = Database['public']['Tables']['plan_changelog']['Row']
export type PlanChangelogInsert = Database['public']['Tables']['plan_changelog']['Insert']

// Extended types with relations
export interface PlanWithDetails extends Plan {
  sport?: Sport | null
  athletes?: (PlanAthlete & { athlete: Profile })[]
  blocks?: TrainingBlock[]
}

export interface TrainingBlockWithWeeks extends TrainingBlock {
  weeks?: BlockWeek[]
}

export interface BlockWeekWithWorkouts extends BlockWeek {
  workouts?: Workout[]
}

// AI Chat types
export type AiChatSession = Database['public']['Tables']['ai_chat_sessions']['Row']
export type AiChatSessionInsert = Database['public']['Tables']['ai_chat_sessions']['Insert']
export type AiChatMessage = Database['public']['Tables']['ai_chat_messages']['Row']
export type AiChatMessageInsert = Database['public']['Tables']['ai_chat_messages']['Insert']
