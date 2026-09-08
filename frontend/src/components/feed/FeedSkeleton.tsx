// ---------------------------------------------------------------------------
// Skeleton shown only during the very first batch load — an Instagram-style
// post card placeholder.
// ---------------------------------------------------------------------------

export default function FeedSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-4 sm:py-6">
      {[0, 1].map((i) => (
        <div key={i} className="mx-auto flex w-full flex-col items-center gap-3 sm:gap-4">
          {/* Pills */}
          <div className="flex items-center justify-center gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            <div className="h-6 w-36 animate-pulse rounded-full bg-muted" />
          </div>
          {/* Media — same phone-like content-fitted footprint as the review card */}
          <div className="w-[min(100%,max(12rem,calc((100dvh-16rem)*9/16)),24rem)] overflow-hidden rounded-2xl border bg-card shadow-md sm:w-[min(100%,max(12rem,calc((100dvh-20rem)*9/16)),24rem)]">
            <div className="aspect-[9/16] w-full animate-pulse bg-muted" />
          </div>
          {/* Actions */}
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            {[0, 1, 2].map((a) => (
              <div key={a} className="h-10 w-24 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
