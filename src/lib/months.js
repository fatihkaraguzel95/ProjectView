// Monthly demand helpers. `months[year] = number[12]` is the single source of
// truth for a position; `hoursByPeriod[year]` and `totalHours` are always
// derived from it, so the yearly table and the monthly chart stay in lock-step.

export function monthsFor(pos, year) {
  const arr = pos.months?.[year]
  return Array.isArray(arr) ? arr.slice(0, 12) : Array(12).fill(0)
}

// Recompute hoursByPeriod + totalHours from months.
export function recalcPosition(pos) {
  const months = pos.months || {}
  const hb = {}
  let total = 0
  for (const [y, arr] of Object.entries(months)) {
    const sum = (arr || []).reduce((a, b) => a + (Number(b) || 0), 0)
    hb[y] = sum
    total += sum
  }
  return { ...pos, months, hoursByPeriod: hb, totalHours: total }
}

// Ensure a position has a months grid for every given period. Missing months
// are back-filled by evenly spreading the existing yearly total.
export function normalizePositionMonths(pos, periods) {
  const months = { ...(pos.months || {}) }
  const hb = pos.hoursByPeriod || {}
  for (const y of periods) {
    if (!Array.isArray(months[y])) {
      const yearTotal = Number(hb[y]) || 0
      months[y] = Array(12).fill(yearTotal / 12)
    }
  }
  pos.months = months
  const recalced = recalcPosition(pos)
  pos.hoursByPeriod = recalced.hoursByPeriod
  pos.totalHours = recalced.totalHours
  return pos
}
