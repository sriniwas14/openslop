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
            className="mb-4 break-inside-avoid cursor-pointer outline-none"
          >
            <div
              className={cn(
                'group relative overflow-hidden rounded-xl border bg-card shadow-xs outline-none transition-all hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50',
                isHorizontal ? 'aspect-[16/9]' : 'aspect-[9/16]',
              )}
            >
              {/* default no-image placeholder — gradient like reel/tiktok */}
              <div className={cn('absolute inset-0 bg-gradient-to-br', meta.gradient)} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.18),transparent_50%)]" />
              <div className="absolute inset-0 grid place-items-center">
                <Icon className="size-10 text-white/80 drop-shadow-sm sm:size-12" strokeWidth={1.5} />
              </div>
              {/* scrim for legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

              {/* top badges */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <StatusBadge status={item.status} className="shadow-xs backdrop-blur-sm" />
              </div>
              <div className="absolute top-2 right-2">
                <AiScorePill score={item.aiScore} className="shadow-xs" />
              </div>

              {/* bottom overlay — tiktok style */}
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="line-clamp-2 text-sm font-semibold leading-snug text-white drop-shadow-sm">{item.title}</div>
                <div className="mt-1 line-clamp-1 text-xs text-white/75">{item.summary}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs tabular-nums text-white/60">{formatDate(item.scheduledAt)}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-white/70">
                    {item.platforms.slice(0, 2).map((p) => (
                      <span key={p} className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] leading-none">{p}</span>
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
