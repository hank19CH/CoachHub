/**
 * Generate the Smart Import template .xlsx file.
 * Run once: node scripts/generate-template.mjs
 * Output: public/templates/import-template.xlsx
 */
import XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '..', 'public', 'templates', 'import-template.xlsx')

const wb = XLSX.utils.book_new()

// ─── Sheet 1: Block Plan Example ─────────────────────────────────────────
const blockPlanData = [
  ['Block Plan Template', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['Block 1 — GPP (General Preparation)', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['Week 1 — Session 1: Upper Body', '', '', '', '', '', ''],
  ['Exercise', 'Sets', 'Reps', 'Weight', 'Rest', 'Tempo', 'Notes'],
  ['Bench Press', '4', '8', '70%', '90s', '3010', ''],
  ['DB Row', '4', '8 e/s', '30kg', '60s', '', 'Each side'],
  ['Overhead Press', '3', '10', '60%', '60s', '', ''],
  ['Face Pull', '3', '15', '', '45s', '', 'Band or cable'],
  ['', '', '', '', '', '', ''],
  ['Week 1 — Session 2: Lower Body', '', '', '', '', '', ''],
  ['Exercise', 'Sets', 'Reps', 'Weight', 'Rest', 'Tempo', 'Notes'],
  ['Back Squat', '4', '6', '75%', '120s', '3010', ''],
  ['RDL', '4', '8', '65%', '90s', '', ''],
  ['Walking Lunge', '3', '10 e/s', '', '60s', '', 'Bodyweight or DB'],
  ['Leg Curl', '3', '12', '', '60s', '', ''],
  ['', '', '', '', '', '', ''],
  ['Week 1 — Session 3: Speed/Power', '', '', '', '', '', ''],
  ['Exercise', 'Sets', 'Reps', 'Weight', 'Rest', 'Tempo', 'Notes'],
  ['Box Jump', '4', '5', '', '90s', '', 'Focus on landing'],
  ['Hang Clean', '4', '3', '70%', '120s', '', ''],
  ['Med Ball Slam', '3', '8', '', '60s', '', ''],
  ['', '', '', '', '', '', ''],
  ['Week 2 — Session 1: Upper Body', '', '', '', '', '', ''],
  ['Exercise', 'Sets', 'Reps', 'Weight', 'Rest', 'Tempo', 'Notes'],
  ['Bench Press', '4', '8', '72.5%', '90s', '3010', 'Progress from W1'],
  ['DB Row', '4', '8 e/s', '32kg', '60s', '', 'Each side'],
  ['Overhead Press', '3', '10', '62.5%', '60s', '', ''],
  ['Face Pull', '3', '15', '', '45s', '', ''],
  ['', '', '', '', '', '', ''],
  ['(Continue adding Week 2 Session 2, Session 3, etc.)', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['Block 2 — SPP (Specific Preparation)', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['Week 1 — Session 1: Strength', '', '', '', '', '', ''],
  ['Exercise', 'Sets', 'Reps', 'Weight', 'Rest', 'Tempo', 'Notes'],
  ['Back Squat', '5', '5', '80%', '180s', '', 'Heavier than GPP'],
  ['Bench Press', '5', '5', '80%', '180s', '', ''],
  ['Barbell Row', '4', '6', '75%', '90s', '', ''],
  ['', '', '', '', '', '', ''],
  ['(Continue with more weeks and sessions...)', '', '', '', '', '', ''],
]

const ws1 = XLSX.utils.aoa_to_sheet(blockPlanData)

// Set column widths
ws1['!cols'] = [
  { wch: 22 }, // Exercise
  { wch: 6 },  // Sets
  { wch: 10 }, // Reps
  { wch: 10 }, // Weight
  { wch: 8 },  // Rest
  { wch: 8 },  // Tempo
  { wch: 25 }, // Notes
]

XLSX.utils.book_append_sheet(wb, ws1, 'Block Plan')

// ─── Sheet 2: Single Session Example ─────────────────────────────────────
const singleSessionData = [
  ['Single Session Template', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['Session: Upper Body Strength', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['Exercise', 'Sets', 'Reps', 'Weight', 'Rest', 'Notes'],
  ['--- Warm-Up ---', '', '', '', '', ''],
  ['Band Pull-Apart', '2', '15', '', '', ''],
  ['Push-Up', '2', '10', '', '', ''],
  ['--- Main Set ---', '', '', '', '', ''],
  ['Bench Press', '4', '6', '80%', '120s', ''],
  ['Weighted Pull-Up', '4', '6', '+15kg', '120s', ''],
  ['DB Incline Press', '3', '10', '28kg', '90s', ''],
  ['Cable Row', '3', '10', '', '60s', ''],
  ['--- Accessory ---', '', '', '', '', ''],
  ['Lateral Raise', '3', '15', '', '45s', ''],
  ['Tricep Pushdown', '3', '12', '', '45s', ''],
  ['Hammer Curl', '3', '12', '', '45s', ''],
]

const ws2 = XLSX.utils.aoa_to_sheet(singleSessionData)
ws2['!cols'] = [
  { wch: 22 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 25 },
]
XLSX.utils.book_append_sheet(wb, ws2, 'Single Session')

// ─── Sheet 3: Tips ───────────────────────────────────────────────────────
const tipsData = [
  ['Smart Import — Formatting Tips'],
  [''],
  ['STRUCTURE'],
  ['- Use clear session/day labels: "Session 1: Upper Body", "Monday AM", "Speed Day"'],
  ['- Use clear week labels: "Week 1", "Wk 1", "W1"'],
  ['- Use clear block/phase labels: "GPP", "SPP", "Competition", "Hypertrophy"'],
  ['- Keep one exercise per row with consistent columns'],
  [''],
  ['COLUMNS'],
  ['- Required: Exercise name (first column)'],
  ['- Recommended: Sets, Reps, Weight/Load, Rest, Notes'],
  ['- Optional: Tempo, RPE, Intensity %, Duration, Distance'],
  ['- Column order does not matter as long as headers are labeled'],
  [''],
  ['SECTION HEADERS'],
  ['- Use rows like "--- Warm-Up ---" or "Warm-Up" to create visual sections'],
  ['- These appear as dividers in the plan, not as exercises'],
  [''],
  ['ABBREVIATIONS'],
  ['- Feel free to use shorthand (e.g., BS, RDL, PP, DB, BB)'],
  ['- Smart Import will interpret abbreviations and let you review'],
  ['- Check "Keep" to save your shorthand as a coach alias'],
  ['- Athletes always see the full exercise name'],
  ['- Your corrections build a personal glossary for future imports'],
  [''],
  ['SUPPORTED FORMATS'],
  ['- Excel (.xlsx, .xls), CSV, PDF, Images (.jpg, .png)'],
  ['- Max file size: 10MB'],
]

const ws3 = XLSX.utils.aoa_to_sheet(tipsData)
ws3['!cols'] = [{ wch: 70 }]
XLSX.utils.book_append_sheet(wb, ws3, 'Tips')

// ─── Write file ──────────────────────────────────────────────────────────
XLSX.writeFile(wb, outPath)
console.log(`Template generated: ${outPath}`)
