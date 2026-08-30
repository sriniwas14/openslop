import { Copy, Film, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CONTENT_TYPES, formatDateLong, type ContentItem } from './data'
import { AiScorePill, PlatformList, StatusBadge, TypePreview } from './primitives'
import { renderVideo } from '@/services/content'

export default function ContentDetailDialog({
  item,
  onOpenChange,
  onDuplicate,
  onDelete,
  onRendered,
}: {
  item: ContentItem | null
  onOpenChange: (open: boolean) => void
  onDuplicate: (item: ContentItem) => void
  onDelete: (item: ContentItem) => void
  onRendered?: (item: ContentItem) => void
}) {
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const isVideo = item ? item.type === 'talkinghead' || item.type === 'greenscreen' : false
  const meta = item ? CONTENT_TYPES[item.type] : null
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        {item && meta && (
          <>
            <TypePreview type={item.type} className="h-28" />
            <div className="grid gap-4 p-5 pt-4">
              <DialogHeader className="gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="text-xs text-muted-foreground">{meta.label}</span>
                  <AiScorePill score={item.aiScore} className="ml-auto" />
                </div>
                <DialogTitle className="text-lg leading-snug">{item.title}</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">{item.summary}</DialogDescription>
              </DialogHeader>

              {item.mediaUrl && (
                <div className="overflow-hidden rounded-lg border bg-muted/20">
                  {item.type === 'carousel' ? <img src={item.mediaUrl} alt="Generated content" className="max-h-64 w-full object-contain" /> : <video src={item.mediaUrl} controls className="max-h-64 w-full" />}
                  <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="block px-3 py-2 text-xs text-muted-foreground underline">Open generated media</a>
                </div>
              )}

              {isVideo && (
                <div className="grid gap-2">
                  <Button
                    disabled={rendering}
                    onClick={async () => {
                      if (!item || rendering) return
                      setRendering(true)
                      setRenderError(null)
                      try {
                        const row = await renderVideo(item.id)
                        const updated: ContentItem = {
                          ...item,
                          mediaUrl: row.mediaUrl,
                          summary: row.scripts?.[0]?.prompt?.slice(0, 220) ?? item.summary,
                        }
                        onRendered?.(updated)
                      } catch (e) {
                        setRenderError(e instanceof Error ? e.message : 'Render failed')
                      } finally {
                        setRendering(false)
                      }
                    }}
                  >
                    {rendering ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Film data-icon="inline-start" />}
                    {rendering ? 'Rendering… this may take up to 5 minutes' : item.mediaUrl ? 'Re-render Video' : 'Render Video'}
                  </Button>
                  {rendering && <p className="text-xs text-muted-foreground">Blocking UI until video is ready — don't close the dialog.</p>}
                  {renderError && <p className="text-xs text-destructive">{renderError}</p>}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-muted/30 p-3.5 text-sm">
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Scheduled</dt>
                  <dd className="font-medium tabular-nums">{formatDateLong(item.scheduledAt)}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Content type</dt>
                  <dd className="font-medium">{meta.label}</dd>
                </div>
                <div className="col-span-2 grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">Platforms</dt>
                  <dd className="font-medium">
                    <PlatformList platforms={item.platforms} max={4} />
                  </dd>
                </div>
              </dl>

              <DialogFooter className="-mx-5 -mb-5 sm:justify-between">
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete(item)
                    onOpenChange(false)
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      onDuplicate(item)
                      onOpenChange(false)
                    }}
                  >
                    <Copy data-icon="inline-start" />
                    Duplicate
                  </Button>
                  <DialogClose asChild>
                    <Button>Done</Button>
                  </DialogClose>
                </div>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
