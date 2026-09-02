import { cn } from '@/lib/utils'
import { CONTENT_TYPES, formatDate, type ContentItem } from './data'
import { AiScorePill, StatusBadge } from './primitives'

export default function CardsView({
  items,
  onSelect,
}: {
  items: ContentItem[]
  onSelect: (item: ContentItem) => void
}) {
  return (
    <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
      {items.map((item) => {
        const meta = CONTENT_TYPES[item.type]
        const Icon = meta.icon
        const isHorizontal = item.format === 'horizontal'
        return (
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
            className="group mb-4 break-inside-avoid cursor-pointer outline-none"
          >
            <div className="overflow-hidden rounded-xl border bg-card transition-colors outline-none group-hover:border-foreground/20 group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
              {/* media area — generated media or quiet monochrome placeholder */}
              {item.mediaUrl ? (
                item.type === 'carousel' ? (
                  <img src={item.mediaUrl} alt="" className={cn('w-full object-cover', isHorizontal ? 'aspect-[16/9]' : 'aspect-[4/5]')} />
                ) : (
                  <video src={item.mediaUrl} muted playsInline className={cn('w-full object-cover', isHorizontal ? 'aspect-[16/9]' : 'aspect-[4/5]')} />
                )
              ) : (
                <div className={cn('grid w-full place-items-center border-b bg-muted/40', isHorizontal ? 'aspect-[16/9]' : 'aspect-[4/5]')}>
                  <Icon className="size-8 text-foreground/35" strokeWidth={1.5} />
                </div>
              )}

              {/* info */}
              <div className="grid gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={item.status} />
                  <AiScorePill score={item.aiScore} />
                </div>
                <div className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</div>
                <div className="line-clamp-1 text-xs text-muted-foreground">{item.summary}</div>
                <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{formatDate(item.scheduledAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    {item.platforms.slice(0, 2).map((p) => (
                      <span key={p} className="rounded-full border px-1.5 py-0.5 text-[10px] leading-none">{p}</span>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
