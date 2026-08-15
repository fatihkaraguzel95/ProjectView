// Aggregation helpers that turn the project tree into chart-ready data.

export function allPeriods(projects) {
  const set = new Set()
  for (const p of projects)
    for (const sp of p.subProjects) for (const per of sp.periods || []) set.add(per)
  return [...set].sort()
}

export function allWorkGroups(projects) {
  const set = new Set()
  for (const p of projects)
    for (const sp of p.subProjects) for (const pos of sp.positions) set.add(pos.workGroup)
  return [...set].sort()
}

// Unique list of Personalkosten job positions across all sub-projects,
// grouped by their work group. Returns [{ workGroup, position }].
export function allPositions(projects) {
  const map = new Map() // position -> workGroup
  for (const p of projects)
    for (const sp of p.subProjects)
      for (const pp of sp.personalPositions || []) {
        if (!map.has(pp.position)) map.set(pp.position, pp.workGroup || 'Personal')
      }
  return [...map.entries()]
    .map(([position, workGroup]) => ({ position, workGroup }))
    .sort((a, b) =>
      a.workGroup === b.workGroup
        ? a.position.localeCompare(b.position)
        : a.workGroup.localeCompare(b.workGroup),
    )
}

// Years that can hold capacity data = the timeline periods across all projects.
export function capacityYears(projects) {
  return allPeriods(projects)
}

// Total head-count (persons) per month (Jan..Dez) for one year, summed over
// all positions. headcount shape: { [position]: { [year]: number[12] } }.
export function monthlyHeadcountForYear(headcount, year) {
  const out = Array(12).fill(0)
  for (const perYear of Object.values(headcount || {})) {
    const arr = perYear && perYear[year]
    if (!Array.isArray(arr)) continue
    for (let m = 0; m < 12; m++) out[m] += Number(arr[m]) || 0
  }
  return out
}

// Available capacity in HOURS per month for one year:
// persons-in-month × (FTE hours per year ÷ 12).
export function monthlyCapacityHoursForYear(headcount, settings, year) {
  const perMonth = (settings?.hoursPerFTEPerYear || 1600) / 12
  return monthlyHeadcountForYear(headcount, year).map((n) => n * perMonth)
}

// Total hours for a project in a given period (sum across sub-projects & positions).
export function projectHoursByPeriod(project) {
  const out = {}
  for (const sp of project.subProjects) {
    for (const pos of sp.positions) {
      for (const [per, h] of Object.entries(pos.hoursByPeriod || {})) {
        out[per] = (out[per] || 0) + (h || 0)
      }
    }
  }
  return out
}

// Monthly hours for a project: { [year]: number[12] }, summed over all
// sub-projects & positions (uses the real monthly Excel data).
export function projectMonthlyHours(project) {
  const out = {}
  for (const sp of project.subProjects) {
    for (const pos of sp.positions) {
      const months = pos.months || {}
      for (const [year, arr] of Object.entries(months)) {
        if (!out[year]) out[year] = Array(12).fill(0)
        for (let m = 0; m < 12; m++) out[year][m] += Number(arr[m]) || 0
      }
    }
  }
  return out
}

export function projectTotalHours(project) {
  return project.subProjects.reduce(
    (a, sp) => a + sp.positions.reduce((b, p) => b + (p.totalHours || 0), 0),
    0,
  )
}

/**
 * Stacked-bar data for the Resource Mount Chart.
 * Awarded projects are stacked first (bottom), planned projects last (top),
 * so the striped "not yet confirmed" demand always sits on top of committed load.
 * Returns { data: [{period, [projId]: hours}], series: [{id,name,color,status}] }
 */
export function mountChartData(projects, { visibleIds } = {}) {
  const periods = allPeriods(projects)
  const visible = projects.filter((p) => !visibleIds || visibleIds.has(p.id))
  const ordered = [
    ...visible.filter((p) => p.status === 'awarded'),
    ...visible.filter((p) => p.status === 'planned'),
  ]
  const data = periods.map((per) => {
    const row = { period: per }
    for (const p of ordered) {
      const h = projectHoursByPeriod(p)[per] || 0
      row[p.id] = Math.round(h)
    }
    return row
  })
  const series = ordered.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    status: p.status,
  }))
  return { data, series, periods }
}

/**
 * Monthly stacked-area data for the Resource Mount Chart, using the real
 * per-month Excel values. Returns { data: [{year,m,...projId}], series, periods }.
 */
