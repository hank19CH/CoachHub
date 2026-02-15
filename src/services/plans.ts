import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

// ============================================
// Type aliases from database schema
// ============================================
type Plan = Database['public']['Tables']['plans']['Row']
type PlanInsert = Database['public']['Tables']['plans']['Insert']
type PlanUpdate = Database['public']['Tables']['plans']['Update']
type TrainingBlock = Database['public']['Tables']['training_blocks']['Row']
type TrainingBlockInsert = Database['public']['Tables']['training_blocks']['Insert']
type TrainingBlockUpdate = Database['public']['Tables']['training_blocks']['Update']
type BlockWeek = Database['public']['Tables']['block_weeks']['Row']
type BlockWeekInsert = Database['public']['Tables']['block_weeks']['Insert']
type BlockWeekUpdate = Database['public']['Tables']['block_weeks']['Update']
type PlanAthlete = Database['public']['Tables']['plan_athletes']['Row']
type PlanAthleteInsert = Database['public']['Tables']['plan_athletes']['Insert']
type PeriodizationTemplate = Database['public']['Tables']['periodization_templates']['Row']

// ============================================
// Extended types with relations
// ============================================
export interface PlanWithBlocks extends Plan {
  training_blocks: TrainingBlock[]
  plan_athletes: PlanAthlete[]
}

export interface TrainingBlockWithWeeks extends TrainingBlock {
  block_weeks: BlockWeek[]
}

export interface PlanFull extends Plan {
  training_blocks: TrainingBlockWithWeeks[]
  plan_athletes: (PlanAthlete & { athlete?: { display_name: string; avatar_url: string | null } | null })[]
  sport?: { name: string; icon: string | null } | null
}

