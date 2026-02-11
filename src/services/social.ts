import { supabase } from '@/lib/supabase'
import type { FollowStatus } from '@/types/database'

// ============================================
// Likes
// ============================================

export async function toggleLike(userId: string, postId: string): Promise<{ liked: boolean }> {
  // Check if already liked
  const { data: existing } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle()

  if (existing) {
    // Unlike
    await supabase.from('likes').delete().eq('id', existing.id)
    // Decrement count
    await supabase.rpc('decrement_likes_count', { post_id_input: postId }).catch(() => {
      // Fallback: manual decrement
      supabase
        .from('posts')
        .select('likes_count')
        .eq('id', postId)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase
              .from('posts')
              .update({ likes_count: Math.max(0, (data.likes_count || 1) - 1) })
              .eq('id', postId)
          }
        })
    })
    return { liked: false }
  } else {
    // Like
    await supabase.from('likes').insert({ user_id: userId, post_id: postId })
    // Increment count
    await supabase.rpc('increment_likes_count', { post_id_input: postId }).catch(() => {
      // Fallback: manual increment
      supabase
        .from('posts')
        .select('likes_count')
        .eq('id', postId)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase
              .from('posts')
              .update({ likes_count: (data.likes_count || 0) + 1 })
              .eq('id', postId)
          }
        })
    })
    return { liked: true }
  }
}

export async function checkIfLiked(userId: string, postId: string): Promise<boolean> {
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .maybeSingle()
  return !!data
}

export async function getPostLikers(postId: string, limit = 20) {
  const { data } = await supabase
    .from('likes')
    .select('user_id, created_at, user:profiles!user_id(id, username, display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map((like: any) => {
    const user = Array.isArray(like.user) ? like.user[0] : like.user
    return { ...like, user }
  })
}

// ============================================
// Comments
// ============================================

export async function getPostComments(postId: string, limit = 50) {
  const { data, error } = await supabase
    .from('comments')
    .select('*, author:profiles!author_id(id, username, display_name, avatar_url)')
    .eq('post_id', postId)
    .is('parent_id', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Error fetching comments:', error)
    return []
  }

  return (data || []).map((comment: any) => {
    const author = Array.isArray(comment.author) ? comment.author[0] : comment.author
    return { ...comment, author }
  })
}

export async function addComment(postId: string, authorId: string, content: string, parentId?: string) {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      author_id: authorId,
      content,
      parent_id: parentId ?? null,
    })
    .select('*, author:profiles!author_id(id, username, display_name, avatar_url)')
    .single()

  if (error) {
    console.error('Error adding comment:', error)
    return null
  }

  // Increment comment count on post
  const { data: post } = await supabase
    .from('posts')
    .select('comments_count')
    .eq('id', postId)
    .single()

  if (post) {
    await supabase
      .from('posts')
      .update({ comments_count: (post.comments_count || 0) + 1 })
      .eq('id', postId)
  }

  // Normalize author
  if (data) {
    const normalized = { ...data } as any
    normalized.author = Array.isArray(data.author) ? (data.author as any)[0] : data.author
    return normalized
  }

  return data
}

export async function deleteComment(commentId: string, postId: string) {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)

  if (error) {
    console.error('Error deleting comment:', error)
    return false
  }

  // Decrement comment count
  const { data: post } = await supabase
    .from('posts')
    .select('comments_count')
    .eq('id', postId)
    .single()

  if (post) {
    await supabase
      .from('posts')
      .update({ comments_count: Math.max(0, (post.comments_count || 1) - 1) })
      .eq('id', postId)
  }

  return true
}

// ============================================
// Follows
// ============================================

export async function getFollowStatus(
  followerId: string,
  followingId: string
): Promise<{ isFollowing: boolean; status: FollowStatus | null }> {
  const { data } = await supabase
    .from('follows')
    .select('id, status')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle()

  if (!data) return { isFollowing: false, status: null }
  return { isFollowing: true, status: data.status as FollowStatus }
}

export async function followUser(followerId: string, followingId: string, isPrivate: boolean) {
  const status: FollowStatus = isPrivate ? 'pending' : 'active'

  const { data, error } = await supabase
    .from('follows')
    .insert({
      follower_id: followerId,
      following_id: followingId,
      status,
    })
    .select()
    .single()

  if (error) {
    console.error('Error following user:', error)
    return null
  }

  return data
}

export async function unfollowUser(followerId: string, followingId: string) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)

  if (error) {
    console.error('Error unfollowing user:', error)
    return false
  }

  return true
}

export async function acceptFollowRequest(followId: string) {
  const { error } = await supabase
    .from('follows')
    .update({ status: 'active' })
    .eq('id', followId)

  if (error) {
    console.error('Error accepting follow request:', error)
    return false
  }

  return true
}

export async function getFollowers(userId: string, limit = 50) {
  const { data } = await supabase
    .from('follows')
    .select('*, follower:profiles!follower_id(id, username, display_name, avatar_url)')
    .eq('following_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map((follow: any) => {
    const follower = Array.isArray(follow.follower) ? follow.follower[0] : follow.follower
    return { ...follow, follower }
  })
}

export async function getFollowing(userId: string, limit = 50) {
  const { data } = await supabase
    .from('follows')
    .select('*, following:profiles!following_id(id, username, display_name, avatar_url)')
    .eq('follower_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).map((follow: any) => {
    const following = Array.isArray(follow.following) ? follow.following[0] : follow.following
    return { ...follow, following }
  })
}

// ============================================
// Delete Post
// ============================================

export async function deletePost(postId: string, authorId: string): Promise<boolean> {
  // Delete the post (CASCADE should handle post_media, but let's be safe)
  const { error: mediaError } = await supabase
    .from('post_media')
    .delete()
    .eq('post_id', postId)

  if (mediaError) {
    console.error('Error deleting post media:', mediaError)
  }

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', authorId)

  if (error) {
    console.error('Error deleting post:', error)
    return false
  }

  return true
}

// ============================================
// Feed with Following filter
// ============================================

export async function getFollowingFeed(userId: string, limit = 25, offset = 0) {
  // First get list of users we follow
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .eq('status', 'active')

  if (!follows || follows.length === 0) return []

  const followingIds = follows.map((f: any) => f.following_id)
  // Include own posts too
  followingIds.push(userId)

  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!author_id(*),
      media:post_media(*),
      workout_completion:workout_completions!posts_workout_completion_id_fkey(
        id, duration_minutes, overall_rpe, has_pb, completed_at,
        shared_exercise_ids, share_settings,
        assignment:workout_assignments!workout_completions_assignment_id_fkey(
          workout:workouts!workout_assignments_workout_id_fkey(id, name, description)
        )
      )
    `)
    .in('author_id', followingIds)
    .in('visibility', ['public', 'followers'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching following feed:', error)
    return []
  }

  return data || []
}

// ============================================
// Single Post fetch (for PostDetailView)
// ============================================

export async function getPostById(postId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!author_id(*),
      media:post_media(*),
      workout_completion:workout_completions!posts_workout_completion_id_fkey(
        id, duration_minutes, overall_rpe, has_pb, completed_at,
        shared_exercise_ids, share_settings,
        assignment:workout_assignments!workout_completions_assignment_id_fkey(
          workout:workouts!workout_assignments_workout_id_fkey(id, name, description)
        )
      )
    `)
    .eq('id', postId)
    .single()

  if (error) {
    console.error('Error fetching post:', error)
    return null
  }

  return data
}
