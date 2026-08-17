import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { initStore } from '../store.js'
import Login from './Login.jsx'

// Wraps the app in a Supabase-auth gate:
//   - not configured  → run in local mode, no login (store auto-boots)
//   - session unknown  → spinner while getSession() resolves
//   - no session       → <Login />
//   - session present  → load data (initStore) then render the app
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Kick off the (remote) data load once we actually have a session.
  useEffect(() => {
    if (session) initStore().then(() => setReady(true))
  }, [session])

  // No Supabase configured → local-only prototype, skip auth entirely.
  if (!isSupabaseConfigured) return children

  if (session === undefined) return <Splash label="Verbinde…" />
  if (!session) return <Login />
  if (!ready) return <Splash label="Lade Daten…" />
  return children
}

function Splash({ label }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-100">
      <div className="flex items-center gap-3 text-sm font-medium text-ink-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        {label}
      </div>
    </div>
  )
}
