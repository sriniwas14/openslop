import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, Check, CheckCircle2, Copy, Download, Send, Trash2, Undo2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/content/primitives'
import type { ContentStatus } from '@/components/content/data'
import type { LibraryStatus } from '@/services/library'

// ---------------------------------------------------------------------------
// Library detail dialog — redesigned as a two-pane action workflow.
//
// Left pane: media preview + title/caption/meta (what is this post).
// Right pane: stepped workflow the user asked for —
//   1. Schedule (quick picks + exact time + clear)
//   2. Post (Post now primary, Draft secondary)
//   3. More (Download, Remove with confirm)
//
// Single column on mobile, two columns from `sm` up. The parent owns all
// mutations; this dialog only collects intent (iso string / confirm clicks).
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
  /** Details editing (backend PATCH title/hook/body or name). Omitted = read-only. */
  initialTitle?: string
  initialCaption?: string | null
  isBank?: boolean
  savingDetails?: boolean
  onSaveDetails?: (patch: { title?: string; hook?: string; body?: string; name?: string }) => void
  /** Other items scheduled within ±30 min of the picked time — conflict warning. */
  conflicts?: { title: string; at: string }[]
  captionText?: string | null
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function atHour(daysFromNow: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, 0, 0, 0)
  return d
}

function nextMonday9am(): Date {
  const d = new Date()
  const delta = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + delta)
  d.setHours(9, 0, 0, 0)
  return d
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
  initialTitle,
  initialCaption,
  isBank,
  savingDetails,
  onSaveDetails,
  conflicts,
  captionText,
}: Props) {
  const [dateValue, setDateValue] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editCaption, setEditCaption] = useState('')
  const [copied, setCopied] = useState(false)

  // Reset per-item: prefill the scheduler with the stored time so
  // rescheduling is one click, and clear the remove confirm.
  useEffect(() => {
    if (open) {
      setDateValue(toLocalInputValue(scheduledAt))
      setConfirmRemove(false)
      setEditTitle(initialTitle ?? title)
      setEditCaption(initialCaption ?? subtitle ?? '')
      setCopied(false)
    }
  }, [open, scheduledAt, initialTitle, initialCaption, title, subtitle])

  const scheduledLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not scheduled'

  // ponytail: computed once per open so render stays pure (oxlint react/purity).
  const quickPicks = useMemo(
    () => [
      { label: 'Tomorrow 9am', at: atHour(1, 9) },
      { label: 'Mon 9am', at: nextMonday9am() },
      { label: 'In 1 hour', at: new Date(Date.now() + 60 * 60 * 1000) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally per-mount
    [open],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={status as ContentStatus} />
            {needsAttention && (
              <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                Needs Attention
              </span>
            )}
            {scheduledAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info tabular-nums">
                <CalendarPlus className="size-3" />
                {scheduledLabel}
              </span>
            )}
          </div>
          <DialogTitle className="line-clamp-2 text-left text-lg">{title}</DialogTitle>
          {meta && (
            <DialogDescription className="text-left text-xs">{meta}</DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* Preview pane */}
          <div className="grid content-start gap-2">
            <div className="overflow-hidden rounded-xl border bg-card">{media}</div>
            {subtitle && <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={onDownload}
              disabled={!canDownload || downloading}
            >
              <Download className="size-3.5" data-icon="inline-start" />
              {downloading ? 'Preparing…' : 'Download file'}
            </Button>
          </div>

          {/* Workflow pane */}
          <div className="grid content-start gap-3">
            {/* 0 — Details (title + caption, persisted via backend PATCH) */}
            {onSaveDetails && (
              <section aria-label="Details" className="grid gap-2 rounded-xl border bg-muted/30 p-3">
                <h3 className="text-sm font-semibold">Details</h3>
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  {isBank ? 'Name' : 'Title'}
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-8 bg-background text-sm font-normal text-foreground"
                    maxLength={isBank ? 255 : 500}
                    aria-label={isBank ? 'Media name' : 'Post title'}
                  />
                </label>
                {!isBank && (
                  <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                    Caption
                    <Textarea
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      className="min-h-16 bg-background text-sm font-normal text-foreground"
                      maxLength={2000}
                      aria-label="Post caption"
                    />
                  </label>
                )}
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !!savingDetails ||
                      (isBank ? editTitle.trim() === (initialTitle ?? title) : editTitle === (initialTitle ?? title) && editCaption === (initialCaption ?? subtitle ?? ''))
                    }
                    onClick={() =>
                      isBank
                        ? onSaveDetails({ name: editTitle.trim() })
                        : onSaveDetails({ title: editTitle, hook: editCaption, body: editCaption })
                    }
                  >
                    {savingDetails ? 'Saving…' : 'Save details'}
                  </Button>
                  {captionText && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard?.writeText(captionText).then(
                          () => {
                            setCopied(true)
                            setTimeout(() => setCopied(false), 1500)
                          },
                          () => {},
                        )
                      }}
                    >
                      {copied ? <Check className="size-3.5" data-icon="inline-start" /> : <Copy className="size-3.5" data-icon="inline-start" />}
                      {copied ? 'Copied' : 'Copy caption'}
                    </Button>
                  )}
                </div>
              </section>
            )}
            {/* 1 — Schedule */}
            <section aria-label="Schedule" className="grid gap-2 rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">1 · Schedule</h3>
                <span className="text-xs text-muted-foreground tabular-nums">{scheduledLabel}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickPicks.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setDateValue(toLocalInputValue(q.at.toISOString()))}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="datetime-local"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="h-9 text-xs"
                  aria-label="Schedule date and time"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  disabled={!dateValue}
                  onClick={() => dateValue && onSchedule(new Date(dateValue).toISOString())}
                >
                  <CalendarPlus className="size-3.5" data-icon="inline-start" />
                  {scheduledAt ? 'Reschedule' : 'Schedule'}
                </Button>
                {scheduledAt && (
                  <Button type="button" variant="ghost" size="sm" onClick={onDraft}>
                    <XCircle className="size-3.5" data-icon="inline-start" />
                    Clear schedule
                  </Button>
                )}
              </div>
              {conflicts && conflicts.length > 0 && dateValue && (
                <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-[11px] leading-snug text-warning">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  <span>
                    {conflicts.length} other {conflicts.length === 1 ? 'post is' : 'posts are'} scheduled within 30 min
                    ({conflicts.slice(0, 2).map((c) => c.title).join(', ')}). Double-booking an audience slot.
                  </span>
                </p>
              )}
              <p className="text-[11px] leading-snug text-muted-foreground">
                Scheduled posts appear in Library → Scheduled and on the calendar view.
              </p>
            </section>

            {/* 2 — Post */}
            <section aria-label="Post" className="grid gap-2 rounded-xl border bg-muted/30 p-3">
              <h3 className="text-sm font-semibold">2 · Post</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" size="sm" variant="default" onClick={onPublish}>
                  <Send className="size-3.5" data-icon="inline-start" />
                  Post now
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onPublish}>
                  <CheckCircle2 className="size-3.5" data-icon="inline-start" />
                  Mark published
                </Button>
                {status !== 'draft' ? (
                  <Button type="button" size="sm" variant="ghost" onClick={onDraft}>
                    <Undo2 className="size-3.5" data-icon="inline-start" />
                    Move to drafts
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Currently a draft — schedule it or post it when ready.</span>
                )}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Posting publishes immediately and clears any scheduled time.
              </p>
            </section>

            {/* 3 — Danger */}
            <section aria-label="Remove" className="flex items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.04] px-3 py-2.5">
              <div className="grid">
                <p className="text-xs font-semibold">Remove from Library</p>
                <p className="text-[11px] text-muted-foreground">This only removes the library copy.</p>
              </div>
              {confirmRemove ? (
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                    Keep
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={onRemove} aria-label="Confirm remove">
                    <Trash2 className="size-3.5" data-icon="inline-start" />
                    Confirm
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmRemove(true)}
                  aria-label="Remove from library"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