// ============================================
// Plans CRUD
// ============================================
export const plansService = {
  /**
   * Get all plans for a coach
   */
  async getCoachPlans(coachId: string): Promise<Plan[]> {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('coach_id', coachId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching coach plans:', error)
      throw new Error(error.message || 'Failed to fetch plans')
    }
    return data || []
  },

  /**
   * Get a single plan with full nested data
   */
  async getPlanById(planId: string, coachId?: string): Promise<PlanFull> {
    let query = supabase
      .from('plans')
      .select(`
        *,
        sport:sports(name, icon),
        training_blocks(
          *,
          block_weeks(*)
        ),
        plan_athletes(
          *,
          athlete:profiles!plan_athletes_athlete_id_fkey(display_name, avatar_url)
        )
      `)
      .eq('id', planId)

    if (coachId) {
      query = query.eq('coach_id', coachId)
    }

    const { data, error } = (await query.single()) as { data: any; error: any }

    if (error) {
      console.error('Error fetching plan:', error)
      throw new Error(error.message || 'Failed to fetch plan')
    }

    // Normalize FK relations
    if (data) {
      data.sport = Array.isArray(data.sport) ? data.sport[0] ?? null : data.sport ?? null

      // Sort blocks by order_index
      if (data.training_blocks) {
        data.training_blocks.sort((a: TrainingBlock, b: TrainingBlock) => a.order_index - b.order_index)
        // Sort block_weeks within each block
        for (const block of data.training_blocks) {
          if (block.block_weeks) {
            block.block_weeks.sort((a: BlockWeek, b: BlockWeek) => a.week_number - b.week_number)
          }
        }
      }

      // Normalize plan_athletes relations
      if (data.plan_athletes) {
        for (const pa of data.plan_athletes) {
          pa.athlete = Array.isArray(pa.athlete) ? pa.athlete[0] ?? null : pa.athlete ?? null
        }
      }
    }

    return data as PlanFull
  },

  /**
   * Create a new plan
   */
  async createPlan(plan: PlanInsert): Promise<Plan> {
    const { data, error } = (await (supabase
      .from('plans') as any)
      .insert(plan)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error creating plan:', error)
      throw new Error(error.message || 'Failed to create plan')
    }
    return data
  },

  /**
   * Update an existing plan
   */
  async updatePlan(planId: string, updates: PlanUpdate, coachId?: string): Promise<Plan> {
    let query = (supabase
      .from('plans') as any)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', planId)

    if (coachId) {
      query = query.eq('coach_id', coachId)
    }

    const { data, error } = await query.select().single()

    if (error) {
      console.error('Error updating plan:', error)
      throw new Error(error.message || 'Failed to update plan')
    }
    return data
  },

  /**
   * Delete a plan (cascades to blocks, weeks, plan_athletes)
   */
  async deletePlan(planId: string, coachId?: string): Promise<void> {
    let query = supabase
      .from('plans')
      .delete()
      .eq('id', planId)

    if (coachId) {
      query = query.eq('coach_id', coachId)
    }

    const { error } = await query

    if (error) {
      console.error('Error deleting plan:', error)
      throw new Error(error.message || 'Failed to delete plan')
    }
  },

  // ============================================
  // Training Blocks CRUD
  // ============================================

  /**
   * Get blocks for a plan
   */
  async getPlanBlocks(planId: string): Promise<TrainingBlockWithWeeks[]> {
    const { data, error } = await supabase
      .from('training_blocks')
      .select('*, block_weeks(*)')
      .eq('plan_id', planId)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('Error fetching plan blocks:', error)
      throw new Error(error.message || 'Failed to fetch training blocks')
    }

    // Sort block_weeks within each block
    if (data) {
      for (const block of data) {
        if ((block as any).block_weeks) {
          (block as any).block_weeks.sort((a: BlockWeek, b: BlockWeek) => a.week_number - b.week_number)
        }
      }
    }

    return (data || []) as TrainingBlockWithWeeks[]
  },

  /**
   * Create a training block
   */
  async createBlock(block: TrainingBlockInsert): Promise<TrainingBlock> {
    const { data, error } = (await (supabase
      .from('training_blocks') as any)
      .insert(block)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error creating training block:', error)
      throw new Error(error.message || 'Failed to create training block')
    }

    // Auto-create block_weeks if duration_weeks is set
    if (data && block.duration_weeks && block.duration_weeks > 0) {
      const weeks: BlockWeekInsert[] = []
      for (let i = 1; i <= block.duration_weeks; i++) {
        weeks.push({
          training_block_id: data.id,
          week_number: i,
          name: `Week ${i}`,
          volume_modifier: 1.0,
          intensity_modifier: 1.0,
          is_deload: false,
        })
      }

      const { error: weekError } = await (supabase
        .from('block_weeks') as any)
        .insert(weeks)

      if (weekError) {
        console.error('Error creating block weeks:', weekError)
      }
    }

    return data
  },

  /**
   * Update a training block
   */
  async updateBlock(blockId: string, updates: TrainingBlockUpdate): Promise<TrainingBlock> {
    const { data, error } = (await (supabase
      .from('training_blocks') as any)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', blockId)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error updating training block:', error)
      throw new Error(error.message || 'Failed to update training block')
    }
    return data
  },

  /**
   * Delete a training block
   */
  async deleteBlock(blockId: string): Promise<void> {
    const { error } = await supabase
      .from('training_blocks')
      .delete()
      .eq('id', blockId)

    if (error) {
      console.error('Error deleting training block:', error)
      throw new Error(error.message || 'Failed to delete training block')
    }
  },

  /**
   * Reorder blocks within a plan
   */
  async reorderBlocks(blocks: { id: string; order_index: number }[]): Promise<void> {
    for (const block of blocks) {
      const { error } = await (supabase
        .from('training_blocks') as any)
        .update({ order_index: block.order_index })
        .eq('id', block.id)

      if (error) {
        console.error('Error reordering block:', error)
        throw new Error(error.message || 'Failed to reorder blocks')
      }
    }
  },

  // ============================================
  // Block Weeks CRUD
  // ============================================

  /**
   * Get weeks for a block
   */
  async getBlockWeeks(blockId: string): Promise<BlockWeek[]> {
    const { data, error } = await supabase
      .from('block_weeks')
      .select('*')
      .eq('training_block_id', blockId)
      .order('week_number', { ascending: true })

    if (error) {
      console.error('Error fetching block weeks:', error)
      throw new Error(error.message || 'Failed to fetch block weeks')
    }
    return data || []
  },

  /**
   * Update a block week
   */
  async updateBlockWeek(weekId: string, updates: BlockWeekUpdate): Promise<BlockWeek> {
    const { data, error } = (await (supabase
      .from('block_weeks') as any)
      .update(updates)
      .eq('id', weekId)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error updating block week:', error)
      throw new Error(error.message || 'Failed to update block week')
    }
    return data
  },

  /**
   * Add a week to a block
   */
  async createBlockWeek(week: BlockWeekInsert): Promise<BlockWeek> {
    const { data, error } = (await (supabase
      .from('block_weeks') as any)
      .insert(week)
      .select()
      .single()) as { data: any; error: any }

    if (error) {
      console.error('Error creating block week:', error)
      throw new Error(error.message || 'Failed to create block week')
    }
    return data
  },

  /**
   * Delete a block week
   */
  async deleteBlockWeek(weekId: string): Promise<void> {
    const { error } = await supabase
      .from('block_weeks')
      .delete()
      .eq('id', weekId)

    if (error) {
      console.error('Error deleting block week:', error)
      throw new Error(error.message || 'Failed to delete block week')
    }
  },

  // ============================================
  // Plan Athletes
  // ============================================

  /**
   * Assign athletes to a plan
   */
  async addPlanAthletes(athletes: PlanAthleteInsert[]): Promise<PlanAthlete[]> {
    const { data, error } = (await (supabase
      .from('plan_athletes') as any)
      .insert(athletes)
      .select()) as { data: any; error: any }

    if (error) {
      console.error('Error adding plan athletes:', error)
      throw new Error(error.message || 'Failed to add athletes to plan')
    }
    return data || []
  },

  /**
   * Remove an athlete from a plan
   */
  async removePlanAthlete(planAthleteId: string): Promise<void> {
    const { error } = await supabase
      .from('plan_athletes')
      .delete()
      .eq('id', planAthleteId)

    if (error) {
      console.error('Error removing plan athlete:', error)
      throw new Error(error.message || 'Failed to remove athlete from plan')
    }
  },

  // ============================================
  // Periodization Templates
  // ============================================

  /**
   * Get available templates (system + coach's own)
   */
  async getTemplates(coachId?: string): Promise<PeriodizationTemplate[]> {
    let query = supabase
      .from('periodization_templates')
      .select('*')
      .order('name', { ascending: true })

    if (coachId) {
      // System templates (coach_id IS NULL) + coach's own templates
      query = query.or(`coach_id.is.null,coach_id.eq.${coachId}`)
    } else {
      // Only system templates
      query = query.is('coach_id', null)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      throw new Error(error.message || 'Failed to fetch templates')
    }
    return data || []
  },

  /**
   * Apply a template to a plan — creates blocks and weeks from template structure
   */
  async applyTemplate(planId: string, template: PeriodizationTemplate): Promise<void> {
    const structure = template.structure as any
    if (!structure || !structure.blocks) {
      throw new Error('Template has no block structure')
    }

    // Delete existing blocks for this plan first
    const { error: deleteError } = await supabase
      .from('training_blocks')
      .delete()
      .eq('plan_id', planId)

    if (deleteError) {
      console.error('Error clearing existing blocks:', deleteError)
      throw new Error(deleteError.message || 'Failed to clear existing blocks')
    }

    // Create blocks from template
    for (let i = 0; i < structure.blocks.length; i++) {
      const blockDef = structure.blocks[i]
      const blockInsert: TrainingBlockInsert = {
        plan_id: planId,
        name: blockDef.name || `Block ${i + 1}`,
        block_type: blockDef.block_type || null,
        focus_tags: blockDef.focus_tags || [],
        order_index: i,
        duration_weeks: blockDef.duration_weeks || 4,
        volume_target: blockDef.volume_target || null,
        intensity_target: blockDef.intensity_target || null,
        ai_generated: false,
      }

      await plansService.createBlock(blockInsert) // This auto-creates weeks
    }

    // Update plan with template's periodization model if available
    if (structure.periodization_model) {
      await plansService.updatePlan(planId, {
        periodization_model: structure.periodization_model,
      })
    }
  },

  // ============================================
  // Coach's athletes (for plan assignment)
  // ============================================

  /**
   * Get athletes the coach works with (for assignment selector)
   */
  async getCoachAthletes(coachId: string): Promise<{ id: string; display_name: string; avatar_url: string | null }[]> {
    const { data, error } = await supabase
      .from('coach_athletes')
      .select('athlete:profiles!coach_athletes_athlete_id_fkey(id, display_name, avatar_url)')
      .eq('coach_id', coachId)
      .eq('status', 'active')

    if (error) {
      console.error('Error fetching coach athletes:', error)
      throw new Error(error.message || 'Failed to fetch athletes')
    }

    return (data || []).map((row: any) => {
      const athlete = Array.isArray(row.athlete) ? row.athlete[0] : row.athlete
      return athlete
    }).filter(Boolean)
  },

  /**
   * Get coach's groups (for plan assignment)
   */
  async getCoachGroups(coachId: string): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name')
      .eq('coach_id', coachId)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching coach groups:', error)
      throw new Error(error.message || 'Failed to fetch groups')
    }
    return data || []
  },

  /**
   * Get sports list
   */
  async getSports(): Promise<{ id: string; name: string; icon: string | null }[]> {
    const { data, error } = await supabase
      .from('sports')
      .select('id, name, icon')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching sports:', error)
      throw new Error(error.message || 'Failed to fetch sports')
    }
    return data || []
  },
}
