import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  Brush,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  projectPositionBreakdown,
  subPositionBreakdown,
  monthlyPositionSeries,
} from '../lib/resource.js'
import { shade, PROJECT_PALETTE, POSITION_PALETTE } from '../lib/colors.js'
import { fmt } from '../lib/util.js'
import { IconChart } from './icons.jsx'
import YAxisZoom, { yMaxForZoom } from './YAxisZoom.jsx'

const truncate = (v, n = 30) => (v && v.length > n ? v.slice(0, n - 1) + '…' : v)
const chartHeight = (rows) => Math.max(150, rows.length * 26 + 56)

// Stable color per work group, drawn from the project palette.
function workGroupColors(groups) {
  const map = {}
  groups.forEach((g, i) => (map[g] = PROJECT_PALETTE[i % PROJECT_PALETTE.length]))
  return map
}

function ProjectTooltip({ active, payload, label, subNames }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value > 0)
  const total = rows.reduce((a, p) => a + p.value, 0)
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3 text-xs shadow-pop">
      <div className="mb-1.5 max-w-[240px] font-bold text-ink-900">{label}</div>
      <div className="space-y-1">
        {rows.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.fill }} />
            <span className="flex-1 text-ink-600">{p.dataKey}</span>
            <span className="tnum font-semibold text-ink-900">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
      {subNames.length > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-1.5">
          <span className="font-semibold text-ink-700">Gesamt</span>
          <span className="tnum font-bold text-ink-900">{fmt(total)} Std</span>
        </div>
      )}
    </div>
  )
}

function SimpleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-2.5 text-xs shadow-pop">
      <div className="mb-0.5 max-w-[240px] font-bold text-ink-900">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-ink-500">{p.payload.workGroup}</span>
        <span className="tnum ml-auto font-bold text-ink-900">{fmt(p.value)} Std</span>
      </div>
    </div>
  )
}

