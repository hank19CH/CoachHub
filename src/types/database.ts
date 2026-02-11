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
          name: string
          description: string | null
          day_of_week: number | null
          estimated_duration_min: number | null
          workout_type: string | null
          is_template: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id: string
          program_week_id?: string | null
          name: string
          description?: string | null
          day_of_week?: number | null
          estimated_duration_min?: number | null
          workout_type?: string | null
          is_template?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          program_week_id?: string | null
          name?: string
          description?: string | null
          day_of_week?: number | null
          estimated_duration_min?: number | null
          workout_type?: string | null
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
