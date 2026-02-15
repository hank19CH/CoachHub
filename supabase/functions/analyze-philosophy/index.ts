// Supabase Edge Function: analyze-philosophy
// Uses Anthropic Claude Sonnet to analyze a coach's programming patterns
// Detects periodization style, exercise preferences, and generates insights

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
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trigger-secret',
        },
      })
    }

    // Parse request body
    const body = await req.json()
    const { coachId } = body

    // Determine auth mode: user JWT or server-to-server (DB trigger via pg_net)
    const triggerSecret = req.headers.get('x-trigger-secret')
    const expectedSecret = Deno.env.get('TRIGGER_SECRET')
    const authHeader = req.headers.get('Authorization')

    let supabaseClient
    let isServerMode = false

    if (triggerSecret && expectedSecret && triggerSecret === expectedSecret) {
      // Server-to-server call from database trigger (pg_net)
      // Authenticated via shared secret stored in vault + Edge Function env
      console.log(`Auto-analysis triggered for coach: ${coachId}`)
      isServerMode = true

      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )

      if (!coachId) {
        return new Response(JSON.stringify({ error: 'Missing coachId for server call' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      // User-initiated call via frontend (JWT auth)
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      supabaseClient = createClient(
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

      if (coachId !== user.id) {
        return new Response(JSON.stringify({ error: 'Cannot analyze another coach\'s philosophy' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch all programs with nested structure
    const { data: programs, error: programsError } = await supabaseClient
      .from('programs')
      .select(`
        id,
        name,
        duration_weeks,
        created_at,
        program_weeks (
          week_number,
          name,
          workouts:workouts (
            name,
            day_of_week,
            exercises (
              name,
              sets,
              reps,
              duration_seconds,
              distance_meters,
              rpe,
              order_index
            )
          )
        )
      `)
      .eq('coach_id', coachId)
      .order('created_at', { ascending: true })

    if (programsError) {
      console.error('Error fetching programs:', programsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch programs' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!programs || programs.length === 0) {
      return new Response(JSON.stringify({ error: 'No programs found for analysis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Truncate program data if too large (keep within token limits)
    const programSummary = JSON.stringify(programs, null, 2)
    const truncatedSummary = programSummary.length > 50000
      ? programSummary.substring(0, 50000) + '\n... (truncated)'
      : programSummary

    // Call Claude API for analysis
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system: `You are a sports science analyst specializing in periodization and program design. Analyze the coach's program library and identify their coaching philosophy. Output ONLY valid JSON matching the requested schema. Never include markdown, code blocks, or explanations.`,
        messages: [
          {
            role: 'user',
            content: `Analyze these ${programs.length} training programs and extract the coaching philosophy.

Program data:
${truncatedSummary}

Analyze and return ONLY this JSON (no markdown, no code blocks):
{
  "primaryPeriodization": ["linear", "undulating", etc],
  "avgMesocycleLength": 4.2,
  "typicalDeloadFrequency": 4,
  "volumeProgressionPattern": "wave" | "linear" | "step",
  "intensityDistribution": {
    "low": 0.3,
    "medium": 0.5,
    "high": 0.2
  },
  "topExercises": [
    {"name": "Back Squat", "frequency": 0.85}
  ],
  "movementPatterns": {
    "squat": 0.4,
    "hinge": 0.3,
    "push": 0.2,
    "pull": 0.1
  },
  "coachingStyleSummary": "2-3 sentence summary of coaching approach",
  "recommendations": [
    "Actionable suggestion 1",
    "Actionable suggestion 2",
    "Actionable suggestion 3"
  ]
}

Analysis guidelines:
- Periodization: Look at how volume/intensity changes across weeks
- Linear = steady progression, Undulating = daily/weekly variation, Block = concentrated focus periods
- Frequency = how often an exercise appears across all programs (0.0-1.0)
- Movement patterns: classify exercises into squat/hinge/push/pull/carry categories
- Recommendations should be specific and actionable, based on gaps or imbalances you detect`,
          },
        ],
      }),
    })

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text()
      console.error('Anthropic API error:', errorText)
      return new Response(JSON.stringify({ error: `AI analysis failed: ${anthropicResponse.status}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const aiData = await anthropicResponse.json()
    const textContent = aiData.content?.find((c: any) => c.type === 'text')

    if (!textContent) {
      return new Response(JSON.stringify({ error: 'No text content in AI response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Extract JSON from response
    let jsonText = textContent.text.trim()
    const codeBlockMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    let analysisResult
    try {
      analysisResult = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse philosophy analysis:', jsonText.substring(0, 500))
      return new Response(JSON.stringify({ error: 'Failed to parse AI analysis response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Upsert coach_philosophy record
    const { data: savedPhilosophy, error: saveError } = await supabaseClient
      .from('coach_philosophy')
      .upsert({
        coach_id: coachId,
        programs_analyzed: programs.length,
        last_analysis_at: new Date().toISOString(),
        next_analysis_threshold: 10,
        primary_periodization: analysisResult.primaryPeriodization || [],
        avg_mesocycle_length_weeks: analysisResult.avgMesocycleLength || null,
        typical_deload_frequency: analysisResult.typicalDeloadFrequency || null,
        volume_progression_pattern: analysisResult.volumeProgressionPattern || null,
        intensity_distribution: analysisResult.intensityDistribution || null,
        top_exercises: analysisResult.topExercises || null,
        movement_patterns: analysisResult.movementPatterns || null,
        coaching_style_summary: analysisResult.coachingStyleSummary || null,
        recommendations: analysisResult.recommendations || [],
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'coach_id',
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving philosophy:', saveError)
      return new Response(JSON.stringify({ error: 'Failed to save analysis results' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Log to ai_plan_logs
    await supabaseClient.from('ai_plan_logs').insert({
      coach_id: coachId,
      tier: 'philosophy',
      action: isServerMode ? 'auto_analyze_philosophy' : 'analyze_philosophy',
      prompt: `Philosophy analysis for ${programs.length} programs${isServerMode ? ' (auto-triggered)' : ''}`,
      response: JSON.stringify(analysisResult).substring(0, 5000),
      model: CLAUDE_MODEL,
      tokens_used: (aiData.usage?.input_tokens || 0) + (aiData.usage?.output_tokens || 0),
    } as any)

    return new Response(JSON.stringify({
      success: true,
      philosophy: savedPhilosophy,
      usage: aiData.usage,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('analyze-philosophy error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
