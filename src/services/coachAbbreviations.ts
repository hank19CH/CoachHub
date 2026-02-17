import { supabase } from '@/lib/supabase'
import type { CoachAbbreviation } from '@/types/import'

// ============================================
// Coach Abbreviation Glossary Service
// Manages coach-specific exercise shorthand mappings
// Used by Smart Import for pre-expansion + prompt injection
// ============================================

/**
 * Get all abbreviations for a coach (lightweight, for import use).
 * Sorted by usage_count desc so most-used appear first.
 */
export async function getCoachAbbreviations(coachId: string): Promise<CoachAbbreviation[]> {
  const { data, error } = await (supabase as any)
    .from('coach_abbreviations')
    .select('abbreviation, expansion, sport_context')
    .eq('coach_id', coachId)
    .order('usage_count', { ascending: false })

  if (error) {
    console.error('[CoachAbbreviations] Error fetching:', error.message)
    return [] // Non-critical: return empty rather than throwing
  }
  return data || []
}

/**
 * Get full abbreviation records (for management UI).
 */
export async function getCoachAbbreviationsFull(coachId: string) {
  const { data, error } = await (supabase as any)
    .from('coach_abbreviations')
    .select('*')
    .eq('coach_id', coachId)
    .order('usage_count', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Build a glossary map for import pre-processing.
 * Returns { 'PP': 'Push Position Start', 'FG': 'From Ground Start', ... }
 */
export async function getAbbreviationMap(coachId: string): Promise<Record<string, string>> {
  const abbrs = await getCoachAbbreviations(coachId)
  const map: Record<string, string> = {}
  for (const a of abbrs) {
    map[a.abbreviation] = a.expansion
  }
  return map
}

/**
 * Upsert a single abbreviation.
 * Normalizes abbreviation to UPPERCASE.
 * If it already exists, updates expansion.
 */
export async function upsertAbbreviation(
  coachId: string,
  abbreviation: string,
  expansion: string,
  source: 'manual' | 'import_correction' | 'bulk' = 'manual',
  sportContext?: string[]
): Promise<void> {
  const normalized = abbreviation.trim().toUpperCase()
  if (!normalized || !expansion.trim()) return

  const { error } = await (supabase as any)
    .from('coach_abbreviations')
    .upsert({
      coach_id: coachId,
      abbreviation: normalized,
      expansion: expansion.trim(),
      source,
      sport_context: sportContext || [],
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'coach_id,abbreviation',
    })

  if (error) throw new Error(error.message)
}

/**
 * Batch-save abbreviations from import corrections.
 * Uses upsert to handle duplicates gracefully.
 */
export async function batchSaveAbbreviations(
  coachId: string,
  abbreviations: Array<{ abbreviation: string; expansion: string; sportContext?: string[] }>
): Promise<number> {
  if (abbreviations.length === 0) return 0

  const rows = abbreviations.map(a => ({
    coach_id: coachId,
    abbreviation: a.abbreviation.trim().toUpperCase(),
    expansion: a.expansion.trim(),
    sport_context: a.sportContext || [],
    source: 'import_correction',
    updated_at: new Date().toISOString(),
  }))

  const { error } = await (supabase as any)
    .from('coach_abbreviations')
    .upsert(rows, { onConflict: 'coach_id,abbreviation' })

  if (error) {
    console.error('[CoachAbbreviations] Batch save error:', error.message)
    throw new Error(error.message)
  }

  console.log(`[CoachAbbreviations] Saved ${rows.length} abbreviations`)
  return rows.length
}

/**
 * Delete an abbreviation by ID.
 */
export async function deleteAbbreviation(coachId: string, abbreviationId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('coach_abbreviations')
    .delete()
    .eq('id', abbreviationId)
    .eq('coach_id', coachId)

  if (error) throw new Error(error.message)
}

/**
 * Detect abbreviation patterns from exercise name corrections.
 *
 * Looks for short uppercase tokens (≤6 chars, alphanumeric) in the original
 * name that were replaced by longer phrases in the corrected name.
 *
 * Examples:
 *   "PP 10 Reps" → "Push Position Start 10 Reps" → detects PP = Push Position Start
 *   "FEF60" → "Fast Easy Fast 60m" → detects FEF60 = Fast Easy Fast 60m
 *   "Power Pole" → "Push Position Start" → no abbreviation detected (no short token)
 */
export function detectAbbreviationsFromCorrections(
  corrections: Array<{ original: string; corrected: string }>
): Array<{ abbreviation: string; expansion: string }> {
  const detected: Array<{ abbreviation: string; expansion: string }> = []
  const seen = new Set<string>()

  for (const { original, corrected } of corrections) {
    if (original === corrected) continue

    const origTokens = original.split(/\s+/)
    const corrTokens = corrected.split(/\s+/)

    // Case 1: Entire name is a short abbreviation (e.g., "PP" → "Push Position Start")
    if (origTokens.length === 1 && corrTokens.length >= 1) {
      const possibleAbbr = origTokens[0].toUpperCase()
      if (possibleAbbr.length <= 6 && /^[A-Z0-9]+$/.test(possibleAbbr) && !seen.has(possibleAbbr)) {
        detected.push({ abbreviation: possibleAbbr, expansion: corrected.trim() })
        seen.add(possibleAbbr)
        continue
      }
    }

    // Case 2: First token is a short abbreviation, rest is context
    // e.g., "PP 10 Reps" → "Push Position Start 10 Reps"
    if (origTokens.length >= 2) {
      const firstToken = origTokens[0].toUpperCase()
      if (firstToken.length <= 6 && /^[A-Z0-9]+$/.test(firstToken) && !seen.has(firstToken)) {
        // Check if this token was replaced (not present in corrected)
        if (!corrTokens.some(t => t.toUpperCase() === firstToken)) {
          // Find what it expanded to: diff the beginning
          // Simple heuristic: the expansion is everything before the shared suffix
          const origSuffix = origTokens.slice(1).join(' ')
          const corrSuffix = corrTokens.slice(-origTokens.length + 1).join(' ')

          if (origSuffix.toLowerCase() === corrSuffix.toLowerCase()) {
            // Shared suffix - expansion is the new prefix
            const expansionTokens = corrTokens.slice(0, corrTokens.length - origTokens.length + 1)
            if (expansionTokens.length > 0) {
              detected.push({ abbreviation: firstToken, expansion: expansionTokens.join(' ') })
              seen.add(firstToken)
              continue
            }
          }

          // Fallback: use entire corrected name as expansion
          detected.push({ abbreviation: firstToken, expansion: corrected.trim() })
          seen.add(firstToken)
        }
      }
    }

    // Case 3: Token-level scan for embedded abbreviations
    // e.g., "3x PP Sprint" → "3x Push Position Start Sprint"
    for (const token of origTokens) {
      const upper = token.toUpperCase()
      if (upper.length >= 2 && upper.length <= 6 && /^[A-Z0-9]+$/.test(upper) && !seen.has(upper)) {
        if (!corrTokens.some(t => t.toUpperCase() === upper)) {
          detected.push({ abbreviation: upper, expansion: corrected.trim() })
          seen.add(upper)
          break // one abbreviation per correction max
        }
      }
    }
  }

  return detected
}
