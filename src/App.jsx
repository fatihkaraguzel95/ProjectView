import { useStore, actions } from './store.js'
import { portfolioTotals } from './lib/resource.js'
import { fmt } from './lib/util.js'
import ProjectsPanel from './components/ProjectsPanel.jsx'
import ResourceMountChart from './components/ResourceMountChart.jsx'
import WorkGroupCapacity from './components/WorkGroupCapacity.jsx'
import PositionCapacity from './components/PositionCapacity.jsx'
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

export default function App() {
  const projects = useStore((s) => s.projects)
  const capacity = useStore((s) => s.capacity)
  const headcount = useStore((s) => s.headcount)
  const settings = useStore((s) => s.settings)
  const t = portfolioTotals(projects)

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <IconLayers width={20} height={20} stroke="#fff" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-extrabold leading-none text-ink-900">ProjectView</h1>
            <p className="text-xs text-ink-400">Projektbasiertes Ressourcenmanagement</p>
          </div>
          <span className="chip bg-ink-100 text-ink-500">Prototyp</span>
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
        {/* KPI row */}
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

        {/* Two-column workspace */}
        <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-92px)] xl:overflow-y-auto xl:pr-1">
            <ProjectsPanel projects={projects} />
          </aside>

          <section className="space-y-5">
            <ResourceMountChart projects={projects} headcount={headcount} settings={settings} />
            <PositionCapacity projects={projects} headcount={headcount} settings={settings} />
            <WorkGroupCapacity projects={projects} capacity={capacity} settings={settings} />
          </section>
        </div>

        <footer className="mt-8 border-t border-ink-200 pt-4 text-center text-xs text-ink-400">
          ProjectView Prototyp · Daten lokal im Browser gespeichert · Demo-Daten: VW386 0EU
          (HiSi/VoSi)
        </footer>
      </main>
    </div>
  )
}
