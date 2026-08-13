import * as XLSX from 'xlsx'

/**
 * Parses a "Gesamtkalkulation" style workbook (or a simple template) and
 * extracts resource demand as a flat list of positions:
 *
 *   { workGroup, position, hoursByPeriod: { '2023': 1357.7, '2024': 2546.1 }, totalHours }
 *
 * Two strategies are attempted, in order:
 *   1. EKAS sheet  — the real automotive template (Fachbereich / Umfang / Std per year)
 *   2. Generic     — any sheet with a header row containing period tokens (years/months)
 */

const SKIP_POSITIONS = new Set([
  'summe',
  'zwischensumme:',
  'zwischensumme',
  'gesamtsumme',
  '-',
  '',
])

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0)
const clean = (v) => (v == null ? '' : String(v).replace(/�/g, 'ü').trim())

function isYear(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 2000 && n <= 2100
}

const MONTHS = ['jan', 'feb', 'mrz', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez']
function isMonth(v) {
  return typeof v === 'string' && MONTHS.includes(v.trim().toLowerCase().slice(0, 3))
}

/** Read an uploaded File -> { positions, periods, personalPositions, meta } */
export async function parseWorkbookFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  return parseWorkbook(wb, file.name)
}

export function parseWorkbook(wb, fileName = 'upload.xlsx') {
  // Only the sheet whose name contains "Kostenverfolgung" is relevant.
  const sheetName = findKostenverfolgungSheet(wb)
  if (sheetName) {
    const res = parseKostenverfolgung(wb.Sheets[sheetName])
    if (res.positions.length)
      return {
        ...res,
        personalPositions: res.positions.map((p) => ({ workGroup: p.workGroup, position: p.position })),
        meta: { fileName, sheet: sheetName, strategy: 'Kostenverfolgung' },
      }
  }

  // Fallback for non-standard files: scan sheets generically.
  let best = { positions: [], periods: [] }
  let bestSheet = ''
  for (const name of wb.SheetNames) {
    const res = parseGeneric(wb.Sheets[name])
    if (res.positions.length > best.positions.length) {
      best = res
      bestSheet = name
    }
  }
  const personalPositions = best.positions.map((p) => ({ workGroup: p.workGroup, position: p.position }))
  return { ...best, personalPositions, meta: { fileName, sheet: bestSheet, strategy: 'generic' } }
}

function findKostenverfolgungSheet(wb) {
  return wb.SheetNames.find((n) => n.toLowerCase().includes('kostenverfolgung'))
}

/**
 * Parses the "Kostenverfolgung" sheet — the single source of truth.
 * Positions = column B entries in the PERSONALKOSTEN section whose column C
 * holds a numeric hourly rate (Std-Satz). Section headers (Projektsteuerung,
 * Konstruktion …), "Summe …", "GESAMTSUMME", "-" placeholders and the whole
 * MATERIALKOSTEN block are skipped.
 * Yearly hours are read from the "Jahresabschluss YYYY [h]" columns.
 */
