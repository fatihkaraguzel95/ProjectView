import { useState } from 'react'
import { actions } from '../store.js'
import { projectTotalHours } from '../lib/resource.js'
import { PROJECT_PALETTE } from '../lib/colors.js'
import { fmt } from '../lib/util.js'
import Modal from './Modal.jsx'
import {
  IconPlus,
  IconTrash,
  IconChevron,
  IconFile,
  IconCheck,
} from './icons.jsx'

export function StatusToggle({ status, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-300 p-0.5 text-xs">
      {[
        ['awarded', 'Alınmış'],
        ['planned', 'Planlanan'],
      ].map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={`rounded-md px-2 py-1 font-semibold transition-colors ${
            status === val
              ? val === 'awarded'
                ? 'bg-brand-600 text-white'
                : 'bg-accent-500 text-white'
              : 'text-ink-500 hover:bg-ink-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function ColorPicker({ color, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-6 w-6 rounded-md ring-2 ring-white ring-offset-1 ring-offset-ink-200"
        style={{ background: color }}
        aria-label="Farbe wählen"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-20 w-44 rounded-xl border border-ink-200 bg-white p-3 shadow-pop">
            <div className="grid grid-cols-6 gap-1.5">
              {PROJECT_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onChange(c)
                    setOpen(false)
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{ background: c }}
                  aria-label={c}
                >
                  {c === color && <IconCheck width={13} height={13} stroke="#fff" />}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-500">
              Eigene
              <input
                type="color"
                value={color}
                onChange={(e) => onChange(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border border-ink-300 bg-white"
              />
            </label>
          </div>
        </>
      )}
    </div>
  )
}

function SubProjectRow({ projectId, sub }) {
  const hours = sub.positions.reduce((a, p) => a + (p.totalHours || 0), 0)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2">
      <IconFile width={16} height={16} className="shrink-0 text-ink-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink-800">{sub.name}</div>
        <div className="truncate text-xs text-ink-400" title={sub.source}>
          {sub.source || 'manuell'} · {sub.positions.length} Positionen
        </div>
      </div>
      <div className="tnum shrink-0 text-right text-xs">
        <div className="font-bold text-ink-800">{fmt(hours)} Std</div>
        <div className="text-ink-400">{(sub.periods || []).join(', ')}</div>
      </div>
    </div>
  )
}

function ProjectCard({ project }) {
  const total = projectTotalHours(project)

  return (
    <div className="card overflow-hidden">
      <div
        className="h-1 w-full"
        style={{
          background:
            project.status === 'planned'
              ? `repeating-linear-gradient(45deg, ${project.color} 0 6px, ${project.color}55 6px 12px)`
              : project.color,
        }}
      />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            className="mt-1 shrink-0 text-ink-400 transition-transform"
            style={{ transform: project.collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
            onClick={() => actions.toggleCollapse(project.id)}
            aria-label="Ein-/ausklappen"
          >
            <IconChevron width={16} height={16} />
          </button>
          <ColorPicker
            color={project.color}
            onChange={(c) => actions.updateProject(project.id, { color: c })}
          />
          <div className="min-w-0 flex-1">
            <input
              value={project.name}
              onChange={(e) => actions.updateProject(project.id, { name: e.target.value })}
              className="w-full truncate border-none bg-transparent p-0 text-sm font-bold text-ink-900 outline-none focus:ring-0"
            />
            <input
              value={project.client}
              placeholder="Kunde / Phase"
              onChange={(e) => actions.updateProject(project.id, { client: e.target.value })}
              className="w-full truncate border-none bg-transparent p-0 text-xs text-ink-400 outline-none focus:ring-0"
            />
          </div>
          <button
            className="btn-ghost shrink-0 p-1.5 text-ink-400 hover:text-red-600"
            onClick={() => actions.removeProject(project.id)}
            aria-label="Projekt löschen"
          >
            <IconTrash width={16} height={16} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <StatusToggle
            status={project.status}
            onChange={(s) => actions.updateProject(project.id, { status: s })}
          />
          <div className="tnum text-right text-xs">
            <span className="font-bold text-ink-800">{fmt(total)}</span>
            <span className="text-ink-400"> Std · {project.subProjects.length} Teilprojekte</span>
          </div>
        </div>

        {!project.collapsed && (
          <div className="mt-3 space-y-2">
            {project.subProjects.map((sp) => (
              <SubProjectRow key={sp.id} projectId={project.id} sub={sp} />
            ))}
            {project.subProjects.length === 0 && (
              <p className="rounded-lg border border-dashed border-ink-200 px-3 py-2 text-center text-xs text-ink-400">
                Teilprojekte werden unter „Projektdaten" per Excel hinzugefügt.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProjectsPanel({ projects }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', client: '', status: 'awarded' })

  const create = () => {
    actions.addProject(form)
    setForm({ name: '', client: '', status: 'awarded' })
    setModalOpen(false)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Projekte</h2>
          <p className="text-xs text-ink-400">{projects.length} Projekte im Portfolio</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setModalOpen(true)}>
          <IconPlus width={16} height={16} /> Projekt
        </button>
      </div>

      <div className="space-y-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {projects.length === 0 && (
          <div className="card p-6 text-center text-sm text-ink-400">
            Noch keine Projekte. Legen Sie das erste an.
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Neues Projekt"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModalOpen(false)}>
              Abbrechen
            </button>
            <button className="btn-primary" onClick={create}>
              Erstellen
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Projektname</label>
            <input
              autoFocus
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z. B. VW386 0EU · T-ROC"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-600">Kunde / Phase</label>
            <input
              className="input"
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              placeholder="z. B. Volkswagen AG"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-600">Status</label>
            <StatusToggle status={form.status} onChange={(s) => setForm({ ...form, status: s })} />
            <p className="mt-1.5 text-xs text-ink-400">
              „Alınmış" = beauftragt · „Planlanan" = geplant (im Chart schraffiert)
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
