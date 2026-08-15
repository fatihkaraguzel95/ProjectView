import { supabase } from './supabase.js'
import { normalizePositionMonths } from './months.js'
import { uid } from './util.js'

// Repository over the Supabase tables. Assembles the flat rows into the nested
// app state the components expect, and exposes small write-through helpers that
// the store calls after each optimistic local update.

const TABLES = [
  'projects',
  'sub_projects',
  'positions',
  'capacity_positions',
  'headcount',
  'app_capacity',
  'settings',
]

function throwErr(res) {
  if (res.error) throw res.error
  return res
}

// ---- read ------------------------------------------------------------------

export async function fetchState() {
  const [projects, subs, positions, caps, hc, appcap, settingsRows] = await Promise.all([
    supabase.from('projects').select('*').order('sort_index'),
    supabase.from('sub_projects').select('*').order('sort_index'),
    supabase.from('positions').select('*').order('sort_index'),
    supabase.from('capacity_positions').select('*').order('sort_index'),
    supabase.from('headcount').select('*'),
    supabase.from('app_capacity').select('*'),
    supabase.from('settings').select('*'),
  ])
  ;[projects, subs, positions, caps, hc, appcap, settingsRows].forEach(throwErr)

  const posBySub = new Map()
  for (const row of positions.data) {
    const list = posBySub.get(row.sub_project_id) || []
    list.push(row)
    posBySub.set(row.sub_project_id, list)
  }
  const subsByProject = new Map()
  for (const row of subs.data) {
    const list = subsByProject.get(row.project_id) || []
    list.push(row)
    subsByProject.set(row.project_id, list)
  }

  const projectsOut = projects.data.map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client || '',
    status: p.status,
    color: p.color,
    collapsed: !!p.collapsed,
    subProjects: (subsByProject.get(p.id) || []).map((sp) => {
      const periods = Array.isArray(sp.periods) ? sp.periods.map(String) : []
      const posList = (posBySub.get(sp.id) || []).map((pos) =>
        normalizePositionMonths(
          {
            id: pos.id,
            workGroup: pos.work_group,
            position: pos.position,
            months: pos.months || {},
          },
          periods,
        ),
      )
      return { id: sp.id, name: sp.name, source: sp.source || '', periods, positions: posList }
    }),
  }))

  const headcount = {}
  for (const row of hc.data) {
    if (!headcount[row.position]) headcount[row.position] = {}
    headcount[row.position][String(row.year)] = Array.isArray(row.months)
      ? row.months.slice(0, 12)
      : Array(12).fill(0)
  }
  const capacity = {}
  for (const row of appcap.data) capacity[row.work_group] = Number(row.people) || 0
  const settings = {}
  for (const row of settingsRows.data) settings[row.key] = row.value
  if (settings.hoursPerFTEPerYear == null) settings.hoursPerFTEPerYear = 1600
  const capacityPositions = caps.data.map((c) => ({ workGroup: c.work_group, position: c.position }))

  return { projects: projectsOut, capacity, capacityPositions, headcount, settings }
}

// ---- seed / reset ----------------------------------------------------------

export async function seedState(seed) {
  const projectRows = []
  const subRows = []
  const posRows = []
  seed.projects.forEach((p, pi) => {
    projectRows.push({
      id: p.id,
      name: p.name,
      client: p.client || '',
      status: p.status,
      color: p.color,
      collapsed: !!p.collapsed,
      sort_index: pi,
    })
    p.subProjects.forEach((sp, si) => {
      const spId = sp.id || uid('sub')
      subRows.push({
        id: spId,
        project_id: p.id,
        name: sp.name,
        source: sp.source || '',
        periods: sp.periods || [],
        sort_index: si,
      })
      sp.positions.forEach((pos, xi) => {
        posRows.push({
          id: pos.id || uid('pos'),
          sub_project_id: spId,
          work_group: pos.workGroup || 'Sonstige',
          position: pos.position,
          months: pos.months || {},
          sort_index: xi,
        })
      })
    })
  })
  const capRows = (seed.capacityPositions || []).map((c, i) => ({
    position: c.position,
    work_group: c.workGroup || 'Sonstige',
    sort_index: i,
  }))
  const hcRows = []
  for (const [position, perYear] of Object.entries(seed.headcount || {}))
    for (const [year, months] of Object.entries(perYear))
      hcRows.push({ position, year: Number(year), months })
  const capacityRows = Object.entries(seed.capacity || {}).map(([work_group, people]) => ({
    work_group,
    people,
  }))
  const settingRows = Object.entries(seed.settings || {}).map(([key, value]) => ({ key, value }))

  if (projectRows.length) throwErr(await supabase.from('projects').insert(projectRows))
  if (subRows.length) throwErr(await supabase.from('sub_projects').insert(subRows))
  if (posRows.length) throwErr(await supabase.from('positions').insert(posRows))
  if (capRows.length) throwErr(await supabase.from('capacity_positions').insert(capRows))
  if (hcRows.length) throwErr(await supabase.from('headcount').insert(hcRows))
  if (capacityRows.length) throwErr(await supabase.from('app_capacity').insert(capacityRows))
  if (settingRows.length) throwErr(await supabase.from('settings').insert(settingRows))

  return fetchState()
}

