import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookmarkPlus, CheckCircle2, Link2, Share2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { type FeedItem, visualSrc } from '@/services/visual'
import { isPostSaved, saveFeedPost } from '@/services/library'
import type { OverlayBlock } from '@/components/feed/MediaTextOverlay'
import type { MemeGifLayer } from '@/components/feed/MemeGifOverlay'

// ---------------------------------------------------------------------------
// Review popup — opened from the feed's Review button. Two options:
//   1. Save this post → stored in the Library DB (user + brand scoped).
//   2. Share on Insta → native share sheet, clipboard fallback (no
//      publishing integration exists on the backend).
// ---------------------------------------------------------------------------

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: FeedItem | null
  visualUrl: string | null
  mediaType: 'image' | 'video'
  /** Live overlay layers + fitted aspect from the feed card. */
  blocks: OverlayBlock[]
  aspect: number | null
  /** Layer 3 meme GIF position from the feed card (meme posts only). */
  gifLayer?: MemeGifLayer | null
}

export default function ReviewDialog({ open, onOpenChange, item, visualUrl, mediaType, blocks, aspect, gifLayer }: Props) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fresh state per open — an already-saved post shows the confirmation.
  useEffect(() => {
    if (open && item) {
      setSaving(false)
      let cancelled = false
      isPostSaved(item.content.companyId, item.content.id)
        .then((v) => !cancelled && setSaved(v))
        .catch(() => !cancelled && setSaved(false))
      return () => {
        cancelled = true
      }
    }
  }, [open, item])

  const caption = item
    ? [item.content.hook ?? item.content.title ?? 'Untitled', item.content.body].filter(Boolean).join('\n\n')
    : ''

  const handleSave = useCallback(() => {
    if (!item) return
    setSaving(true)
    void (async () => {
      try {
        await saveFeedPost(item.content.companyId, item, visualUrl ?? visualSrc(item.visual), mediaType, { blocks, aspect, gifLayer: gifLayer ?? null })
        setSaved(true)
        toast({ title: 'Saved to Library', description: 'Find it under Library → My Content.', variant: 'success' })
      } catch (e: any) {
        toast({ title: 'Could not save', description: String(e?.message ?? ''), variant: 'error' })
      } finally {
        setSaving(false)
      }
    })()
  }, [item, visualUrl, mediaType, blocks, aspect, gifLayer, toast])

  const handleShare = useCallback(async () => {
    if (!item) return
    const shareData = { title: item.content.title ?? 'Content', text: caption }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        toast({ title: 'Shared', variant: 'success' })
        return
      }
      throw new Error('no-share')
    } catch (e: any) {
      // User dismissal is not an error; anything else falls back to copy.
      if (e?.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(`${shareData.title}\n\n${shareData.text}`)
        toast({ title: 'Caption copied', description: 'Paste it into Instagram to share.', variant: 'success' })
      } catch {
        toast({ title: 'Sharing is not available here', variant: 'warning' })
      }
    }
  }, [item, caption, toast])

  const openLibrary = useCallback(() => {
    onOpenChange(false)
    navigate('/dashboard/library')
  }, [navigate, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{saved ? 'Saved to Library' : 'Review this post'}</DialogTitle>
          <DialogDescription>
            {saved
              ? 'This post is in your content library.'
              : 'Save it to your library, or share it straight to Instagram.'}
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <CheckCircle2 className="size-10 text-success" />
            <p className="text-sm text-muted-foreground">
              Find it any time under Library → My Content.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            <Button type="button" onClick={handleSave} disabled={!item || saving} className="h-11 justify-start gap-3 rounded-xl">
              <BookmarkPlus className="size-5" data-icon="inline-start" />
              <span className="text-left">
                <span className="block text-sm font-semibold">Save post in library</span>
                <span className="block text-xs font-normal opacity-80">Keep it under My Content</span>
              </span>
            </Button>
            <Button type="button" variant="outline" onClick={handleShare} disabled={!item} className="h-11 justify-start gap-3 rounded-xl">
              <Share2 className="size-5" data-icon="inline-start" />
              <span className="text-left">
                <span className="block text-sm font-semibold">Share on Insta</span>
                <span className="block text-xs font-normal text-muted-foreground">System share sheet</span>
              </span>
            </Button>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Link2 className="size-3" /> Direct publishing isn't connected — sharing opens your device sheet.
            </p>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {saved ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button onClick={openLibrary}>Open Library</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