// One project → stacked horizontal bars (position × sub-project).
function ProjectCard({ project }) {
  const rows = useMemo(() => projectPositionBreakdown(project), [project])
  const subNames = project.subProjects.map((s) => s.name)
  const [hidden, setHidden] = useState(() => new Set()) // sub-projects hidden via legend
  const toggle = (name) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  const data = rows.map((r) => ({ position: r.position, total: r.total, ...r.bySub }))
  const top = rows[0]

  if (!rows.length)
    return (
      <div className="card p-5">
        <CardHead project={project} />
        <p className="mt-3 text-sm text-ink-400">Keine Stunden erfasst.</p>
      </div>
    )

  return (
    <div className="card p-5">
      <CardHead project={project} top={top} count={rows.length} />
      {subNames.length > 1 && (
        <div className="mb-2 mt-3 flex flex-wrap gap-2">
          {subNames.map((name, i) => {
            const off = hidden.has(name)
            return (
              <button
                key={name}
                onClick={() => toggle(name)}
                className={`chip border border-ink-200 bg-white text-ink-700 transition-opacity ${off ? 'opacity-40' : ''}`}
                aria-pressed={!off}
                title={off ? 'Einblenden' : 'Ausblenden'}
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: shade(project.color, i * 0.24) }}
                />
                {name}
              </button>
            )
          })}
        </div>
      )}
      <ResponsiveContainer width="100%" height={chartHeight(rows)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmt(v)} />
          <YAxis
            type="category"
            dataKey="position"
            width={210}
            tick={{ fontSize: 11, fill: '#334155' }}
            tickFormatter={(v) => truncate(v, 32)}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ProjectTooltip subNames={subNames} />} />
          {subNames.map((name, i) => (
            <Bar
              key={name}
              dataKey={name}
              stackId="a"
              hide={hidden.has(name)}
              fill={shade(project.color, i * 0.24)}
              radius={i === subNames.length - 1 ? [0, 3, 3, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// One sub-project → horizontal bars per position, colored by work group.
function SubCard({ project, sub }) {
  const rows = useMemo(() => subPositionBreakdown(sub), [sub])
  const groups = [...new Set(rows.map((r) => r.workGroup))]
  const colors = workGroupColors(groups)
  const top = rows[0]

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: project.color }} />
            <span className="truncate text-xs font-semibold text-ink-400">{project.name}</span>
          </div>
          <h3 className="truncate text-base font-bold text-ink-900">{sub.name}</h3>
        </div>
        {top && (
          <div className="shrink-0 rounded-lg bg-ink-50 px-3 py-1.5 text-right">
            <div className="text-[11px] text-ink-400">Meist genutzt</div>
            <div className="max-w-[200px] truncate text-sm font-bold text-ink-800" title={top.position}>
              {top.position}
            </div>
          </div>
        )}
      </div>
      {groups.length > 1 && (
        <div className="mb-2 mt-3 flex flex-wrap gap-2">
          {groups.map((g) => (
            <span key={g} className="chip border border-ink-200 bg-white text-ink-700">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: colors[g] }} />
              {g}
            </span>
          ))}
        </div>
      )}
      {!rows.length ? (
        <p className="mt-3 text-sm text-ink-400">Keine Stunden erfasst.</p>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight(rows)}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmt(v)} />
            <YAxis
              type="category"
              dataKey="position"
              width={210}
              tick={{ fontSize: 11, fill: '#334155' }}
              tickFormatter={(v) => truncate(v, 32)}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: '#f1f5f9' }} content={<SimpleTooltip />} />
            <Bar dataKey="hours" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.position} fill={colors[r.workGroup]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function CardHead({ project, top, count }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: project.color }} />
          <h3 className="truncate text-base font-bold text-ink-900">{project.name}</h3>
          <span
            className={`chip ${project.status === 'awarded' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}
          >
            {project.status === 'awarded' ? 'beauftragt' : 'geplant'}
          </span>
        </div>
        {count != null && (
          <p className="mt-0.5 text-xs text-ink-400">
            {count} Positionen · über {project.subProjects.length} Teilprojekt(e)
          </p>
        )}
      </div>
      {top && (
        <div className="shrink-0 rounded-lg bg-brand-50 px-3 py-1.5 text-right">
          <div className="text-[11px] text-brand-600">Meist genutzte Position</div>
          <div className="max-w-[220px] truncate text-sm font-bold text-brand-800" title={top.position}>
            {top.position}
          </div>
          <div className="tnum text-xs font-semibold text-brand-700">{fmt(top.total)} Std</div>
        </div>
      )}
    </div>
  )
}

// ---- mount-chart (stacked area over months, stacked by position) -----------

function AreaTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value)
  const total = rows.reduce((a, p) => a + p.value, 0)
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3 text-xs shadow-pop">
      <div className="mb-1.5 font-bold text-ink-900">{label}</div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {rows.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="min-w-0 max-w-[190px] flex-1 truncate text-ink-600" title={p.name}>
              {p.name}
            </span>
            <span className="tnum shrink-0 font-semibold text-ink-900">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-1.5">
        <span className="font-semibold text-ink-700">Gesamt</span>
        <span className="tnum font-bold text-ink-900">{fmt(total)} Std</span>
      </div>
    </div>
  )
}

// Monthly stacked-area chart of the given positions (which month uses which role).
function PositionMountChart({ positions, topN }) {
  const { data, series } = useMemo(
    () => monthlyPositionSeries(positions, POSITION_PALETTE, topN ? { topN } : undefined),
    [positions, topN],
  )
  const [yZoom, setYZoom] = useState(1) // vertical-axis zoom: 1 = full range
  const [brushRange, setBrushRange] = useState(null) // controlled horizontal window
  const [hidden, setHidden] = useState(() => new Set()) // series hidden via legend
  const toggle = (key) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  // peak stacked total across VISIBLE series → base for the value-axis domain
  const peak = useMemo(
    () =>
      Math.max(
        1,
        ...data.map((row) =>
          series.reduce((a, s) => a + (hidden.has(s.key) ? 0 : row[s.key] || 0), 0),
        ),
      ),
    [data, series, hidden],
  )
  if (!data.length || !series.length)
    return <p className="mt-3 text-sm text-ink-400">Keine monatlichen Daten.</p>
  const brushEnd = Math.min(23, data.length - 1)
  const yMax = yMaxForZoom(peak * 1.05, yZoom)
  // Controlled horizontal window so the vertical-zoom re-render doesn't snap the
  // Brush back to its default position — it stays where the user left it.
  const brushIdx = brushRange || { startIndex: 0, endIndex: brushEnd }
  const onBrushChange = (r) => {
    if (r && r.startIndex != null && r.endIndex != null)
      setBrushRange({ startIndex: r.startIndex, endIndex: r.endIndex })
  }
  return (
    <>
      <div className="mb-2 mt-3 flex flex-wrap items-center gap-1.5">
        {series.length > 1 && (
          <div className="inline-flex rounded-lg border border-ink-200 p-0.5">
            <button
              onClick={() => setHidden(new Set())}
              className="rounded-md px-2 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-100"
            >
              Alle
            </button>
            <button
              onClick={() => setHidden(new Set(series.map((s) => s.key)))}
              className="rounded-md px-2 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-100"
            >
              Keine
            </button>
          </div>
        )}
        {series.map((s) => {
          const off = hidden.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`chip border border-ink-200 bg-white text-ink-700 transition-opacity ${off ? 'opacity-40' : ''}`}
              aria-pressed={!off}
              title={off ? 'Einblenden' : 'Ausblenden'}
            >
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="max-w-[170px] truncate">{s.name}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-stretch">
        <YAxisZoom zoom={yZoom} setZoom={setYZoom} height={400} />
        <div className="min-w-0 flex-1">
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`pa-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.85" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.4" />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[0, yMax]}
            allowDataOverflow
            tickFormatter={(v) => fmt(v)}
          />
          <Tooltip content={<AreaTooltip />} />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stackId="p"
              hide={hidden.has(s.key)}
              stroke={s.color}
              strokeWidth={1}
              fill={`url(#pa-${i})`}
              isAnimationActive={false}
              dot={false}
            />
          ))}
          {data.length > 13 && (
            <Brush
              dataKey="label"
              height={22}
              travellerWidth={8}
              stroke="#94a3b8"
              fill="#f8fafc"
              startIndex={brushIdx.startIndex}
              endIndex={brushIdx.endIndex}
              onChange={onBrushChange}
              tickFormatter={(v) => String(v).slice(-2)}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

function ProjectAreaCard({ project }) {
  const rows = useMemo(() => projectPositionBreakdown(project), [project])
  const positions = project.subProjects.flatMap((s) => s.positions)
  return (
    <div className="card p-5">
      <CardHead project={project} top={rows[0]} count={rows.length} />
      <PositionMountChart positions={positions} />
    </div>
  )
}

function SubAreaCard({ project, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: project.color }} />
        <span className="truncate text-xs font-semibold text-ink-400">{project.name}</span>
        <span className="text-ink-300">·</span>
        <h3 className="truncate text-base font-bold text-ink-900">{sub.name}</h3>
      </div>
      <PositionMountChart positions={sub.positions} />
    </div>
  )
}

