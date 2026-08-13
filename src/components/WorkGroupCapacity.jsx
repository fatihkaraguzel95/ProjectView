import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'
import { workGroupBreakdown } from '../lib/resource.js'
import { fmt } from '../lib/util.js'
import { actions } from '../store.js'

export default function WorkGroupCapacity({ projects, capacity, settings }) {
  const rows = useMemo(
    () => workGroupBreakdown(projects, capacity, settings),
    [projects, capacity, settings],
  )

  const chartData = rows.map((r) => ({
    name: r.workGroup,
    Bedarf: Math.round(r.demandFTE * 10) / 10,
    Verfügbar: r.people,
    gap: r.gap,
  }))

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* capacity input table */}
      <div className="card p-5 lg:col-span-2">
        <h2 className="text-lg font-bold text-ink-900">Personalkapazität je Arbeitsgruppe</h2>
        <p className="mb-4 text-sm text-ink-500">
          Alle Arbeitsgruppen aus den Excel-Vorlagen. Tragen Sie die verfügbare Mitarbeiterzahl ein.
        </p>
        <div className="overflow-hidden rounded-lg border border-ink-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-3 py-2">Arbeitsgruppe</th>
                <th className="px-3 py-2 text-right">Bedarf (FTE)</th>
                <th className="px-3 py-2 text-right">Personen</th>
                <th className="px-3 py-2 text-right">Auslastung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-ink-400">
                    Keine Arbeitsgruppen – laden Sie eine Excel-Vorlage.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const util = r.utilization
                const over = util != null && util > 1
                return (
                  <tr key={r.workGroup} className="hover:bg-ink-50">
                    <td className="px-3 py-2 font-medium text-ink-800">{r.workGroup}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-600">
                      {fmt(r.demandFTE, 1)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={r.people || ''}
                        onChange={(e) => actions.setCapacity(r.workGroup, Number(e.target.value))}
                        className="tnum w-16 rounded-md border border-ink-300 px-2 py-1 text-right text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {util == null ? (
                        <span className="text-ink-300">–</span>
                      ) : (
                        <span
                          className={`chip tnum ${
                            over
                              ? 'bg-red-50 text-red-700'
                              : util > 0.85
                                ? 'bg-accent-50 text-accent-600'
                                : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {fmt(util * 100)}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-400">
          1 FTE ={' '}
          <input
            type="number"
            value={settings?.hoursPerFTEPerYear || 1600}
            onChange={(e) => actions.setSetting('hoursPerFTEPerYear', Number(e.target.value) || 1600)}
            className="tnum mx-1 w-20 rounded border border-ink-300 px-1.5 py-0.5 text-right"
          />
          Std/Jahr · Bedarf = Gesamtstunden ÷ FTE-Stunden ÷ Perioden
        </p>
      </div>

      {/* demand vs capacity chart */}
      <div className="card p-5 lg:col-span-3">
        <h2 className="text-lg font-bold text-ink-900">Bedarf vs. Verfügbarkeit</h2>
        <p className="mb-4 text-sm text-ink-500">
          Durchschnittlich benötigte FTE gegen vorhandene Mitarbeiter je Arbeitsgruppe.
        </p>
        {chartData.length === 0 ? (
          <div className="flex h-[360px] items-center justify-center rounded-lg border border-dashed border-ink-200 text-sm text-ink-400">
            Keine Daten
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: '#475569' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fontSize: 11, fill: '#334155' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: '#0f172a', fillOpacity: 0.04 }}
                formatter={(v, n) => [fmt(v, 1), n]}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Bedarf" fill="#1e40af" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.gap > 0 ? '#dc2626' : '#1e40af'} />
                ))}
              </Bar>
              <Bar
                dataKey="Verfügbar"
                fill="#94a3b8"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="mt-2 text-xs text-ink-400">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-600" /> Rot = Unterdeckung
          (Bedarf &gt; Verfügbar)
        </p>
      </div>
    </div>
  )
}
