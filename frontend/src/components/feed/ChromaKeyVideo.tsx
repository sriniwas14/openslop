import { useEffect, useRef, useState, type CSSProperties, type PointerEventHandler } from 'react'
import { proxiedMediaUrl } from '@/lib/utils'
import { createChromaRenderer, type ChromaRenderer } from '@/lib/chroma'

// ---------------------------------------------------------------------------
// Chroma-keyed meme video — Layer 3 of the meme composition.
//
// Same contract as the plain <video> it replaces (looping, muted, autoplay,
// same className/style so composition + drag math are untouched), except the
// visible element is a <canvas> fed by a hidden <video> through a WebGL
// green-screen shader. The canvas is transparent where the green was, so the
// subject composites over the base visual instead of sitting in a green box.
//
// CORS: the hidden video keeps crossOrigin="anonymous" + proxiedMediaUrl, so
// the WebGL texture never taints (R2 sends no CORS headers; /media/proxy
// fixes that — same helper the plain <video> already used).
//
// Fallback: WebGL unavailable → plain <video> (today's behavior). Never blank.
//
// Visibility-gated: only the in-view card holds a GL context, a video
// decoder, and an rAF loop. Offscreen cards fully unload (src removed,
// context lost, canvas cleared) so a feed of memes can't exhaust contexts
// or crash the tab. Defaults to active so single-post surfaces (editor,
// Library) keep playing without opting in.
// ---------------------------------------------------------------------------

type Props = {
  src: string
  alt: string
  className?: string
  style?: CSSProperties
  /** False when the card scrolled out of view — unload everything. */
  active?: boolean
  soundOn?: boolean
  onError?: () => void
  onPointerDown?: PointerEventHandler<HTMLCanvasElement | HTMLVideoElement>
  onPointerMove?: PointerEventHandler<HTMLCanvasElement | HTMLVideoElement>
  onPointerUp?: PointerEventHandler<HTMLCanvasElement | HTMLVideoElement>
  onPointerCancel?: PointerEventHandler<HTMLCanvasElement | HTMLVideoElement>
}

export default function ChromaKeyVideo({
  src,
  alt,
  className,
  style,
  active = true,
  soundOn = false,
  onError,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLVideoElement>(null)
  const rendererRef = useRef<ChromaRenderer | null>(null)
  const [glFailed, setGlFailed] = useState(false)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  // Fresh renderer per source — the instance persists across posts.
  useEffect(() => {
    setGlFailed(false)
    rendererRef.current?.dispose()
    rendererRef.current = null
  }, [src])

  const url = proxiedMediaUrl(src)

  // WebGL fallback branch has no shader loop, but still must not play offscreen.
  useEffect(() => {
    if (!glFailed) return
    const v = fallbackRef.current
    if (!v) return
    if (active) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [glFailed, active, src])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (!active || glFailed) {
      // Full unload: release the decoder, stop the download, lose the GL
      // context, clear the canvas. Nothing runs until back in view.
      video.pause()
      video.removeAttribute('src')
      video.load()
      rendererRef.current?.dispose()
      rendererRef.current = null
      canvas.width = 0
      canvas.height = 0
      return
    }

    let raf = 0
    let disposed = false
    // Watchdog: when the video has frames but draw() never succeeds (e.g. a
    // context restore that never completes), fall back to plain video.
    let firstFrameAt = 0

    const ensureRenderer = (): ChromaRenderer | null => {
      if (!rendererRef.current) {
        rendererRef.current = createChromaRenderer(canvas)
        if (!rendererRef.current && !disposed) setGlFailed(true)
      }
      return rendererRef.current
    }

    const tick = () => {
      if (disposed) return
      if (!document.hidden && !video.paused && !video.ended && video.readyState >= 2) {
        if (!firstFrameAt) firstFrameAt = performance.now()
        if (!ensureRenderer()?.draw(video) && !disposed && performance.now() - firstFrameAt > 2500) {
          // Video is playing but no keyed frame lands (e.g. a context that
          // never restores) — fall back to the plain video, never blank.
          setGlFailed(true)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }

    const onPlay = () => {
      ensureRenderer()
    }
    video.addEventListener('play', onPlay)
    // src is managed imperatively (never a JSX prop) so the unload above
    // isn't undone by React — restore it here when back in view.
    if (video.getAttribute('src') !== url) video.src = url
    video.play().catch(() => {})
    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      video.removeEventListener('play', onPlay)
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [src, glFailed, active, url])

  if (glFailed) {
    return (
      <video
        ref={fallbackRef}
        src={url}
        aria-label={alt}
        autoPlay={active}
        loop
        muted={!soundOn}
        playsInline
        preload={active ? 'auto' : 'metadata'}
        crossOrigin="anonymous"
        draggable={false}
        onError={() => onErrorRef.current?.()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={className}
        style={style}
      />
    )
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label={alt}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={className}
        style={style}
      />
      <video
        ref={videoRef}
        aria-hidden
        tabIndex={-1}
        loop
        muted={!soundOn}
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        onError={() => onErrorRef.current?.()}
        style={{ display: 'none' }}
      />
    </>
  )
}
