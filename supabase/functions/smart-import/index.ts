// Supabase Edge Function: smart-import
// Uses Anthropic Claude Sonnet for AI-powered training program parsing
// Routes by file type:
//   - Excel (.xlsx/.xls) → Code Execution sandbox (pandas/openpyxl)
//   - CSV → Direct text parsing
//   - PDF → Native document parsing
//   - Images → Vision OCR

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929'

const EXTRACTION_SCHEMA = `Extract the training program and return ONLY a valid JSON object matching this exact schema (no markdown, no explanations, just the JSON):

{
  "programName": "string - program name",
  "durationWeeks": number,
  "periodization": "linear" | "undulating" | "block" | "conjugate" | "mixed",
  "sport": "string or null",
  "weeks": [
    {
      "weekNumber": 1,
      "name": "optional week name",
      "workouts": [
        {
          "name": "Workout name",
          "dayOfWeek": 1,
          "description": "optional",
          "exercises": [
            {
              "name": "Exercise name",
              "sets": 3,
              "reps": "8-10",
              "weight": "80%" or null,
              "rpe": 7 or null,
              "notes": "optional"
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- dayOfWeek: 1=Monday through 7=Sunday
- If you can only detect partial data, fill in reasonable defaults
- periodization: analyze volume/intensity progression patterns
- Detect the sport from exercise selection and context
- Return ONLY the JSON, nothing else`

const SYSTEM_PROMPT = `You are a training program parser. Your job is to extract structured workout data from uploaded files (images, CSVs, PDFs, spreadsheets). Always output ONLY valid JSON matching the requested schema. Never include markdown formatting, code blocks, or explanations — just the raw JSON object.`

function isExcel(fileType: string): boolean {
  return fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel'
}

/**
 * Upload file to Anthropic Files API and return file_id
 */
async function uploadToFilesAPI(fileContent: string, fileName: string): Promise<string> {
  // Convert base64 to binary
  const binaryString = atob(fileContent)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const formData = new FormData()
  const blob = new Blob([bytes])
  formData.append('file', blob, fileName)

  const response = await fetch('https://api.anthropic.com/v1/files', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Files API upload failed: ${response.status} - ${errorText}`)
  }

  const fileObj = await response.json()
  return fileObj.id
}

/**
 * Process Excel file using Code Execution sandbox (pandas/openpyxl)
 */
async function processExcelWithCodeExecution(
  fileContent: string,
  fileName: string
): Promise<{ text: string; usage: any }> {
  // Step 1: Upload file to Anthropic Files API
  const fileId = await uploadToFilesAPI(fileContent, fileName)

  // Step 2: Call Messages API with Code Execution tool + file reference
  // Claude will use openpyxl/pandas (pre-installed) to parse the Excel file
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'code-execution-2025-08-25,files-api-2025-04-14',
      'x-api-key': ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [{
        type: 'code_execution_20250825',
        name: 'code_execution',
      }],
      messages: [{
        role: 'user',
        content: [
          {
            type: 'container_upload',
            file_id: fileId,
          },
          {
            type: 'text',
            text: `This is an Excel training program file called "${fileName}".

Use the code execution tool to:
1. Read the Excel file with openpyxl or pandas (both are pre-installed)
2. Inspect all sheets - list sheet names and preview data from each
3. Identify the training program structure (weeks, days, exercises, sets, reps, etc.)
4. Extract ALL data into a structured format

After reading the file with code, ${EXTRACTION_SCHEMA}`,
          },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Code Execution API error: ${response.status} - ${errorText}`)
  }

  let data = await response.json()
  let totalUsage = { input_tokens: data.usage?.input_tokens || 0, output_tokens: data.usage?.output_tokens || 0 }

  // Handle pause_turn: Claude may need multiple turns to complete code execution
  let maxContinuations = 5
  while (data.stop_reason === 'pause_turn' && maxContinuations > 0) {
    // Continue the conversation with the response so far
    const continueResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'code-execution-2025-08-25,files-api-2025-04-14',
        'x-api-key': ANTHROPIC_API_KEY!,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        container: data.container?.id,
        tools: [{
          type: 'code_execution_20250825',
          name: 'code_execution',
        }],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'container_upload', file_id: fileId },
              {
                type: 'text',
                text: `This is an Excel training program file called "${fileName}". Use the code execution tool to read and parse it, then ${EXTRACTION_SCHEMA}`,
              },
            ],
          },
          {
            role: 'assistant',
            content: data.content,
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Please continue.' }],
          },
        ],
      }),
    })

    if (!continueResponse.ok) {
      break
    }

    data = await continueResponse.json()
    totalUsage.input_tokens += data.usage?.input_tokens || 0
    totalUsage.output_tokens += data.usage?.output_tokens || 0
    maxContinuations--
  }

  // Extract the final text from the response content blocks
  // The response may contain server_tool_use, bash_code_execution_tool_result, and text blocks
  // We want the last text block which should contain the JSON
  const textBlocks = (data.content || []).filter((c: any) => c.type === 'text')
  const lastText = textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text : null

  if (!lastText) {
    // Try extracting from code execution stdout as fallback
    const codeResults = (data.content || []).filter((c: any) => c.type === 'bash_code_execution_tool_result')
    for (const result of codeResults) {
      const stdout = result.content?.stdout || ''
      if (stdout.includes('"programName"') || stdout.includes('"weeks"')) {
        return { text: stdout, usage: totalUsage }
      }
    }
    throw new Error('No parseable output from Code Execution')
  }

  return { text: lastText, usage: totalUsage }
}