const delAll = (table, keyCol = 'id') =>
  supabase.from(table).delete().neq(keyCol, '__never_matches__')

export async function clearAll() {
  // children first (FK cascade would handle projects, but be explicit)
  throwErr(await delAll('positions'))
  throwErr(await delAll('sub_projects'))
  throwErr(await delAll('projects'))
  throwErr(await delAll('capacity_positions', 'position'))
  throwErr(await delAll('headcount', 'position'))
  throwErr(await delAll('app_capacity', 'work_group'))
  throwErr(await delAll('settings', 'key'))
}

export async function resetToSeed(seed) {
  await clearAll()
  return seedState(seed)
}

// ---- write-through (return thenable builders; store fires & logs) -----------

const projectRow = (p, sortIndex) => ({
  id: p.id,
  name: p.name,
  client: p.client || '',
  status: p.status,
  color: p.color,
  collapsed: !!p.collapsed,
  ...(sortIndex != null ? { sort_index: sortIndex } : {}),
})
const subRow = (sp, projectId, sortIndex) => ({
  id: sp.id,
  project_id: projectId,
  name: sp.name,
  source: sp.source || '',
  periods: sp.periods || [],
  ...(sortIndex != null ? { sort_index: sortIndex } : {}),
})
const posRow = (pos, subId, sortIndex) => ({
  id: pos.id,
  sub_project_id: subId,
  work_group: pos.workGroup || 'Sonstige',
  position: pos.position,
  months: pos.months || {},
  ...(sortIndex != null ? { sort_index: sortIndex } : {}),
})

export const db = {
  fetchState,
  seedState,
  clearAll,
  resetToSeed,

  upsertProject: (p, sortIndex) => supabase.from('projects').upsert(projectRow(p, sortIndex)),
  deleteProject: (id) => supabase.from('projects').delete().eq('id', id),

  upsertSubProject: (sp, projectId, sortIndex) =>
    supabase.from('sub_projects').upsert(subRow(sp, projectId, sortIndex)),
  deleteSubProject: (id) => supabase.from('sub_projects').delete().eq('id', id),

  upsertPosition: (pos, subId, sortIndex) =>
    supabase.from('positions').upsert(posRow(pos, subId, sortIndex)),
  upsertPositions: (rows) => supabase.from('positions').upsert(rows),
  deletePosition: (id) => supabase.from('positions').delete().eq('id', id),

  upsertCapacityPosition: (c, sortIndex) =>
    supabase
      .from('capacity_positions')
      .upsert({ position: c.position, work_group: c.workGroup || 'Sonstige', sort_index: sortIndex ?? 0 }),
  deleteCapacityPosition: (position) =>
    supabase.from('capacity_positions').delete().eq('position', position),

  upsertHeadcount: (position, year, months) =>
    supabase.from('headcount').upsert({ position, year: Number(year), months }),
  deleteHeadcountForPosition: (position) =>
    supabase.from('headcount').delete().eq('position', position),

  upsertCapacity: (workGroup, people) =>
    supabase.from('app_capacity').upsert({ work_group: workGroup, people }),

  upsertSetting: (key, value) => supabase.from('settings').upsert({ key, value }),
}

// ---- realtime --------------------------------------------------------------

export function subscribeRealtime(onChange) {
  const channel = supabase.channel('projectview-sync')
  for (const table of TABLES)
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  channel.subscribe()
  return channel
}
