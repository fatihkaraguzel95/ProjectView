// Vertical zoom slider for a chart's numeric (vertical) axis.
//
// zoom = 1 shows the full range. Higher values shrink the visible maximum so
// the lower band fills the chart and small values become readable, while the
// peaks clip off the top (the chart's YAxis needs `allowDataOverflow`).
//
// Given a base maximum, `yMaxForZoom(base, zoom)` returns the domain top to use.
export function yMaxForZoom(base, zoom) {
  const safe = base > 0 ? base : 1
  return safe / (zoom || 1)
}

export default function YAxisZoom({ zoom, setZoom, height = 540, min = 0.5, max = 8, className = '' }) {
  return (
    <div
      className={`flex shrink-0 select-none flex-col items-center gap-1.5 pr-1 text-[10px] font-semibold text-ink-400 ${className}`}
      style={{ height }}
      title="Vertikale Achse skalieren"
    >
      <button
        type="button"
        onClick={() => setZoom((z) => Math.min(max, Math.round((z + 0.5) * 10) / 10))}
        className="rounded px-1 leading-none hover:bg-ink-100 hover:text-ink-700"
        title="Vergrößern"
      >
        +
      </button>
      <input
        type="range"
        className="vzoom flex-1"
        min={min}
        max={max}
        step={0.1}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label="Vertikale Achse skalieren"
      />
      <button
        type="button"
        onClick={() => setZoom((z) => Math.max(min, Math.round((z - 0.5) * 10) / 10))}
        className="rounded px-1 leading-none hover:bg-ink-100 hover:text-ink-700"
        title="Verkleinern"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => setZoom(1)}
        className={`tnum rounded px-1 py-0.5 leading-none ${
          Math.abs(zoom - 1) > 0.001 ? 'text-brand-600 hover:bg-brand-50' : 'text-ink-400'
        }`}
        title="Zurücksetzen (1:1)"
      >
        {zoom.toFixed(1)}×
      </button>
    </div>
  )
}
