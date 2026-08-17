import { useSyncExternalStore } from 'react'
import { buildSeed, STANDARD_POSITIONS } from './lib/seed.js'
import { allPeriods } from './lib/resource.js'
import { uid } from './lib/util.js'
import { nextColor } from './lib/colors.js'
import { recalcPosition, normalizePositionMonths } from './lib/months.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { db, subscribeRealtime } from './lib/db.js'

const KEY = 'projectview.state.v4'
const remote = isSupabaseConfigured

// ---- in-memory mirror (components read this synchronously) ------------------

function skeleton() {
  return {
    projects: [],
    capacity: {},
    capacityPositions: STANDARD_POSITIONS.map((p) => ({ ...p })),
    headcount: {},
    settings: { hoursPerFTEPerYear: 1600 },
    _loading: remote,
    _source: remote ? 'connecting' : 'local', // 'supabase' | 'local' | 'connecting'
  }
}

let state = skeleton()
const listeners = new Set()

function notify() {
  listeners.forEach((l) => l())
}
function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}
export function getState() {
  return state
}

// ---- persistence -----------------------------------------------------------

// Optimistic local update. In local mode it also writes to localStorage; in
// remote mode the individual actions push their delta to Supabase themselves.
function commit(updater) {
  state = typeof updater === 'function' ? updater(state) : updater
  if (!remote) persistLocal()
  notify()
}

function persistLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('state persist failed', e)
  }
}

// Fire a Supabase write and log failures without blocking the UI.
function push(builder) {
  if (!remote || !builder) return
  Promise.resolve(builder)
    .then((res) => {
      if (res && res.error) console.error('Supabase write failed:', res.error)
    })
    .catch((e) => console.error('Supabase write error:', e))
}

// ---- selectors into current state ------------------------------------------

const getProject = (id) => state.projects.find((p) => p.id === id)
const getSub = (projectId, subId) => getProject(projectId)?.subProjects.find((s) => s.id === subId)
const getPos = (projectId, subId, index) => getSub(projectId, subId)?.positions[index]

// ---- init ------------------------------------------------------------------

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (!parsed.headcount) parsed.headcount = {}
      if (!parsed.capacity) parsed.capacity = {}
      if (!parsed.settings) parsed.settings = { hoursPerFTEPerYear: 1600 }
      if (!parsed.capacityPositions)
        parsed.capacityPositions = STANDARD_POSITIONS.map((p) => ({ ...p }))
      for (const p of parsed.projects || [])
        for (const sp of p.subProjects || [])
          for (const pos of sp.positions || []) normalizePositionMonths(pos, sp.periods || [])
      return parsed
    }
  } catch (e) {
    console.warn('state load failed', e)
  }
  return buildSeed()
}

let refetchTimer
function onRemoteChange() {
  clearTimeout(refetchTimer)
  refetchTimer = setTimeout(async () => {
    try {
      const s = await db.fetchState()
      state = { ...s, _loading: false, _source: 'supabase' }
      notify()
    } catch (e) {
      console.error('Supabase refetch failed:', e)
    }
  }, 250)
}

async function init() {
  if (!remote) {
    state = { ...loadLocal(), _source: 'local' }
    notify()
    return
  }
  try {
    let s = await db.fetchState()
    const empty =
      s.projects.length === 0 &&
      s.capacityPositions.length === 0 &&
      Object.keys(s.headcount).length === 0
    if (empty) s = await db.seedState(buildSeed())
    state = { ...s, _loading: false, _source: 'supabase' }
    notify()
    subscribeRealtime(onRemoteChange)
  } catch (e) {
    console.error('Supabase init failed — falling back to local seed.', e)
    state = { ...buildSeed(), _loading: false, _source: 'local' }
    notify()
  }
}

// In remote mode the data load waits until the user has authenticated — the
// AuthGate calls initStore() after a successful login. In local mode there is
// no login, so we boot immediately.
let started = false
export async function initStore() {
  if (started) return
  started = true
  await init()
}
if (!remote) initStore()

// ---- actions ---------------------------------------------------------------