// ---- "Nach Position": pick one or more positions, compare their total demand
//      summed across ALL shown projects. Add/remove single or multiple roles.

const positionTotal = (pos) =>
  pos.totalHours ||
  Object.values(pos.hoursByPeriod || {}).reduce((a, b) => a + (Number(b) || 0), 0) ||
  Object.values(pos.months || {}).reduce(
    (a, arr) => a + (arr || []).reduce((x, y) => x + (Number(y) || 0), 0),
    0,
  )

// Horizontal total-hours bars, one per selected position (across all projects).
function PositionTotalsBars({ rows }) {
  return (
    <ResponsiveContainer width="100%" height={chartHeight(rows)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmt(v)} />
        <YAxis
          type="category"
          dataKey="position"
          width={210}
          tick={{ fontSize: 11, fill: '#334155' }}
          tickFormatter={(v) => truncate(v, 32)}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: '#f1f5f9' }} content={<SimpleTooltip />} />
        <Bar dataKey="hours" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.position} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function PositionCompareView({ projects, style }) {
  const allPos = useMemo(
    () => projects.flatMap((p) => p.subProjects.flatMap((s) => s.positions)),
    [projects],
  )
  // Catalog of unique position names with total hours across all projects.
  const catalog = useMemo(() => {
    const map = new Map()
    for (const pos of allPos) {
      const cur = map.get(pos.position) || {
        position: pos.position,
        workGroup: pos.workGroup,
        total: 0,
      }
      cur.total += positionTotal(pos)
      map.set(pos.position, cur)
    }
    return [...map.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total)
  }, [allPos])

  const [selected, setSelected] = useState(() => catalog.slice(0, 1).map((c) => c.position))

  // Prune selections that disappear when the project filter changes; seed the
  // first position on the very first load so the chart is never empty.
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    const names = new Set(catalog.map((c) => c.position))
    setSelected((sel) => {
      const pruned = sel.filter((n) => names.has(n))
      if (pruned.length === 0 && !touched && catalog.length) return [catalog[0].position]
      return pruned
    })
  }, [catalog, touched])

  const add = (name) => {
    if (!name) return
    setTouched(true)
    setSelected((sel) => (sel.includes(name) ? sel : [...sel, name]))
  }
  const remove = (name) => {
    setTouched(true)
    setSelected((sel) => sel.filter((n) => n !== name))
  }

  // Colour by total-desc rank so chips / bars / area all agree.
  const orderedSel = useMemo(
    () =>
      selected
        .map((name) => catalog.find((c) => c.position === name))
        .filter(Boolean)
        .sort((a, b) => b.total - a.total),
    [selected, catalog],
  )
  const colorFor = (i) => POSITION_PALETTE[i % POSITION_PALETTE.length]
  const selectedPositions = useMemo(
    () => allPos.filter((p) => selected.includes(p.position)),
    [allPos, selected],
  )
  const barRows = orderedSel.map((c, i) => ({
    position: c.position,
    workGroup: c.workGroup,
    hours: c.total,
    color: colorFor(i),
  }))
  const remaining = catalog.filter((c) => !selected.includes(c.position))

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-ink-900">Positionsvergleich</h3>
        <span className="text-sm text-ink-400">— Gesamtbedarf über alle Projekte</span>
      </div>

      {/* selected positions as removable chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {orderedSel.map((c, i) => (
          <span
            key={c.position}
            className="chip border border-ink-200 bg-white text-ink-700"
            title={c.position}
          >
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: colorFor(i) }} />
            <span className="max-w-[190px] truncate">{c.position}</span>
            <span className="tnum text-ink-400">{fmt(c.total)}</span>
            <button
              onClick={() => remove(c.position)}
              className="ml-0.5 rounded px-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Position entfernen"
            >
              ×
            </button>
          </span>
        ))}
        {remaining.length > 0 && (
          <select
            value=""
            onChange={(e) => add(e.target.value)}
            className="rounded-lg border border-dashed border-ink-300 bg-white px-2.5 py-1 text-sm text-ink-600 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">＋ Position hinzufügen…</option>
            {remaining.map((c) => (
              <option key={c.position} value={c.position}>
                {c.position} ({fmt(c.total)} Std)
              </option>
            ))}
          </select>
        )}
        {selected.length > 1 && (
          <button
            onClick={() => {
              setTouched(true)
              setSelected([])
            }}
            className="btn-ghost text-xs"
          >
            Alle entfernen
          </button>
        )}
      </div>

      {orderedSel.length === 0 ? (
        <p className="mt-4 text-sm text-ink-400">
          Wählen Sie oben mindestens eine Position, um den Verlauf zu sehen.
        </p>
      ) : style === 'area' ? (
        <PositionMountChart positions={selectedPositions} topN={Math.max(1, selected.length)} />
      ) : (
        <div className="mt-4">
          <PositionTotalsBars rows={barRows} />
        </div>
      )}
    </div>
  )
}

export default function PositionAnalysis({ projects }) {
  const [mode, setMode] = useState('project') // 'project' | 'sub' | 'position'
  const [style, setStyle] = useState('area') // 'area' (Gebirge) | 'bars'
  const [projectId, setProjectId] = useState('all')

  const shown = projectId === 'all' ? projects : projects.filter((p) => p.id === projectId)
  const withData = shown.filter((p) => p.subProjects.some((s) => s.positions.length))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-ink-300 p-0.5">
          {[
            ['project', 'Nach Projekt'],
            ['sub', 'Nach Teilprojekt'],
            ['position', 'Nach Position'],
          ].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                mode === m ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-ink-300 p-0.5">
          {[
            ['area', 'Gebirge'],
            ['bars', 'Balken'],
          ].map(([st, label]) => (
            <button
              key={st}
              onClick={() => setStyle(st)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                style === st ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {projects.length > 1 && (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="all">Alle Projekte</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <p className="text-sm text-ink-500">
          {mode === 'position'
            ? style === 'area'
              ? 'Ausgewählte Positionen — monatlicher Gesamtbedarf über alle Projekte.'
              : 'Ausgewählte Positionen — Gesamtstunden über alle Projekte.'
            : style === 'area'
              ? 'Monatlicher Bedarf je Position — welcher Monat nutzt welche Position.'
              : 'Welche Position wird am meisten benötigt — gestapelt nach Teilprojekt.'}
        </p>
      </div>

      {withData.length === 0 ? (
        <div className="card flex h-64 flex-col items-center justify-center text-center">
          <IconChart width={28} height={28} className="text-ink-300" />
          <p className="mt-2 text-sm font-semibold text-ink-600">Keine Daten</p>
          <p className="mt-1 max-w-xs text-xs text-ink-400">
            Laden Sie unter „Projektdaten“ Excel-Vorlagen hoch, um die Positionsauslastung zu sehen.
          </p>
        </div>
      ) : mode === 'position' ? (
        <PositionCompareView projects={withData} style={style} />
      ) : mode === 'project' ? (
        <div className="space-y-5">
          {withData.map((p) =>
            style === 'area' ? (
              <ProjectAreaCard key={p.id} project={p} />
            ) : (
              <ProjectCard key={p.id} project={p} />
            ),
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {withData.flatMap((p) =>
            p.subProjects
              .filter((s) => s.positions.length)
              .map((s) =>
                style === 'area' ? (
                  <SubAreaCard key={s.id} project={p} sub={s} />
                ) : (
                  <SubCard key={s.id} project={p} sub={s} />
                ),
              ),
          )}
        </div>
      )}
    </div>
  )
}
