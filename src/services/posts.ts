import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Post = Database['public']['Tables']['posts']['Row']
type PostInsert = Database['public']['Tables']['posts']['Insert']
type PostMediaInsert = Database['public']['Tables']['post_media']['Insert']

export interface WorkoutPostData {
  completionId: string
  caption: string
  visibility: 'public' | 'followers' | 'private'
  sharedExerciseIds: string[]
  shareSettings: {
    show_duration: boolean
    show_rpe: boolean
    show_workout_name: boolean
    show_exercise_details: boolean
    highlight_pbs_only: boolean
  }
}

export interface UploadedMedia {
  file: File
  url: string
  type: 'image' | 'video'
}

/**
 * Upload media file to Supabase Storage
 */
export async function uploadPostMedia(
  file: File,
  userId: string,
  postId: string
): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}/${postId}/${crypto.randomUUID()}.${fileExt}`

    const { data, error } = await supabase.storage
      .from('post-media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('Error uploading media:', error)
      return null
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('post-media').getPublicUrl(data.path)

    return publicUrl
  } catch (error) {
    console.error('Error in uploadPostMedia:', error)
    return null
  }
}

/**
 * Create workout post with media
 */
export async function createWorkoutPost(
  postData: WorkoutPostData,
  mediaFiles: UploadedMedia[]
): Promise<Post | null> {
  try {
    // Step 1: Update workout_completions with sharing metadata
    const { error: updateError } = await supabase
      .from('workout_completions')
      .update({
        caption: postData.caption,
        shared_exercise_ids: postData.sharedExerciseIds,
        share_settings: postData.shareSettings,
      })
      .eq('id', postData.completionId)

    if (updateError) {
      console.error('Error updating workout_completions:', updateError)
      return null
    }

    // Step 2: Get athlete_id from workout_completions
    const { data: completion, error: completionError } = await supabase
      .from('workout_completions')
      .select('athlete_id')
      .eq('id', postData.completionId)
      .single()

    if (completionError || !completion) {
      console.error('Error fetching completion:', completionError)
      return null
    }

    // Step 3: Create post record
    const postInsert: PostInsert = {
      author_id: completion.athlete_id,
      content: postData.caption,
      post_type: 'workout',
      workout_completion_id: postData.completionId,
      visibility: postData.visibility,
      is_pinned: false,
      likes_count: 0,
      comments_count: 0,
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert(postInsert)
      .select()
      .single()

    if (postError || !post) {
      console.error('Error creating post:', postError)
      return null
    }

    // Step 4: Create post_media records for uploaded files
    if (mediaFiles.length > 0) {
      const mediaInserts: PostMediaInsert[] = mediaFiles.map((media, index) => ({
        post_id: post.id,
        media_type: media.type,
        url: media.url,
        display_order: index,
        alt_text: `Workout media ${index + 1}`,
      }))

      const { error: mediaError } = await supabase.from('post_media').insert(mediaInserts)

      if (mediaError) {
        console.error('Error creating post_media:', mediaError)
      }
    }

    // Step 5: Create virtual workout_card media entry
    const workoutCardInsert: PostMediaInsert = {
      post_id: post.id,
      media_type: 'workout_card',
      url: null,
      display_order: mediaFiles.length, // Always last
      alt_text: 'Workout summary card',
    }

    await supabase.from('post_media').insert(workoutCardInsert)

    return post
  } catch (error) {
    console.error('Error in createWorkoutPost:', error)
    return null
  }
}

/**
 * Create a general post (manual type) with optional media
 */
export async function createPost(
  authorId: string,
  caption: string,
  visibility: 'public' | 'followers' | 'private',
  mediaFiles: UploadedMedia[]
): Promise<Post | null> {
  try {
    // Create post record
    const postInsert: PostInsert = {
      author_id: authorId,
      content: caption || null,
      post_type: 'manual',
      visibility,
      is_pinned: false,
      likes_count: 0,
      comments_count: 0,
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert(postInsert)
      .select()
      .single()

    if (postError || !post) {
      console.error('Error creating post:', postError)
      return null
    }

    // Create post_media records for uploaded files
    if (mediaFiles.length > 0) {
      const mediaInserts: PostMediaInsert[] = mediaFiles.map((media, index) => ({
        post_id: post.id,
        media_type: media.type,
        url: media.url,
        display_order: index,
        alt_text: `Post media ${index + 1}`,
      }))

      const { error: mediaError } = await supabase.from('post_media').insert(mediaInserts)

      if (mediaError) {
        console.error('Error creating post_media:', mediaError)
      }
    }

    return post
  } catch (error) {
    console.error('Error in createPost:', error)
    return null
  }
}

/**
 * Fetch feed posts with workout data
 */
export async function getFeedPosts(limit = 25, offset = 0) {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(
        `
        *,
        author:profiles!author_id(*),
        post_media(*),
        workout_completion:workout_completions!posts_workout_completion_id_fkey(
          id,
          duration_minutes,
          overall_rpe,
          has_pb,
          completed_at,
          shared_exercise_ids,
          share_settings,
          assignment:workout_assignments!workout_completions_assignment_id_fkey(
            workout:workouts!workout_assignments_workout_id_fkey(
              id,
              name,
              description
            )
          )
        )
      `
      )
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching feed posts:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getFeedPosts:', error)
    return []
  }
}

/**
 * Fetch exercise results for workout card rendering
 */
export async function getWorkoutCardData(completionId: string, exerciseIds?: string[]) {
  try {
    let query = supabase
      .from('exercise_results')
      .select(
        `
        *,
        exercise:exercises!exercise_results_exercise_id_fkey(
          id,
          name,
          sets,
          reps,
          weight_kg,
          duration_seconds,
          distance_meters
        )
      `
      )
      .eq('completion_id', completionId)
      .order('exercise_id')

    if (exerciseIds && exerciseIds.length > 0) {
      query = query.in('exercise_id', exerciseIds)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching workout card data:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getWorkoutCardData:', error)
    return []
  }
}
