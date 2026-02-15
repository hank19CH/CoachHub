import { supabase } from '@/lib/supabase'
import { AI_CONFIG } from '@/config/ai'
import type { ImportResult, ImportHistoryRecord } from '@/types/import'

/**
 * Upload file and process with AI via Edge Function
 */
export async function importProgram(file: File): Promise<{
  importResult: ImportResult
  historyRecord: ImportHistoryRecord
}> {
  const startTime = Date.now()

  // Validate file
  if (file.size > AI_CONFIG.import.maxFileSize) {
    throw new Error(`File too large. Max size: ${AI_CONFIG.import.maxFileSize / 1024 / 1024}MB`)
  }

  if (!AI_CONFIG.import.supportedTypes.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`)
  }

  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error('Not authenticated')

  const coachId = user.data.user.id

  // 1. Create import history record (status: processing)
  const { data: historyRecord, error: historyError } = await (supabase as any)
    .from('import_history')
    .insert({
      coach_id: coachId,
      file_name: file.name,
      file_type: file.type,
      file_size_bytes: file.size,
      status: 'processing'
    })
    .select()
    .single()

  if (historyError) throw new Error(historyError.message)

  try {
    // 2. Upload to Supabase Storage
    const storagePath = `${coachId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('program-imports')
      .upload(storagePath, file)

    if (uploadError) throw new Error(uploadError.message)

    // Update storage path in history
    await (supabase as any)
      .from('import_history')
      .update({ storage_path: storagePath })
      .eq('id', historyRecord.id)

    // 3. Read file as base64
    const fileContent = await fileToBase64(file)

    // 4. Process with AI via Edge Function
    const { data, error } = await supabase.functions.invoke('smart-import', {
      body: {
        fileContent,
        fileType: file.type,
        fileName: file.name,
      },
    })

    if (error) throw new Error(error.message || 'AI processing failed')
    if (!data?.success) throw new Error(data?.error || 'AI processing returned no result')

    const importResult: ImportResult = data.importResult

    // 5. Calculate processing metrics
    const processingTime = Date.now() - startTime
    const estimatedCost = AI_CONFIG.import.estimatedCostPerImport

    // Count imported items
    const workoutsCount = importResult.weeks.reduce(
      (sum, week) => sum + week.workouts.length,
      0
    )
    const exercisesCount = importResult.weeks.reduce(
      (sum, week) => sum + week.workouts.reduce(
        (wsum, workout) => wsum + workout.exercises.length,
        0
      ),
      0
    )

    // 6. Update import history (status: success)
    const { data: updatedHistory, error: updateError } = await (supabase as any)
      .from('import_history')
      .update({
        ai_model_used: 'claude-sonnet-4-5-20250929',
        processing_cost_usd: estimatedCost,
        processing_time_ms: processingTime,
        programs_imported: 1,
        workouts_imported: workoutsCount,
        exercises_imported: exercisesCount,
        detected_periodization: importResult.periodization,
        detected_duration_weeks: importResult.durationWeeks,
        detected_sport: importResult.sport,
        status: 'success'
      })
      .eq('id', historyRecord.id)
      .select()
      .single()

    if (updateError) throw new Error(updateError.message)

    return {
      importResult,
      historyRecord: updatedHistory
    }

  } catch (error) {
    // Update import history (status: failed)
    await (supabase as any)
      .from('import_history')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', historyRecord.id)

    throw error
  }
}

/**
 * Save imported program to database
 */
export async function saveImportedProgram(importData: ImportResult): Promise<string> {
  const user = await supabase.auth.getUser()
  const coachId = user.data.user?.id
  if (!coachId) throw new Error('Not authenticated')

  // 1. Create program
  const { data: program, error: programError } = await (supabase as any)
    .from('programs')
    .insert({
      coach_id: coachId,
      name: importData.programName,
      duration_weeks: importData.durationWeeks,
      description: `Imported via Smart Import - ${importData.periodization} periodization`,
      is_published: false,
      is_template: false
    })
    .select()
    .single()

  if (programError) throw new Error(programError.message)

  // 2. Create program weeks and workouts
  for (const weekData of importData.weeks) {
    const { data: week, error: weekError } = await (supabase as any)
      .from('program_weeks')
      .insert({
        program_id: program.id,
        week_number: weekData.weekNumber,
        name: weekData.name || `Week ${weekData.weekNumber}`
      })
      .select()
      .single()

    if (weekError) throw new Error(weekError.message)

    for (const workoutData of weekData.workouts) {
      const { data: workout, error: workoutError } = await (supabase as any)
        .from('workouts')
        .insert({
          coach_id: coachId,
          program_week_id: week.id,
          name: workoutData.name,
          description: workoutData.description,
          day_of_week: workoutData.dayOfWeek,
          is_template: false
        })
        .select()
        .single()

      if (workoutError) throw new Error(workoutError.message)

      // Create exercises
      for (let i = 0; i < workoutData.exercises.length; i++) {
        const exData = workoutData.exercises[i]

        await (supabase as any).from('exercises').insert({
          workout_id: workout.id,
          name: exData.name,
          order_index: i,
          sets: exData.sets,
          reps: exData.reps,
          notes: exData.notes,
          duration_seconds: exData.duration_seconds,
          distance_meters: exData.distance_meters,
          rpe: exData.rpe
        })
      }
    }
  }

  return program.id
}

/**
 * Get import history for current coach
 */
export async function getImportHistory(limit = 20): Promise<ImportHistoryRecord[]> {
  const user = await supabase.auth.getUser()
  if (!user.data.user) throw new Error('Not authenticated')

  const { data, error } = await (supabase as any)
    .from('import_history')
    .select('*')
    .eq('coach_id', user.data.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Convert File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data:...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
