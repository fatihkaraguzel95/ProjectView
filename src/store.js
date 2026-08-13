import { useSyncExternalStore } from 'react'
import { buildSeed, STANDARD_POSITIONS } from './lib/seed.js'
import { uid } from './lib/util.js'
import { nextColor } from './lib/colors.js'

const KEY = 'projectview.state.v2'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // backfill keys added in later versions
      if (!parsed.headcount) parsed.headcount = {}
      if (!parsed.capacity) parsed.capacity = {}
      if (!parsed.settings) parsed.settings = { hoursPerFTEPerYear: 1600 }
      if (!parsed.capacityPositions)
        parsed.capacityPositions = STANDARD_POSITIONS.map((p) => ({ ...p }))
      return parsed
    }
  } catch (e) {
    console.warn('state load failed', e)
  }
  return buildSeed()
}

let state = load()
const listeners = new Set()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('state persist failed', e)
  }
}

function setState(updater) {
  state = typeof updater === 'function' ? updater(state) : updater
  persist()
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

// ---- actions -------------------------------------------------------------

export const actions = {
  addProject({ name, client = '', status = 'planned' }) {
    setState((s) => {
      const used = s.projects.map((p) => p.color)
      return {
        ...s,
        projects: [
          ...s.projects,
          {
            id: uid('prj'),
            name: name || 'Neues Projekt',
            client,
            status,
            color: nextColor(used),
            collapsed: false,
            subProjects: [],
          },
        ],
      }
    })
  },

  updateProject(id, patch) {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  },

  removeProject(id) {
    setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }))
  },

  toggleCollapse(id) {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === id ? { ...p, collapsed: !p.collapsed } : p)),
    }))
  },

  addSubProject(projectId, sub) {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: [
                ...p.subProjects,
                {
                  id: uid('sub'),
                  name: sub.name || 'Neues Teilprojekt',
                  source: sub.source || '',
                  periods: sub.periods || [],
                  positions: sub.positions || [],
                },
              ],
            }
          : p,
      ),
    }))
  },

  updateSubProject(projectId, subId, patch) {
    setState((s) => ({
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
  },

  removeSubProject(projectId, subId) {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, subProjects: p.subProjects.filter((sp) => sp.id !== subId) }
          : p,
      ),
    }))
  },

  // add/remove a single position row inside a sub-project
  addSubPosition(projectId, subId, position) {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) =>
                sp.id === subId ? { ...sp, positions: [...sp.positions, position] } : sp,
              ),
            }
          : p,
      ),
    }))
  },

  removeSubPosition(projectId, subId, index) {
    setState((s) => ({
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
  },

  // set one position's hours for a given period (recomputes the row total)
  setSubPositionHours(projectId, subId, index, period, value) {
    const v = Math.max(0, Number(value) || 0)
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) =>
                sp.id === subId
                  ? {
                      ...sp,
                      positions: sp.positions.map((pos, i) => {
                        if (i !== index) return pos
                        const hb = { ...pos.hoursByPeriod, [period]: v }
                        const total = Object.values(hb).reduce((a, b) => a + (b || 0), 0)
                        return { ...pos, hoursByPeriod: hb, totalHours: total }
                      }),
                    }
                  : sp,
              ),
            }
          : p,
      ),
    }))
  },

  // add a period (year) column to a sub-project
  addSubPeriod(projectId, subId, period) {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) => {
                if (sp.id !== subId) return sp
                if ((sp.periods || []).includes(period)) return sp
                const periods = [...(sp.periods || []), period].sort()
                const positions = sp.positions.map((pos) => ({
                  ...pos,
                  hoursByPeriod: { ...pos.hoursByPeriod, [period]: pos.hoursByPeriod?.[period] || 0 },
                }))
                return { ...sp, periods, positions }
              }),
            }
          : p,
      ),
    }))
  },

  removeSubPeriod(projectId, subId, period) {
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              subProjects: p.subProjects.map((sp) => {
                if (sp.id !== subId) return sp
                const periods = (sp.periods || []).filter((x) => x !== period)
                const positions = sp.positions.map((pos) => {
                  const hb = { ...pos.hoursByPeriod }
                  delete hb[period]
                  const total = Object.values(hb).reduce((a, b) => a + (b || 0), 0)
                  return { ...pos, hoursByPeriod: hb, totalHours: total }
                })
                return { ...sp, periods, positions }
              }),
            }
          : p,
      ),
    }))
  },

  // capacity positions (Personalkapazität list)
  addCapacityPosition({ workGroup, position }, people = 5) {
    setState((s) => {
      if (s.capacityPositions.some((p) => p.position === position)) return s
      return {
        ...s,
        capacityPositions: [...s.capacityPositions, { workGroup: workGroup || 'Sonstige', position }],
        headcount: { ...s.headcount, [position]: Array(12).fill(people) },
      }
    })
  },

  removeCapacityPosition(position) {
    setState((s) => {
      const hc = { ...s.headcount }
      delete hc[position]
      return {
        ...s,
        capacityPositions: s.capacityPositions.filter((p) => p.position !== position),
        headcount: hc,
      }
    })
  },

  setCapacity(workGroup, people) {
    setState((s) => ({
      ...s,
      capacity: { ...s.capacity, [workGroup]: people },
    }))
  },

  // Monthly head-count per position: months is a 12-length array (Jan..Dez).
  setHeadcountMonth(position, monthIdx, value) {
    setState((s) => {
      const cur = (s.headcount && s.headcount[position]) || Array(12).fill(0)
      const next = [...cur]
      next[monthIdx] = value
      return { ...s, headcount: { ...s.headcount, [position]: next } }
    })
  },

  setHeadcountRow(position, months) {
    setState((s) => ({ ...s, headcount: { ...s.headcount, [position]: months.slice(0, 12) } }))
  },

  clearHeadcount(position) {
    setState((s) => {
      const next = { ...s.headcount }
      delete next[position]
      return { ...s, headcount: next }
    })
  },

  setSetting(key, value) {
    setState((s) => ({ ...s, settings: { ...s.settings, [key]: value } }))
  },

  resetAll() {
    setState(buildSeed())
  },
}
