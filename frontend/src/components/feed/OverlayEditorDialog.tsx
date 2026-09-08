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
import MemeGifOverlay, { DEFAULT_MEME_GIF_LAYER, type MemeGifLayer } from '@/components/feed/MemeGifOverlay'
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
  /** Layer 3 meme GIF position (only used when content is a meme). */
  initialGifLayer?: MemeGifLayer
  /** Content-fitted viewport aspect (w/h) measured by the feed card. */
  mediaAspect?: number | null
  onApply: (blocks: OverlayBlock[], imageOverride: string | null, mediaKind: DraftMediaKind, gifLayer?: MemeGifLayer) => void
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
  initialGifLayer,
  mediaAspect,
  onApply,
}: Props) {
  const [draftBlocks, setDraftBlocks] = useState<OverlayBlock[]>(initialBlocks)
  const [draftSelectedId, setDraftSelectedId] = useState<string | null>(null)
  const [draftGif, setDraftGif] = useState<MemeGifLayer>(initialGifLayer ?? DEFAULT_MEME_GIF_LAYER)
  const [draftGifSelected, setDraftGifSelected] = useState(false)
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
      setDraftGif(initialGifLayer ?? DEFAULT_MEME_GIF_LAYER)
      setDraftGifSelected(false)
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
    onApply(draftBlocks, applied, draftKind ?? (isVideo ? 'video' : 'image'), draftGif)
    onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftBlocks, draftMedia, draftKind, draftGif, isVideo, initialImageOverride, onApply, onOpenChange])

  const effectiveSrc = draftMedia ?? visualSrc
  const effectiveKind: DraftMediaKind = draftKind ?? (isVideo ? 'video' : 'image')
  const showVideo = effectiveKind === 'video' && !!effectiveSrc
  const isMeme = content.contentFormat === 'meme'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeWithoutApply()}>
      <DialogContent className="max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b px-4 pt-3 pb-2">
          <DialogTitle className="text-sm">Edit visual layout</DialogTitle>
          <DialogDescription className="truncate text-xs" title={`${content.title ?? 'Content'} · ${formatLabel(content.contentFormat)}`}>
            {content.title ?? 'Content'} · {formatLabel(content.contentFormat)} — applies on Done.
          </DialogDescription>
        </DialogHeader>

        <div className="grid h-[min(72vh,640px)] min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_320px] md:grid-rows-1">
          {/* Live visual layout preview — same renderer as the feed card.
              Sticky: never scrolls, vertically centred, capped so the whole
              dialog fits a laptop viewport without outer scroll. */}
          <div className="flex max-h-[30vh] min-h-0 items-center justify-center overflow-hidden bg-black/95 p-3 md:max-h-none md:h-full">
            <div ref={previewRef} style={{ aspectRatio: String(mediaAspect ?? 9 / 16) }} className="relative h-full max-h-full w-auto max-w-full shrink-0 overflow-hidden rounded-lg bg-black">
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
                onSelect={(id) => {
                  setDraftSelectedId(id)
                  if (id) setDraftGifSelected(false)
                }}
                onPatch={patchDraft}
              />
            )}
            {/* Layer 3: meme GIF overlay — draggable in the editor, same
                composition coordinate system as the feed card. */}
            {isMeme && effectiveSrc && (
              <MemeGifOverlay
                src={content.memeUrl}
                alt={content.memeName ?? content.hook ?? 'Meme overlay'}
                layer={draftGif}
                draggable
                selected={draftGifSelected}
                onSelect={setDraftGifSelected}
                onPatch={(p) => {
                  setDraftGif((prev) => ({ ...prev, ...p }))
                  setDraftGifSelected(true)
                  setDraftSelectedId(null)
                }}
              />
            )}
          </div>
          </div>

          {/* Sidebar — the only scrollable column */}
          <div className="min-h-0 overflow-y-auto border-t px-3 py-3 md:h-full md:border-t-0 md:border-l">
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
            gifLayer={isMeme ? draftGif : null}
            gifSelected={draftGifSelected}
            onSelectGif={() => {
              setDraftGifSelected(true)
              setDraftSelectedId(null)
            }}
            onPatchGif={(p) => {
              setDraftGif((prev) => ({ ...prev, ...p }))
              setDraftGifSelected(true)
              setDraftSelectedId(null)
            }}
          />
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 border-t px-4 py-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={closeWithoutApply}>
            Cancel
          </Button>
          <Button size="sm" onClick={apply}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
