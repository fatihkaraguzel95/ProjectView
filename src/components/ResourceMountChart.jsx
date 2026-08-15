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
  Brush,
  ResponsiveContainer,
} from 'recharts'
import { mountMonthlyData, monthlyCapacityHoursForYear } from '../lib/resource.js'
import { fmt } from '../lib/util.js'
import { IconX } from './icons.jsx'

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function CustomTooltip({ active, payload, label, unit, breakdownByKey, grain, format = fmt }) {
  if (!active || !payload?.length) return null
  const total = payload.find((p) => p.dataKey === '__total')?.value ?? 0
  const cap = payload.find((p) => p.dataKey === '__cap')?.value ?? 0
  const overCap = cap > 0 && total > cap

  // full demand breakdown for the hovered period: project → sub-project → positions
  const row = payload[0]?.payload
  const key = row ? (grain === 'year' ? String(row.year) : `${row.year}-${row.m}`) : null
  const groups = (key && breakdownByKey?.get(key)) || []

  return (
    <div className="w-72 rounded-lg border border-ink-200 bg-white p-3 text-xs shadow-pop">
      <div className="mb-2 font-bold text-ink-900">{label}</div>

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {groups.map((g) => (
          <div key={g.id}>
            {/* project header */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{
                  background: g.color,
                  backgroundImage:
                    g.status === 'planned'
                      ? `repeating-linear-gradient(45deg, ${g.color} 0 2px, transparent 2px 4px)`
                      : undefined,
                }}
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-ink-800" title={g.name}>
                {g.name}
                {g.status === 'planned' && <span className="text-ink-400"> (geplant)</span>}
              </span>
              <span className="tnum shrink-0 font-bold text-ink-900">{format(g.hours)}</span>
            </div>

            {/* sub-projects, each with its own positions */}
            <div className="ml-1 mt-1 space-y-1.5 border-l border-ink-100 pl-2">
              {g.subs.map((s) => (
                <div key={s.name}>
                  {g.subs.length > 1 && (
                    <div className="flex items-center gap-2 font-semibold text-ink-600">
                      <span className="min-w-0 flex-1 truncate" title={s.name}>
                        {s.name}
                      </span>
                      <span className="tnum shrink-0">{format(s.hours)}</span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {s.positions.slice(0, 6).map((p) => (
                      <div key={p.position} className="flex items-center gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-ink-500"
                          title={p.position}
                        >
                          {p.position}
                        </span>
                        <span className="tnum shrink-0 text-ink-700">{format(p.hours)}</span>
                      </div>
                    ))}
                    {s.positions.length > 6 && (
                      <div className="flex items-center gap-2 text-ink-400">
                        <span className="flex-1">+ {s.positions.length - 6} weitere</span>
                        <span className="tnum shrink-0">
                          {format(s.positions.slice(6).reduce((a, p) => a + p.hours, 0))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2">
        <span className="font-semibold text-ink-700">Gesamtbedarf</span>
        <span className={`tnum font-bold ${overCap ? 'text-red-600' : 'text-ink-900'}`}>
          {format(total)} {unit}
        </span>
      </div>
      {cap > 0 && (
        <div className="mt-1 flex items-center justify-between text-accent-600">
          <span>Kapazität (Personal)</span>
          <span className="tnum">
            {format(cap)} {unit}
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
  const [grain, setGrain] = useState('month') // 'month' | 'year' — time scale
  const [pinned, setPinned] = useState(null) // clicked period row, kept on screen
  const hoursPerFTE = settings?.hoursPerFTEPerYear || 1600

  const { data, series } = useMemo(() => mountMonthlyData(projects), [projects])
  // FTE = person-equivalents. Per MONTH that is hours ÷ (annual FTE hours ÷ 12),
  // per YEAR it is hours ÷ annual FTE hours. Using the annual figure on monthly
  // values made a 12 h/month need read as 0.0075 FTE (≈ 0); this keeps it ≈ 0,09.
  const fteHours = grain === 'year' ? hoursPerFTE : hoursPerFTE / 12
  const divisor = unit === 'fte' ? fteHours : 1
  // FTE numbers are small → show one decimal; hours stay whole.
  const fmtV = (v) => (unit === 'fte' ? fmt(v, v !== 0 && Math.abs(v) < 10 ? 2 : 1) : fmt(v))

  // capacity per (year, month) in hours — the head-count grid is year-specific
  const capByYear = useMemo(() => {
    const years = [...new Set(data.map((r) => String(r.year)))]
    const map = {}
    for (const y of years) map[y] = monthlyCapacityHoursForYear(headcount, settings, y)
    return map
  }, [data, headcount, settings])
  const hasCapacity = Object.values(capByYear).some((v) => v.some((x) => x > 0))

  const visibleSeries = series.filter((s) => !hidden.has(s.id))

  // Real monthly demand rows straight from the Excel data.
  const monthlyData = useMemo(() => {
    return data.map((row) => {
      const y = String(row.year)
      const cap = capByYear[y] || []
      const out = {
        label: `${MONTHS[row.m]} ${y.slice(-2)}`,
        year: y,
        m: row.m,
        isYearStart: row.m === 0,
      }
      let total = 0
      for (const s of series) {
        const v = hidden.has(s.id) ? 0 : (row[s.id] || 0) / divisor
        out[s.id] = v
        if (!hidden.has(s.id)) total += v
      }
      out.__total = total
      out.__cap = (cap[row.m] || 0) / divisor
      return out
    })
  }, [data, series, hidden, divisor, capByYear])

  // Yearly roll-up: sum each project's 12 months into one bar per year. Reuses
  // monthlyData so hidden series / unit conversion are already applied.
  const yearlyData = useMemo(() => {
    const byYear = new Map()
    for (const row of monthlyData) {
      let acc = byYear.get(row.year)
      if (!acc) {
        acc = { label: row.year, year: row.year, isYearStart: false, __total: 0, __cap: 0 }
        for (const s of series) acc[s.id] = 0
        byYear.set(row.year, acc)
      }
      for (const s of series) acc[s.id] += row[s.id] || 0
      acc.__total += row.__total
      acc.__cap += row.__cap
    }
    return [...byYear.values()]
  }, [monthlyData, series])

  const chartData = grain === 'year' ? yearlyData : monthlyData

  // Per-period demand broken down by project → sub-project → position (which
  // roles & how much). Keyed by year (yearly) or `${year}-${m}`. Only visible
  // projects; hours already divided by the active unit.
  const breakdownByKey = useMemo(() => {
    // key -> Map(projectId -> { project, subs: Map(subName -> Map(position -> hours)) })
    const acc = new Map()
    const bump = (key, project, subName, position, val) => {
      let byProj = acc.get(key)
      if (!byProj) {
        byProj = new Map()
        acc.set(key, byProj)
      }
      let g = byProj.get(project.id)
      if (!g) {
        g = { project, subs: new Map() }
        byProj.set(project.id, g)
      }
      let sub = g.subs.get(subName)
      if (!sub) {
        sub = new Map()
        g.subs.set(subName, sub)
      }
      sub.set(position, (sub.get(position) || 0) + val)
    }
    for (const p of projects) {
      if (hidden.has(p.id)) continue
      for (const sp of p.subProjects || []) {
        for (const pos of sp.positions || []) {
          for (const [year, arr] of Object.entries(pos.months || {})) {
            for (let mo = 0; mo < 12; mo++) {
              const v = Number(arr[mo]) || 0
              if (!v) continue
              bump(grain === 'year' ? String(year) : `${year}-${mo}`, p, sp.name, pos.position, v)
            }
          }
        }
      }
    }
    // shape into sorted, unit-scaled arrays
    const out = new Map()
    for (const [key, byProj] of acc) {
      const groups = [...byProj.values()]
        .map(({ project, subs }) => {
          const subArr = [...subs.entries()]
            .map(([name, posMap]) => {
              const positions = [...posMap.entries()]
                .map(([position, h]) => ({ position, hours: h / divisor }))
                .sort((a, b) => b.hours - a.hours)
              return { name, hours: positions.reduce((a, x) => a + x.hours, 0), positions }
            })
            .sort((a, b) => b.hours - a.hours)
          return {
            id: project.id,
            name: project.name,
            color: project.color,
            status: project.status,
            hours: subArr.reduce((a, s) => a + s.hours, 0),
            subs: subArr,
          }
        })
        .sort((a, b) => b.hours - a.hours)
      out.set(key, groups)
    }
    return out
  }, [projects, hidden, grain, divisor])

  const toggle = (id) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const exportCsv = () => {
    const header = [grain === 'year' ? 'Jahr' : 'Monat', ...series.map((s) => s.name), 'Gesamt', 'Kapazität']
    const lines = [header.join(';')]
    for (const row of chartData) {
      const vals = series.map((s) => Math.round((row[s.id] || 0) * 100) / 100)
      lines.push(
        [row.label, ...vals, Math.round(row.__total * 100) / 100, Math.round(row.__cap * 100) / 100].join(';'),
      )
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `resource-mount-${grain}-${unit}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const unitLabel = unit === 'fte' ? 'FTE' : 'Std'
  const perLabel = grain === 'year' ? 'Jahr' : 'Monat'
  const hasData = series.length > 0 && data.some((r) => visibleSeries.some((s) => r[s.id] > 0))
  const maxTotal = Math.max(0, ...chartData.map((r) => Math.max(r.__total, r.__cap)))
  const yearStarts = chartData.filter((r) => r.isYearStart)
  const peakCap = Math.max(0, ...chartData.map((r) => r.__cap))
  // default zoom window: monthly view starts with ~2 years, then pan right
  const brushStart = 0
  const brushEnd =
    grain === 'month' ? Math.min(23, Math.max(0, chartData.length - 1)) : chartData.length - 1

  // pinned (clicked) period → full breakdown for the fixed detail panel
  const pinnedKey = pinned ? (grain === 'year' ? String(pinned.year) : `${pinned.year}-${pinned.m}`) : null
  const pinnedGroups = (pinnedKey && breakdownByKey.get(pinnedKey)) || []
  const handleChartClick = (e) => {
    const row = e?.activePayload?.[0]?.payload
    if (!row) return
    setPinned((cur) => (cur && cur.label === row.label ? null : row))
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">Resource Mount Chart</h2>
          <p className="text-sm text-ink-500">
            Ressourcen-Bedarfsgebirge pro {perLabel} · gestapelt nach Projekt · geplante Projekte
            schraffiert · Personal-Kapazitätslinie
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-300 p-0.5">
            {[
              ['month', 'Monat'],
              ['year', 'Jahr'],
            ].map(([g, label]) => (
              <button
                key={g}
                onClick={() => {
                  setGrain(g)
                  setPinned(null)
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  grain === g ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
        {series.length > 1 && (
          <div className="inline-flex rounded-lg border border-ink-200 p-0.5">
            <button
              onClick={() => setHidden(new Set())}
              className="rounded-md px-2 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-100"
            >
              Alle
            </button>
            <button
              onClick={() => setHidden(new Set(series.map((s) => s.id)))}
              className="rounded-md px-2 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-100"
            >
              Keine
            </button>
          </div>
        )}
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
            Personal-Kapazität · Spitze {fmtV(peakCap)} {unitLabel}/{perLabel}
          </span>
        )}
      </div>

      {!hasData ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height={540}>
          <ComposedChart
            data={chartData}
            margin={{ top: 28, right: 16, left: 4, bottom: 4 }}
            onClick={handleChartClick}
            style={{ cursor: 'pointer' }}
          >
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
              tick={{ fontSize: grain === 'year' ? 12 : 10, fill: '#475569' }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              interval={grain === 'year' ? 0 : 'preserveStartEnd'}
              minTickGap={8}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#475569' }}
              tickLine={false}
              axisLine={false}
              width={54}
              domain={[0, maxTotal * 1.12 || 1]}
              tickFormatter={(v) => fmtV(v)}
              label={{
                value: unitLabel,
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#94a3b8' },
              }}
            />
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
              content={
                <CustomTooltip
                  unit={unitLabel}
                  breakdownByKey={breakdownByKey}
                  grain={grain}
                  format={fmtV}
                />
              }
            />
            {/* faint year separators (monthly view only) */}
            {grain === 'month' && yearStarts.map((r, i) =>
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
            {/* scrollable zoom window — drag the handles to scale, slide to pan years */}
            <Brush
              key={grain}
              dataKey="label"
              height={26}
              travellerWidth={9}
              stroke="#94a3b8"
              fill="#f8fafc"
              startIndex={brushStart}
              endIndex={brushEnd}
              tickFormatter={(v) => (grain === 'year' ? v : String(v).slice(-2))}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* hint + pinned full-detail panel (click a point to freeze it) */}
      {hasData && !pinned && (
        <p className="mt-2 text-center text-xs text-ink-400">
          Tipp: Klicken Sie auf einen Punkt, um alle Details (Teilprojekte & Positionen) fixiert
          anzuzeigen.
        </p>
      )}
      {pinned && (
        <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-ink-900">Detail · {pinned.label}</h3>
              <span className="chip bg-white text-ink-700">
                Gesamt {fmtV(pinned.__total)} {unitLabel}
              </span>
              {pinned.__cap > 0 && (
                <span
                  className={`chip ${pinned.__total > pinned.__cap ? 'bg-red-50 text-red-600' : 'bg-accent-50 text-accent-600'}`}
                >
                  Kapazität {fmtV(pinned.__cap)} {unitLabel}
                  {pinned.__total > pinned.__cap && ' · Überlast'}
                </span>
              )}
            </div>
            <button
              onClick={() => setPinned(null)}
              className="btn-ghost shrink-0 p-1 text-ink-400 hover:text-red-600"
              title="Schließen"
            >
              <IconX width={16} height={16} />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-ink-400">
            Fixiert per Klick · alle Teilprojekte &amp; benötigten Positionen
          </p>

          {pinnedGroups.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">Kein Bedarf in dieser Periode.</p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pinnedGroups.flatMap((g) =>
                g.subs.map((s) => (
                  <div
                    key={`${g.id}-${s.name}`}
                    className="rounded-lg border border-ink-200 bg-white p-3"
                  >
                    <div className="flex items-center gap-2 border-b border-ink-100 pb-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-sm"
                        style={{
                          background: g.color,
                          backgroundImage:
                            g.status === 'planned'
                              ? `repeating-linear-gradient(45deg, ${g.color} 0 2px, transparent 2px 4px)`
                              : undefined,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold text-ink-500" title={g.name}>
                          {g.name}
                          {g.status === 'planned' && ' (geplant)'}
                        </div>
                        <div className="truncate text-sm font-bold text-ink-900" title={s.name}>
                          {s.name}
                        </div>
                      </div>
                      <span className="tnum shrink-0 text-sm font-extrabold text-brand-700">
                        {fmtV(s.hours)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {s.positions.map((p) => (
                        <div key={p.position} className="flex items-center gap-2 text-xs">
                          <span
                            className="min-w-0 flex-1 truncate text-ink-600"
                            title={p.position}
                          >
                            {p.position}
                          </span>
                          <span className="tnum shrink-0 font-semibold text-ink-800">
                            {fmtV(p.hours)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )),
              )}
            </div>
          )}
        </div>
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
