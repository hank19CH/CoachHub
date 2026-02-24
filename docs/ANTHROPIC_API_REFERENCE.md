# Anthropic Claude API Reference (Internal)

Quick reference for Vumation Edge Functions and AI integrations.
Last updated: 2026-02-16

---

## Models & Pricing

### Current Models (Use These)

| Model | API ID (Alias) | API ID (Dated) | Input $/MTok | Output $/MTok | Context | Max Output |
|-------|---------------|----------------|--------------|---------------|---------|------------|
| **Opus 4.6** | `claude-opus-4-6` | `claude-opus-4-6` | $5 | $25 | 200K (1M beta) | 128K |
| **Sonnet 4.5** | `claude-sonnet-4-5` | `claude-sonnet-4-5-20250929` | $3 | $15 | 200K (1M beta) | 64K |
| **Haiku 4.5** | `claude-haiku-4-5` | `claude-haiku-4-5-20251001` | $1 | $5 | 200K | 64K |

> **Best practice:** Use **aliases** (no date suffix) in production. They always resolve to the latest snapshot and won't break on deprecation.

### Legacy Models (Still Available)

| Model | API ID | Input $/MTok | Output $/MTok | Max Output |
|-------|--------|--------------|---------------|------------|
| Opus 4.5 | `claude-opus-4-5-20251101` / `claude-opus-4-5` | $5 | $25 | 64K |
| Opus 4.1 | `claude-opus-4-1-20250805` / `claude-opus-4-1` | $15 | $75 | 32K |
| Sonnet 4 | `claude-sonnet-4-20250514` / `claude-sonnet-4-0` | $3 | $15 | 64K |
| Sonnet 3.7 | `claude-3-7-sonnet-20250219` | $3 | $15 | 64K (128K beta) |
| Opus 4 | `claude-opus-4-20250514` / `claude-opus-4-0` | $15 | $75 | 32K |
| Haiku 3 | `claude-3-haiku-20240307` | $0.25 | $1.25 | 4K |

### Vumation Model Usage
- **Smart Import (ALL file types):** `claude-sonnet-4-5` — v31 switched to Sonnet-only (Haiku removed). Two-step classify→extract flow. ~$0.005-0.02/import.
- **Plan Generation/Modification:** `claude-sonnet-4-5` (Tier 2/3 AI)
- **Session Generation:** `claude-sonnet-4-5`
- **Philosophy Analysis:** `claude-sonnet-4-5`

---

## Messages API

### Endpoint
```
POST https://api.anthropic.com/v1/messages
```

### Required Headers
```
Content-Type: application/json
anthropic-version: 2023-06-01
x-api-key: YOUR_API_KEY
```

### Minimal Request
```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

### Full Request Shape
```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 8000,
  "system": "You are a helpful assistant.",
  "messages": [
    {"role": "user", "content": "string or content block array"}
  ],
  "temperature": 0.0,
  "top_p": 0.9,
  "top_k": 50,
  "stop_sequences": ["END"],
  "stream": false,
  "metadata": {"user_id": "opaque-id"},
  "tools": [],
  "tool_choice": {"type": "auto"},
  "output_config": {
    "format": {"type": "json_schema", "schema": {}}
  },
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000
  }
}
```

### Response Shape
```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    {"type": "text", "text": "Response text here"}
  ],
  "model": "claude-haiku-4-5",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 12,
    "output_tokens": 6,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

### Stop Reasons
| Value | Meaning |
|-------|---------|
| `end_turn` | Natural completion |
| `max_tokens` | Hit token limit |
| `stop_sequence` | Custom stop sequence matched |
| `tool_use` | Model wants to call a tool |
| `pause_turn` | Long-running turn paused (can continue) |
| `refusal` | Safety policy violation |

---

## Content Block Types

### Text Block
```json
{"type": "text", "text": "Hello world"}
```

### Image Block (base64)
```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpeg",
    "data": "BASE64_DATA"
  }
}
```

Supported formats: `image/jpeg`, `image/png`, `image/gif`, `image/webp`

### Image Block (URL)
```json
{
  "type": "image",
  "source": {
    "type": "url",
    "url": "https://example.com/image.jpg"
  }
}
```

### Document Block (PDF base64)
```json
{
  "type": "document",
  "source": {
    "type": "base64",
    "media_type": "application/pdf",
    "data": "BASE64_PDF_DATA"
  }
}
```

### Document Block (PDF URL)
```json
{
  "type": "document",
  "source": {
    "type": "url",
    "url": "https://example.com/doc.pdf"
  }
}
```

