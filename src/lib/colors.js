// Curated, professional & accessible categorical palette for projects.
// Distinct hues that stay legible on a light (#F8FAFC) dashboard background.
export const PROJECT_PALETTE = [
  '#1e40af', // blue
  '#0e7490', // cyan-700
  '#15803d', // green-700
  '#b45309', // amber-700
  '#7c3aed', // violet-600
  '#be123c', // rose-700
  '#0f766e', // teal-700
  '#c2410c', // orange-700
  '#4d7c0f', // lime-700
  '#6d28d9', // purple-700
  '#a16207', // yellow-700
  '#1d4ed8', // blue-700
]

// Larger categorical palette for per-position series (analysis mount charts).
export const POSITION_PALETTE = [
  '#1e40af', '#0e7490', '#15803d', '#b45309', '#7c3aed', '#be123c', '#0f766e',
  '#c2410c', '#4d7c0f', '#6d28d9', '#a16207', '#db2777', '#0369a1', '#65a30d',
]

let cursor = 0
export function nextColor(usedColors = []) {
  // Prefer an unused palette color; otherwise cycle.
  for (let i = 0; i < PROJECT_PALETTE.length; i++) {
    const c = PROJECT_PALETTE[(cursor + i) % PROJECT_PALETTE.length]
    if (!usedColors.includes(c)) {
      cursor = (cursor + i + 1) % PROJECT_PALETTE.length
      return c
    }
  }
  const c = PROJECT_PALETTE[cursor % PROJECT_PALETTE.length]
  cursor += 1
  return c
}

// Lighten a hex color toward white by `amount` (0..1) — used for sub-project shades.
export function shade(hex, amount = 0) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const mix = (c) => Math.round(c + (255 - c) * amount)
  const to2 = (n) => n.toString(16).padStart(2, '0')
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`
}
