import { supabase } from '@/lib/supabase'

// ============================================
// Groups CRUD
// ============================================

export async function getCoachGroups(coachId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select(`
      *,
      team:teams(id, name),
      sport:sports(id, name, icon)
    `)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching groups:', error)
    return []
  }

  // Normalize relations
  const groups = (data || []).map((g: any) => ({
    ...g,
    team: Array.isArray(g.team) ? g.team[0] ?? null : g.team ?? null,
    sport: Array.isArray(g.sport) ? g.sport[0] ?? null : g.sport ?? null,
  }))

  // Fetch member counts
  if (groups.length > 0) {
    const groupIds = groups.map((g: any) => g.id)
    const { data: members } = await supabase
      .from('group_members')
      .select('group_id')
      .in('group_id', groupIds)

    const countMap = new Map<string, number>()
    for (const m of members || []) {
      countMap.set(m.group_id, (countMap.get(m.group_id) || 0) + 1)
    }

    for (const group of groups) {
      group.member_count = countMap.get(group.id) || 0
    }
  }

  return groups
}

export async function getGroupById(groupId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select(`
      *,
      team:teams(id, name),
      sport:sports(id, name, icon)
    `)
    .eq('id', groupId)
    .single()

  if (error) {
    console.error('Error fetching group:', error)
    return null
  }

  const group = {
    ...data,
    team: Array.isArray(data.team) ? data.team[0] ?? null : data.team ?? null,
    sport: Array.isArray(data.sport) ? data.sport[0] ?? null : data.sport ?? null,
  } as any

  return group
}

export async function createGroup(group: {
  coach_id: string
  name: string
  sport_id?: string | null
  team_id?: string | null
  description?: string | null
}) {
  const { data, error } = await supabase
    .from('groups')
    .insert(group)
    .select()
    .single()

  if (error) {
    console.error('Error creating group:', error)
    return null
  }

  return data
}

export async function updateGroup(groupId: string, updates: {
  name?: string
  sport_id?: string | null
  team_id?: string | null
  description?: string | null
}) {
  const { data, error } = await supabase
    .from('groups')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', groupId)
    .select()
    .single()

  if (error) {
    console.error('Error updating group:', error)
    return null
  }

  return data
}

export async function deleteGroup(groupId: string) {
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  if (error) {
    console.error('Error deleting group:', error)
    return false
  }
  return true
}

// ============================================
// Group Members
// ============================================

export async function getGroupMembers(groupId: string) {
  const { data, error } = await supabase
    .from('group_members')
    .select('*, athlete:profiles!athlete_id(id, username, display_name, avatar_url, user_type)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true })

  if (error) {
    console.error('Error fetching group members:', error)
    return []
  }

  return (data || []).map((m: any) => ({
    ...m,
    athlete: Array.isArray(m.athlete) ? m.athlete[0] : m.athlete,
  }))
}

export async function addGroupMembers(groupId: string, athleteIds: string[]) {
  const inserts = athleteIds.map(id => ({
    group_id: groupId,
    athlete_id: id,
  }))

  const { data, error } = await supabase
    .from('group_members')
    .upsert(inserts, { onConflict: 'group_id,athlete_id', ignoreDuplicates: true })
    .select()

  if (error) {
    console.error('Error adding group members:', error)
    return null
  }

  return data
}

export async function removeGroupMember(groupId: string, athleteId: string) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('athlete_id', athleteId)

  if (error) {
    console.error('Error removing group member:', error)
    return false
  }

  return true
}

// ============================================
// Teams CRUD
// ============================================

export async function getCoachTeams(coachId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('*, sport:sports(id, name, icon)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching teams:', error)
    return []
  }

  return (data || []).map((t: any) => ({
    ...t,
    sport: Array.isArray(t.sport) ? t.sport[0] ?? null : t.sport ?? null,
  }))
}