### Document Block (Plain Text)
```json
{
  "type": "document",
  "source": {
    "type": "text",
    "media_type": "text/plain",
    "data": "Document content as string"
  }
}
```

---

## Vision (Images)

### Limits
- **API:** Max 5MB per image, up to 100 images per request
- **Optimal size:** Resize to max 1568px on longest edge (~1,600 tokens)
- **Token cost formula:** `tokens = (width * height) / 750`
- Images placed **before text** perform best

### Token Cost Examples
| Size | Tokens | Cost (Haiku $1/MTok) |
|------|--------|---------------------|
| 200x200 | ~54 | ~$0.00005 |
| 1000x1000 | ~1,334 | ~$0.001 |
| 1092x1092 | ~1,590 | ~$0.002 |

---

## PDF Support

### Limits
- **Max request size:** 32MB
- **Max pages per request:** 100
- **Format:** Standard PDF only (no passwords/encryption)
- **Token cost:** ~1,500-3,000 text tokens per page + image tokens per page

### How It Works
Each page is converted to an image AND text is extracted. Claude sees both representations. Place PDFs before text in requests.

### Cache PDFs for Repeated Analysis
```json
{
  "type": "document",
  "source": {"type": "base64", "media_type": "application/pdf", "data": "..."},
  "cache_control": {"type": "ephemeral"}
}
```

---

## Structured Outputs (Guaranteed JSON)

### Using `output_config.format` (Recommended for JSON responses)
```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 8000,
  "messages": [{"role": "user", "content": "Extract data from..."}],
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "count": {"type": "integer"}
        },
        "required": ["name", "count"],
        "additionalProperties": false
      }
    }
  }
}
```

Response is guaranteed valid JSON in `content[0].text`.

### JSON Schema Limitations
**Supported:** object, array, string, integer, number, boolean, null, enum, const, anyOf, allOf, $ref, required, additionalProperties
**NOT supported:** recursive schemas, minimum/maximum, minLength/maxLength, complex array constraints

### Alternative: Prompt-Based JSON
For Edge Functions using raw `fetch()`, we can also just ask for JSON in the system prompt and parse manually. This is what Smart Import currently does.

---

## Tool Use

### Define Tools
```json
{
  "tools": [{
    "name": "get_weather",
    "description": "Get current weather for a city",
    "strict": true,
    "input_schema": {
      "type": "object",
      "properties": {
        "city": {"type": "string"}
      },
      "required": ["city"],
      "additionalProperties": false
    }
  }]
}
```

### Tool Choice
```json
"tool_choice": {"type": "auto"}    // Model decides
"tool_choice": {"type": "any"}     // Must use a tool
"tool_choice": {"type": "none"}    // No tools
"tool_choice": {"type": "tool", "name": "get_weather"}  // Specific tool
```

### Tool Use Response -> Tool Result Flow
1. Model returns `stop_reason: "tool_use"` with `tool_use` content block
2. Execute the tool
3. Send result back as `tool_result` content block in next user message

```json
{
  "role": "user",
  "content": [{
    "type": "tool_result",
    "tool_use_id": "toolu_01D7FLrfh...",
    "content": "259.75 USD"
  }]
}
```

---

## Error Handling

### HTTP Error Codes
| Code | Type | Meaning |
|------|------|---------|
| 400 | `invalid_request_error` | Bad request format/content |
| 401 | `authentication_error` | Invalid API key |
| 403 | `permission_error` | No permission for resource |
| 404 | `not_found_error` | Resource not found |
| 413 | `request_too_large` | Exceeds 32MB request limit |
| 429 | `rate_limit_error` | Rate limited |
| 500 | `api_error` | Internal Anthropic error |
| 529 | `overloaded_error` | API temporarily overloaded |

### Error Response Shape
```json
{
  "type": "error",
  "error": {
    "type": "not_found_error",
    "message": "The requested resource could not be found."
  },
  "request_id": "req_011CSHoEeqs5C35K2UUqR7Fy"
}
```

### Request Size Limits
| Endpoint | Max Size |
|----------|----------|
| Messages API | 32 MB |
| Token Counting | 32 MB |
| Batch API | 256 MB |
| Files API | 500 MB |

---

## Prompt Caching

Add `cache_control` to any content block (system, text, image, document, tool definition):
```json
{
  "type": "text",
  "text": "Long reusable context...",
  "cache_control": {"type": "ephemeral", "ttl": "5m"}
}
```

TTL options: `"5m"` (default) or `"1h"`

---

## Edge Function Patterns (Deno)

