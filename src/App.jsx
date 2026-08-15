import { useState } from 'react'
import { useStore, actions } from './store.js'
import {
  portfolioTotals,
  capacityYears,
  monthlyCapacityHoursForYear,
  monthlyHeadcountForYear,
} from './lib/resource.js'
import { fmt } from './lib/util.js'
import ResourceMountChart from './components/ResourceMountChart.jsx'
import PositionCapacity from './components/PositionCapacity.jsx'
import ProjectData from './components/ProjectData.jsx'
import PositionAnalysis from './components/PositionAnalysis.jsx'
import { IconLayers, IconChart, IconUsers, IconFile } from './components/icons.jsx'

function Stat({ icon, label, value, sub, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    accent: 'bg-accent-50 text-accent-600',
    ink: 'bg-ink-100 text-ink-600',
    green: 'bg-green-50 text-green-700',
  }
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="tnum text-xl font-extrabold leading-none text-ink-900">{value}</div>
        <div className="mt-1 truncate text-xs font-medium text-ink-500">{label}</div>
      </div>
      {sub && <div className="ml-auto self-start text-xs text-ink-400">{sub}</div>}
    </div>
  )
}

function NavTab({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

export default function App() {
  const [view, setView] = useState('portfolio')
  const projects = useStore((s) => s.projects)
  const headcount = useStore((s) => s.headcount)
  const settings = useStore((s) => s.settings)
  const source = useStore((s) => s._source)
  const t = portfolioTotals(projects)

  // capacity KPIs averaged across all years on the timeline
  const years = capacityYears(projects)
  const nY = Math.max(1, years.length)
  const avgCap =
    years.reduce(
      (a, y) => a + monthlyCapacityHoursForYear(headcount, settings, y).reduce((x, v) => x + v, 0) / 12,
      0,
    ) / nY
  const avgPersons =
    years.reduce(
      (a, y) => a + monthlyHeadcountForYear(headcount, y).reduce((x, v) => x + v, 0) / 12,
      0,
    ) / nY

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <IconLayers width={20} height={20} stroke="#fff" />
          </div>
          <div>
            <h1 className="text-base font-extrabold leading-none text-ink-900">ProjectView</h1>
            <p className="text-xs text-ink-400">Projektbasiertes Ressourcenmanagement</p>
          </div>
          <nav className="ml-4 flex items-center gap-1">
            <NavTab
              active={view === 'portfolio'}
              onClick={() => setView('portfolio')}
              icon={<IconChart width={16} height={16} />}
            >
              Portfolio & Auslastung
            </NavTab>
            <NavTab
              active={view === 'data'}
              onClick={() => setView('data')}
              icon={<IconFile width={16} height={16} />}
            >
              Projektdaten
            </NavTab>
            <NavTab
              active={view === 'analysis'}
              onClick={() => setView('analysis')}
              icon={<IconChart width={16} height={16} />}
            >
              Positionsanalyse
            </NavTab>
            <NavTab
              active={view === 'capacity'}
              onClick={() => setView('capacity')}
              icon={<IconUsers width={16} height={16} />}
            >
              Personalkapazität
            </NavTab>
          </nav>
          <span
            className={`ml-auto chip ${
              source === 'supabase'
                ? 'bg-green-50 text-green-700'
                : source === 'local'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-ink-100 text-ink-500'
            }`}
            title={
              source === 'supabase'
                ? 'Alle Daten laufen live über Supabase'
                : source === 'local'
                  ? 'Keine Supabase-Verbindung – lokaler Fallback (Änderungen werden nicht gespeichert)'
                  : 'Verbinde mit Supabase…'
            }
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                source === 'supabase'
                  ? 'bg-green-500'
                  : source === 'local'
                    ? 'bg-amber-500'
                    : 'bg-ink-400'
              }`}
            />
            {source === 'supabase'
              ? 'Supabase · live'
              : source === 'local'
                ? 'Lokal (offline)'
                : 'Verbinde…'}
          </span>
          <button
            className="btn-ghost text-xs"
            onClick={() => {
              if (confirm('Alle Daten auf die Demo-Vorlage zurücksetzen?')) actions.resetAll()
            }}
          >
            Zurücksetzen
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-5">
        {view === 'portfolio' ? (
          <>
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat
                icon={<IconLayers width={20} height={20} />}
                label="Projekte"
                value={fmt(t.projects)}
                tone="brand"
              />
              <Stat
                icon={<IconFile width={20} height={20} />}
                label="Teilprojekte"
                value={fmt(t.subProjects)}
                tone="ink"
              />
              <Stat
                icon={<IconChart width={20} height={20} />}
                label="Beauftragte Std"
                value={fmt(t.awardedHours)}
                tone="green"
              />
              <Stat
                icon={<IconUsers width={20} height={20} />}
                label="Geplante Std"
                value={fmt(t.plannedHours)}
                sub="schraffiert"
                tone="accent"
              />
            </div>

            <ResourceMountChart projects={projects} headcount={headcount} settings={settings} />
          </>
        ) : view === 'data' ? (
          <ProjectData projects={projects} />
        ) : view === 'analysis' ? (
          <PositionAnalysis projects={projects} />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Stat
                icon={<IconUsers width={20} height={20} />}
                label="⌀ Personen / Monat"
                value={fmt(avgPersons, 0)}
                tone="brand"
              />
              <Stat
                icon={<IconChart width={20} height={20} />}
                label="⌀ Kapazität Std / Monat"
                value={fmt(avgCap)}
                tone="green"
              />
              <Stat
                icon={<IconFile width={20} height={20} />}
                label="FTE-Stunden / Jahr"
                value={fmt(settings?.hoursPerFTEPerYear || 1600)}
                tone="ink"
              />
            </div>
            <PositionCapacity projects={projects} headcount={headcount} settings={settings} />
          </>
        )}

        <footer className="mt-8 border-t border-ink-200 pt-4 text-center text-xs text-ink-400">
          ProjectView Prototyp · Daten lokal im Browser gespeichert · Demo-Daten: VW386 0EU
          (HiSi/VoSi)
        </footer>
      </main>
    </div>
  )
}
