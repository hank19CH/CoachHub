// Supabase Edge Function: generate-session
// Uses Anthropic Claude Sonnet for AI-powered workout session generation
// Generates exercise prescriptions with sets/reps/load based on block/week context

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
      coachId,
      blockType,
      blockFocusTags,
      weekNumber,
      isDeload,
      volumeModifier,
      intensityModifier,
      sessionType,
      sessionFocus,
      targetRpe,
      dayOfWeek,
      athleteLevel,
      injuries,
      equipment,
      coachPrompt,
      athleteContext,
      conversationHistory,
    } = body

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build prompt
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const prompt = `You are a professional strength and conditioning coach. Generate a detailed workout session based on the coach's request.

**Session Context:**
- Block Type: ${blockType || 'general'}
- Block Focus: ${blockFocusTags?.join(', ') || 'general fitness'}
- Week Number: ${weekNumber || 1}
- Deload Week: ${isDeload ? 'YES' : 'NO'}
- Volume Modifier: ${volumeModifier || 1.0}x
- Intensity Modifier: ${intensityModifier || 1.0}x
- Session Type: ${sessionType || 'mixed'}
- Session Focus: ${sessionFocus?.join(', ') || 'general'}
- Target RPE: ${targetRpe || 7}/10
- Day: ${dayOfWeek !== undefined ? dayNames[dayOfWeek] : 'unspecified'}
- Athlete Level: ${athleteLevel || 'intermediate'}
${injuries ? `- Injuries/Limitations: ${injuries}` : ''}
${equipment?.length ? `- Equipment: ${equipment.join(', ')}` : ''}

**Coach Instructions:**
${coachPrompt}

${athleteContext ? `**Athlete Context:**\n${athleteContext}\n` : ''}

IMPORTANT DECISION TREE:
1. If the coach's request is vague or missing critical details (e.g., "create a program" without specifying body parts, session count, or focus), respond with a clarifying question in plain text asking for:
   - How many sessions per week?
   - What body parts or movement patterns to focus on?
   - Any specific exercises they want included?

2. If the coach's request is specific enough (mentions body parts like "lower body", training type like "max strength", or specific exercises), proceed to generate a complete session.

When generating a session, return ONLY valid JSON with this structure:
{
  "name": "Session name",
  "description": "Brief session description",
  "session_type": "${sessionType || 'mixed'}",
  "session_focus": ${sessionFocus ? JSON.stringify(sessionFocus) : '["general"]'},
  "target_rpe": ${targetRpe || 7},
  "estimated_duration_minutes": 60,
  "exercises": [
    {
      "order_index": 0,
      "exercise_name": "Exercise name",
      "category": "strength|cardio|mobility|warmup|cooldown",
      "sets": 3,
      "reps": "10-12",
      "rest_seconds": 90,
      "load_percentage": 70,
      "load_unit": "% 1RM|kg|lbs|bodyweight",
      "rpe": 7,
      "tempo": "3010",
      "notes": "Exercise-specific coaching cues",
      "is_superset": false,
      "superset_group": null
    }
  ]
}

Guidelines:
- ${isDeload ? 'This is a DELOAD week - reduce volume and intensity' : 'Normal training intensity'}
- Apply ${volumeModifier}x volume modifier (adjust sets/reps)
- Apply ${intensityModifier}x intensity modifier (adjust load %)
- Include 4-8 exercises appropriate for the session type
- Start with warmup exercises, end with cooldown/mobility
- Use proper exercise progression and order
- Include specific load prescriptions (% 1RM, kg, or bodyweight)
- Add coaching cues in notes field

Return ONLY valid JSON, no markdown formatting.`

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
        max_tokens: 2048,
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
    let sessionJson: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        sessionJson = JSON.parse(jsonMatch[0])
      } else {
        sessionJson = JSON.parse(rawText)
      }
    } catch (e) {
      console.error('Failed to parse AI response:', rawText)
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', rawText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        session: sessionJson,
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