export function parseKostenverfolgung(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })

  // header row = first row that contains a "Jan" cell
  let hidx = rows.findIndex((r) => r.some((c) => typeof c === 'string' && c.trim() === 'Jan'))
  if (hidx < 0) hidx = 7
  const hdr = rows[hidx] || []

  // detect the yearly hour columns: header text contains "[h]" + a 4-digit year
  const yearCols = []
  hdr.forEach((c, j) => {
    const s = c == null ? '' : String(c).replace(/\s+/g, ' ')
    if (s.includes('[h]')) {
      const m = s.match(/20\d{2}/)
      if (m) yearCols.push({ col: j, year: m[0] })
    }
  })

  const positions = []
  const seen = new Set()
  let inSection = false
  let currentGroup = ''
  for (const r of rows) {
    const label = clean(r[1]).replace(/^'+/, '')
    const rate = r[2]
    const key = label.toLowerCase()
    if (key.includes('personalkosten')) {
      inSection = !key.startsWith('gesamtsumme')
      continue
    }
    if (!inSection) continue
    if (key.startsWith('materialkosten')) break
    if (!label || label === '-') continue
    if (key.startsWith('summe') || key.startsWith('gesamtsumme')) continue
    // group header row → rate cell reads "Kalkulation …"
    const rateStr = typeof rate === 'string' ? rate.toLowerCase() : ''
    if (rateStr.includes('kalkulation')) {
      currentGroup = label
      continue
    }
    // blank rate (non-Summe) → structural filler, skip
    if (rate == null || rate === '') continue
    // numeric placeholder 0 → skip; everything else (numeric >0 or unit like
    // "1 LE") is a position, per the "take all other column-B entries" rule
    if (typeof rate === 'number' && rate <= 0) continue
    if (seen.has(label)) continue
    seen.add(label)

    const hoursByPeriod = {}
    for (const { col, year } of yearCols) hoursByPeriod[year] = num(r[col])
    positions.push({
      workGroup: currentGroup || 'Personal',
      position: label,
      hoursByPeriod,
      totalHours: Object.values(hoursByPeriod).reduce((a, b) => a + b, 0),
    })
  }

  // keep only years that actually carry data (across any position);
  // fall back to the first three detected years if the sheet is still empty.
  let periods = yearCols
    .map((y) => y.year)
    .filter((y) => positions.some((p) => (p.hoursByPeriod[y] || 0) > 0))
  if (!periods.length) periods = yearCols.slice(0, 3).map((y) => y.year)

  for (const p of positions) {
    const hb = {}
    for (const y of periods) hb[y] = p.hoursByPeriod[y] || 0
    p.hoursByPeriod = hb
    p.totalHours = Object.values(hb).reduce((a, b) => a + b, 0)
  }

  return { positions, periods }
}

/** Back-compat: list of { workGroup, position } from the Kostenverfolgung sheet. */
export function parsePersonalkosten(wb) {
  const sheetName = findKostenverfolgungSheet(wb)
  if (!sheetName) return []
  return parseKostenverfolgung(wb.Sheets[sheetName]).positions.map((p) => ({
    workGroup: p.workGroup,
    position: p.position,
  }))
}

function parseGeneric(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
  // Find a header row that has >=2 period tokens (years or months).
  let headerIdx = -1
  let periodCols = []
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cols = []
    rows[i].forEach((c, idx) => {
      if (isYear(c) || isMonth(c)) cols.push({ idx, label: String(c) })
    })
    if (cols.length >= 2) {
      headerIdx = i
      periodCols = cols
      break
    }
  }
  if (headerIdx === -1) return { positions: [], periods: [] }

  // Label column = first column to the left of the first period col that holds text.
  const firstPeriodCol = periodCols[0].idx
  const positions = []
  let currentGroup = ''
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    // find right-most text cell before the periods = position label
    let label = ''
    let groupCandidate = ''
    for (let c = 0; c < firstPeriodCol; c++) {
      const t = clean(r[c])
      if (t) {
        if (!label) label = t
        groupCandidate = t
      }
    }
    const hoursByPeriod = {}
    let total = 0
    for (const pc of periodCols) {
      const v = num(r[pc.idx])
      hoursByPeriod[pc.label] = v
      total += v
    }
    const key = label.toLowerCase()
    if (!label) continue
    if (total <= 0) {
      // could be a group header row (text but no numbers)
      if (label && !SKIP_POSITIONS.has(key)) currentGroup = label
      continue
    }
    if (SKIP_POSITIONS.has(key) || key.startsWith('summe') || key.startsWith('zwischensumme')) continue
    positions.push({
      workGroup: currentGroup || 'Allgemein',
      position: label,
      hoursByPeriod,
      totalHours: total,
    })
  }
  return { positions, periods: periodCols.map((p) => p.label) }
}
