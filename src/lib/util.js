let counter = 0
export function uid(prefix = 'id') {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}

export function fmt(n, digits = 0) {
  if (n == null || isNaN(n)) return '–'
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}
