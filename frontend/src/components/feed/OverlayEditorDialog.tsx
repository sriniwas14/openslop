import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import MediaTextOverlay, { type OverlayBlock } from '@/components/feed/MediaTextOverlay'
import OverlayEditorPanel, { type DraftMediaKind } from '@/components/feed/OverlayEditorPanel'
import { formatLabel } from '@/components/feed/data'
import type { GeneratedContentDoc } from '@/services/visual'

// ---------------------------------------------------------------------------
// Visual layout editor popup — opens when overlay text is clicked in the
// feed. Left: large live preview of the visual with the same overlay
// renderer as the card. Right: sidebar with the text/background controls,
// image replacement, and a composition summary.
//
// Draft isolation: everything edits a private copy. The feed card is
// untouched until Done applies the draft; closing any other way discards
// all changes (uploaded object URLs are revoked, never leak to the feed).
// ---------------------------------------------------------------------------

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: GeneratedContentDoc
  /** Feed visual URL (original). */
  visualSrc: string | null
  isVideo: boolean
  poster?: string | null
  initialBlocks: OverlayBlock[]
  /** Currently applied custom media (object URL owned by the parent). */
  initialImageOverride: string | null
  /** Media type of the applied override (null = original post kind). */
  initialMediaKind: DraftMediaKind | null
  /** Layer that was tapped to open the popup — pre-selected in the draft. */
  initialSelectedId: string | null
  /** Content-fitted viewport aspect (w/h) measured by the feed card. */
  mediaAspect?: number | null
  onApply: (blocks: OverlayBlock[], imageOverride: string | null, mediaKind: DraftMediaKind) => void
}

export default function OverlayEditorDialog({
  open,
  onOpenChange,
  content,
  visualSrc,
  isVideo,
  poster,
  initialBlocks,
  initialImageOverride,
  initialMediaKind,
  initialSelectedId,
  mediaAspect,
  onApply,
}: Props) {
  const [draftBlocks, setDraftBlocks] = useState<OverlayBlock[]>(initialBlocks)
  const [draftSelectedId, setDraftSelectedId] = useState<string | null>(null)
  const [draftMedia, setDraftMedia] = useState<string | null>(initialImageOverride)
  const [draftKind, setDraftKind] = useState<DraftMediaKind | null>(initialMediaKind)
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  // Object URLs created by uploads inside this dialog — owned here until
  // applied (ownership transfers to the parent) or discarded (revoked).
  const createdUrlsRef = useRef<string[]>([])

  // Fresh draft on every open — the feed state is the source of truth.
  useEffect(() => {
    if (open) {
      setDraftBlocks(initialBlocks)
      setDraftSelectedId(initialSelectedId)
      setDraftMedia(initialImageOverride)
      setDraftKind(initialMediaKind)
      createdUrlsRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Measure the preview so the sidebar can report live line counts.
  useEffect(() => {
    if (!open) return
    const el = previewRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setPreviewSize({ width: rect.width, height: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [open ])

  const patchDraft = useCallback((id: string, p: Partial<OverlayBlock>) => {
    setDraftBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)))
  }, [])

  const removeDraft = useCallback((id: string) => {
    setDraftBlocks((prev) => prev.filter((b) => b.id !== id))
    setDraftSelectedId((s) => (s === id ? null : s))
  }, [])

  // Uploads are kind-matched to the post (video posts take video, image
  // posts take images) — the panel already filters the file picker and
  // rejects mismatches, so the kind here follows the post kind.
  const uploadMedia = useCallback((file: File) => {
    const kind: DraftMediaKind = file.type.startsWith('video/') ? 'video' : 'image'
    const url = URL.createObjectURL(file)
    createdUrlsRef.current.push(url)
    setDraftKind(kind)
    setDraftMedia((prev) => {
      // Replaced-but-unapplied uploads never escape — revoke immediately.
      if (prev && prev !== initialImageOverride && createdUrlsRef.current.includes(prev)) {
        URL.revokeObjectURL(prev)
        createdUrlsRef.current = createdUrlsRef.current.filter((u) => u !== prev)
      }
      return url
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageOverride])

  const revertImage = useCallback(() => {
    setDraftKind(null)
    setDraftMedia((prev) => {
      if (prev && prev !== initialImageOverride && createdUrlsRef.current.includes(prev)) {
        URL.revokeObjectURL(prev)
        createdUrlsRef.current = createdUrlsRef.current.filter((u) => u !== prev)
      }
      return null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageOverride])

  const closeWithoutApply = useCallback(() => {
    // Discard: revoke uploads created in this session that were never applied.
    // The parent-owned initialImageOverride is never revoked here.
    const keep = initialImageOverride
    for (const url of createdUrlsRef.current) {
      if (url !== keep) URL.revokeObjectURL(url)
    }
    createdUrlsRef.current = []
    onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImageOverride, onOpenChange])

  const apply = useCallback(() => {
    // Transfer ownership of the applied URL to the parent (do NOT revoke);
    // revoke any other created URLs that were superseded along the way.
    const applied = draftMedia
    for (const url of createdUrlsRef.current) {
      if (url !== applied && url !== initialImageOverride) URL.revokeObjectURL(url)
    }
    createdUrlsRef.current = []
    onApply(draftBlocks, applied, draftKind ?? (isVideo ? 'video' : 'image'))
    onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftBlocks, draftMedia, draftKind, isVideo, initialImageOverride, onApply, onOpenChange])

  const effectiveSrc = draftMedia ?? visualSrc
  const effectiveKind: DraftMediaKind = draftKind ?? (isVideo ? 'video' : 'image')
  const showVideo = effectiveKind === 'video' && !!effectiveSrc

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeWithoutApply()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit visual layout</DialogTitle>
          <DialogDescription>
            {content.title ?? 'Content'} · {formatLabel(content.contentFormat)} — changes apply to the post only when you press Done.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] gap-4 overflow-auto pr-1 md:grid-cols-[minmax(0,1fr)_260px]">
          {/* Live visual layout preview — same renderer as the feed card */}
          <div ref={previewRef} style={{ aspectRatio: String(mediaAspect ?? 9 / 16) }} className="relative w-full overflow-hidden rounded-lg bg-black">
            {showVideo ? (
              <video
                src={effectiveSrc!}
                poster={poster ?? undefined}
                muted
                loop
                playsInline
                autoPlay
                className="h-full w-full object-contain"
              />
            ) : effectiveSrc ? (
              <img src={effectiveSrc} alt={content.hook ?? 'Content visual'} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-white/50">
                No visual yet — upload {effectiveKind === 'video' ? 'a video' : 'an image'} to preview.
              </div>
            )}
            {effectiveSrc && (
              <MediaTextOverlay
                blocks={draftBlocks}
                selectedId={draftSelectedId}
                onSelect={setDraftSelectedId}
                onPatch={patchDraft}
              />
            )}
          </div>

          {/* Sidebar */}
          <OverlayEditorPanel
            blocks={draftBlocks}
            selectedId={draftSelectedId}
            previewSize={previewSize}
            formatLabel={formatLabel(content.contentFormat)}
            imageSrc={effectiveSrc}
            isCustomImage={!!draftMedia}
            mediaKind={effectiveKind}
            onSelect={setDraftSelectedId}
            onPatch={patchDraft}
            onRemove={removeDraft}
            onUploadMedia={uploadMedia}
            onRevertImage={revertImage}
          />
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={closeWithoutApply}>
            Cancel
          </Button>
          <Button onClick={apply}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
