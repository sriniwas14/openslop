import { useState } from 'react'
import { CheckCircle2, Download, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/content/primitives'
import type { ContentStatus } from '@/components/content/data'
import type { LibraryStatus } from '@/services/library'

// ---------------------------------------------------------------------------
// Library detail dialog — Content-page language for a saved post or media
// bank item: media header, status row, title, meta line, then the Library
// actions (Download / Schedule / Publish / Draft / Remove).
// ---------------------------------------------------------------------------

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle: string | null
  status: LibraryStatus
  needsAttention?: boolean
  scheduledAt: string | null
  meta: string
  media: React.ReactNode
  downloading: boolean
  canDownload: boolean
  onDownload: () => void
  onSchedule: (iso: string) => void
  onPublish: () => void
  onDraft: () => void
  onRemove: () => void
}

export default function LibraryDetailDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  needsAttention,
  scheduledAt,
  meta,
  media,
  downloading,
  canDownload,
  onDownload,
  onSchedule,
  onPublish,
  onDraft,
  onRemove,
}: Props) {
  const [dateValue, setDateValue] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="line-clamp-2 text-left">{title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5 text-left">
            <StatusBadge status={status as ContentStatus} />
            {needsAttention && (
              <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                Needs Attention
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border bg-card">{media}</div>

        <div className="grid gap-2">
          {subtitle && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
          <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {scheduledAt ? new Date(scheduledAt).toLocaleString() : 'Not scheduled'}
            </span>
            <span>{meta}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              type="datetime-local"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="h-8 text-xs"
              aria-label="Schedule date"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!dateValue}
              onClick={() => dateValue && onSchedule(new Date(dateValue).toISOString())}
            >
              Schedule
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={onDownload} disabled={!canDownload || downloading}>
              <Download className="size-3.5" data-icon="inline-start" />
              {downloading ? 'Preparing…' : 'Download'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onPublish}>
              <CheckCircle2 className="size-3.5" data-icon="inline-start" />
              Publish
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDraft}>
              Draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive"
              onClick={onRemove}
              aria-label="Remove from library"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
