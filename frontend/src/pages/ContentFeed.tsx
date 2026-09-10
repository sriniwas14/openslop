import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCompany } from '@/context/CompanyContext'
import { useContentFeed } from '@/hooks/useContentFeed'
import ContentFeedItem from '@/components/feed/ContentFeedItem'
import FeedSkeleton from '@/components/feed/FeedSkeleton'
import ReviewDialog from '@/components/feed/ReviewDialog'
import { PostMediaContainer, resolveMediaType, type PostReviewSnapshot } from '@/components/feed/PostContainer'
import { visualSrc } from '@/services/visual'
import { FeedEmptyState, FeedErrorState, DailyCompleteState } from '@/components/feed/FeedStates'

// ---------------------------------------------------------------------------
// Content Feed — single-card deck over the brand's generated content +
// matched visual assets. Lives inside the normal dashboard layout (sidebar +
// topbar retained); one focused card at a time.
//
// Deliberately simple: every action swaps the card with a short crossfade —
// no drag, no fly-off, no rotation.
//
//   X button / ArrowLeft       → skip (advance only, no side effect)
//   check button / ArrowRight  → advance + open the Review dialog for the
//     post (save in Library or share — the existing ReviewDialog, rendered
//     at deck level so it survives the card underneath changing)
//
// The deck pointer is the hook's activeIndex, so batched prefetch + visual
// polling keep working untouched. Only the active card's video autoplays.
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

  // Shared sound state — persists across cards in the session.
  const [soundOn, setSoundOn] = useState(false)

  const handleToggleSound = useCallback(() => {
    setSoundOn((prev) => !prev)
  }, [])

  // Review inputs for the swiped post — handed up by the active card.
  const [review, setReview] = useState<PostReviewSnapshot | null>(null)
  // Lets ArrowRight trigger the active card's check button.
  const reviewActionRef = useRef<(() => void) | null>(null)

  const clampedIndex = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1)
  const activeItem = items.length === 0 ? null : items[clampedIndex]
  const nextItem = items.length === 0 ? null : (items[clampedIndex + 1] ?? null)
  const isLast = items.length > 0 && clampedIndex >= items.length - 1

  // "Up next" rail inputs — media-only thumbnail of the following post.
  const nextSrc = nextItem ? visualSrc(nextItem.visual) : null
  const nextMediaType = nextItem
    ? resolveMediaType({
        explicitKind: nextItem.visual?.mediaType ?? null,
        src: nextSrc,
        contentFormat: nextItem.content.contentFormat,
      })
    : 'image'
  const nextTitle = nextItem ? (nextItem.content.hook ?? nextItem.content.title ?? 'Untitled') : ''

  const goNext = useCallback(() => {
    setActiveIndex(Math.min(clampedIndex + 1, Math.max(items.length - 1, 0)))
  }, [clampedIndex, items.length, setActiveIndex])

  const handleReviewPress = useCallback((snapshot: PostReviewSnapshot) => {
    // Stay on the same card under the dialog — advance only when the
    // dialog closes (Cancel / Done / X / Esc / outside / Open Library).
    setReview(snapshot)
  }, [])

  // keyboard parity for the two deck buttons (no vertical list to scroll)
  const goNextRef = useRef(goNext)
  useEffect(() => {
    goNextRef.current = goNext
  }, [goNext])
  const reviewOpenRef = useRef(false)
  useEffect(() => {
    reviewOpenRef.current = review !== null
  }, [review])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (reviewOpenRef.current) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goNextRef.current()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        reviewActionRef.current?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // -----------------------------------------------------------------------
  // Initial skeleton state
  // -----------------------------------------------------------------------
  if (bootstrapping && items.length === 0) {
    return (
      <div>
        <FeedSkeleton />
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------
  if (error && items.length === 0) {
    return (
      <div>
        <FeedErrorState message={error} onRetry={retry} />
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  if (!bootstrapping && items.length === 0 && !preparing) {
    return (
      <div>
        <FeedEmptyState onReload={reload} />
      </div>
    )
  }

  return (
    <div
      className="mx-auto flex w-full max-w-4xl items-start justify-center gap-6 px-4 py-4 sm:py-6"
      role="region"
      aria-roledescription="carousel"
      aria-label="Content deck"
    >
      <div className="flex w-full max-w-xl min-w-0 flex-col items-center gap-3">
      {/* Deck position */}
      {items.length > 0 && (
        <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
          Card {clampedIndex + 1} of {items.length}
          {hasMore ? '+' : ''}
        </p>
      )}

      {/* Active card — the only card in the main column; nothing stacks
          behind or overlaps the image. */}
      {activeItem && (
        <div className="relative w-full" aria-live="polite">
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.content.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <ContentFeedItem
                  item={activeItem}
                  isActive
                  index={clampedIndex}
                  onSkip={goNext}
                  onReviewPress={handleReviewPress}
                  reviewActionRef={reviewActionRef}
                  soundOn={soundOn}
                  onToggleSound={handleToggleSound}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Deck-level Review popup for the swiped post — save to Library or share.
          The deck advances on close (not on open), so the crossfade to the
          next post runs when the user dismisses the dialog. goNext is
          idempotent per render (clamped +1), so a duplicate close event
          cannot skip two cards. */}
      <ReviewDialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && review !== null) {
            setReview(null)
            goNext()
          }
        }}
        item={review?.item ?? null}
        visualUrl={review?.visualUrl ?? null}
        mediaType={review?.mediaType ?? 'image'}
        blocks={review?.blocks ?? []}
        aspect={review?.aspect ?? null}
        gifLayer={review?.gifLayer ?? undefined}
      />

      {/* End of deck */}
      {isLast && !hasMore && (
        <div className="w-full">
          {dailyComplete ? (
            <DailyCompleteState daily={daily} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-8 text-center">
              <p className="text-sm font-semibold">You've reached the end of the deck</p>
              <p className="text-xs text-muted-foreground">Swipe through again or reload for fresh posts.</p>
              <button
                type="button"
                onClick={() => setActiveIndex(0)}
                className="rounded-full bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/70"
              >
                Back to the first card
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error at end of deck */}
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

      {/* "Up next" side rail — desktop only. A static media-only thumbnail
          pinned beside the card, never overlapping the image. Hidden on
          mobile and when there is no following post. */}
      {nextItem && (
        <aside aria-label="Up next" className="sticky top-6 hidden w-44 shrink-0 lg:block">
          <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Up next</p>
          <PostMediaContainer
            src={nextSrc}
            poster={nextItem.visual?.posterUrl ?? nextItem.visual?.previewUrl ?? null}
            alt={nextTitle}
            mediaType={nextMediaType}
            resetKey={nextItem.content.id}
            visualStatus={nextItem.visualStatus}
            isActive={false}
            memeActive={false}
          />
          <p className="mt-2 line-clamp-2 text-xs font-medium text-muted-foreground">{nextTitle}</p>
        </aside>
      )}
    </div>
  )
}
