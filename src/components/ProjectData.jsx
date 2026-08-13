import { useRef, useState, useMemo } from 'react'
import { actions } from '../store.js'
import { parseWorkbookFile } from '../lib/excelParser.js'
import { fmt } from '../lib/util.js'
import Modal from './Modal.jsx'
import { ColorPicker, StatusToggle } from './ProjectsPanel.jsx'
import { IconUpload, IconTrash, IconFile, IconChart, IconPlus, IconX } from './icons.jsx'

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
// Keeps each position's original index so rows can be deleted precisely.
function groupPositions(sub) {
  const groups = new Map()
  sub.positions.forEach((p, idx) => {
    if (!groups.has(p.workGroup)) groups.set(p.workGroup, [])
    groups.get(p.workGroup).push({ ...p, __idx: idx })
  })
  return [...groups.entries()].map(([name, items]) => ({
    name,
    items,
    total: items.reduce((a, p) => a + (p.totalHours || 0), 0),
  }))
}

export default function ProjectData({ projects }) {
  const [selected, setSelected] = useState(null) // { projectId, subId }
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', client: '', status: 'awarded' })
  const [posOpen, setPosOpen] = useState(false)
  const [posForm, setPosForm] = useState({ workGroup: '', position: '', hours: {} })
  const [yearOpen, setYearOpen] = useState(false)
  const [yearVal, setYearVal] = useState('')

  const createProject = () => {
    actions.addProject(form)
    setForm({ name: '', client: '', status: 'awarded' })
    setAddOpen(false)
  }

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

  const createPosition = () => {
    if (!sub || !posForm.position.trim()) return
    const hoursByPeriod = {}
    let total = 0
    for (const per of periods) {
      const v = Math.max(0, Number(posForm.hours[per]) || 0)
      hoursByPeriod[per] = v
      total += v
    }
    actions.addSubPosition(project.id, sub.id, {
      workGroup: posForm.workGroup.trim() || 'Sonstige',
      position: posForm.position.trim(),
      hoursByPeriod,
      totalHours: total,
    })
    setPosForm({ workGroup: '', position: '', hours: {} })
    setPosOpen(false)
  }

  const groupNames = sub ? [...new Set(sub.positions.map((p) => p.workGroup))] : []

  const createYear = () => {
    const y = String(yearVal).trim()
    if (!/^\d{4}$/.test(y) || !sub) return
    actions.addSubPeriod(project.id, sub.id, y)
    setYearVal('')
    setYearOpen(false)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* navigator */}
      <aside className="card h-max p-3">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
            Projekte & Teilprojekte
          </h2>
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => setAddOpen(true)}>
            <IconPlus width={14} height={14} /> Projekt
          </button>
        </div>
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="rounded-xl border border-ink-100 p-2">
              <div className="flex items-center gap-2">
                <ColorPicker
                  color={p.color}
                  onChange={(c) => actions.updateProject(p.id, { color: c })}
                />
                <input
                  value={p.name}
                  onChange={(e) => actions.updateProject(p.id, { name: e.target.value })}
                  className="min-w-0 flex-1 truncate border-none bg-transparent p-0 text-sm font-bold text-ink-800 outline-none focus:ring-0"
                />
                <button
                  className="btn-ghost shrink-0 p-1 text-ink-400 hover:text-red-600"
                  onClick={() => {
                    if (confirm(`Projekt „${p.name}" löschen?`)) actions.removeProject(p.id)
                  }}
                  aria-label="Projekt löschen"
                >
                  <IconTrash width={14} height={14} />
                </button>
              </div>
              <div className="mt-1.5 px-0.5">
                <StatusToggle
                  status={p.status}
                  onChange={(s) => actions.updateProject(p.id, { status: s })}
                />
              </div>
              <div className="mt-2 space-y-1">
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

            <div className="mt-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-700">Positionen & Stundenbedarf</h3>
              <div className="flex items-center gap-2">
                <button className="btn-outline text-xs" onClick={() => setYearOpen(true)}>
                  <IconPlus width={14} height={14} /> Jahr
                </button>
                <button className="btn-outline text-xs" onClick={() => setPosOpen(true)}>
                  <IconPlus width={14} height={14} /> Position
                </button>
              </div>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-2 py-2">Position</th>
                    {periods.map((per) => (
                      <th key={per} className="group px-2 py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          {per}
                          <button
                            onClick={() => {
                              if (confirm(`Jahr ${per} aus „${sub.name}" entfernen?`))
                                actions.removeSubPeriod(project.id, sub.id, per)
                            }}
                            className="rounded p-0.5 text-ink-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                            title={`Jahr ${per} entfernen`}
                          >
                            <IconX width={11} height={11} />
                          </button>
                        </span>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right">Summe (Std)</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <FragmentGroup
                      key={g.name}
                      group={g}
                      periods={periods}
                      onRemove={(idx) => actions.removeSubPosition(project.id, sub.id, idx)}
                      onEdit={(idx, per, val) =>
                        actions.setSubPositionHours(project.id, sub.id, idx, per, val)
                      }
                    />
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
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* add project modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Neues Projekt"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>
              Abbrechen
            </button>
            <button className="btn-primary" onClick={createProject}>
              Erstellen
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Projektname</label>
            <input
              autoFocus
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z. B. VW386 0EU · T-ROC"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Kunde / Phase</label>
            <input
              className="input"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              placeholder="z. B. Volkswagen AG"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-600">Status</label>
            <StatusToggle status={form.status} onChange={(s) => setForm({ ...form, status: s })} />
          </div>
        </div>
      </Modal>

      {/* add year modal */}
      <Modal
        open={yearOpen}
        onClose={() => setYearOpen(false)}
        title="Jahr hinzufügen"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setYearOpen(false)}>
              Abbrechen
            </button>
            <button className="btn-primary" onClick={createYear}>
              Hinzufügen
            </button>
          </>
        }
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-600">Jahr (JJJJ)</label>
          <input
            autoFocus
            type="number"
            className="input"
            value={yearVal}
            onChange={(e) => setYearVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createYear()}
            placeholder="z. B. 2026"
          />
          <p className="mt-2 text-xs text-ink-400">
            Fügt eine neue Spalte hinzu (Startwert 0 für alle Positionen). Die Zeitachse im
            Diagramm wird automatisch erweitert.
          </p>
        </div>
      </Modal>

      {/* add position modal */}
      <Modal
        open={posOpen}
        onClose={() => setPosOpen(false)}
        title="Position hinzufügen"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPosOpen(false)}>
              Abbrechen
            </button>
            <button className="btn-primary" onClick={createPosition}>
              Hinzufügen
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Position</label>
            <input
              autoFocus
              className="input"
              value={posForm.position}
              onChange={(e) => setPosForm({ ...posForm, position: e.target.value })}
              placeholder="z. B. Konstrukteur/in - HiSi"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Arbeitsgruppe</label>
            <input
              className="input"
              list="data-groups"
              value={posForm.workGroup}
              onChange={(e) => setPosForm({ ...posForm, workGroup: e.target.value })}
              placeholder="z. B. Konstruktion"
            />
            <datalist id="data-groups">
              {groupNames.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">
              Stundenbedarf je Periode
            </label>
            <div className="flex flex-wrap gap-2">
              {periods.map((per) => (
                <div key={per} className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-ink-500">{per}</span>
                  <input
                    type="number"
                    min="0"
                    className="tnum w-24 rounded-lg border border-ink-300 px-2 py-1 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    value={posForm.hours[per] || ''}
                    onChange={(e) =>
                      setPosForm({
                        ...posForm,
                        hours: { ...posForm.hours, [per]: e.target.value },
                      })
                    }
                    placeholder="0"
                  />
                </div>
              ))}
              {periods.length === 0 && (
                <p className="text-xs text-ink-400">Dieses Teilprojekt hat keine Perioden.</p>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FragmentGroup({ group, periods, onRemove, onEdit }) {
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
        <td className="bg-ink-50" />
      </tr>
      {group.items.map((p) => (
        <tr key={p.__idx} className="group border-t border-ink-100 hover:bg-ink-50/50">
          <td className="px-2 py-1.5 pl-4 text-ink-800" title={p.position}>
            <div className="max-w-[420px] truncate">{p.position}</div>
          </td>
          {periods.map((per) => (
            <td key={per} className="px-1 py-1 text-right">
              <input
                type="number"
                min="0"
                value={p.hoursByPeriod?.[per] ?? ''}
                onChange={(e) => onEdit(p.__idx, per, e.target.value)}
                className="tnum h-8 w-20 rounded-md border border-transparent bg-transparent px-1.5 text-right text-ink-700 outline-none hover:border-ink-200 focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-100"
                placeholder="0"
              />
            </td>
          ))}
          <td className="tnum px-2 py-1.5 text-right font-semibold text-ink-800">
            {fmt(p.totalHours)}
          </td>
          <td className="px-1 text-center">
            <button
              onClick={() => {
                if (confirm(`Position „${p.position}" entfernen?`)) onRemove(p.__idx)
              }}
              className="rounded-md p-1 text-ink-300 hover:bg-red-50 hover:text-red-600"
              title="Position entfernen"
            >
              <IconTrash width={13} height={13} />
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}