export const actions = {
  addProject({ name, client = '', status = 'planned' }) {
    const project = {
      id: uid('prj'),
      name: name || 'Neues Projekt',
      client,
      status,
      color: nextColor(state.projects.map((p) => p.color)),
      collapsed: false,
      subProjects: [],
    }
    const sortIndex = state.projects.length
    commit((s) => ({ ...s, projects: [...s.projects, project] }))
    push(db.upsertProject(project, sortIndex))
  },

  updateProject(id, patch) {
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
    const p = getProject(id)
    if (p) push(db.upsertProject(p))
  },

  removeProject(id) {
    commit((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }))
    push(db.deleteProject(id))
  },

  toggleCollapse(id) {
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === id ? { ...p, collapsed: !p.collapsed } : p)),
    }))
    const p = getProject(id)
    if (p) push(db.upsertProject(p))
  },

  addSubProject(projectId, sub) {
    const subId = uid('sub')
    const periods = sub.periods || []
    const positions = (sub.positions || []).map((pos) =>
      normalizePositionMonths({ ...pos, id: pos.id || uid('pos') }, periods),
    )
    const newSub = {
      id: subId,
      name: sub.name || 'Neues Teilprojekt',
      source: sub.source || '',
      periods,
      positions,
    }
    const sortIndex = getProject(projectId)?.subProjects.length ?? 0
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, subProjects: [...p.subProjects, newSub] } : p,
      ),
    }))
    push(db.upsertSubProject(newSub, projectId, sortIndex))
    if (positions.length)
      push(db.upsertPositions(positions.map((pos, i) => posRowFor(pos, subId, i))))
  },

  updateSubProject(projectId, subId, patch) {
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) => (sp.id === subId ? { ...sp, ...patch } : sp)),
            }
          : p,
      ),
    }))
    const sp = getSub(projectId, subId)
    if (sp) push(db.upsertSubProject(sp, projectId))
  },

  removeSubProject(projectId, subId) {
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, subProjects: p.subProjects.filter((sp) => sp.id !== subId) }
          : p,
      ),
    }))
    push(db.deleteSubProject(subId))
  },

  addSubPosition(projectId, subId, position) {
    const sub = getSub(projectId, subId)
    const newPos = normalizePositionMonths(
      { ...position, id: position.id || uid('pos') },
      sub?.periods || [],
    )
    const sortIndex = sub?.positions.length ?? 0
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) =>
                sp.id === subId ? { ...sp, positions: [...sp.positions, newPos] } : sp,
              ),
            }
          : p,
      ),
    }))
    push(db.upsertPosition(newPos, subId, sortIndex))
  },

  removeSubPosition(projectId, subId, index) {
    const pos = getPos(projectId, subId, index)
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) =>
                sp.id === subId
                  ? { ...sp, positions: sp.positions.filter((_, i) => i !== index) }
                  : sp,
              ),
            }
          : p,
      ),
    }))
    if (pos) push(db.deletePosition(pos.id))
  },

  // Set a position's YEARLY total for a period — spread evenly over 12 months.
  setSubPositionHours(projectId, subId, index, period, value) {
    const v = Math.max(0, Number(value) || 0)
    commit((s) => mapPos(s, projectId, subId, index, (pos) =>
      recalcPosition({ ...pos, months: { ...(pos.months || {}), [period]: Array(12).fill(v / 12) } }),
    ))
    persistPos(projectId, subId, index)
  },

  // Set a position's hours for ONE month of a period (authoritative edit).
  setSubPositionMonth(projectId, subId, index, period, monthIdx, value) {
    const v = Math.max(0, Number(value) || 0)
    commit((s) => mapPos(s, projectId, subId, index, (pos) => {
      const arr = Array.isArray(pos.months?.[period]) ? [...pos.months[period]] : Array(12).fill(0)
      arr[monthIdx] = v
      return recalcPosition({ ...pos, months: { ...(pos.months || {}), [period]: arr } })
    }))
    persistPos(projectId, subId, index)
  },

  addSubPeriod(projectId, subId, period) {
    const existing = getSub(projectId, subId)
    if (!existing || (existing.periods || []).includes(period)) return
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) => {
                if (sp.id !== subId) return sp
                const periods = [...(sp.periods || []), period].sort()
                const positions = sp.positions.map((pos) =>
                  recalcPosition({
                    ...pos,
                    months: { ...(pos.months || {}), [period]: Array(12).fill(0) },
                  }),
                )
                return { ...sp, periods, positions }
              }),
            }
          : p,
      ),
    }))
    persistSubAndPositions(projectId, subId)
  },

  removeSubPeriod(projectId, subId, period) {
    commit((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) => {
                if (sp.id !== subId) return sp
                const periods = (sp.periods || []).filter((x) => x !== period)
                const positions = sp.positions.map((pos) => {
                  const months = { ...(pos.months || {}) }
                  delete months[period]
                  return recalcPosition({ ...pos, months })
                })
                return { ...sp, periods, positions }
              }),
            }
          : p,
      ),
    }))
    persistSubAndPositions(projectId, subId)
  },

  // capacity positions (Personalkapazität list)
  addCapacityPosition({ workGroup, position }, people = 5) {
    if (state.capacityPositions.some((p) => p.position === position)) return
    const years = allPeriods(state.projects)
    const perYear = {}
    for (const y of years) perYear[y] = Array(12).fill(people)
    const sortIndex = state.capacityPositions.length
    commit((s) => ({
      ...s,
      capacityPositions: [...s.capacityPositions, { workGroup: workGroup || 'Sonstige', position }],
      headcount: { ...s.headcount, [position]: perYear },
    }))
    push(db.upsertCapacityPosition({ workGroup: workGroup || 'Sonstige', position }, sortIndex))
    for (const [y, months] of Object.entries(perYear)) push(db.upsertHeadcount(position, y, months))
  },

  removeCapacityPosition(position) {
    commit((s) => {
      const hc = { ...s.headcount }
      delete hc[position]
      return {
        ...s,
        capacityPositions: s.capacityPositions.filter((p) => p.position !== position),
        headcount: hc,
      }
    })
    push(db.deleteCapacityPosition(position))
    push(db.deleteHeadcountForPosition(position))
  },

  setCapacity(workGroup, people) {
    commit((s) => ({ ...s, capacity: { ...s.capacity, [workGroup]: people } }))
    push(db.upsertCapacity(workGroup, people))
  },

  // Monthly head-count per position per year. headcount[position][year] = [12].
  setHeadcountMonth(position, year, monthIdx, value) {
    const cur = (state.headcount?.[position]?.[year]) || Array(12).fill(0)
    const next = [...cur]
    next[monthIdx] = Math.max(0, Number(value) || 0)
    commit((s) => {
      const perYear = (s.headcount && s.headcount[position]) || {}
      return { ...s, headcount: { ...s.headcount, [position]: { ...perYear, [year]: next } } }
    })
    push(db.upsertHeadcount(position, year, next))
  },

  setHeadcountRow(position, year, months) {
    const row = months.slice(0, 12)
    commit((s) => {
      const perYear = (s.headcount && s.headcount[position]) || {}
      return { ...s, headcount: { ...s.headcount, [position]: { ...perYear, [year]: row } } }
    })
    push(db.upsertHeadcount(position, year, row))
  },

  setSetting(key, value) {
    commit((s) => ({ ...s, settings: { ...s.settings, [key]: value } }))
    push(db.upsertSetting(key, value))
  },

  async resetAll() {
    const seed = buildSeed()
    if (remote) {
      try {
        const s = await db.resetToSeed(seed)
        state = { ...s, _loading: false }
        notify()
      } catch (e) {
        console.error('Supabase reset failed:', e)
      }
    } else {
      commit(seed)
    }
  },
}

// ---- write-through helpers -------------------------------------------------

function mapPos(s, projectId, subId, index, fn) {
  return {
    ...s,
    projects: s.projects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            subProjects: p.subProjects.map((sp) =>
              sp.id === subId
                ? { ...sp, positions: sp.positions.map((pos, i) => (i === index ? fn(pos) : pos)) }
                : sp,
            ),
          }
        : p,
    ),
  }
}

function posRowFor(pos, subId, sortIndex) {
  return {
    id: pos.id,
    sub_project_id: subId,
    work_group: pos.workGroup || 'Sonstige',
    position: pos.position,
    months: pos.months || {},
    sort_index: sortIndex,
  }
}

// push a single (already-mutated) position to Supabase
function persistPos(projectId, subId, index) {
  const pos = getPos(projectId, subId, index)
  if (pos) push(db.upsertPosition(pos, subId))
}

// push a sub-project's periods + all its positions (used by add/remove period)
function persistSubAndPositions(projectId, subId) {
  const sp = getSub(projectId, subId)
  if (!sp) return
  push(db.upsertSubProject(sp, projectId))
  if (sp.positions.length)
    push(db.upsertPositions(sp.positions.map((pos, i) => posRowFor(pos, subId, i))))
}