### Basic Anthropic API Call from Edge Function
```typescript
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': ANTHROPIC_API_KEY!,
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 8000,
    system: 'You are a parser. Return only valid JSON.',
    messages: [{
      role: 'user',
      content: 'Parse this data...',
    }],
  }),
})

if (!response.ok) {
  const errorText = await response.text()
  throw new Error(`API error: ${response.status} - ${errorText}`)
}

const data = await response.json()
const text = data.content?.find((c: any) => c.type === 'text')?.text
```

### Vision Call (Image/PDF) from Edge Function
```typescript
// Image
const userContent = [
  {
    type: 'image',
    source: { type: 'base64', media_type: fileType, data: base64Data },
  },
  {
    type: 'text',
    text: 'Describe this image.',
  }
]

// PDF
const userContent = [
  {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
  },
  {
    type: 'text',
    text: 'Extract data from this PDF.',
  }
]

const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': ANTHROPIC_API_KEY!,
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    messages: [{ role: 'user', content: userContent }],
  }),
})
```

### Edge Function CORS Pattern (Required!)
```typescript
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS })
}

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
    // ... your logic ...
    return jsonResponse({ success: true, data: result })
  } catch (error) {
    // MUST include CORS headers on errors too!
    return jsonResponse({ error: error.message }, 500)
  }
})
```

