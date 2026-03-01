// Claude API utility — callClaude() + extractJSON()
// Extracted from smart-import v33

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

/**
 * Call the Anthropic Messages API.
 * Temperature fixed at 0 for deterministic output.
 * Throws on non-2xx, max_tokens hit, or missing text response.
 */
export async function callClaude(
  model: string,
  maxTokens: number,
  messages: Array<{ role: string; content: any }>,
  systemPrompt: string,
): Promise<{ text: string; usage: any; stopReason: string }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system: systemPrompt,
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

/**
 * Robustly extract JSON from Claude's response text.
 * Handles markdown code fences, extra text before/after JSON, etc.
 */
export function extractJSON(raw: string): any {
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
