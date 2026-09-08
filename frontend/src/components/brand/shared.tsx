import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ponytail: data-driven Brand Intelligence UI. Sections/items are described by field
// configs; a single generic dialog renders + validates them, so every piece is
// viewable, editable, addable, deletable and savable without bespoke forms.

export type FieldType = 'text' | 'url' | 'textarea' | 'list' | 'number' | 'boolean'

export type FieldConfig = {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  hint?: string
  maxLength?: number
  rows?: number
  min?: number
  max?: number
  step?: number
  required?: boolean
}

export function toStr(v: unknown): string {
  if (v == null) return ''
  return typeof v === 'string' ? v : String(v)
}

export function toList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => (typeof x === 'string' ? x : x == null ? '' : String(x))).filter((x) => x.trim().length > 0)
}

function parseList(text: string, maxLength?: number): string[] {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (maxLength ? x.slice(0, maxLength) : x))
}

/** Multi-line list editor — one item per line. Owns its raw text; parses up on change. */
export function ListInput({
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  id,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  rows?: number
  maxLength?: number
  id?: string
}) {
  const [text, setText] = useState(() => toList(value).join('\n'))
  return (
    <div className="grid gap-1">
      <Textarea
        id={id}
        rows={rows}
        placeholder={placeholder ?? 'One item per line'}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseList(e.target.value, maxLength))
        }}
      />
      <p className="text-xs text-muted-foreground">
        {toList(value).length} item{toList(value).length === 1 ? '' : 's'} · one per line
      </p>
    </div>
  )
}

/** Renders a set of field configs against a values record. */
export function FieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: FieldConfig[]
  values: Record<string, any>
  onChange: (key: string, v: any) => void
}) {
  return (
    <div className="grid gap-4">
      {fields.map((f) => {
        const id = `bf-${f.key}`
        return (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={id}>
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>
            {f.type === 'textarea' ? (
              <Textarea
                id={id}
                rows={f.rows ?? 3}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                value={toStr(values[f.key])}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : f.type === 'list' ? (
              <ListInput
                id={id}
                value={toList(values[f.key])}
                onChange={(v) => onChange(f.key, v)}
                placeholder={f.placeholder}
                rows={f.rows ?? 4}
                maxLength={f.maxLength}
              />
            ) : f.type === 'number' ? (
              <Input
                id={id}
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => onChange(f.key, e.target.value === '' ? null : Number(e.target.value))}
              />
            ) : f.type === 'boolean' ? (
              <button
                type="button"
                id={id}
                aria-pressed={!!values[f.key]}
                onClick={() => onChange(f.key, !values[f.key])}
                className={cn(
                  'inline-flex h-10 w-fit items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                  values[f.key] ? 'border-primary bg-accent text-accent-foreground' : 'bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                <span className={cn('grid size-4 place-items-center rounded-full border', values[f.key] ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50')}>
                  {values[f.key] ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                {values[f.key] ? 'Active' : 'Inactive'}
              </button>
            ) : (
              <Input
                id={id}
                type={f.type === 'url' ? 'url' : 'text'}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                value={toStr(values[f.key])}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )}
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        )
      })}
    </div>
  )
}

/** Generic edit/create dialog driven by field configs. Handles draft, validation, saving. */
export function EditorDialog({
  open,
  title,
  description,
  fields,
  initial,
  onClose,
  onSave,
  submitLabel = 'Save',
}: {
  open: boolean
  title: string
  description?: string
  fields: FieldConfig[]
  initial: Record<string, any>
  onClose: () => void
  onSave: (values: Record<string, any>) => Promise<void>
  submitLabel?: string
}) {
  const [values, setValues] = useState<Record<string, any>>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ponytail: reset the draft during render when the dialog (re)opens, so the
  // semi-uncontrolled ListInput mounts with the correct values. An effect would run
  // too late (after children mount) and leave stale list items from the previous item.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setValues(initial)
      setError(null)
      setSaving(false)
    }
  }

  function set(key: string, v: any) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  async function handleSave() {
    for (const f of fields) {
      if (!f.required) continue
      const v = values[f.key]
      const empty = f.type === 'list' ? toList(v).length === 0 : typeof v === 'string' ? !v.trim() : v == null || v === ''
      if (empty) {
        setError(`${f.label} is required`)
        return
      }
      if (f.type === 'url' && typeof v === 'string' && v.trim()) {
        try {
          new URL(v.trim())
        } catch {
          setError(`${f.label} must be a valid URL`)
          return
        }
      }
      if (f.type === 'number' && v != null && v !== '') {
        const n = Number(v)
        if (!Number.isFinite(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max)) {
          setError(`${f.label} must be between ${f.min ?? '−∞'} and ${f.max ?? '∞'}`)
          return
        }
      }
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(values)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <FieldInputs fields={fields} values={values} onChange={set} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Card shell for a Brand Intelligence section, with an optional Edit action. */
export function SectionCard({
  icon: Icon,
  title,
  description,
  onEdit,
  busy,
  action,
  children,
}: {
  icon?: React.ElementType
  title: string
  description?: string
  onEdit?: () => void
  busy?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              <CardTitle className="truncate">{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
                <Pencil className="size-3.5" /> Edit
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function DisplayField({ label, value }: { label: string; value?: string | null }) {
  const v = toStr(value).trim()
  if (!v) return null
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-relaxed whitespace-pre-wrap">{v}</dd>
    </div>
  )
}

export function DisplayList({ label, items }: { label: string; items?: string[] | null }) {
  const list = toList(items)
  if (!list.length) return null
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {list.map((x, i) => (
          <span key={i} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
            {x}
          </span>
        ))}
      </dd>
    </div>
  )
}

/** A definition list that shows a muted note when nothing is filled in yet. */
export function DisplayGrid({ children, empty }: { children: React.ReactNode; empty?: boolean }) {
  if (empty) return <EmptyNote />
  return <dl className="grid gap-3">{children}</dl>
}

export function EmptyNote({ text = 'Nothing here yet — click Edit to add it.' }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'active' | 'muted' | 'priority' }) {
  const tones: Record<string, string> = {
    neutral: 'border bg-muted/40 text-foreground',
    active: 'border border-primary/30 bg-accent text-accent-foreground',
    muted: 'border bg-muted/40 text-muted-foreground',
    priority: 'border border-primary/30 bg-accent text-accent-foreground',
  }
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

/** Small clickable list row used for object arrays (angles, segments, competitors). */
export function ItemRow({
  title,
  subtitle,
  badges,
  onClick,
  onDelete,
  deleting,
}: {
  title: string
  subtitle?: string | null
  badges?: React.ReactNode
  onClick: () => void
  onDelete?: () => void
  deleting?: boolean
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="group flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {badges}
        </div>
        {subtitle && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={deleting}
          aria-label={`Delete ${title}`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  )
}
