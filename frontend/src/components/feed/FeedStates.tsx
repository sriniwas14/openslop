import { AlertTriangle, RefreshCw, Sparkles, ZapOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Terminal states for the content feed: empty, error, daily complete.
// Rendered as centered cards inside the normal dashboard layout.
// ---------------------------------------------------------------------------

function EmptyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-20 text-center">
      {children}
    </div>
  )
}

export function FeedEmptyState({ onReload }: { onReload?: () => void }) {
  return (
    <EmptyWrapper>
      <div className="flex flex-col items-center gap-4 max-w-sm">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="size-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No content yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated content will appear here once your brand has posts ready for visual discovery.
          </p>
        </div>
        {onReload && (
          <Button variant="outline" size="sm" onClick={onReload}>
            <RefreshCw className="size-3.5" data-icon="inline-start" />
            Refresh
          </Button>
        )}
      </div>
    </EmptyWrapper>
  )
}

export function FeedErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyWrapper>
      <div className="flex flex-col items-center gap-4 max-w-sm">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="size-8 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Something went wrong</h3>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-3.5" data-icon="inline-start" />
            Try again
          </Button>
        )}
      </div>
    </EmptyWrapper>
  )
}

export function DailyCompleteState({ daily }: { daily: { dailyLimit: number; preparedToday: number } }) {
  return (
    <EmptyWrapper>
      <div className="flex flex-col items-center gap-4 max-w-sm">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <ZapOff className="size-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">You're all caught up for today</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            New content will be ready tomorrow. You've reviewed{' '}
            <span className="font-medium text-foreground">{daily.preparedToday}</span> pieces today.
          </p>
        </div>
      </div>
    </EmptyWrapper>
  )
}
