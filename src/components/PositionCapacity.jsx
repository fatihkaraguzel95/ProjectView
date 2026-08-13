import { useMemo, useState } from 'react'
import { monthlyHeadcountForYear, monthlyCapacityHoursForYear, capacityYears } from '../lib/resource.js'
import { fmt } from '../lib/util.js'
import { actions, useStore } from '../store.js'
import Modal from './Modal.jsx'
import { IconPlus, IconTrash } from './icons.jsx'

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export default function PositionCapacity({ projects, headcount, settings }) {
  const positions = useStore((s) => s.capacityPositions)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ workGroup: '', position: '', people: 5 })

  // available years come from the project timeline; keep a selected one
  const years = useMemo(() => {
    const ys = capacityYears(projects)
    return ys.length ? ys : [String(new Date().getFullYear())]
  }, [projects])
  const [year, setYear] = useState(years[0])
  const activeYear = years.includes(year) ? year : years[0]

  const totalsPersons = monthlyHeadcountForYear(headcount, activeYear)
  const totalsHours = monthlyCapacityHoursForYear(headcount, settings, activeYear)

  const existingGroups = useMemo(
    () => [...new Set(positions.map((p) => p.workGroup))],
    [positions],
  )

  const createPosition = () => {
    if (!form.position.trim()) return
    actions.addCapacityPosition(
      { workGroup: form.workGroup.trim() || 'Sonstige', position: form.position.trim() },
      Math.max(0, Number(form.people) || 0),
    )
    setForm({ workGroup: '', position: '', people: 5 })
    setAddOpen(false)
  }

  // group positions by work group (unique group names, merges HiSi/VoSi)
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of positions) {
      if (!map.has(p.workGroup)) map.set(p.workGroup, { name: p.workGroup, items: [] })
      map.get(p.workGroup).items.push(p)
    }
    return [...map.values()]
  }, [positions])

  const setCell = (pos, m, val) => {
    actions.setHeadcountMonth(pos, activeYear, m, val)
  }
  const fillRow = (pos) => {
    const first = headcount[pos]?.[activeYear]?.[0] || 0
    actions.setHeadcountRow(pos, activeYear, Array(12).fill(first))
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-ink-900">
            Personalkapazität je Position ·{' '}
            <span className="text-brand-600">Jahr {activeYear}</span>
          </h2>
          <p className="text-sm text-ink-500">
            Positionen aus dem Bereich <strong>Personalkosten</strong> (Kostenverfolgung). Verfügbare
            Personenzahl <strong>je Jahr und Monat</strong>. Die Summe ergibt die
            Kapazitätslinie im Diagramm (jahr-spezifisch).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip bg-brand-50 text-brand-600">{positions.length} Positionen</span>
          <button className="btn-primary text-xs" onClick={() => setAddOpen(true)}>
            <IconPlus width={14} height={14} /> Position
          </button>
        </div>
      </div>

      {/* year selector */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Jahr</span>
        <div className="inline-flex rounded-lg border border-ink-300 p-0.5">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`tnum rounded-md px-3 py-1 text-sm font-semibold transition-colors ${
                y === activeYear ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <span className="ml-1 text-xs text-ink-400">
          Ø {fmt(totalsPersons.reduce((a, b) => a + b, 0) / 12, 1)} Personen ·{' '}
          {fmt(totalsHours.reduce((a, b) => a + b, 0))} Std im Jahr {activeYear}
        </span>
      </div>

      {positions.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-200 text-sm text-ink-400">
          Keine Positionen.
          <button className="btn-outline text-xs" onClick={() => setAddOpen(true)}>
            <IconPlus width={14} height={14} /> Position hinzufügen
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-xs font-semibold text-ink-500">
                <th className="sticky left-0 z-10 min-w-[240px] bg-white px-2 py-2 text-left">
                  Position
                </th>
                {MONTHS.map((m) => (
                  <th key={m} className="w-12 px-1 py-2 text-center font-semibold">
                    {m}
                  </th>
                ))}
                <th className="w-8 px-1 py-2" title="Erste Zahl auf alle Monate übertragen" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <FragmentGroup
                  key={g.name}
                  group={g}
                  headcount={headcount}
                  year={activeYear}
                  setCell={setCell}
                  fillRow={fillRow}
                  onRemove={(pos) => actions.removeCapacityPosition(pos)}
                />
              ))}
              {/* totals */}
              <tr className="bg-brand-50/60">
                <td className="sticky left-0 z-10 bg-brand-50/60 px-2 py-2 text-left font-bold text-ink-800">
                  Summe Personen
                </td>
                {totalsPersons.map((v, i) => (
                  <td key={i} className="tnum px-1 py-2 text-center font-bold text-brand-600">
                    {v || ''}
                  </td>
                ))}
                <td />
              </tr>
              <tr className="bg-brand-50/60">
                <td className="sticky left-0 z-10 bg-brand-50/60 px-2 py-1 text-left text-xs font-semibold text-ink-500">
                  Kapazität (Std)
                </td>
                {totalsHours.map((v, i) => (
                  <td key={i} className="tnum px-1 py-1 text-center text-xs text-ink-500">
                    {v ? fmt(v) : ''}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-400">
        Das Monatsmuster (Jan–Dez) gilt für jedes Jahr der Zeitachse. „→“ überträgt den Januar-Wert
        auf alle Monate.
      </p>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Position hinzufügen"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>
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
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              placeholder="z. B. Projektleiter/in"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Arbeitsgruppe</label>
            <input
              className="input"
              list="capacity-groups"
              value={form.workGroup}
              onChange={(e) => setForm({ ...form, workGroup: e.target.value })}
              placeholder="z. B. Konstruktion"
            />
            <datalist id="capacity-groups">
              {existingGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">
              Personen / Monat (Startwert)
            </label>
            <input
              type="number"
              min="0"
              className="input"
              value={form.people}
              onChange={(e) => setForm({ ...form, people: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FragmentGroup({ group, headcount, year, setCell, fillRow, onRemove }) {
  // group-level info: sum of persons per month across the group's positions
  const groupTotals = Array(12).fill(0)
  for (const p of group.items) {
    const r = headcount[p.position]?.[year] || []
    for (let m = 0; m < 12; m++) groupTotals[m] += Number(r[m]) || 0
  }
  return (
    <>
      <tr>
        <td className="sticky left-0 z-10 bg-ink-50 px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
          {group.name}
        </td>
        {groupTotals.map((v, i) => (
          <td key={i} className="tnum bg-ink-50 px-1 py-1.5 text-center text-xs font-semibold text-ink-400">
            {v || ''}
          </td>
        ))}
        <td className="bg-ink-50" />
      </tr>
      {group.items.map((p) => {
        const row = headcount[p.position]?.[year] || []
        return (
          <tr key={p.position} className="border-t border-ink-100 hover:bg-ink-50/50">
            <td
              className="sticky left-0 z-10 min-w-[240px] bg-white px-2 py-1.5 text-left text-ink-800"
              title={p.position}
            >
              <div className="max-w-[240px] truncate">{p.position}</div>
            </td>
            {MONTHS.map((_, m) => (
              <td key={m} className="px-0.5 py-1 text-center">
                <input
                  type="number"
                  min="0"
                  value={row[m] || ''}
                  onChange={(e) => setCell(p.position, m, e.target.value)}
                  className="tnum h-8 w-10 rounded-md border border-ink-200 px-1 text-center text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-100"
                  placeholder="0"
                />
              </td>
            ))}
            <td className="whitespace-nowrap px-1 text-center">
              <button
                onClick={() => fillRow(p.position)}
                className="rounded-md px-1.5 py-1 text-xs font-bold text-ink-400 hover:bg-brand-50 hover:text-brand-600"
                title="Januar-Wert auf alle Monate übertragen"
              >
                →
              </button>
              <button
                onClick={() => {
                  if (confirm(`Position „${p.position}" entfernen?`)) onRemove(p.position)
                }}
                className="rounded-md p-1 text-ink-300 hover:bg-red-50 hover:text-red-600"
                title="Position entfernen"
              >
                <IconTrash width={13} height={13} />
              </button>
            </td>
          </tr>
        )
      })}
    </>
  )
}
