import { Calendar, LayoutGrid, List, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CONTENT_TYPES,
  PLATFORMS,
  STATUSES,
  scoreTone,
  type ContentStatus,
  type ContentType,
  type Platform,
  type ViewMode,
} from './data'

/** Small monochrome tile with the content-type icon — used as preview thumbnails. */
export function TypeIconBox({
  type,
  className,
  iconClassName,
}: {
  type: ContentType
  className?: string
  iconClassName?: string
}) {
  const meta = CONTENT_TYPES[type]
  const Icon = meta.icon
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-lg text-background',
        meta.gradient,
        className,
      )}
    >
      <Icon className={iconClassName ?? 'size-4'} />
    </div>
  )
}

/** Quiet preview panel used on cards and detail banners. */
export function TypePreview({ type, className }: { type: ContentType; className?: string }) {
  const meta = CONTENT_TYPES[type]
  const Icon = meta.icon
  return (
    <div className={cn('relative overflow-hidden border-b bg-muted/40', className)}>
      <div className="absolute inset-0 grid place-items-center">
        <Icon className="size-10 text-foreground/40" strokeWidth={1.5} />
      </div>
    </div>
  )
}

export function StatusBadge({ status, className }: { status: ContentStatus; className?: string }) {
  const meta = STATUSES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        meta.badge,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function TypeBadge({ type, className }: { type: ContentType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap', className)}>
      <TypeIconBox type={type} className="size-4.5 rounded" iconClassName="size-2.5" />
      {CONTENT_TYPES[type].label}
    </span>
  )
}

export function PlatformList({ platforms, max = 3 }: { platforms: Platform[]; max?: number }) {
  const shown = platforms.slice(0, max)
  const extra = platforms.length - shown.length
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {shown.map((p) => (
        <span key={p} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', PLATFORMS[p].dot)} />
          {PLATFORMS[p].label}
        </span>
      ))}
      {extra > 0 && <span className="text-xs text-muted-foreground">+{extra}</span>}
    </span>
  )
}

export function AiScorePill({ score, className }: { score: number; className?: string }) {
  return (
    <span
      title="AI visibility / relevance score"
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap',
        scoreTone(score),
        className,
      )}
    >
      <Sparkles className="size-3" />
      {score}
    </span>
  )
}

const VIEW_OPTIONS: { value: ViewMode; label: string; icon: typeof List }[] = [
  { value: 'list', label: 'List', icon: List },
  { value: 'calendar', label: 'Calendar', icon: Calendar },
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
]

export function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center rounded-lg border bg-muted/60 p-0.5" role="tablist" aria-label="Content view">
      {VIEW_OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-xs font-medium transition-all',
            value === v ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
