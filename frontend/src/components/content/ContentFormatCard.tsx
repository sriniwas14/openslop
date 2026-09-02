import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContentFormat } from './formats'

export default function ContentFormatCard({
  format,
  selected,
  onSelect,
}: {
  format: ContentFormat
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-[15px] border bg-card text-left shadow-xs transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
        // selected: orange border thickened by a 1px halo — no size shift
        selected
          ? 'border-primary shadow-[0_0_0_1px_var(--primary)]'
          : 'border-border',
      )}
    >
      {format.type === 'custom' ? (
        <div className="grid aspect-[4/3] w-full place-items-center bg-muted">
          <Pencil className="size-9 text-primary" strokeWidth={1.5} />
        </div>
      ) : (
        <img
          src={format.image ?? undefined}
          alt={format.title}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
        />
      )}
      <div className="p-3.5">
        <div className="text-[15px] leading-tight font-bold text-foreground">{format.title}</div>
        <div className="mt-1 text-[13px] leading-[1.35] text-muted-foreground">{format.description}</div>
      </div>
    </button>
  )
}
