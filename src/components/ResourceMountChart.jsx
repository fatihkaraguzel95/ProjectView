import { useMemo, useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { mountChartData, monthlyCapacityHours } from '../lib/resource.js'
import { fmt } from '../lib/util.js'

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function CustomTooltip({ active, payload, label, unit, series }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter(
    (p) => p.dataKey !== '__total' && p.dataKey !== '__cap' && p.value > 0,
  )
  const total = payload.find((p) => p.dataKey === '__total')?.value ?? 0
  const cap = payload.find((p) => p.dataKey === '__cap')?.value ?? 0
  const overCap = cap > 0 && total > cap
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3 text-xs shadow-pop">
      <div className="mb-2 font-bold text-ink-900">{label}</div>
      <div className="space-y-1">
        {rows.map((p) => {
          const s = series.find((x) => x.id === p.dataKey)
          return (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{
                  background: s?.color,
                  backgroundImage:
                    s?.status === 'planned'
                      ? `repeating-linear-gradient(45deg, ${s.color} 0 2px, transparent 2px 4px)`
                      : undefined,
                }}
              />
              <span className="flex-1 text-ink-600">
                {s?.name}
                {s?.status === 'planned' && <span className="text-ink-400"> (geplant)</span>}
              </span>
              <span className="tnum font-semibold text-ink-900">{fmt(p.value)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2">
        <span className="font-semibold text-ink-700">Gesamtbedarf</span>
        <span className={`tnum font-bold ${overCap ? 'text-red-600' : 'text-ink-900'}`}>
          {fmt(total)} {unit}
        </span>
      </div>
      {cap > 0 && (
        <div className="mt-1 flex items-center justify-between text-accent-600">
          <span>Kapazität (Personal)</span>
          <span className="tnum">
            {fmt(cap)} {unit}
            {overCap && <span className="ml-1 font-semibold text-red-600">· Überlast</span>}
          </span>
        </div>
      )}
    </div>
  )
}

export default function ResourceMountChart({ projects, headcount, settings }) {
  const [hidden, setHidden] = useState(() => new Set())
  const [unit, setUnit] = useState('h') // 'h' | 'fte'
  const hoursPerFTE = settings?.hoursPerFTEPerYear || 1600

  const { data, series } = useMemo(() => mountChartData(projects), [projects])
  const divisor = unit === 'fte' ? hoursPerFTE : 1

  // capacity per month (Jan..Dez) in hours, from the position head-count grid
  const capVectorHours = useMemo(
    () => monthlyCapacityHours(headcount, settings),
    [headcount, settings],
  )
  const capVector = capVectorHours.map((h) => h / divisor)
  const hasCapacity = capVectorHours.some((v) => v > 0)

  const visibleSeries = series.filter((s) => !hidden.has(s.id))
  const yearlyDisplay = useMemo(() => {
    return data.map((row) => {
      const out = { period: row.period }
      let total = 0
      for (const s of series) {
        const v = hidden.has(s.id) ? 0 : (row[s.id] || 0) / divisor
        out[s.id] = v
        if (!hidden.has(s.id)) total += v
      }
      out.__total = total
      return out
    })
  }, [data, series, hidden, divisor])

  // Break each yearly period into 12 monthly buckets; overlay the monthly
  // capacity vector so the capacity line varies month by month.
  const monthlyData = useMemo(() => {
    const sorted = [...yearlyDisplay].sort((a, b) => String(a.period).localeCompare(String(b.period)))
    const rows = []
    for (const row of sorted) {
      const yy = String(row.period).slice(-2)
      for (let m = 0; m < 12; m++) {
        const out = { label: `${MONTHS[m]} ${yy}`, year: String(row.period), m, isYearStart: m === 0 }
        for (const s of series) out[s.id] = (row[s.id] || 0) / 12
        out.__total = (row.__total || 0) / 12
        out.__cap = capVector[m] || 0
        rows.push(out)
      }
    }
    return rows
  }, [yearlyDisplay, series, capVector])

  const toggle = (id) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const exportCsv = () => {
    const header = ['Monat', ...series.map((s) => s.name), 'Gesamt', 'Kapazität']
    const lines = [header.join(';')]
    for (const row of monthlyData) {
      const vals = series.map((s) => Math.round((row[s.id] || 0) * 100) / 100)
      lines.push(
        [row.label, ...vals, Math.round(row.__total * 100) / 100, Math.round(row.__cap * 100) / 100].join(';'),
      )
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `resource-mount-${unit}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const unitLabel = unit === 'fte' ? 'FTE' : 'Std'
  const hasData = series.length > 0 && data.some((r) => visibleSeries.some((s) => r[s.id] > 0))
  const maxTotal = Math.max(0, ...monthlyData.map((r) => Math.max(r.__total, r.__cap)))
  const yearStarts = monthlyData.filter((r) => r.isYearStart)
  const peakCap = Math.max(0, ...capVector)

  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">Resource Mount Chart</h2>
          <p className="text-sm text-ink-500">
            Ressourcen-Bedarfsgebirge pro Monat · gestapelt nach Projekt · geplante Projekte
            schraffiert · Personal-Kapazitätslinie
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-300 p-0.5">
            {['h', 'fte'].map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  unit === u ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
                }`}
              >
                {u === 'h' ? 'Stunden' : 'FTE'}
              </button>
            ))}
          </div>
          <button className="btn-outline text-xs" onClick={exportCsv}>
            CSV
          </button>
        </div>
      </div>

      {/* interactive legend */}
      <div className="mb-3 mt-3 flex flex-wrap gap-2">
        {series.map((s) => {
          const off = hidden.has(s.id)
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`chip border transition-opacity ${off ? 'opacity-40' : ''} border-ink-200 bg-white text-ink-700`}
              aria-pressed={!off}
            >
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{
                  background: s.color,
                  backgroundImage:
                    s.status === 'planned'
                      ? `repeating-linear-gradient(45deg, ${s.color} 0 2.5px, ${s.color}44 2.5px 5px)`
                      : undefined,
                }}
              />
              {s.name}
              {s.status === 'planned' && <span className="text-ink-400">· geplant</span>}
            </button>
          )
        })}
        {hasCapacity && (
          <span className="chip ml-auto bg-accent-50 text-accent-600">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-accent-500" />
            Personal-Kapazität · Spitze {fmt(peakCap)} {unitLabel}/Monat
          </span>
        )}
      </div>

      {!hasData ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={monthlyData} margin={{ top: 28, right: 16, left: 4, bottom: 4 }}>
            <defs>
              {series.map((s) =>
                s.status === 'planned' ? (
                  <pattern
                    key={s.id}
                    id={`hatch-${s.id}`}
                    patternUnits="userSpaceOnUse"
                    width="8"
                    height="8"
                    patternTransform="rotate(45)"
                  >
                    <rect width="8" height="8" fill={s.color} fillOpacity="0.28" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke={s.color} strokeWidth="3.5" />
                  </pattern>
                ) : (
                  <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity="0.85" />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0.35" />
                  </linearGradient>
                ),
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#475569' }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              interval={2}
              minTickGap={8}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
              width={54}
              domain={[0, Math.ceil(maxTotal * 1.12) || 1]}
              tickFormatter={(v) => fmt(v)}
              label={{
                value: unitLabel,
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#94a3b8' },
              }}
            />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
              content={<CustomTooltip unit={unitLabel} series={series} />}
            />
            {/* faint year separators */}
            {yearStarts.map((r, i) =>
              i === 0 ? null : (
                <ReferenceLine
                  key={r.year}
                  x={r.label}
                  stroke="#cbd5e1"
                  strokeDasharray="2 3"
                  label={{
                    value: r.year,
                    position: 'insideTopLeft',
                    fill: '#94a3b8',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              ),
            )}
            {series.map((s) => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                stackId="load"
                hide={hidden.has(s.id)}
                stroke={s.color}
                strokeWidth={1.5}
                fill={s.status === 'planned' ? `url(#hatch-${s.id})` : `url(#grad-${s.id})`}
                fillOpacity={1}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
            {/* silhouette line tracing the top of the demand mountain */}
            <Line
              type="monotone"
              dataKey="__total"
              stroke="#0f172a"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#0f172a', strokeWidth: 0 }}
              isAnimationActive={false}
              legendType="none"
            />
            {/* monthly personnel capacity line */}
            {hasCapacity && (
              <Line
                type="monotone"
                dataKey="__cap"
                stroke="#d97706"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 3, fill: '#d97706', strokeWidth: 0 }}
                isAnimationActive={false}
                legendType="none"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-ink-200 text-center">
      <p className="text-sm font-semibold text-ink-600">Noch keine Daten</p>
      <p className="mt-1 max-w-xs text-xs text-ink-400">
        Legen Sie ein Projekt an und laden Sie eine Excel-Vorlage in ein Teilprojekt, um das
        Ressourcen-Bedarfsgebirge zu sehen.
      </p>
    </div>
  )
}
