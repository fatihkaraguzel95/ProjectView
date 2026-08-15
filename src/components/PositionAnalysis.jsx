import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { projectPositionBreakdown, subPositionBreakdown } from '../lib/resource.js'
import { shade, PROJECT_PALETTE } from '../lib/colors.js'
import { fmt } from '../lib/util.js'
import { IconChart } from './icons.jsx'

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
          {subNames.map((name, i) => (
            <span key={name} className="chip border border-ink-200 bg-white text-ink-700">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: shade(project.color, i * 0.24) }}
              />
              {name}
            </span>
          ))}
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

export default function PositionAnalysis({ projects }) {
  const [mode, setMode] = useState('project') // 'project' | 'sub'
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
          Welche Position wird am meisten benötigt — gestapelt nach Teilprojekt.
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
      ) : mode === 'project' ? (
        <div className="space-y-5">
          {withData.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {withData.flatMap((p) =>
            p.subProjects
              .filter((s) => s.positions.length)
              .map((s) => <SubCard key={s.id} project={p} sub={s} />),
          )}
        </div>
      )}
    </div>
  )
}
