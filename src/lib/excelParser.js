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
  const personalPositions = parsePersonalkosten(wb)

  // Strategy 1: EKAS sheet (real template).
  const ekasName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'ekas')
  if (ekasName) {
    const res = parseEkas(wb.Sheets[ekasName])
    if (res.positions.length)
      return { ...res, personalPositions, meta: { fileName, sheet: ekasName, strategy: 'EKAS' } }
  }

  // Strategy 2: generic — scan every sheet, pick the one that yields the most rows.
  let best = { positions: [], periods: [] }
  let bestSheet = ''
  for (const name of wb.SheetNames) {
    const res = parseGeneric(wb.Sheets[name])
    if (res.positions.length > best.positions.length) {
      best = res
      bestSheet = name
    }
  }
  return { ...best, personalPositions, meta: { fileName, sheet: bestSheet, strategy: 'generic' } }
}

/**
 * Extracts the job positions listed in the PERSONALKOSTEN section of a
 * "Kostenverfolgung" / "LEK" sheet — e.g. Projektleiter/in, Projektingenieur/in,
 * Konstrukteur/in …. Returns [{ workGroup, position }].
 * A row is a position when col C holds a numeric hourly rate (Std-Satz);
 * section headers (Projektsteuerung, Konstruktion …) carry text there instead.
 */
export function parsePersonalkosten(wb) {
  const sheetName = wb.SheetNames.find((n) => {
    const k = n.toLowerCase()
    return k.includes('kostenverfolgung') || k.startsWith('lek')
  })
  if (!sheetName) return []
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true })

  const out = []
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
    // Section header row: has a non-numeric "Kalkulation" rate cell.
    if (typeof rate !== 'number') {
      if (!key.startsWith('summe') && !key.startsWith('gesamtsumme')) currentGroup = label
      continue
    }
    if (rate <= 0) continue // placeholder rows
    if (key.startsWith('summe')) continue
    if (seen.has(label)) continue
    seen.add(label)
    out.push({ workGroup: currentGroup || 'Personal', position: label })
  }
  return out
}

function parseEkas(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
  // Layout (0-indexed cols): B=Fachbereich(1) C=Umfang(2) D=Std'22(3) G=Std'23(6) J=Std'24(9)
  // Detect the year header cells to be robust to shifts.
  let yearCols = { 3: null, 6: null, 9: null }
  for (const r of rows.slice(0, 8)) {
    r.forEach((cell, idx) => {
      if (isYear(cell) && yearCols[idx] === null && [3, 6, 9].includes(idx)) {
        yearCols[idx] = String(cell)
      }
    })
  }
  // Fallback labels if header detection failed.
  const periodFor = { 3: yearCols[3] || '2022', 6: yearCols[6] || '2023', 9: yearCols[9] || '2024' }
  const periods = [periodFor[3], periodFor[6], periodFor[9]]

  const positions = []
  let currentGroup = ''
  for (const r of rows) {
    const fb = clean(r[1])
    const umfang = clean(r[2])
    if (fb) currentGroup = fb
    const key = umfang.toLowerCase()
    if (!umfang || SKIP_POSITIONS.has(key) || umfang.includes('VW386') || key.startsWith('zwischensumme')) continue
    const hoursByPeriod = {
      [periodFor[3]]: num(r[3]),
      [periodFor[6]]: num(r[6]),
      [periodFor[9]]: num(r[9]),
    }
    const totalHours = Object.values(hoursByPeriod).reduce((a, b) => a + b, 0)
    if (totalHours <= 0) continue
    positions.push({
      workGroup: currentGroup || 'Allgemein',
      position: umfang,
      hoursByPeriod,
      totalHours,
    })
  }
  return { positions, periods: periods.filter((p, i, a) => a.indexOf(p) === i) }
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
