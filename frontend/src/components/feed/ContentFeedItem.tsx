import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Play,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { type FeedItem, visualSrc } from '@/services/visual'
import { platformMeta, formatLabel, typeLabel } from '@/components/feed/data'
import MediaTextOverlay, { overlayBlocksForContent, type OverlayBlock } from '@/components/feed/MediaTextOverlay'
import OverlayEditorDialog from '@/components/feed/OverlayEditorDialog'
import ReviewDialog from '@/components/feed/ReviewDialog'

// ---------------------------------------------------------------------------
// Content review card: centered minimal approval UI.
//
//   [ Content Type ] [ Platform · Format ]
//            [ MAIN 19:16 POST ]
//     [ Reject ] [ Edit ] [ Review ]
//
// The 19:16 media is viewport-aware: its width is capped so pills + media +
// actions fit comfortably inside the viewport without scrolling. All actions
// sit OUTSIDE the media in a dedicated row underneath it.
// ---------------------------------------------------------------------------

type Props = {
  item: FeedItem
  isActive: boolean
  index: number
}

// Still-image formats; every other content format pairs with motion video.
// Mirrors backend isVideoContentFormat (IMAGE_CONTENT_FORMATS in
// backend/src/modules/ugc/ugc.schemas.ts) — last-resort detection when the
// visual row carries no explicit media type.
const IMAGE_CONTENT_FORMATS = new Set(['wall_of_text_slide', 'meme'])

