import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bookmark,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Send,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { type FeedItem, type VisualSearchStatus, visualSrc } from '@/services/visual'
import { platformMeta, formatLabel, visualStatusMeta, typeLabel } from '@/components/feed/data'
import MediaTextOverlay, { overlayBlocksForContent, type OverlayBlock } from '@/components/feed/MediaTextOverlay'
import OverlayEditorDialog from '@/components/feed/OverlayEditorDialog'

// ---------------------------------------------------------------------------
// An Instagram-style post card: avatar/header, 4:5 media (image or video),
// action row (heart/comment/share/save), caption, and content badges.
// ---------------------------------------------------------------------------

type Props = {
  item: FeedItem
  isActive: boolean
  index: number
}

export default function ContentFeedItem({ item, isActive }: Props) {
  const { content, visual, visualStatus } = item
  const baseSrc = visualSrc(visual)

  // Overlay layers + custom image live on the card. Popup edits work on a
  // private draft — the feed (and these states) only change on Done.
  const [blocks, setBlocks] = useState<OverlayBlock[]>(() => overlayBlocksForContent(content))
  const [imageOverride, setImageOverride] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSelectedId, setEditorSelectedId] = useState<string | null>(null)
  const overrideRef = useRef<string | null>(null)
  overrideRef.current = imageOverride

  // Fresh layers per post.
  useEffect(() => {
    setBlocks(overlayBlocksForContent(content))
    setImageOverride((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.id])

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

  const openEditor = useCallback((id: string) => {
    setEditorSelectedId(id)
    setEditorOpen(true)
  }, [])

  const applyEditor = useCallback((nextBlocks: OverlayBlock[], nextImage: string | null) => {
    setBlocks(nextBlocks)
    setImageOverride((prev) => {
      if (prev && prev !== nextImage) URL.revokeObjectURL(prev)
      return nextImage
    })
  }, [])

  const displaySrc = imageOverride ?? baseSrc
  const src = displaySrc
  const isVideo = visual?.mediaType === 'video' || (!!src && /\.(mp4|webm|mov)$/i.test(src))
  const isPending = visualStatus === 'pending' || visualStatus === 'searching'
  const isFailed = visualStatus === 'failed'
  const isReview = visualStatus === 'needs_review'

  const platform = platformMeta(content.platform)

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {(content.title ?? content.platform)?.slice(0, 1).toUpperCase() ?? 'B'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {content.title ?? 'Content'}
            {content.cta && (
              <span className="truncate text-xs font-normal text-muted-foreground">· {content.cta}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', platform.dot)} />
            {platform.label} · {formatLabel(content.contentFormat)}
          </div>
        </div>
      </div>

      {/* Media */}
      <div className="relative aspect-[4/5] w-full bg-black">
        {isPending ? (
          <PendingVisual />
        ) : isFailed ? (
          <FailedVisual />
        ) : isReview ? (
          <ReviewVisual src={src} />
        ) : isVideo ? (
          <VideoVisual src={src} isActive={isActive} poster={visual?.posterUrl ?? visual?.previewUrl} />
        ) : src ? (
          <ImageVisual src={src} alt={visual?.altText ?? content.hook ?? 'Content visual'} />
        ) : (
          <PendingVisual />
        )}

        {/* Editable UGC-style text overlay over the media.
            Tap a layer to open the visual layout editor popup — the card
            itself stays non-editable so gestures here never mutate the feed:
            drag/inline-typing are disabled, selection UI is off. */}
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

        {/* Status chip */}
        {!['matched', 'needs_review'].includes(visualStatus) && (
          <div className="absolute top-3 right-3">
            <StatusChip status={visualStatus} />
          </div>
        )}
      </div>

      {/* Action row */}
      <PostActions />

      {/* Caption */}
      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge label={typeLabel(content.contentType)} />
          {content.contentAngleId && <Badge label="Angle" />}
        </div>

        {content.hook && (
          <p className="text-sm font-semibold leading-snug">
            <span className="mr-1 font-semibold text-foreground">{content.title ?? 'Content'}</span>
            {content.hook}
          </p>
        )}

        {content.body && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{content.body}</p>
        )}

        {!content.body && content.script && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{content.script}</p>
        )}
      </div>

      {/* Visual layout editor popup — draft editing, feed applies on Done */}
      <OverlayEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        content={content}
        visualSrc={baseSrc}
        isVideo={!!baseSrc && /\.(mp4|webm|mov)$/i.test(baseSrc)}
        poster={visual?.previewUrl}
        initialBlocks={blocks}
        initialImageOverride={imageOverride}
        initialSelectedId={editorSelectedId}
        onApply={applyEditor}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action row — Instagram-like (heart / comment / share / save). Visual only.
// ---------------------------------------------------------------------------

function PostActions() {
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const { toast } = useToast()

  const toggleLike = useCallback(() => {
    setLiked((v) => !v)
    if (!liked) toast({ title: 'Liked', variant: 'success' })
  }, [liked, toast])

  const toggleSave = useCallback(() => {
    setSaved((v) => !v)
    toast({ title: saved ? 'Removed from saved' : 'Saved to library', variant: 'success' })
  }, [saved, toast])

  const share = useCallback(() => {
    toast({ title: 'Share coming soon', variant: 'default' })
  }, [toast])

  return (
    <div className="flex items-center gap-1 px-2 pt-2">
      <Button variant="ghost" size="icon-sm" className="text-foreground" onClick={toggleLike} aria-label="Like">
        <Heart className={cn('size-5', liked && 'fill-destructive text-destructive')} />
      </Button>
      <Button variant="ghost" size="icon-sm" className="text-foreground" aria-label="Comment">
        <MessageCircle className="size-5" />
      </Button>
      <Button variant="ghost" size="icon-sm" className="text-foreground" onClick={share} aria-label="Share">
        <Send className="size-5" />
      </Button>
      <span className="flex-1" />
      <Button variant="ghost" size="icon-sm" className="text-foreground" onClick={toggleSave} aria-label="Save">
        <Bookmark className={cn('size-5', saved && 'fill-foreground')} />
      </Button>
    </div>
  )
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Image visual
// ---------------------------------------------------------------------------

function ImageVisual({ src, alt }: { src: string; alt: string }) {
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
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-500',
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

function VideoVisual({ src, isActive, poster }: { src: string; isActive: boolean; poster?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [showPlayBtn, setShowPlayBtn] = useState(false)

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
    const v = ref.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }, [])

  return (
    <div className="relative h-full w-full">
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        loop
        playsInline
        preload={isActive ? 'auto' : 'metadata'}
        onClick={togglePlay}
        className="h-full w-full object-cover"
      />

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

function ReviewVisual({ src }: { src: string | null }) {
  if (!src) return <PendingVisual />
  return (
    <div className="relative h-full w-full">
      <img src={src} alt="Visual pending review" className="h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-black/20" />
    </div>
  )
}

function StatusChip({ status }: { status: VisualSearchStatus }) {
  const meta = visualStatusMeta(status)
  return (
    <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', meta.badge)}>
      <meta.icon className={cn('size-3', meta.spin && 'animate-spin')} />
      {meta.label}
    </div>
  )
}
