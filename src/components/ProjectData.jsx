import { useRef, useState, useMemo } from 'react'
import { actions } from '../store.js'
import { parseWorkbookFile } from '../lib/excelParser.js'
import { fmt } from '../lib/util.js'
import { IconUpload, IconTrash, IconFile, IconChart } from './icons.jsx'

function StatusDot({ status }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        status === 'awarded' ? 'bg-brand-600' : 'bg-accent-500'
      }`}
    />
  )
}

// Upload control that adds a sub-project (parsed from Excel) to a project.
function UploadButton({ projectId, onAdded }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function handle(list) {
    const files = Array.from(list || [])
    if (!files.length) return
    setBusy(true)
    setErr('')
    try {
      for (const file of files) {
        const parsed = await parseWorkbookFile(file)
        if (!parsed.positions.length) {
          setErr(`In „${file.name}" wurden keine Positionen gefunden.`)
          continue
        }
        const sub = {
          name: file.name.replace(/\.(xlsm|xlsx|xls|csv)$/i, ''),
          source: file.name,
          periods: parsed.periods,
          positions: parsed.positions,
          personalPositions: parsed.personalPositions || [],
        }
        actions.addSubProject(projectId, sub)
        onAdded?.(projectId)
      }
    } catch (e) {
      console.error(e)
      setErr('Datei konnte nicht gelesen werden.')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xlsm,.xls,.csv"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <button
        className="btn-outline w-full justify-center border-dashed py-1.5 text-xs"
        onClick={() => ref.current?.click()}
        disabled={busy}
      >
        <IconUpload width={14} height={14} />
        {busy ? 'Wird verarbeitet…' : 'Excel-Vorlage hochladen'}
      </button>
      {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
    </>
  )
}

// Groups a sub-project's positions by work group with per-period + total hours.
function groupPositions(sub) {
  const groups = new Map()
  for (const p of sub.positions) {
    if (!groups.has(p.workGroup)) groups.set(p.workGroup, [])
    groups.get(p.workGroup).push(p)
  }
  return [...groups.entries()].map(([name, items]) => ({
    name,
    items,
    total: items.reduce((a, p) => a + (p.totalHours || 0), 0),
  }))
}