export function mountMonthlyData(projects) {
  const periods = allPeriods(projects)
  const ordered = [
    ...projects.filter((p) => p.status === 'awarded'),
    ...projects.filter((p) => p.status === 'planned'),
  ]
  const perProject = ordered.map((p) => ({ p, months: projectMonthlyHours(p) }))
  const data = []
  for (const year of periods) {
    for (let m = 0; m < 12; m++) {
      const row = { year, m }
      for (const { p, months } of perProject) {
        row[p.id] = Math.round((months[year] && months[year][m]) || 0)
      }
      data.push(row)
    }
  }
  const series = ordered.map((p) => ({ id: p.id, name: p.name, color: p.color, status: p.status }))
  return { data, series, periods }
}

/**
 * Capacity (available hours) per period = total headcount across work groups
 * × hoursPerFTEPerYear. A flat capacity line, since headcount is steady-state.
 */
export function capacityHours(capacity, settings) {
  const heads = Object.values(capacity || {}).reduce((a, n) => a + (Number(n) || 0), 0)
  return heads * (settings?.hoursPerFTEPerYear || 1600)
}

/**
 * Work-group demand vs. capacity.
 * demandHours summed over ALL projects (optionally only awarded).
 * Returns rows: { workGroup, demandHours, demandFTE, people, capacityHours, utilization, gap }
 */
export function workGroupBreakdown(projects, capacity, settings, { onlyAwarded = false } = {}) {
  const hoursPerFTE = settings?.hoursPerFTEPerYear || 1600
  const groups = allWorkGroups(projects)
  const demand = {}
  for (const p of projects) {
    if (onlyAwarded && p.status !== 'awarded') continue
    for (const sp of p.subProjects) {
      for (const pos of sp.positions) {
        demand[pos.workGroup] = (demand[pos.workGroup] || 0) + (pos.totalHours || 0)
      }
    }
  }
  // number of periods to annualize demand (demand is spread across the timeline)
  const nPeriods = Math.max(1, allPeriods(projects).length)
  return groups.map((g) => {
    const demandHours = demand[g] || 0
    const demandFTE = demandHours / hoursPerFTE / nPeriods // avg concurrent FTE need
    const people = Number(capacity?.[g] || 0)
    const capHours = people * hoursPerFTE * nPeriods
    return {
      workGroup: g,
      demandHours,
      demandFTE,
      people,
      capacityHours: capHours,
      utilization: capHours > 0 ? demandHours / capHours : null,
      gap: demandFTE - people, // >0 => understaffed
    }
  })
}

/**
 * Position usage within ONE project, split by sub-project (for the analysis
 * tab). Same role appearing in several sub-projects is combined into one row
 * with a per-sub-project breakdown, so the longest bar = most-used position.
 * Returns rows [{ position, workGroup, total, bySub: { [subName]: hours } }]
 * sorted by total descending.
 */
export function projectPositionBreakdown(project) {
  const map = new Map()
  for (const sp of project.subProjects) {
    for (const pos of sp.positions) {
      const h = pos.totalHours || Object.values(pos.hoursByPeriod || {}).reduce((a, b) => a + b, 0)
      if (!h) continue
      const cur = map.get(pos.position) || {
        position: pos.position,
        workGroup: pos.workGroup,
        total: 0,
        bySub: {},
      }
      cur.bySub[sp.name] = (cur.bySub[sp.name] || 0) + h
      cur.total += h
      map.set(pos.position, cur)
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

/**
 * Position usage within ONE sub-project. Returns rows [{ position, workGroup,
 * hours }] sorted by hours descending.
 */
export function subPositionBreakdown(sub) {
  const map = new Map()
  for (const pos of sub.positions) {
    const h = pos.totalHours || Object.values(pos.hoursByPeriod || {}).reduce((a, b) => a + b, 0)
    if (!h) continue
    const cur = map.get(pos.position) || { position: pos.position, workGroup: pos.workGroup, hours: 0 }
    cur.hours += h
    map.set(pos.position, cur)
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours)
}

export function portfolioTotals(projects) {
  const awarded = projects.filter((p) => p.status === 'awarded')
  const planned = projects.filter((p) => p.status === 'planned')
  return {
    projects: projects.length,
    subProjects: projects.reduce((a, p) => a + p.subProjects.length, 0),
    awardedHours: awarded.reduce((a, p) => a + projectTotalHours(p), 0),
    plannedHours: planned.reduce((a, p) => a + projectTotalHours(p), 0),
  }
}
