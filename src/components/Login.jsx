import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { IconLayers } from './icons.jsx'

// Email/password sign-in against Supabase Auth. On success the AuthGate picks
// up the new session via onAuthStateChange and swaps in the app.
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort ist falsch.'
          : error.message,
      )
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-100 px-4">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <IconLayers width={26} height={26} stroke="#fff" />
          </div>
          <h1 className="text-lg font-extrabold text-ink-900">ProjectView</h1>
          <p className="mt-1 text-sm text-ink-500">Bitte anmelden, um fortzufahren</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">E-Mail</label>
            <input
              type="email"
              autoComplete="username"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@projectview.local"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Passwort</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
            {busy ? 'Anmelden…' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  )
}
