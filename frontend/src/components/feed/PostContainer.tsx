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
import { visualSrc, type FeedItem, type GeneratedContentDoc, type VisualSearchStatus } from '@/services/visual'
import type { MediaBankItem, SavedPost } from '@/services/library'
import type { ContentItem } from '@/components/content/data'
import { platformMeta, formatLabel, typeLabel } from '@/components/feed/data'
import MediaTextOverlay, { overlayBlocksForContent, type OverlayBlock } from '@/components/feed/MediaTextOverlay'
import MemeGifOverlay, { DEFAULT_MEME_GIF_LAYER, type MemeGifLayer, isMemeVideoSrc } from '@/components/feed/MemeGifOverlay'
import OverlayEditorDialog from '@/components/feed/OverlayEditorDialog'
import ReviewDialog from '@/components/feed/ReviewDialog'

// ---------------------------------------------------------------------------
// Reusable post container — one sizing + editor flow used everywhere.
//
//   PostMediaContainer  pure media box (fixed width, fitted aspect, overlays)
//   PostContainer       full post: pills + media + Reject/Edit/Review + dialogs
//
// The media box is viewport-aware: its width is capped so pills + media +
// actions fit comfortably inside the viewport without scrolling. Overlay text
// scales with this box (fontSize = width × size fraction). The media element
// fills the container with object-contain, so the full frame is always
// visible and never cropped. Visually clean: no action buttons overlap it.
// ---------------------------------------------------------------------------

export type PostMediaType = 'image' | 'video'

// Still-image formats; every other content format pairs with motion video.
// Mirrors backend isVideoContentFormat (IMAGE_CONTENT_FORMATS in
// backend/src/modules/ugc/ugc.schemas.ts) — last-resort detection when the
// visual row carries no explicit media type.
export const IMAGE_CONTENT_FORMATS = new Set(['wall_of_text_slide', 'meme'])