function hasVideoExtension(src: string) {
  // Strip query/fragment first: cached or CDN URLs often look like
  // "/media/files/abc" (no extension) or "clip.mp4?auto=compress".
  return /\.(mp4|webm|mov)$/i.test(src.split(/[?#]/)[0])
}

export default function ContentFeedItem({ item, isActive }: Props) {
  const { content, visual, visualStatus } = item
  const { toast } = useToast()
  const baseSrc = visualSrc(visual)

  // Overlay layers + custom media live on the card. Popup edits work on a
  // private draft — the feed (and these states) only change on Done.
  const [blocks, setBlocks] = useState<OverlayBlock[]>(() => overlayBlocksForContent(content))
  const [mediaOverride, setMediaOverride] = useState<{ url: string; kind: 'image' | 'video' } | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSelectedId, setEditorSelectedId] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Natural media dimensions — the viewport shrink-fits each post's actual
  // content so portrait video never sits in an oversized landscape box.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const overrideRef = useRef<string | null>(null)
  overrideRef.current = mediaOverride?.url ?? null

  // Fresh layers per post.
  useEffect(() => {
    setBlocks(overlayBlocksForContent(content))
    setNatural(null)
    setMediaOverride((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.id])

  const reportNaturalSize = useCallback((w: number, h: number) => {
    if (!w || !h) return
    setNatural((prev) => (prev && Math.abs(prev.w / prev.h - w / h) < 0.01 ? prev : { w, h }))
  }, [])

  // Never leak an uploaded object URL when the card unmounts.
  useEffect(
    () => () => {
      if (overrideRef.current) URL.revokeObjectURL(overrideRef.current)
    },
    [],
  )

  const patchBlocks = useCallback((id: string, p: Partial<OverlayBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)))
  }, [])

  const openEditor = useCallback((id: string | null) => {
    setEditorSelectedId(id)
    setEditorOpen(true)
  }, [])

  const handleEdit = useCallback(() => {
    openEditor(blocks[0]?.id ?? null)
  }, [blocks, openEditor])

  const handleReject = useCallback(() => {
    toast({ title: 'Rejected', description: 'This post was marked as rejected.', variant: 'default' })
  }, [toast])

  const handleReview = useCallback(() => {
    setReviewOpen(true)
  }, [])

  const applyEditor = useCallback((nextBlocks: OverlayBlock[], nextUrl: string | null, nextKind: 'image' | 'video') => {
    setBlocks(nextBlocks)
    setMediaOverride((prev) => {
      if (prev && prev.url !== nextUrl) URL.revokeObjectURL(prev.url)
      return nextUrl ? { url: nextUrl, kind: nextKind } : null
    })
  }, [])

  const displaySrc = mediaOverride?.url ?? baseSrc
  const src = displaySrc
  // Explicit kind wins (override kind, then the server's media type). Blob
  // overrides carry no file extension, and cached/CDN URLs may be
  // extensionless or carry query strings — so only then fall back to the
  // extension test, and finally to the format pairing (non-meme/slide
  // formats are motion). Without this, videos render as broken <img>.
  const explicitKind = mediaOverride?.kind ?? visual?.mediaType ?? null
  const isVideo =
    explicitKind === 'video' ||
    (explicitKind == null &&
      !!src &&
      (hasVideoExtension(src) || !IMAGE_CONTENT_FORMATS.has(content.contentFormat)))
  const isPending = visualStatus === 'pending' || visualStatus === 'searching'
  const isFailed = visualStatus === 'failed'
  const isReview = visualStatus === 'needs_review'

  const platform = platformMeta(content.platform)
  const typePill = typeLabel(content.contentType) || formatLabel(content.contentFormat)
  const campaignPill = `${platform.label} · ${formatLabel(content.contentFormat)}`

  // Viewport aspect follows the actual media (clamped to sane bounds);
  // portrait 9:16 until the media reports its dimensions. The width formula
  // derives viewport width from available viewport height, so container and
  // media always scale together and the full frame stays visible.
  const mediaAspect = natural
    ? Math.min(1.9, Math.max(0.5, natural.w / natural.h))
    : 9 / 16

  return (
    <article className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 sm:gap-4">
      {/* Top context pills — dynamic, from existing content data */}
      <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Post context">
        <span className="inline-flex items-center rounded-full border border-transparent bg-muted px-3 py-1 text-xs font-medium text-foreground">
          {typePill}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <span className={cn('size-1.5 rounded-full', platform.dot)} aria-hidden />
          {campaignPill}
        </span>
      </div>

      {/* Hero media — phone-like viewport that shrink-fits the actual
          content: portrait video gets a portrait box (no wide black side
          bars), capped at 24rem so the post previews at true social-media
          scale instead of stretching across the screen. Width derives from
          available viewport height so pills + media + actions fit on one
          screen. Overlay text scales with this box (fontSize = width × size
          fraction). The media element fills the container with
          object-contain, so the full frame is always visible and never
          cropped by it. Visually clean: no action buttons overlap it. */}
      <div
        style={{ '--ar': String(mediaAspect) } as CSSProperties}
        className="w-[min(100%,max(12rem,calc((100dvh-16rem)*var(--ar))),24rem)] overflow-hidden rounded-2xl border bg-card shadow-md sm:w-[min(100%,max(12rem,calc((100dvh-20rem)*var(--ar))),24rem)]"
      >
        <div className="relative aspect-[var(--ar)] w-full bg-black">
          {isPending ? (
            <PendingVisual />
          ) : isFailed ? (
            <FailedVisual />
          ) : isReview ? (
            <ReviewVisual
              src={src}
              isVideo={isVideo}
              isActive={isActive}
              poster={visual?.posterUrl ?? visual?.previewUrl}
              onNaturalSize={reportNaturalSize}
            />
          ) : isVideo && src ? (
            <VideoVisual src={src} isActive={isActive} poster={visual?.posterUrl ?? visual?.previewUrl} onNaturalSize={reportNaturalSize} />
          ) : src ? (
            <ImageVisual src={src} alt={visual?.altText ?? content.hook ?? 'Content visual'} onNaturalSize={reportNaturalSize} />
          ) : (
            <PendingVisual />
          )}

          {/* Read-only UGC-style text overlay. Tap a layer to open the visual
              layout editor popup (draft-based, applies on Done). */}
          {src && !isPending && !isFailed && (
            <MediaTextOverlay
              blocks={blocks}
              selectedId={null}
              draggable={false}
              allowInlineEdit={false}
              onSelect={() => {}}
              onPatch={patchBlocks}
              onTextClick={openEditor}
            />
          )}
        </div>
      </div>

      {/* Action row — completely outside the media, underneath the post */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3" role="group" aria-label="Review actions">
        <Button
          type="button"
          variant="outline"
          onClick={handleReject}
          className="h-10 rounded-full border-destructive/30 bg-white px-4 text-destructive shadow-sm hover:bg-destructive/10 hover:text-destructive sm:px-5 dark:bg-card"
          aria-label="Reject post"
        >
          <X className="size-4 text-destructive" data-icon="inline-start" />
          Reject
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleEdit}
          className="h-10 rounded-full bg-white px-4 shadow-sm sm:px-5 dark:bg-card"
          aria-label="Edit post"
        >
          <Pencil className="size-4" data-icon="inline-start" />
          Edit
        </Button>
        <Button
          type="button"
          onClick={handleReview}
          className="h-10 rounded-full border-transparent bg-success px-4 text-white shadow-sm hover:bg-success/90 sm:px-5"
          aria-label="Review post"
        >
          <Check className="size-4" data-icon="inline-start" />
          Review
        </Button>
      </div>

      {/* Visual layout editor popup — draft editing, feed applies on Done */}
      <OverlayEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        content={content}
        visualSrc={baseSrc}
        isVideo={isVideo}
        poster={visual?.previewUrl}
        initialBlocks={blocks}
        initialImageOverride={mediaOverride?.url ?? null}
        initialMediaKind={mediaOverride?.kind ?? null}
        initialSelectedId={editorSelectedId}
        mediaAspect={mediaAspect}
        onApply={applyEditor}
      />

      {/* Review popup — save to Library or share */}
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        item={item}
        visualUrl={src}
        mediaType={isVideo ? 'video' : 'image'}
        blocks={blocks}
        aspect={mediaAspect}
      />
    </article>
  )
}

// ---------------------------------------------------------------------------
// Image visual
// ---------------------------------------------------------------------------

function ImageVisual({ src, alt, onNaturalSize }: { src: string; alt: string; onNaturalSize?: (w: number, h: number) => void }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
      {error ? (
        <div className="flex flex-col items-center gap-2 text-white/50">
          <AlertTriangle className="size-8" />
          <span className="text-xs">Image unavailable</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            setLoaded(true)
            const im = e.currentTarget
            if (im.naturalWidth && im.naturalHeight) onNaturalSize?.(im.naturalWidth, im.naturalHeight)
          }}
          onError={() => setError(true)}
          className={cn(
            'h-full w-full object-contain transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Video visual — plays only when active, autoplays muted, loop.
// ---------------------------------------------------------------------------

function VideoVisual({ src, isActive, poster, onNaturalSize }: { src: string; isActive: boolean; poster?: string | null; onNaturalSize?: (w: number, h: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [showPlayBtn, setShowPlayBtn] = useState(false)
  const [failed, setFailed] = useState(false)

  // Reset the error state when the source changes (the instance persists
  // across posts within the same branch).
  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (isActive) {
      const p = v.play()
      if (p) {
        p.then(() => setPlaying(true)).catch(() => {
          setShowPlayBtn(true)
          setPlaying(false)
        })
      }
    } else {
      v.pause()
      setPlaying(false)
    }
  }, [isActive])

  // Keep the element's muted flag in sync with state (autoplay requires muted).
  useEffect(() => {
    if (ref.current) ref.current.muted = muted
  }, [muted])

  const togglePlay = useCallback(() => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => {})
      setShowPlayBtn(false)
    } else {
      v.pause()
      setPlaying(false)
    }
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => !m)
  }, [])

  return (
    <div className="relative h-full w-full">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <AlertTriangle className="size-7" />
            <span className="text-xs">Video unavailable</span>
          </div>
        </div>
      ) : (
        <video
          ref={ref}
          src={src}
          poster={poster ?? undefined}
          muted
          loop
          playsInline
          preload={isActive ? 'auto' : 'metadata'}
          onClick={togglePlay}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth && v.videoHeight) onNaturalSize?.(v.videoWidth, v.videoHeight)
          }}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      )}

      {showPlayBtn && !playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20"
          aria-label="Play video"
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Play className="ml-1 size-7 text-white" fill="white" />
          </div>
        </button>
      )}

      <button
        type="button"
        onClick={toggleMute}
        className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Placeholders / states
