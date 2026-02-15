# Deploy Gemini-Based Edge Functions to Supabase

The AI Planner has been updated to use **Google Gemini API** instead of Claude API for cost savings.

## Prerequisites

1. **Google AI Studio API Key**
   - Go to https://aistudio.google.com/app/apikey
   - Create a new API key
   - Copy the key (starts with `AIza...`)

2. **Supabase CLI installed**
   ```bash
   npm install -g supabase
   ```

3. **Supabase CLI logged in**
   ```bash
   supabase login
   ```

## Deployment Steps

### 1. Link to your Supabase project
```bash
supabase link --project-ref mzrmivqwywinsffkaimw
```

### 2. Set the Gemini API key as a secret
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
```

Replace `your_gemini_api_key_here` with your actual Gemini API key.

### 3. Deploy the Edge Functions
```bash
# Deploy generate-plan function
supabase functions deploy generate-plan

# Deploy generate-session function
supabase functions deploy generate-session
```

### 4. Verify deployment
```bash
supabase functions list
```

You should see both functions listed with status "ACTIVE".

## Testing the Functions

### Test generate-plan (Tier 3)
```bash
supabase functions invoke generate-plan \
  --body '{
    "tier": 3,
    "coachId": "your-coach-id",
    "sport": "powerlifting",
    "goal": "increase 1RM squat",
    "durationWeeks": 8,
    "athleteLevel": "intermediate",
    "sessionsPerWeek": 4,
    "coachPrompt": "Create a linear progression plan focusing on squat volume"
  }'
```

### Test generate-session
```bash
supabase functions invoke generate-session \
  --body '{
    "coachId": "your-coach-id",
    "blockType": "strength",
    "sessionType": "strength",
    "targetRpe": 8,
    "athleteLevel": "intermediate",
    "coachPrompt": "Generate a lower body strength session"
  }'
```

## Model Information

- **Model**: `gemini-2.0-flash-exp` (Experimental Flash model)
- **Why this model?**
  - **Free tier**: 1,500 requests per day
  - **Fast**: Low latency responses
  - **Cost-effective**: After free tier, very cheap ($0.00001875/1K chars input, $0.000075/1K chars output)
  - **Good quality**: Suitable for structured JSON generation

## Switching Models (Optional)

If you want to use a different Gemini model, edit the Edge Function files and change:

```typescript
const GEMINI_MODEL = 'gemini-2.0-flash-exp'
```

Available models:
- `gemini-2.0-flash-exp` - Fastest, free tier (recommended)
- `gemini-1.5-flash` - Stable flash model
- `gemini-1.5-pro` - Higher quality, slower, more expensive

Then redeploy:
```bash
supabase functions deploy generate-plan
supabase functions deploy generate-session
```

## Troubleshooting

### Error: "GEMINI_API_KEY not configured"
- Make sure you set the secret: `supabase secrets set GEMINI_API_KEY=...`
- Verify with: `supabase secrets list`

### Error: "Unauthorized"
- Check that you're logged into the app as a coach user
- Verify JWT token is being passed correctly from frontend

### Error: "Failed to parse AI response"
- The AI returned invalid JSON
- Check the `rawText` field in the error response
- May need to adjust the prompt to be more specific about JSON formatting

## Cost Comparison

### Claude Sonnet 4.5 (Previous)
- $3 per million input tokens
- $15 per million output tokens
- ~$0.05 per plan generation (3K tokens)

### Gemini 2.0 Flash (New)
- Free for 1,500 requests/day
- After free tier: ~$0.0003 per plan generation
- **~166x cheaper** than Claude

## Rollback to Claude (if needed)

If you need to switch back to Claude:

1. Set Claude API key:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=your_claude_key
   ```

2. Update Edge Functions to use Claude API (requires code changes)

3. Redeploy functions
