// ---------------------------------------------------------------------------
// Skeleton shown only during the very first batch load — an Instagram-style
// post card placeholder.
// ---------------------------------------------------------------------------

export default function FeedSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-2xl border bg-card">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3">
            <div className="size-9 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            </div>
          </div>
          {/* Media */}
          <div className="aspect-[4/5] w-full animate-pulse bg-muted" />
          {/* Actions */}
          <div className="flex gap-2 px-4 py-3">
            {[0, 1, 2].map((a) => (
              <div key={a} className="size-6 animate-pulse rounded bg-muted" />
            ))}
          </div>
          {/* Caption */}
          <div className="space-y-2 px-4 pb-4">
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
