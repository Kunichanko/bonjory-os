import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function ensureEnv(name: string, value: string | undefined): string {
  if (!value) {
    const err = new Error(`Missing required environment variable: ${name}`)
    // Log so the error is visible in server logs before throwing
    // eslint-disable-next-line no-console
    console.error(err)
    throw err
  }
  return value
}

const url = ensureEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
const anonKey = ensureEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY)

let supabase: SupabaseClient

try {
  supabase = createClient(url, anonKey)
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Failed to initialize Supabase client:', err)
  throw err
}

export { supabase }

export default supabase
