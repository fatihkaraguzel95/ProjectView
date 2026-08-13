import { useMemo } from 'react'
import { allPositions, monthlyHeadcount, monthlyCapacityHours } from '../lib/resource.js'
import { fmt } from '../lib/util.js'
import { actions } from '../store.js'

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export default function PositionCapacity({ projects, headcount, settings }) {
  const positions = useMemo(() => allPositions(projects), [projects])
  const totalsPersons = monthlyHeadcount(headcount)
  const totalsHours = monthlyCapacityHours(headcount, settings)

  // group positions by work group for readable section headers
  const groups = useMemo(() => {
    const g = []
    let cur = null
    for (const p of positions) {
      if (!cur || cur.name !== p.workGroup) {
        cur = { name: p.workGroup, items: [] }
        g.push(cur)
      }
      cur.items.push(p)
    }
    return g
  }, [positions])

  const setCell = (pos, m, val) => {
    const n = val === '' ? 0 : Math.max(0, Number(val) || 0)
    actions.setHeadcountMonth(pos, m, n)
  }
  const fillRow = (pos) => {
    const first = (headcount[pos] && headcount[pos][0]) || 0
    actions.setHeadcountRow(pos, Array(12).fill(first))
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-ink-900">Personalkapazität je Position (monatlich)</h2>
          <p className="text-sm text-ink-500">
            Positionen aus dem Bereich <strong>Personalkosten</strong> der Excel-Vorlagen. Tragen Sie
            je Position die verfügbare Personenzahl pro Monat ein – die Summe erscheint als
            Kapazitätslinie im Diagramm.
          </p>
        </div>
        <span className="chip bg-brand-50 text-brand-600">{positions.length} Positionen</span>
      </div>

      {positions.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-ink-200 text-sm text-ink-400">
          Keine Positionen – laden Sie eine Excel-Vorlage mit Personalkosten-Bereich.
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
                  setCell={setCell}
                  fillRow={fillRow}
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
    </div>
  )
}

function FragmentGroup({ group, headcount, setCell, fillRow }) {
  return (
    <>
      <tr>
        <td
          colSpan={14}
          className="sticky left-0 bg-ink-50 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-500"
        >
          {group.name}
        </td>
      </tr>
      {group.items.map((p) => {
        const row = headcount[p.position] || []
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
            <td className="px-1 text-center">
              <button
                onClick={() => fillRow(p.position)}
                className="rounded-md px-1.5 py-1 text-xs font-bold text-ink-400 hover:bg-brand-50 hover:text-brand-600"
                title="Januar-Wert auf alle Monate übertragen"
              >
                →
              </button>
            </td>
          </tr>
        )
      })}
    </>
  )
}