// ---------------------------------------------------------------------------

function PendingVisual() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <span className="text-sm font-medium">Preparing your visual…</span>
      </div>
    </div>
  )
}

function FailedVisual() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <XCircle className="size-8" />
        <span className="text-sm">Visual unavailable</span>
      </div>
    </div>
  )
}

function ReviewVisual({
  src,
  isVideo,
  isActive,
  poster,
  onNaturalSize,
}: {
  src: string | null
  isVideo: boolean
  isActive: boolean
  poster?: string | null
  onNaturalSize?: (w: number, h: number) => void
}) {
  if (!src) return <PendingVisual />
  // A needs_review video must still play — a static <img> of an mp4 renders
  // nothing. The dim layer is pointer-transparent so taps reach the video.
  if (isVideo) {
    return (
      <div className="relative h-full w-full">
        <VideoVisual src={src} isActive={isActive} poster={poster} onNaturalSize={onNaturalSize} />
        <div className="pointer-events-none absolute inset-0 bg-black/20" />
      </div>
    )
  }
  return (
    <div className="relative h-full w-full">
      <img
        src={src}
        alt="Visual pending review"
        onLoad={(e) => {
          const im = e.currentTarget
          if (im.naturalWidth && im.naturalHeight) onNaturalSize?.(im.naturalWidth, im.naturalHeight)
        }}
        className="h-full w-full object-contain opacity-80"
      />
      <div className="pointer-events-none absolute inset-0 bg-black/20" />
    </div>
  )
}
