import { useEffect, useRef } from 'react'
import { useCompany } from '@/context/CompanyContext'
import { useContentFeed } from '@/hooks/useContentFeed'
import ContentFeedItem from '@/components/feed/ContentFeedItem'
import FeedSkeleton from '@/components/feed/FeedSkeleton'
import { FeedEmptyState, FeedErrorState, DailyCompleteState } from '@/components/feed/FeedStates'

// ---------------------------------------------------------------------------
// Content Feed — Instagram-style vertical feed over the brand's generated
// content + matched visual assets. Lives inside the normal dashboard layout
// (sidebar + topbar retained); the user simply scrolls the main column.
// ---------------------------------------------------------------------------

export default function ContentFeed() {
  const { selectedId } = useCompany()
  const {
    items,
    bootstrapping,
    preparing,
    error,
    hasMore,
    dailyComplete,
    daily,
    activeIndex,
    setActiveIndex,
    reload,
    retry,
  } = useContentFeed(selectedId)

  const containerRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------------------------------
  // IntersectionObserver — track the most visible item to drive video autoplay.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let bestIndex = 0
    let bestRatio = 0
    let bestPending = false

    const observer = new IntersectionObserver(
      (entries) => {
        bestPending = true
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.feedIndex)
          if (Number.isNaN(idx)) continue
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio
            bestIndex = idx
          }
        }
        if (bestPending) {
          if (bestRatio > 0.5) setActiveIndex(bestIndex)
          bestRatio = 0
          bestPending = false
        }
      },
      { root: null, threshold: [0, 0.5, 0.8, 1] },
    )

    const itemsEls = container.querySelectorAll<HTMLElement>('[data-feed-index]')
    itemsEls.forEach((el) => observer.observe(el))

    return () => {
      itemsEls.forEach((el) => observer.unobserve(el))
      observer.disconnect()
    }
  }, [items.length, setActiveIndex])

  // -----------------------------------------------------------------------
  // Initial skeleton state
  // -----------------------------------------------------------------------
  if (bootstrapping && items.length === 0) {
    return (
      <div ref={containerRef}>
        <FeedSkeleton />
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  if (error && items.length === 0) {
    return (
      <div ref={containerRef}>
        <FeedErrorState message={error} onRetry={retry} />
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  if (!bootstrapping && items.length === 0 && !preparing) {
    return (
      <div ref={containerRef}>
        <FeedEmptyState onReload={reload} />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4" ref={containerRef}>
      {items.map((item, idx) => (
        <div
          key={item.content.id}
          data-feed-index={idx}
          role="article"
          aria-posinset={idx + 1}
          aria-setsize={hasMore ? -1 : items.length}
          aria-label={`Post ${idx + 1}: ${item.content.hook ?? item.content.title ?? 'Untitled'}`}
        >
          <ContentFeedItem item={item} isActive={idx === activeIndex} index={idx} />
        </div>
      ))}

      {/* Daily complete sentinel */}
      {dailyComplete && hasMore === false && items.length > 0 && (
        <DailyCompleteState daily={daily} />
      )}

      {/* Error at end of feed */}
      {error && items.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <button
            type="button"
            onClick={retry}
            className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
          >
            <span>Load failed — tap to retry</span>
          </button>
        </div>
      )}

      {/* Preparing indicator at end */}
      {preparing && !dailyComplete && items.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            Preparing more visuals…
          </div>
        </div>
      )}
    </div>
  )
}
