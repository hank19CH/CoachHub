// smart-import Edge Function (v12 - block-aware import → planner tables)
// Pre-parsed spreadsheets (SheetJS on frontend) -> Haiku 4.5 for JSON structuring
// PDF/Images -> Sonnet 4.5 for vision/document parsing

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-5'

// ── CORS ────────────────────────────────────────────────────────────────
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

// ── Prompts ─────────────────────────────────────────────────────────────
const SYSTEM = `You are a training program parser. Output ONLY valid JSON. No markdown, no code fences, no commentary.
CRITICAL: You must extract EVERY exercise from EVERY workout. Never return an empty exercises array when exercises exist in the data. If a row in a spreadsheet contains an exercise name, sets, reps, or distances, include it.`

const SCHEMA = `Return a JSON object with this structure:
{
  "programName": "string",
  "durationWeeks": number,
  "periodization": "linear"|"undulating"|"block"|"conjugate"|"mixed",
  "sport": "string or null",
  "blocks": [{
    "name": "string",
    "blockType": "string or null",
    "weeks": [{
      "weekNumber": number,
      "name": "string",
      "workouts": [{
        "name": "string",
        "dayOfWeek": 1-7,
        "sessionType": "speed"|"strength"|"power"|"hypertrophy"|"conditioning"|"endurance"|"recovery"|"technique"|"competition"|"mixed"|null,
        "exercises": [{
          "name": "string",
          "sets": number,
          "reps": "string"
        }]
      }]
    }]
  }]
}

RULES:
1. Extract ALL exercises for every workout. Each exercise must have at least a name. If sets/reps are not clear, use reasonable defaults (sets: 1, reps: "1").
2. For sprint/track data: treat drills like "Power Pole", "High Start", "3 Point" as exercises. Distances (e.g. "20m", "30m", "60m") should go in the reps field as a string.
3. Group weeks into training blocks/phases if detectable (GPP, SPP, Competition, Accumulation, Intensification, Peaking, Hypertrophy, Strength, Power, Taper). If no phases are detectable, use one block.
4. blockType examples: "hypertrophy", "strength", "power", "peaking", "gpp", "spp", "competition", "recovery".
5. weekNumber must be sequential within each block starting at 1.
6. dayOfWeek: 1=Monday, 7=Sunday. If specific days aren't clear, assign workouts sequentially starting from Monday.
7. sessionType: classify each workout's primary focus. For sprint training, "speed" is typical.
8. Optional exercise fields (include ONLY when data exists): "weight", "rpe", "notes", "duration_seconds", "distance_meters".
9. Detect the sport and periodization from context.
10. Be CONSISTENT: given the same input data, always produce the same output structure and the same number of workouts and exercises.
Output ONLY the JSON.`

// ── Call Anthropic Messages API ─────────────────────────────────────────
async function callClaude(
  model: string,
  maxTokens: number,
  messages: Array<{ role: string; content: any }>,
): Promise<{ text: string; usage: any; stopReason: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system: SYSTEM,
      messages,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`Claude API ${res.status}:`, errBody.substring(0, 500))
    throw new Error(`Claude API ${res.status}: ${errBody.substring(0, 300)}`)
  }

  const data = await res.json()
  const stopReason = data.stop_reason
  const usage = data.usage

  console.log(`Claude response: model=${model}, stop_reason=${stopReason}, input=${usage?.input_tokens}, output=${usage?.output_tokens}`)

  if (stopReason === 'max_tokens') {
    throw new Error(
      `Response truncated at ${usage?.output_tokens ?? '?'} tokens (limit: ${maxTokens}). Program too large for single pass.`,
    )
  }

  const textBlock = data.content?.find((b: any) => b.type === 'text')
  if (!textBlock?.text) {
    throw new Error('No text in Claude response')
  }

  return { text: textBlock.text, usage, stopReason }
}

// ── Extract JSON from AI text ───────────────────────────────────────────
function extractJSON(raw: string): any {
  let text = raw.trim()

  // Strip markdown code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) text = fenced[1].trim()

  // Extract outermost { ... }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    text = text.substring(start, end + 1)
  }

  return JSON.parse(text) // throws on invalid JSON
}

// ── Main handler ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await sb.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ── Parse request ──
    const { fileContent, fileType, fileName, preParsed } = await req.json()
    if (!fileContent || !fileType || !fileName) {
      return json({ error: 'Missing fileContent, fileType, or fileName' }, 400)
    }
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    console.log(`[smart-import] file=${fileName} type=${fileType} preParsed=${preParsed} len=${fileContent.length}`)

    // ── Route to correct model ──
    let result: { text: string; usage: any; stopReason: string }
    let modelUsed: string

    if (preParsed) {
      // Spreadsheet text from SheetJS -> Haiku (fast, cheap)
      modelUsed = HAIKU
      result = await callClaude(HAIKU, 32000, [
        {
          role: 'user',
          content: `Parse this spreadsheet data from "${fileName}":\n\n${fileContent}\n\n${SCHEMA}`,
        },
      ])
    } else {
      // PDF or image -> Sonnet with vision/document blocks
      modelUsed = SONNET
      const contentBlocks: any[] = []

      if (fileType === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: fileContent },
        })
      } else if (fileType.startsWith('image/')) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: fileType, data: fileContent },
        })
      } else {
        contentBlocks.push({
          type: 'text',
          text: `File "${fileName}" (${fileType}), base64 preview:\n${fileContent.substring(0, 3000)}`,
        })
      }

      contentBlocks.push({
        type: 'text',
        text: `Extract the training program from "${fileName}".\n\n${SCHEMA}`,
      })

      result = await callClaude(SONNET, 32000, [
        { role: 'user', content: contentBlocks },
      ])
    }

    // ── Parse the JSON ──
    let importResult: any
    try {
      importResult = extractJSON(result.text)
    } catch (parseErr) {
      console.error('[smart-import] JSON parse failed. Raw (first 1000):', result.text.substring(0, 1000))
      return json({
        error: 'Failed to parse AI response as JSON',
        raw: result.text.substring(0, 500),
      }, 500)
    }

    // Validate required fields
    if (!importResult.programName) {
      return json({ error: 'AI response missing programName' }, 500)
    }
    if (!Array.isArray(importResult.blocks) || importResult.blocks.length === 0) {
      // Backward compat: if AI returned flat weeks[] instead of blocks[], wrap in a single block
      if (Array.isArray(importResult.weeks) && importResult.weeks.length > 0) {
        importResult.blocks = [{
          name: importResult.programName,
          blockType: null,
          weeks: importResult.weeks,
        }]
        delete importResult.weeks
      } else {
        return json({ error: 'AI response missing blocks[] or weeks[]' }, 500)
      }
    }

    // ── Log (non-blocking) ──
    const tokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
    try {
      await sb.from('ai_plan_logs').insert({
        coach_id: user.id,
        tier: 'import',
        action: 'smart_import',
        prompt: `${fileName} (${fileType}) [${preParsed ? 'Haiku' : 'Sonnet'}]`,
        response: JSON.stringify(importResult).substring(0, 5000),
        model: modelUsed,
        tokens_used: tokens,
      } as any)
    } catch (e) {
      console.warn('[smart-import] ai_plan_logs insert failed (non-fatal):', e)
    }

    return json({ success: true, importResult, model: modelUsed, usage: result.usage })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[smart-import] ERROR:', msg)
    if (err instanceof Error && err.stack) console.error(err.stack)
    return json({ error: msg || 'Internal server error' }, 500)
  }
})
