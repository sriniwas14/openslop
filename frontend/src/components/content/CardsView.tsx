import { formatDate, type ContentItem } from './data'
import { AiScorePill, PlatformList, StatusBadge, TypePreview } from './primitives'

export default function CardsView({
  items,
  onSelect,
}: {
  items: ContentItem[]
  onSelect: (item: ContentItem) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
          className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="relative">
            <TypePreview type={item.type} className="aspect-[16/9] transition-transform duration-300 group-hover:scale-[1.015]" />
            <div className="absolute top-2 left-2">
              <StatusBadge status={item.status} className="shadow-xs backdrop-blur-sm" />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 p-3.5">
            <div className="min-w-0">
              <div className="line-clamp-2 text-sm leading-snug font-semibold">{item.title}</div>
              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.summary}</div>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <div className="flex min-w-0 flex-col gap-1.5">
                <PlatformList platforms={item.platforms} max={2} />
                <span className="text-xs text-muted-foreground tabular-nums">{formatDate(item.scheduledAt)}</span>
              </div>
              <AiScorePill score={item.aiScore} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