/**
 * Process non-Excel files with direct Claude API (vision, document, text)
 */
async function processWithDirectAPI(
  fileContent: string,
  fileType: string,
  fileName: string
): Promise<{ text: string; usage: any }> {
  const isImage = fileType.startsWith('image/')
  const isCsv = fileType === 'text/csv'
  const isPdf = fileType === 'application/pdf'

  const userContent: any[] = []

  if (isImage) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: fileType, data: fileContent },
    })
    userContent.push({
      type: 'text',
      text: `This is an image of a training program called "${fileName}". Extract the complete program structure from this image.\n\n${EXTRACTION_SCHEMA}`,
    })
  } else if (isCsv) {
    const csvText = atob(fileContent)
    userContent.push({
      type: 'text',
      text: `Parse this CSV training program file ("${fileName}"):\n\n${csvText}\n\n${EXTRACTION_SCHEMA}`,
    })
  } else if (isPdf) {
    userContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileContent },
    })
    userContent.push({
      type: 'text',
      text: `This is a PDF of a training program called "${fileName}". Extract the complete program structure.\n\n${EXTRACTION_SCHEMA}`,
    })
  } else {
    // Unknown type fallback
    userContent.push({
      type: 'text',
      text: `I have a training program file called "${fileName}" (type: ${fileType}). Raw base64 preview:\n\n${fileContent.substring(0, 3000)}...\n\nExtract what you can.\n\n${EXTRACTION_SCHEMA}`,
    })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI processing failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const textContent = data.content?.find((c: any) => c.type === 'text')

  if (!textContent) {
    throw new Error('No text content in AI response')
  }

  return { text: textContent.text, usage: data.usage }
}

// ============================================
// Main handler
// ============================================
Deno.serve(async (req) => {
  try {
    // CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    }

    // Auth
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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse request
    const body = await req.json()
    const { fileContent, fileType, fileName } = body

    if (!fileContent || !fileType || !fileName) {
      return new Response(JSON.stringify({ error: 'Missing required fields: fileContent, fileType, fileName' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Route by file type
    let rawText: string
    let usage: any

    if (isExcel(fileType)) {
      // Excel → Code Execution sandbox (pandas/openpyxl)
      console.log(`Processing Excel file via Code Execution: ${fileName}`)
      const result = await processExcelWithCodeExecution(fileContent, fileName)
      rawText = result.text
      usage = result.usage
    } else {
      // CSV, PDF, images → Direct API
      console.log(`Processing ${fileType} via Direct API: ${fileName}`)
      const result = await processWithDirectAPI(fileContent, fileType, fileName)
      rawText = result.text
      usage = result.usage
    }

    // Extract JSON from response
    let jsonText = rawText.trim()

    // Remove markdown code blocks if present
    const codeBlockMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim()
    }

    // If text has content before/after JSON, try to extract just the JSON object
    const jsonObjMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonObjMatch && jsonObjMatch[0] !== jsonText) {
      jsonText = jsonObjMatch[0]
    }

    // Parse and validate
    let importResult
    try {
      importResult = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse AI response:', jsonText.substring(0, 500))
      return new Response(JSON.stringify({ error: 'Failed to parse AI response as JSON' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!importResult.programName || !importResult.weeks || importResult.weeks.length === 0) {
      return new Response(JSON.stringify({ error: 'AI response missing required fields (programName, weeks)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Log to ai_plan_logs
    await supabaseClient.from('ai_plan_logs').insert({
      coach_id: user.id,
      tier: 'import',
      action: 'smart_import',
      prompt: `Smart Import: ${fileName} (${fileType})${isExcel(fileType) ? ' [Code Execution]' : ' [Direct API]'}`,
      response: JSON.stringify(importResult).substring(0, 5000),
      model: CLAUDE_MODEL,
      tokens_used: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
    } as any)

    return new Response(JSON.stringify({
      success: true,
      importResult,
      usage,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('smart-import error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
