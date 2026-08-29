import { Copy, Trash2 } from 'lucide-react'
import { formatDate, type ContentItem } from './data'
import { AiScorePill, PlatformList, StatusBadge, TypeBadge, TypeIconBox } from './primitives'

function RowActions({
  item,
  onDuplicate,
  onDelete,
}: {
  item: ContentItem
  onDuplicate: (item: ContentItem) => void
  onDelete: (item: ContentItem) => void
}) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        title="Duplicate"
        aria-label={`Duplicate ${item.title}`}
        onClick={(e) => {
          e.stopPropagation()
          onDuplicate(item)
        }}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Copy className="size-3.5" />
      </button>
      <button
        type="button"
        title="Delete"
        aria-label={`Delete ${item.title}`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(item)
        }}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

export default function ListView({
  items,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  items: ContentItem[]
  onSelect: (item: ContentItem) => void
  onDuplicate: (item: ContentItem) => void
  onDelete: (item: ContentItem) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* header */}
      <div className="hidden items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:flex">
        <div className="w-9" />
        <div className="min-w-0 flex-1">Content</div>
        <div className="w-32">Type</div>
        <div className="hidden w-40 xl:block">Platform</div>
        <div className="w-24">Status</div>
        <div className="w-16">Date</div>
        <div className="w-14">AI score</div>
        <div className="w-16" />
      </div>

      <div className="divide-y">
        {items.map((item) => (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(item)
              }
            }}
            className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
          >
            <TypeIconBox type={item.type} className="size-9" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.title}</div>
              <div className="truncate text-xs text-muted-foreground">{item.summary}</div>
            </div>
            <div className="hidden w-32 md:block">
              <TypeBadge type={item.type} />
            </div>
            <div className="hidden w-40 xl:block">
              <PlatformList platforms={item.platforms} />
            </div>
            <div className="hidden w-24 md:block">
              <StatusBadge status={item.status} />
            </div>
            <div className="hidden w-16 text-xs text-muted-foreground tabular-nums md:block">
              {formatDate(item.scheduledAt)}
            </div>
            <div className="hidden w-14 md:block">
              <AiScorePill score={item.aiScore} />
            </div>
            <div className="hidden w-16 justify-end md:flex">
              <RowActions item={item} onDuplicate={onDuplicate} onDelete={onDelete} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
