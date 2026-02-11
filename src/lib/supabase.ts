import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Note: We use our own TypeScript types from @/types/database rather than
// the Supabase generic Database type, which requires generated Relationships
// arrays for each table. Our types are maintained in database.ts.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