export function hasVideoExtension(src: string) {
  // Strip query/fragment first: cached or CDN URLs often look like
  // "/media/files/abc" (no extension) or "clip.mp4?auto=compress".
  return /\.(mp4|webm|mov)$/i.test(src.split(/[?#]/)[0])
}

/** Explicit kind wins (override kind, then the server's media type); only
 *  then the extension test, finally the format pairing (non-meme/slide
 *  formats are motion). Without this, videos render as broken <img>. */
export function resolveMediaType(opts: {
  explicitKind?: 'image' | 'video' | string | null
  src: string | null
  contentFormat: string
}): PostMediaType {
  const { explicitKind, src, contentFormat } = opts
  if (explicitKind === 'video') return 'video'
  if (explicitKind === 'image') return 'image'
  if (src && (hasVideoExtension(src) || !IMAGE_CONTENT_FORMATS.has(contentFormat))) return 'video'
  return 'image'
}

// ---------------------------------------------------------------------------
// Normalized post source — adapters below build this from FeedItem,
// SavedPost, or ContentItem so the container never learns each shape.
// ---------------------------------------------------------------------------

export type PostSource = {
  /** Reset key — state (layers, aspect, overrides) resets when this changes. */
  key: string
  platform: string
  contentType: string
  contentFormat: string
  title: string | null
  visualUrl: string | null
  posterUrl?: string | null
  altText?: string | null
  mediaType: PostMediaType
  /** Absent/null = resolved media (or empty when no src) — no status chrome. */
  visualStatus?: VisualSearchStatus | null
  memeUrl?: string | null
  memeName?: string | null
  /** Fitted aspect (w/h) measured earlier — e.g. the Library snapshot. */
  aspect?: number | null
  /** Snapshot layers — e.g. a saved post's edited text. Defaults to derived. */
  initialBlocks?: OverlayBlock[]
  initialGifLayer?: MemeGifLayer | null
  /** Full doc for the editor + overlay derivation. */
  contentDoc: GeneratedContentDoc
  /** Present only for live feed items — enables the Review dialog. */
  feedItem?: FeedItem | null
}

/** Frozen review inputs for the deck-level Review dialog — pulled from the
 *  swiped card after its fly-off animation. */
export type PostReviewSnapshot = {
  item: FeedItem
  visualUrl: string | null
  mediaType: PostMediaType
  blocks: OverlayBlock[]
  aspect: number | null
  gifLayer?: MemeGifLayer | null
}

function emptyContentDoc(overrides: Partial<GeneratedContentDoc> & Pick<GeneratedContentDoc, 'id' | 'platform' | 'contentFormat' | 'contentType'>): GeneratedContentDoc {
  return {
    userId: '',
    companyId: '',
    jobId: null,
    contentAngleId: '',
    generationMode: '',
    language: '',
    hook: null,
    title: null,
    body: null,
    lines: [],
    script: null,
    onScreenText: [],
    cta: null,
    visualTags: [],
    visualMood: null,
    visualStyle: null,
    visualCategory: null,
    visualOrientation: '',
    status: '',
    source: '',
    model: null,
    promptVersion: null,
    memeId: null,
    memeName: null,
    memeUrl: null,
    memeDescription: null,
    visualIntentId: null,
    visualAssetId: null,
    usageCount: 0,
    isEdited: false,
    editedAt: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

export function postSourceFromFeedItem(item: FeedItem): PostSource {
  const { content, visual, visualStatus } = item
  const src = visualSrc(visual)
  return {
    key: content.id,
    platform: content.platform,
    contentType: content.contentType,
    contentFormat: content.contentFormat,
    title: content.title ?? content.hook,
    visualUrl: src,
    posterUrl: visual?.posterUrl ?? visual?.previewUrl ?? null,
    altText: visual?.altText ?? content.hook ?? 'Content visual',
    mediaType: resolveMediaType({ explicitKind: visual?.mediaType ?? null, src, contentFormat: content.contentFormat }),
    visualStatus,
    memeUrl: content.memeUrl,
    memeName: content.memeName,
    aspect: null,
    contentDoc: content,
    feedItem: item,
  }
}

export function postSourceFromSavedPost(post: SavedPost): PostSource {
  // The persisted Edit-replacement wins — visualUrl stays as remote fallback.
  const src = post.editedFile ?? post.visualUrl
  const mediaType = post.editedFile ? (post.editedMediaType ?? post.mediaType) : post.mediaType
  return {
    key: post.id,
    platform: post.platform,
    contentType: post.contentType,
    contentFormat: post.contentFormat,
    title: post.title ?? post.hook,
    visualUrl: src,
    posterUrl: post.posterUrl,
    altText: post.hook ?? 'Saved visual',
    mediaType,
    visualStatus: src ? 'matched' : null,
    memeUrl: post.memeUrl,
    aspect: post.aspect,
    initialBlocks: post.blocks,
    initialGifLayer: post.gifLayer,
    contentDoc: emptyContentDoc({
      id: post.contentId,
      companyId: post.companyId,
      platform: post.platform,
      contentFormat: post.contentFormat,
      contentType: post.contentType,
      title: post.title,
      hook: post.hook,
      body: post.body,
      memeUrl: post.memeUrl,
    }),
    feedItem: null,
  }
}

export function postSourceFromBankItem(item: MediaBankItem): PostSource {
  return {
    key: item.id,
    platform: 'instagram',
    contentType: 'post',
    contentFormat: item.mediaType,
    title: item.name,
    visualUrl: item.fileUrl,
    altText: item.name,
    mediaType: item.mediaType,
    visualStatus: item.fileUrl ? 'matched' : null,
    memeUrl: item.memeUrl,
    aspect: item.aspect,
    initialBlocks: item.blocks,
    initialGifLayer: item.gifLayer,
    contentDoc: emptyContentDoc({
      id: item.id,
      companyId: item.companyId,
      platform: 'instagram',
      contentFormat: item.mediaType,
      contentType: 'post',
      title: item.name,
      memeUrl: item.memeUrl,
    }),
    feedItem: null,
  }
}

export function postSourceFromContentItem(item: ContentItem): PostSource {
  const src = item.mediaUrl ?? null
  const mediaType: PostMediaType =
    src && hasVideoExtension(src) ? 'video' : item.type === 'carousel' ? 'image' : 'video'
  return {
    key: item.id,
    platform: item.platforms[0] ?? 'instagram',
    contentType: item.type,
    contentFormat: item.type,
    title: item.title,
    visualUrl: src,
    altText: 'Generated content',
    mediaType,
    visualStatus: src ? 'matched' : null,
    aspect: item.format === 'horizontal' ? 16 / 9 : 9 / 16,
    contentDoc: emptyContentDoc({
      id: item.id,
      platform: item.platforms[0] ?? 'instagram',
      contentFormat: item.type,
      contentType: item.type,
      title: item.title,
      hook: item.summary,
      body: item.summary,
    }),
    feedItem: null,
  }
}

// ---------------------------------------------------------------------------
// PostMediaContainer — the pure media box. Same width + fitted aspect +
// read-only overlays everywhere; no pills, actions, or dialogs.
// ---------------------------------------------------------------------------

type PostMediaContainerProps = {
  src: string | null
  poster?: string | null
  alt?: string
  mediaType: PostMediaType
  /** Aspect fallback until the media reports its natural size. */
  aspect?: number | null
  /** Resets measured natural size + reports — pass the post id. */
  resetKey?: string
  blocks?: OverlayBlock[]
  gifLayer?: MemeGifLayer | null
  /** Meme GIF overlay source — pass only for meme posts. */
  memeSrc?: string | null
  memeAlt?: string
  visualStatus?: VisualSearchStatus | null
  /** Active video autoplays (muted, loop); inactive ones pause. */
  isActive?: boolean
  /** Meme overlay plays only while true — the feed passes its visibility;
   *  single-post surfaces (Library, dialogs) leave the default. */
  memeActive?: boolean
  /** Native player controls on the video element (detail dialogs). */
  videoControls?: boolean
  /** Tap-a-layer callback — when absent the overlay is fully inert. */
  onTextClick?: (id: string) => void
  onPatchBlocks?: (id: string, p: Partial<OverlayBlock>) => void
  onAspectChange?: (aspect: number) => void
  /** Feed frame (rounded-2xl border shadow). False when the parent shell
   *  already provides its own border (Library / Content dialogs). */
  framed?: boolean
  className?: string
  soundOn?: boolean
  onToggleSound?: () => void
}

export function PostMediaContainer({
  src,
  poster,
  alt,
  mediaType,
  aspect,
  resetKey,
  blocks = [],
  gifLayer,
  memeSrc,
  memeAlt,
  visualStatus,
  isActive = false,
  memeActive = true,
  videoControls = false,
  onTextClick,
  onPatchBlocks,
  onAspectChange,
  framed = true,
  className,
  soundOn = false,
  onToggleSound,
}: PostMediaContainerProps) {
  // Natural media dimensions — the viewport shrink-fits each post's actual
  // content so portrait video never sits in an oversized landscape box.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    setNatural(null)
  }, [resetKey, src])

  const reportNaturalSize = useCallback((w: number, h: number) => {
    if (!w || !h) return
    setNatural((prev) => (prev && Math.abs(prev.w / prev.h - w / h) < 0.01 ? prev : { w, h }))
  }, [])

  // Viewport aspect follows the actual media (clamped to sane bounds);
  // portrait 9:16 until the media reports its dimensions. The width formula
  // derives viewport width from available viewport height, so container and
  // media always scale together and the full frame stays visible.
  const mediaAspect = natural
    ? Math.min(1.9, Math.max(0.5, natural.w / natural.h))
    : (aspect ?? 9 / 16)

  const onAspectChangeRef = useRef(onAspectChange)
  useEffect(() => {
    onAspectChangeRef.current = onAspectChange
  })
  useEffect(() => {
    onAspectChangeRef.current?.(mediaAspect)
  }, [mediaAspect])

  const isVideo = mediaType === 'video'
  const isPending = visualStatus === 'pending' || visualStatus === 'searching'
  const isFailed = visualStatus === 'failed'
  const isReview = visualStatus === 'needs_review'

  // Sound: one button, default off. When on, meme video takes priority over base.
  const memeIsVideo = memeSrc ? isMemeVideoSrc(memeSrc) : false
  const memeCanPlayAudio = !!memeIsVideo && memeActive
  const baseSoundOn = soundOn ? (!memeCanPlayAudio ? true : false) : false
  const memeSoundOn = soundOn ? (memeCanPlayAudio ? true : false) : false
  const hasAnyAudio = isVideo || memeIsVideo

  return (
    <div
      style={{ '--ar': String(mediaAspect) } as CSSProperties}
      className={cn(
        'w-[min(100%,max(12rem,calc((100dvh-16rem)*var(--ar))),24rem)] sm:w-[min(100%,max(12rem,calc((100dvh-20rem)*var(--ar))),24rem)]',
        framed && 'overflow-hidden rounded-2xl border bg-card shadow-md',
        className,
      )}
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
            poster={poster}
            onNaturalSize={reportNaturalSize}
          />
        ) : isVideo && src ? (
          <VideoVisual src={src} isActive={isActive} poster={poster} controls={videoControls} onNaturalSize={reportNaturalSize} soundOn={baseSoundOn} />
        ) : src ? (
          <ImageVisual src={src} alt={alt ?? 'Content visual'} onNaturalSize={reportNaturalSize} />
        ) : (
          <EmptyVisual />
        )}

        {/* Layer 2: generated overlay text (meme: top 20%, centered, 80%).
            Read-only here — tap a layer to open the visual layout editor
            popup (draft-based, applies on Done). */}
        {src && !isPending && !isFailed && blocks.length > 0 && (
          <MediaTextOverlay
            blocks={blocks}
            selectedId={null}
            draggable={false}
            allowInlineEdit={false}
            onSelect={() => {}}
            onPatch={onPatchBlocks ?? (() => {})}
            onTextClick={onTextClick}
          />
        )}

        {/* Layer 3: meme GIF overlay from the stored meme_url — above the
            base image (Layer 1) and the text (Layer 2), inside the same
            composition. Read-only on the card; drag to reposition in Edit. */}
        {memeSrc && src && !isPending && !isFailed && (
          <MemeGifOverlay
            src={memeSrc}
            alt={memeAlt ?? alt ?? 'Meme overlay'}
            layer={gifLayer ?? DEFAULT_MEME_GIF_LAYER}
            active={memeActive}
            soundOn={memeSoundOn}
          />
        )}

        {/* Sound toggle — top-left, single button for the post. Default off. */}
        {hasAnyAudio && onToggleSound && (
          <button
            type="button"
            onClick={() => onToggleSound?.()}
            className="absolute top-3 left-3 z-30 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
            aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
            title={soundOn ? 'Mute sound' : 'Unmute sound'}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PostContainer — full post: context pills + media + Reject/Edit/Review +
// editor + review dialogs. Overlay layers + custom media live here; popup
// edits work on a private draft — applied on Done only.
// ---------------------------------------------------------------------------

type PostContainerProps = {
  source: PostSource
  isActive?: boolean
  /** Meme overlay visibility — the feed passes its active index; Library /
   *  dialogs leave the default so their single visible post keeps playing. */
  memeActive?: boolean
  showPills?: boolean
  /** Action row (Skip/Edit/Review). Review renders only with a feedItem
   *  or an onReview handler. */
  showActions?: boolean
  /** Library detail: Edit + schedule actions live in the dialog — hide Skip. */
  showReject?: boolean
  /** Deck skip — the X button advances without any reject side effect
   *  (no toast). Falls back to the legacy reject toast only when neither
   *  this nor onReject is provided. */
  onSkip?: () => void
  /** Deck review — the check button hands the card's live layers up so the
   *  deck can open its Review dialog. Used only by the feed; every other
   *  surface keeps the direct handlers below. */
  onReviewPress?: (snapshot: PostReviewSnapshot) => void
  /** Lets the deck trigger the check button (arrow keys). */
  reviewActionRef?: { current: (() => void) | null }
  onReject?: () => void
  onReview?: () => void
  /** Persist hook for DB-backed surfaces (Library) — called on editor Done
   *  with the draft layers + replacement media (session object URL or null). */
  onApplyEdit?: (patch: { blocks: OverlayBlock[]; gifLayer: MemeGifLayer; aspect: number | null; url: string | null; kind: 'image' | 'video' }) => void
  className?: string
  soundOn?: boolean
  onToggleSound?: () => void
}

export function PostContainer({
  source,
  isActive = false,
  memeActive = true,
  showPills = true,
  showActions = true,
  showReject = true,
  onSkip,
  onReviewPress,
  reviewActionRef,
  onReject,
  onReview,
  onApplyEdit,
  className,
  soundOn,
  onToggleSound,
}: PostContainerProps) {
  const { contentDoc: content, mediaType } = source
  const baseSrc = source.visualUrl
  const { toast } = useToast()

  const [blocks, setBlocks] = useState<OverlayBlock[]>(() => source.initialBlocks ?? overlayBlocksForContent(content))
  // Layer 3 of the meme composition: position of the meme_url GIF overlay.
  // Session-local per post (resets with the post, like blocks); persisted to
  // the Library snapshot on save via ReviewDialog.
  const [gifLayer, setGifLayer] = useState<MemeGifLayer>(source.initialGifLayer ?? DEFAULT_MEME_GIF_LAYER)
  const [mediaOverride, setMediaOverride] = useState<{ url: string; kind: 'image' | 'video' } | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSelectedId, setEditorSelectedId] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Content-fitted viewport aspect measured by the media box — reused by the
  // editor popup + review snapshot so all three share one frame.
  const [fittedAspect, setFittedAspect] = useState<number | null>(source.aspect ?? null)
  const overrideRef = useRef<string | null>(null)
  useEffect(() => {
    overrideRef.current = mediaOverride?.url ?? null
  }, [mediaOverride?.url])
  // Refs for the persist hook — applyEditor is stable, reads latest values.
  const onApplyEditRef = useRef(onApplyEdit)
  useEffect(() => {
    onApplyEditRef.current = onApplyEdit
  })
  const gifLayerRef = useRef(gifLayer)
  useEffect(() => {
    gifLayerRef.current = gifLayer
  }, [gifLayer])
  const fittedAspectRef = useRef(fittedAspect)
  useEffect(() => {
    fittedAspectRef.current = fittedAspect
  }, [fittedAspect])

  // Fresh layers per post.
  useEffect(() => {
    setBlocks(source.initialBlocks ?? overlayBlocksForContent(content))
    setGifLayer(source.initialGifLayer ?? DEFAULT_MEME_GIF_LAYER)
    setFittedAspect(source.aspect ?? null)
    setMediaOverride((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.key])

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

  const handleSkip = useCallback(() => {
    // Deck X button: advance only, no side effect.
    if (onSkip) {
      onSkip()
      return
    }
    if (onReject) {
      onReject()
      return
    }
    toast({ title: 'Rejected', description: 'This post was marked as rejected.', variant: 'default' })
  }, [onSkip, onReject, toast])

  const applyEditor = useCallback((nextBlocks: OverlayBlock[], nextUrl: string | null, nextKind: 'image' | 'video', nextGif?: MemeGifLayer) => {
    setBlocks(nextBlocks)
    if (nextGif) setGifLayer(nextGif)
    setMediaOverride((prev) => {
      if (prev && prev.url !== nextUrl) URL.revokeObjectURL(prev.url)
      return nextUrl ? { url: nextUrl, kind: nextKind } : null
    })
    onApplyEditRef.current?.({
      blocks: nextBlocks,
      gifLayer: nextGif ?? gifLayerRef.current,
      aspect: fittedAspectRef.current,
      url: nextUrl,
      kind: nextKind,
    })
  }, [])

  const displaySrc = mediaOverride?.url ?? baseSrc
  const isVideo = (mediaOverride?.kind ?? mediaType) === 'video'
  const isMeme = content.contentFormat === 'meme'

  const platform = platformMeta(content.platform)
  const typePill = typeLabel(content.contentType) || formatLabel(content.contentFormat)
  const campaignPill = `${platform.label} · ${formatLabel(content.contentFormat)}`
  const showReviewAction = !!source.feedItem || !!onReview

  // Deck review — the check button freezes the card's live layers and hands
  // them to the deck, which advances and opens its Review dialog.
  const getSnapshot = useCallback((): PostReviewSnapshot | null => {
    if (!source.feedItem) return null
    return {
      item: source.feedItem,
      visualUrl: displaySrc,
      mediaType: isVideo ? 'video' : 'image',
      blocks,
      aspect: fittedAspect,
      gifLayer: isMeme ? gifLayer : undefined,
    }
  }, [source.feedItem, displaySrc, isVideo, blocks, fittedAspect, isMeme, gifLayer])

  const handleReview = useCallback(() => {
    const snapshot = getSnapshot()
    if (snapshot && onReviewPress) {
      onReviewPress(snapshot)
      return
    }
    if (onReview) {
      onReview()
      return
    }
    setReviewOpen(true)
  }, [getSnapshot, onReviewPress, onReview])

  // Lets the deck trigger the check button (arrow keys).
  useEffect(() => {
    if (!reviewActionRef) return
    reviewActionRef.current = handleReview
  })

  return (
    <article className={cn('mx-auto flex w-full max-w-lg flex-col items-center gap-3 sm:gap-4', className)}>
      {/* Top context stickers — sticker-pack badges: thick borders, hard
          offset shadows, slight tilts, loud uppercase type. Dynamic labels
          from existing content data; look only, no behavior. */}
      {showPills && (
        <div className="flex flex-wrap items-center justify-center gap-2.5" aria-label="Post context">
          <span className="-rotate-2 inline-flex items-center rounded-full border-2 border-foreground bg-foreground px-3.5 py-1.5 text-[11px] font-extrabold tracking-wider text-background uppercase shadow-[3px_3px_0_0_var(--color-foreground)]">
            {typePill}
          </span>
          <span className="inline-flex rotate-1 items-center gap-1.5 rounded-full border-2 border-primary/60 bg-primary/15 px-3.5 py-1.5 text-[11px] font-extrabold tracking-wider text-primary uppercase shadow-[3px_3px_0_0_var(--color-primary)]">
            <span className={cn('size-1.5 rounded-full', platform.dot)} aria-hidden />
            {campaignPill}
          </span>
        </div>
      )}

      {/* Hero media — phone-like viewport that shrink-fits the actual
          content: portrait video gets a portrait box (no wide black side
          bars), capped at 24rem so the post previews at true social-media
          scale instead of stretching across the screen. */}
      <PostMediaContainer
        src={displaySrc}
        poster={source.posterUrl}
        alt={source.altText ?? content.hook ?? 'Content visual'}
        mediaType={isVideo ? 'video' : 'image'}
        aspect={source.aspect}
        resetKey={source.key}
        blocks={blocks}
        gifLayer={gifLayer}
        memeSrc={isMeme ? content.memeUrl : null}
        memeAlt={content.memeName ?? content.hook ?? 'Meme overlay'}
        visualStatus={source.visualStatus}
        isActive={isActive}
        memeActive={memeActive}
        onTextClick={openEditor}
        onPatchBlocks={patchBlocks}
        onAspectChange={setFittedAspect}
        soundOn={soundOn}
        onToggleSound={onToggleSound}
      />

      {/* Action row — one flat, center-aligned row: tinted Skip circle /
          Edit pill / tinted Review circle, fully outside the media. Skip
          advances only; Review hands the card to the deck dialog. */}
      {showActions && (
        <div className="flex items-center justify-center gap-5" role="group" aria-label="Review actions">
          {showReject && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleSkip}
              className="size-14 rounded-full border-destructive/30 bg-destructive/[0.07] shadow-md transition hover:bg-destructive/15 hover:shadow-lg active:scale-95 dark:bg-card"
              aria-label="Skip post"
              title="Skip (←)"
            >
              <X className="size-7 text-destructive" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleEdit}
            className="h-11 rounded-full px-7 shadow-md transition active:scale-95 dark:bg-card"
            aria-label="Edit post"
          >
            <Pencil className="size-4" data-icon="inline-start" />
            Edit
          </Button>
          {showReviewAction && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleReview}
              className="size-14 rounded-full border-success/30 bg-success/[0.07] shadow-md transition hover:bg-success/15 hover:shadow-lg active:scale-95 dark:bg-card"
              aria-label="Review post"
              title="Review (→)"
            >
              <Check className="size-7 text-success" />
            </Button>
          )}
        </div>
      )}

      {/* Visual layout editor popup — draft editing, feed applies on Done */}
      <OverlayEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        content={content}
        visualSrc={baseSrc}
        isVideo={isVideo}
        poster={source.posterUrl}
        initialBlocks={blocks}
        initialImageOverride={mediaOverride?.url ?? null}
        initialMediaKind={mediaOverride?.kind ?? null}
        initialSelectedId={editorSelectedId}
        initialGifLayer={gifLayer}
        mediaAspect={fittedAspect}
        onApply={applyEditor}
      />

      {/* Review popup — save to Library or share */}
      {source.feedItem && (
        <ReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          item={source.feedItem}
          visualUrl={displaySrc}
          mediaType={isVideo ? 'video' : 'image'}
          blocks={blocks}
          aspect={fittedAspect}
          gifLayer={isMeme ? gifLayer : undefined}
        />
      )}
    </article>
  )
}

export default PostContainer

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

function VideoVisual({ src, isActive, poster, controls, onNaturalSize, soundOn }: { src: string; isActive: boolean; poster?: string | null; controls?: boolean; onNaturalSize?: (w: number, h: number) => void; soundOn?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const muted = soundOn === undefined ? true : !soundOn
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

  // Keep the element's muted flag in sync with controlled state.
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
          muted={muted}
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
          controls={controls}
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

function EmptyVisual() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <span className="text-xs">No visual</span>
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