export default function ProjectData({ projects }) {
  const [selected, setSelected] = useState(null) // { projectId, subId }

  // resolve current selection against live data, else pick first available
  const resolved = useMemo(() => {
    const find = (sel) => {
      if (!sel) return null
      const pr = projects.find((p) => p.id === sel.projectId)
      const sp = pr?.subProjects.find((s) => s.id === sel.subId)
      return sp ? { project: pr, sub: sp } : null
    }
    let cur = find(selected)
    if (!cur) {
      for (const p of projects)
        if (p.subProjects.length) {
          cur = { project: p, sub: p.subProjects[0] }
          break
        }
    }
    return cur
  }, [projects, selected])

  const sub = resolved?.sub
  const project = resolved?.project
  const groups = sub ? groupPositions(sub) : []
  const periods = sub?.periods || []
  const totalHours = sub ? sub.positions.reduce((a, p) => a + (p.totalHours || 0), 0) : 0

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* navigator */}
      <aside className="card h-max p-3">
        <h2 className="px-2 pb-2 pt-1 text-sm font-bold uppercase tracking-wide text-ink-500">
          Projekte & Teilprojekte
        </h2>
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id}>
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="h-3 w-3 rounded-sm" style={{ background: p.color }} />
                <span className="flex-1 truncate text-sm font-bold text-ink-800">{p.name}</span>
                <StatusDot status={p.status} />
              </div>
              <div className="mt-1 space-y-1 pl-2">
                {p.subProjects.map((s) => {
                  const active = sub?.id === s.id
                  const h = s.positions.reduce((a, x) => a + (x.totalHours || 0), 0)
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelected({ projectId: p.id, subId: s.id })}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                        active ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-50'
                      }`}
                    >
                      <IconFile width={15} height={15} className="shrink-0 text-ink-400" />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="tnum shrink-0 text-xs text-ink-400">{fmt(h)}</span>
                    </button>
                  )
                })}
                {p.subProjects.length === 0 && (
                  <p className="px-2 py-1 text-xs text-ink-400">Keine Teilprojekte</p>
                )}
                <div className="pt-1">
                  <UploadButton
                    projectId={p.id}
                    onAdded={() => {
                      // select the newest sub-project of this project
                      const pr = projects.find((x) => x.id === p.id)
                      const last = pr?.subProjects[pr.subProjects.length - 1]
                      if (last) setSelected({ projectId: p.id, subId: last.id })
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <p className="px-2 py-3 text-sm text-ink-400">
              Legen Sie zuerst unter „Portfolio" ein Projekt an.
            </p>
          )}
        </div>
      </aside>

      {/* detail: positions + required hours as a list */}
      <section className="card p-5">
        {!sub ? (
          <div className="flex h-72 flex-col items-center justify-center text-center">
            <IconChart width={28} height={28} className="text-ink-300" />
            <p className="mt-2 text-sm font-semibold text-ink-600">Kein Teilprojekt ausgewählt</p>
            <p className="mt-1 max-w-xs text-xs text-ink-400">
              Wählen Sie links ein Teilprojekt oder laden Sie eine Excel-Vorlage hoch.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: project.color }} />
                  <span className="truncate text-xs font-semibold text-ink-400">
                    {project.name}
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-bold text-ink-900">{sub.name}</h2>
                <p className="truncate text-xs text-ink-400" title={sub.source}>
                  Quelle: {sub.source || 'manuell'} · {sub.positions.length} Positionen ·{' '}
                  {periods.join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="tnum rounded-lg bg-brand-50 px-3 py-2 text-right">
                  <div className="text-lg font-extrabold text-brand-700">{fmt(totalHours)}</div>
                  <div className="text-xs font-medium text-brand-600">Gesamtstunden</div>
                </div>
                <button
                  className="btn-ghost p-2 text-ink-400 hover:text-red-600"
                  title="Teilprojekt löschen"
                  onClick={() => {
                    if (confirm(`Teilprojekt „${sub.name}" löschen?`)) {
                      actions.removeSubProject(project.id, sub.id)
                      setSelected(null)
                    }
                  }}
                >
                  <IconTrash width={18} height={18} />
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-2 py-2">Position</th>
                    {periods.map((per) => (
                      <th key={per} className="px-2 py-2 text-right">
                        {per}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right">Summe (Std)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <FragmentGroup key={g.name} group={g} periods={periods} />
                  ))}
                  <tr className="border-t-2 border-ink-200 bg-brand-50/50">
                    <td className="px-2 py-2 font-bold text-ink-800">Gesamt</td>
                    {periods.map((per) => (
                      <td key={per} className="tnum px-2 py-2 text-right font-semibold text-ink-600">
                        {fmt(sub.positions.reduce((a, p) => a + (p.hoursByPeriod?.[per] || 0), 0))}
                      </td>
                    ))}
                    <td className="tnum px-2 py-2 text-right font-extrabold text-brand-700">
                      {fmt(totalHours)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function FragmentGroup({ group, periods }) {
  return (
    <>
      <tr className="bg-ink-50">
        <td className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
          {group.name}
        </td>
        {periods.map((per) => (
          <td key={per} className="tnum px-2 py-1.5 text-right text-xs text-ink-400">
            {fmt(group.items.reduce((a, p) => a + (p.hoursByPeriod?.[per] || 0), 0))}
          </td>
        ))}
        <td className="tnum px-2 py-1.5 text-right text-xs font-semibold text-ink-500">
          {fmt(group.total)}
        </td>
      </tr>
      {group.items.map((p, i) => (
        <tr key={i} className="border-t border-ink-100 hover:bg-ink-50/50">
          <td className="px-2 py-1.5 pl-4 text-ink-800" title={p.position}>
            <div className="max-w-[420px] truncate">{p.position}</div>
          </td>
          {periods.map((per) => (
            <td key={per} className="tnum px-2 py-1.5 text-right text-ink-600">
              {p.hoursByPeriod?.[per] ? fmt(p.hoursByPeriod[per]) : '–'}
            </td>
          ))}
          <td className="tnum px-2 py-1.5 text-right font-semibold text-ink-800">
            {fmt(p.totalHours)}
          </td>
        </tr>
      ))}
    </>
  )
}