### Frontend Calling Edge Functions
```typescript
// Option A: supabase.functions.invoke() (auto-handles auth, but swallows error bodies)
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { key: 'value' },
})

// Option B: Raw fetch() (exposes full error bodies - preferred for debugging)
const session = await supabase.auth.getSession()
const response = await fetch(`${supabaseUrl}/functions/v1/my-function`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.data.session?.access_token}`,
    'apikey': supabaseAnonKey,
  },
  body: JSON.stringify({ key: 'value' }),
  signal: abortController.signal, // for timeout/cancel support
})
const responseText = await response.text()
const data = JSON.parse(responseText) // parse manually to always see error bodies
```

---

## Cost Estimation Quick Reference

### Smart Import Costs
| File Type | Model | Est. Input Tokens | Est. Output Tokens | Est. Cost |
|-----------|-------|-------------------|--------------------|-----------|
| Excel/CSV (pre-parsed ~20K chars) | Haiku 4.5 | ~6,000 | ~3,000 | ~$0.02 |
| PDF (10 pages) | Sonnet 4.5 | ~30,000 | ~3,000 | ~$0.14 |
| Image (1000x1000) | Sonnet 4.5 | ~2,500 | ~3,000 | ~$0.05 |

### Plan Generation Costs
| Action | Model | Est. Tokens | Est. Cost |
|--------|-------|-------------|-----------|
| Tier 2 (modify plan) | Sonnet 4.5 | ~2,000 | ~$0.04 |
| Tier 3 (generate plan) | Sonnet 4.5 | ~8,000 | ~$0.07 |
| Session generation | Sonnet 4.5 | ~3,000 | ~$0.05 |
| Philosophy analysis | Sonnet 4.5 | ~10,000 | ~$0.08 |

---

## Other API Endpoints

### Token Counting API (Pre-flight cost estimation)
```
POST https://api.anthropic.com/v1/messages/count_tokens
```
Same headers as Messages API. Request body accepts `model`, `messages`, `system`, `tools`, `thinking`, `tool_choice`, `output_config` — everything except `max_tokens` and `stream`.

Response:
```json
{"input_tokens": 2095}
```

Use this to estimate costs before sending large requests (e.g., pre-check PDF imports).

### Message Batches API (50% cost savings)
```
POST https://api.anthropic.com/v1/messages/batches
```
Process up to 100K requests per batch at **50% off** standard pricing. Takes up to 24h to complete.

```json
{
  "requests": [
    {
      "custom_id": "import-001",
      "params": {
        "model": "claude-haiku-4-5",
        "max_tokens": 8000,
        "messages": [{"role": "user", "content": "..."}]
      }
    }
  ]
}
```

Response includes `results_url` (`.jsonl` file) when `processing_status: "ended"`. Results may be out of order — match via `custom_id`.

> **Future use:** If Smart Import volume exceeds ~50+ imports/day, batch processing could cut AI costs in half for non-time-sensitive imports.

### Models API
```
GET https://api.anthropic.com/v1/models        # List all available models
GET https://api.anthropic.com/v1/models/{id}   # Get specific model details
```

---

## Rate Limits

### Tier Requirements
| Tier | Cumulative Credit Purchase | Max Single Purchase |
|------|---------------------------|---------------------|
| Tier 1 | $5 | $100 |
| Tier 2 | $40 | $500 |
| Tier 3 | $200 | $1,000 |
| Tier 4 | $400 | $5,000 |

### Haiku 4.5 Rate Limits (Our Primary Model)
| Tier | RPM | Input TPM | Output TPM |
|------|-----|-----------|------------|
| 1 | 50 | 50,000 | 10,000 |
| 2 | 1,000 | 450,000 | 90,000 |
| 3 | 2,000 | 1,000,000 | 200,000 |
| 4 | 4,000 | 4,000,000 | 800,000 |

### Sonnet 4.x Rate Limits (Shared across Sonnet 4.5 + Sonnet 4)
| Tier | RPM | Input TPM | Output TPM |
|------|-----|-----------|------------|
| 1 | 50 | 30,000 | 8,000 |
| 2 | 1,000 | 450,000 | 90,000 |
| 3 | 2,000 | 800,000 | 160,000 |
| 4 | 4,000 | 2,000,000 | 400,000 |

### Key Rate Limit Behaviors
- **Token bucket algorithm** — capacity refills continuously, not at fixed intervals
- **Cached input tokens do NOT count** toward ITPM for Haiku 4.5 and Sonnet 4.x (huge win with prompt caching)
- **Output TPM estimated from `max_tokens`** at request start, adjusted after — set `max_tokens` as low as practical to avoid premature OTPM limits
- Rate limits are **per-model-class**, so Haiku and Sonnet limits are independent
- 429 errors include `retry-after` header with seconds to wait

### Rate Limit Response Headers
| Header | Description |
|--------|-------------|
| `retry-after` | Seconds to wait before retrying |
| `anthropic-ratelimit-requests-remaining` | Requests left in current window |
| `anthropic-ratelimit-input-tokens-remaining` | Input tokens remaining (nearest 1K) |
| `anthropic-ratelimit-output-tokens-remaining` | Output tokens remaining (nearest 1K) |

---

## Additional Request Parameters

### Output Effort Level (`output_config.effort`)
Controls how much effort the model puts into its response:
```json
"output_config": {
  "effort": "low"    // faster, cheaper, less thorough
  "effort": "medium" // balanced
  "effort": "high"   // default
  "effort": "max"    // maximum quality
}
```

### Extended Thinking
```json
"thinking": {
  "type": "enabled",
  "budget_tokens": 10000  // min 1024, must be < max_tokens
}
```
Or use adaptive thinking (model decides how much to think):
```json
"thinking": {"type": "adaptive"}
```
Or disable explicitly:
```json
"thinking": {"type": "disabled"}
```

### Data Residency
```json
"inference_geo": "us"       // US only
"inference_geo": "global"   // Any region (default)
```

### Tool Strict Mode
Guarantees schema validation on tool names and inputs:
```json
"tools": [{
  "name": "my_tool",
  "strict": true,
  "input_schema": { ... }
}]
```

### Parallel Tool Use Control
```json
"tool_choice": {
  "type": "auto",
  "disable_parallel_tool_use": true  // Force one tool at a time
}
```

---

## Important Gotchas

1. **Always include CORS headers on error responses** from Edge Functions, or the browser blocks the error body and you see a generic CORS error instead of the actual error.

2. **`supabase.functions.invoke()` swallows error bodies** on non-2xx responses. Use raw `fetch()` when debugging to see actual errors.

3. **`anthropic-version: 2023-06-01`** is still the current API version header (hasn't changed).

4. **Consecutive user/assistant messages are auto-combined** by the API.

5. **Prefilling is deprecated** on Opus 4.6 and Sonnet 4.5. Use structured outputs or system prompt instructions instead.

6. **Image tokens scale with pixel area** - resize images before sending to save costs.

7. **PDF pages are converted to images + text** - each page costs both text tokens and image tokens.

8. **Extended thinking minimum is 1,024 tokens** and must be less than `max_tokens`.

9. **Structured output grammar compilation** adds latency on first request but is cached for 24 hours.

10. **Max 100,000 messages per request** (practically never hit, but good to know).

11. **Set `max_tokens` high enough for the expected output** — if the response hits `max_tokens`, `stop_reason` will be `"max_tokens"` and JSON output will be truncated/invalid. Always check `stop_reason` before parsing.

12. **Output TPM rate limits are estimated from `max_tokens`** at request start. Setting `max_tokens: 64000` when you only need ~5K output burns your OTPM budget. Size it to ~2x expected output.

13. **Cached tokens don't count toward ITPM** for Haiku 4.5 and Sonnet 4.x — use prompt caching for repeated system prompts and large context to effectively multiply your rate limits.

14. **Rate limits are per-model-class**, not per-alias. `claude-sonnet-4-5` and `claude-sonnet-4-0` share the same Sonnet 4.x rate limit pool.