export async function createTeam(team: {
  coach_id: string
  name: string
  sport_id?: string | null
  description?: string | null
}) {
  const { data, error } = await supabase
    .from('teams')
    .insert(team)
    .select()
    .single()

  if (error) {
    console.error('Error creating team:', error)
    return null
  }

  return data
}

// ============================================
// Assign Program to Group
// ============================================

export async function assignProgramToGroup(
  programId: string,
  groupId: string,
  coachId: string,
  startDate: string
) {
  // 1. Get all workouts in the program (via program_weeks)
  const { data: weeks } = await supabase
    .from('program_weeks')
    .select('id, week_number')
    .eq('program_id', programId)
    .order('week_number')

  if (!weeks || weeks.length === 0) {
    return { success: false, error: 'No weeks found in program' }
  }

  const weekIds = weeks.map(w => w.id)
  const { data: workouts } = await supabase
    .from('workouts')
    .select('id, program_week_id, day_of_week')
    .in('program_week_id', weekIds)
    .order('day_of_week')

  if (!workouts || workouts.length === 0) {
    return { success: false, error: 'No workouts found in program' }
  }

  // 2. Get all members in the group
  const { data: members } = await supabase
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', groupId)

  if (!members || members.length === 0) {
    return { success: false, error: 'No members in this group' }
  }

  // 3. Build a week_number lookup
  const weekNumberMap = new Map<string, number>()
  for (const w of weeks) {
    weekNumberMap.set(w.id, w.week_number)
  }

  // 4. Create workout_assignment records for each workout x each member
  const start = new Date(startDate)
  const assignments: any[] = []

  for (const workout of workouts) {
    const weekNumber = weekNumberMap.get(workout.program_week_id!) || 1
    const dayOffset = (weekNumber - 1) * 7 + (workout.day_of_week || 0)

    const assignedDate = new Date(start)
    assignedDate.setDate(assignedDate.getDate() + dayOffset)
    const dateStr = assignedDate.toISOString().split('T')[0]

    for (const member of members) {
      assignments.push({
        workout_id: workout.id,
        athlete_id: member.athlete_id,
        coach_id: coachId,
        assigned_date: dateStr,
        status: 'pending',
      })
    }
  }

  // 5. Batch insert (Supabase supports bulk inserts)
  const BATCH_SIZE = 100
  for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
    const batch = assignments.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('workout_assignments').insert(batch)
    if (error) {
      console.error('Error inserting assignments batch:', error)
      return { success: false, error: `Failed at batch ${i / BATCH_SIZE + 1}: ${error.message}` }
    }
  }

  return {
    success: true,
    assignmentCount: assignments.length,
    workoutCount: workouts.length,
    memberCount: members.length,
  }
}

// ============================================
// Athlete: Get my groups
// ============================================

export async function getAthleteGroups(athleteId: string) {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      group:groups(
        id, name, description, created_at,
        coach:profiles!coach_id(id, username, display_name, avatar_url),
        team:teams(id, name),
        sport:sports(id, name, icon)
      )
    `)
    .eq('athlete_id', athleteId)

  if (error) {
    console.error('Error fetching athlete groups:', error)
    return []
  }

  return (data || []).map((m: any) => {
    const group = Array.isArray(m.group) ? m.group[0] : m.group
    if (group) {
      group.coach = Array.isArray(group.coach) ? group.coach[0] ?? null : group.coach ?? null
      group.team = Array.isArray(group.team) ? group.team[0] ?? null : group.team ?? null
      group.sport = Array.isArray(group.sport) ? group.sport[0] ?? null : group.sport ?? null
    }
    return group
  }).filter(Boolean)
}

// ============================================
// Sports lookup
// ============================================

export async function getSports() {
  const { data, error } = await supabase
    .from('sports')
    .select('*')
    .eq('is_approved', true)
    .order('name')

  if (error) {
    console.error('Error fetching sports:', error)
    return []
  }

  return data || []
}
