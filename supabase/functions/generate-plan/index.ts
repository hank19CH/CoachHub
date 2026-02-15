// Supabase Edge Function: generate-plan
// Uses Anthropic Claude Sonnet for AI-powered training plan generation and modification
// Tier 2: Modify existing plans | Tier 3: Generate new plans from scratch

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'

Deno.serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    // JWT verification
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const body = await req.json()
    const {
      tier,
      planId,
      coachId,
      existingPlan,
      modificationRequest,
      coachPrompt,
      athleteContext,
      sport,
      goal,
      durationWeeks,
      athleteLevel,
      sessionsPerWeek,
      equipment,
      injuries,
      conversationHistory,
    } = body

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build prompt based on tier
    let prompt = ''

    if (tier === 2) {
      // Tier 2: Modify existing plan
      prompt = `You are a professional strength and conditioning coach. A coach has requested modifications to an existing training plan.

**Existing Plan:**
${JSON.stringify(existingPlan, null, 2)}

**Modification Request:**
${modificationRequest}

${athleteContext ? `**Athlete Context:**\n${athleteContext}\n` : ''}

Please generate a modified training plan in JSON format with this structure:
{
  "name": "Plan name",
  "sport": "sport type",
  "periodization_model": "linear|undulating|block|conjugate",
  "goal_description": "brief goal description",
  "training_blocks": [
    {
      "name": "Block name",
      "block_type": "base|build|peak|taper|recovery",
      "duration_weeks": 4,
      "focus_tags": ["tag1", "tag2"],
      "notes": "block notes",
      "block_weeks": [
        {
          "week_number": 1,
          "is_deload": false,
          "volume_modifier": 1.0,
          "intensity_modifier": 1.0,
          "theme": "week theme"
        }
      ]
    }
  ]
}

Return ONLY valid JSON, no markdown formatting.`
    } else {
      // Tier 3: Generate new plan
      prompt = `You are a professional strength and conditioning coach. Generate a complete periodized training plan.

**Requirements:**
- Sport: ${sport || 'general fitness'}
- Goal: ${goal || 'improve performance'}
- Duration: ${durationWeeks || 12} weeks
- Athlete Level: ${athleteLevel || 'intermediate'}
- Sessions Per Week: ${sessionsPerWeek || 4}
${equipment?.length ? `- Equipment: ${equipment.join(', ')}` : ''}
${injuries ? `- Injuries/Limitations: ${injuries}` : ''}

**Coach Instructions:**
${coachPrompt}

${athleteContext ? `**Athlete Context:**\n${athleteContext}\n` : ''}

Generate a periodized training plan in JSON format with this structure:
{
  "name": "Plan name",
  "sport": "${sport || 'fitness'}",
  "periodization_model": "linear|undulating|block|conjugate",
  "goal_description": "brief goal description",
  "training_blocks": [
    {
      "name": "Block name (e.g., Base Building, Strength Focus)",
      "block_type": "base|build|peak|taper|recovery",
      "duration_weeks": 4,
      "focus_tags": ["strength", "hypertrophy", "etc"],
      "notes": "block-level programming notes",
      "block_weeks": [
        {
          "week_number": 1,
          "is_deload": false,
          "volume_modifier": 1.0,
          "intensity_modifier": 1.0,
          "theme": "week-specific theme or focus"
        }
      ]
    }
  ]
}

Create ${Math.ceil((durationWeeks || 12) / 4)} blocks with appropriate progression. Include deload weeks every 3-4 weeks.
Return ONLY valid JSON, no markdown formatting.`
    }

    // Build messages array with conversation history for multi-turn context
    const messages: { role: string; content: string }[] = []

    // Add prior conversation history (last 10 messages to stay within context limits)
    if (conversationHistory?.length) {
      const recentHistory = conversationHistory.slice(-10)
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add the current prompt as the final user message
    messages.push({ role: 'user', content: prompt })

    // Call Anthropic Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        temperature: 0.7,
        messages,
      }),
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'AI service error', details: errorText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeResponse.json()
    const rawText = claudeData.content?.[0]?.text || ''

    // Parse JSON from response (strip markdown if present)
    let planJson: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        planJson = JSON.parse(jsonMatch[0])
      } else {
        planJson = JSON.parse(rawText)
      }
    } catch (e) {
      console.error('Failed to parse AI response:', rawText)
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', rawText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Log to ai_plan_logs
    if (planId) {
      await supabaseClient.from('ai_plan_logs').insert({
        plan_id: planId,
        coach_id: coachId,
        tier,
        action: tier === 2 ? 'modify' : 'generate',
        prompt: prompt.substring(0, 2000),
        response: rawText.substring(0, 2000),
        model: CLAUDE_MODEL,
        tokens_used: (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0),
      })
    }

    return new Response(
      JSON.stringify({
        plan: planJson,
        rawText,
        usage: {
          input_tokens: claudeData.usage?.input_tokens || 0,
          output_tokens: claudeData.usage?.output_tokens || 0,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})
