import { useEffect } from 'react'
import { IconX } from './icons.jsx'

export default function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl bg-white shadow-pop`}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h3 className="text-base font-bold text-ink-900">{title}</h3>
          <button className="btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  )
}
