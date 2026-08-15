import { createClient } from '@supabase/supabase-js'

// Reads Vite env (see .env). If either is missing the app transparently falls
// back to localStorage so it keeps working before Supabase is configured.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && key)

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null
