import { Copy, Trash2 } from 'lucide-react'
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

export default function ContentDetailDialog({
  item,
  onOpenChange,
  onDuplicate,
  onDelete,
}: {
  item: ContentItem | null
  onOpenChange: (open: boolean) => void
  onDuplicate: (item: ContentItem) => void
  onDelete: (item: ContentItem) => void
}) {
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
