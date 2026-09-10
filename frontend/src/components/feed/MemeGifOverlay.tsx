import { useState } from 'react'
import { cn, proxiedMediaUrl } from '@/lib/utils'
import { MEME_GIF_COMPOSITION } from '@/components/feed/overlayConfig'
import ChromaKeyVideo from '@/components/feed/ChromaKeyVideo'

// ---------------------------------------------------------------------------
// Layer 3 of the meme composition — the meme from the stored `meme_url`,
// overlaid ABOVE the base image (Layer 1) and the overlay text (Layer 2).
//
// Same composition coordinate system as the text overlay: position is the
// centre anchor in % of the container, rendered with
// translate(-50%, -50%). Images (incl. GIFs) render as <img> to preserve
// animation; video memes (.mp4/.mov/.webm) render keyed through
// ChromaKeyVideo (WebGL green-screen removal onto a transparent canvas).
// Width is 70% of the composition; aspect ratio is never
// distorted (object-contain + max-height cap). Hidden when there is no
// meme_url or it fails to load.
// ---------------------------------------------------------------------------

export type MemeGifLayer = {
  /** % of composition width from left (centre). */
  x: number
  /** % of composition height from top (centre). */
  y: number
}

export const DEFAULT_MEME_GIF_LAYER: MemeGifLayer = {
  x: MEME_GIF_COMPOSITION.x,
  y: MEME_GIF_COMPOSITION.y,
}

/** Video memes (R2 .mp4s) need a <video> element — <img> renders them broken. */
export function isMemeVideoSrc(src: string): boolean {
  const path = src.split('?')[0].split('#')[0].toLowerCase()
  return path.endsWith('.mp4') || path.endsWith('.mov') || path.endsWith('.webm')
}

export default function MemeGifOverlay({
  src,
  alt,
  layer,
  draggable = false,
  disabled = false,
  selected = false,
  active = true,
  soundOn = false,
  onSelect,
  onPatch,
}: {
  /** Stored meme_url — null/undefined renders nothing. */
  src: string | null | undefined
  alt: string
  layer: MemeGifLayer
  draggable?: boolean
  disabled?: boolean
  selected?: boolean
  /** False when the card is offscreen — the video unloads its shader. */
  active?: boolean
  soundOn?: boolean
  onSelect?: (selected: boolean) => void
  onPatch?: (p: Partial<MemeGifLayer>) => void
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [loadedSrc, setLoadedSrc] = useState(src)
  // A failed meme_url must never poison later posts: the card instance
  // persists across posts, so reset the latch whenever the source changes
  // (derived during render, not in an effect — no cascading re-render).
  if (src !== loadedSrc) {
    setLoadedSrc(src)
    if (failed) setFailed(false)
  }

  if (!src || failed) return null

  const interactive = draggable && !disabled && !!onPatch
  const overlayClass = cn(
    'absolute z-20 -translate-x-1/2 -translate-y-1/2 object-contain select-none',
    interactive ? 'cursor-move touch-none' : 'pointer-events-none',
    selected && interactive && 'ring-2 ring-primary/80',
  )
  const overlayStyle = {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${MEME_GIF_COMPOSITION.widthPct * 100}%`,
    maxHeight: `${MEME_GIF_COMPOSITION.maxHeightPct * 100}%`,
  }

  if (isMemeVideoSrc(src)) {
    // Video memes are shot on green — key it out on a transparent canvas so
    // the subject composites over the base visual (same box/handlers as the
    // plain <video> before it; drag math resolves against the parent rect).
    return (
      <ChromaKeyVideo
        src={src}
        alt={alt}
        active={active}
        soundOn={soundOn}
        onError={() => setFailed(true)}
        onPointerDown={
          !interactive
            ? undefined
            : (e) => {
                e.stopPropagation()
                onSelect?.(true)
                // The composition container is the direct parent — resolve the
                // drag offset against its rect so movement stays in % coords.
                const rect = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect()
                setDrag({
                  dx: e.clientX - rect.left - (layer.x / 100) * rect.width,
                  dy: e.clientY - rect.top - (layer.y / 100) * rect.height,
                })
              }
        }
        onPointerMove={
          !interactive
            ? undefined
            : (e) => {
                if (!drag) return
                const rect = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect()
                if (rect.width <= 0 || rect.height <= 0) return
                const nx = ((e.clientX - rect.left - drag.dx) / rect.width) * 100
                const ny = ((e.clientY - rect.top - drag.dy) / rect.height) * 100
                onPatch?.({ x: Math.min(100, Math.max(0, nx)), y: Math.min(100, Math.max(0, ny)) })
              }
        }
        onPointerUp={!interactive ? undefined : () => setDrag(null)}
        onPointerCancel={!interactive ? undefined : () => setDrag(null)}
        className={overlayClass}
        style={overlayStyle}
      />
    )
  }

  return (
    <img
      src={proxiedMediaUrl(src)}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
      onPointerDown={
        !interactive
          ? undefined
          : (e) => {
              e.stopPropagation()
              onSelect?.(true)
              // The composition container is the direct parent — resolve the
              // drag offset against its rect so movement stays in % coords.
              const rect = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect()
              setDrag({
                dx: e.clientX - rect.left - (layer.x / 100) * rect.width,
                dy: e.clientY - rect.top - (layer.y / 100) * rect.height,
              })
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }
      }
      onPointerMove={
        !interactive
          ? undefined
          : (e) => {
              if (!drag) return
              const rect = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect()
              if (rect.width <= 0 || rect.height <= 0) return
              const nx = ((e.clientX - rect.left - drag.dx) / rect.width) * 100
              const ny = ((e.clientY - rect.top - drag.dy) / rect.height) * 100
              onPatch?.({ x: Math.min(100, Math.max(0, nx)), y: Math.min(100, Math.max(0, ny)) })
            }
      }
      onPointerUp={!interactive ? undefined : () => setDrag(null)}
      onPointerCancel={!interactive ? undefined : () => setDrag(null)}
      className={overlayClass}
      style={overlayStyle}
    />
  )
}
