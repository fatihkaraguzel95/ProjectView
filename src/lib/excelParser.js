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

// Canonical position name: strips HiSi/VoSi qualifiers, fixes the "Kontrukteur"
// typo and cost-centre suffixes ("_CU210"), so HiSi/VoSi variants collapse to
// one shared position (e.g. "Koordination BTV HiSi" + "… Vosi" -> "Koordination BTV").
export function canonicalPosition(name) {
  let s = String(name).trim().replace(/Kontrukteur/gi, 'Konstrukteur')
  s = s.replace(/\b(hisi|vosi)\b/gi, '').replace(/_[A-Za-z]{1,4}\d+/g, '')
  s = s
    .replace(/\s*:\s*/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return s
}

// Match key for grouping variants of the same role.
export function positionKey(name) {
  return String(name)
    .toLowerCase()
    .replace(/kontrukteur/g, 'konstrukteur')
    .replace(/\b(hisi|vosi)\b/g, '')
    .replace(/_[a-z]{1,4}\d+/g, '')
    .replace(/[^a-z0-9äöüß]/g, '')
}

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
// Compact a header cell for matching: lowercase and strip spaces, dashes and
// the \r\n line breaks used inside "Jahres-\r\nabschluss\r\n2024\r\n[h]",
// yielding e.g. "jahresabschluss2024[h]". Keeps [ ] € for unit detection.
const compactHdr = (v) => (v == null ? '' : String(v).toLowerCase().replace(/[\s-]+/g, ''))
const isYearHoursHeader = (v) => {
  const s = compactHdr(v)
  return s.includes('jahresabschluss') && s.includes('[h]') && /20\d{2}/.test(s)
}

export function parseKostenverfolgung(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })

  // Header row = the row carrying the "Jahresabschluss YYYY [h]" year totals.
  // Fall back to the first row with a "Jan" cell, then to the fixed row 7.
  let hidx = rows.findIndex((r) => r.some(isYearHoursHeader))
  if (hidx < 0) hidx = rows.findIndex((r) => r.some((c) => typeof c === 'string' && c.trim() === 'Jan'))
  if (hidx < 0) hidx = 7
  const hdr = rows[hidx] || []

  // Yearly HOURS columns = "Jahresabschluss YYYY [h]". The layout repeats
  // [12 months][YYYY h][YYYY €] per year, so we must pick the [h] column and
  // never the [€] cost column. This spans every year present in the template
  // (2022–2029 in the VW files) — any future year is detected automatically.
  // Fallback: if a template drops the unit tag, take the FIRST "Jahresabschluss
  // YYYY" column per year (hours precede cost in the layout).
  const yearCols = []
  const seenYear = new Set()
  hdr.forEach((c, j) => {
    const s = compactHdr(c)
    const ym = s.match(/20\d{2}/)
    if (!ym) return
    const year = ym[0]
    const isJA = s.includes('jahresabschluss')
    const isHours = s.includes('[h]') || s.includes('[std]')
    const isCost = s.includes('[€]') || s.includes('[eur]')
    if (isJA && isHours) {
      yearCols.push({ col: j, year })
      seenYear.add(year)
    } else if (isJA && !isCost && !seenYear.has(year)) {
      yearCols.push({ col: j, year })
      seenYear.add(year)
    }
  })
  yearCols.sort((a, b) => a.col - b.col)

  const positions = []
  const byLabel = new Map() // label -> position (to merge a role listed twice)
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

    // this row's monthly hours per detected year (12 columns before each "[h]")
    const rowMonths = {}
    for (const { col, year } of yearCols) {
      if (col < 12) continue
      const arr = []
      for (let m = 0; m < 12; m++) arr.push(num(r[col - 12 + m]))
      const mSum = arr.reduce((a, b) => a + b, 0)
      const yTotal = num(r[col])
      // if only a yearly total is given (no monthly split), spread it evenly so
      // the hours are never lost — months stay the single source of truth.
      rowMonths[year] = mSum === 0 && yTotal > 0 ? Array(12).fill(yTotal / 12) : arr
    }

    const existing = byLabel.get(label)
    if (existing) {
      // same role appears twice → merge month-by-month instead of dropping it
      for (const [year, arr] of Object.entries(rowMonths)) {
        const cur = existing.months[year] || Array(12).fill(0)
        existing.months[year] = cur.map((v, i) => v + (arr[i] || 0))
      }
      continue
    }
    const pos = { workGroup: currentGroup || 'Personal', position: label, months: rowMonths }
    byLabel.set(label, pos)
    positions.push(pos)
  }

  // keep only years that actually carry hours (across any position);
  // fall back to the first three detected years if the sheet is still empty.
  const yearHasData = (y) => positions.some((p) => (p.months[y] || []).some((v) => v > 0))
  let periods = yearCols.map((y) => y.year).filter(yearHasData)
  if (!periods.length) periods = yearCols.slice(0, 3).map((y) => y.year)

  // restrict each position to the kept periods; derive yearly totals from months
  for (const p of positions) {
    const months = {}
    const hoursByPeriod = {}
    for (const y of periods) {
      const arr = p.months[y] || Array(12).fill(0)
      months[y] = arr
      hoursByPeriod[y] = arr.reduce((a, b) => a + b, 0)
    }
    p.months = months
    p.hoursByPeriod = hoursByPeriod
    p.totalHours = Object.values(hoursByPeriod).reduce((a, b) => a + b, 0)
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
