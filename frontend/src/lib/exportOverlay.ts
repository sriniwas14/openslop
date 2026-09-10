import type { OverlayBlock } from '@/components/feed/MediaTextOverlay'
import { computeOverlayLayout, HIGHLIGHT, MEME_GIF_COMPOSITION } from '@/components/feed/overlayConfig'
import { isMemeVideoSrc, type MemeGifLayer } from '@/components/feed/MemeGifOverlay'
import { keyImageData } from '@/lib/chroma'
import { proxiedMediaUrl } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Client-side export — bakes overlay text layers into the downloaded file so
// the image/video carries the same text seen in the feed/Library preview.
//
// Layout comes from the shared engine (computeOverlayLayout), which sizes
// text proportionally to frame width — so wrapping, sizing and positioning
// match the preview relatively at any resolution (WYSIWYG).
//
// Output is normalized to a per-post format frame (default 9:16 1080×1920
// for Reels/TikTok) with a full-bleed cover-crop — no black letterbox bars.
// Videos record to WebM via canvas.captureStream, then POST to
// /media/convert for an ffmpeg H.264 MP4 that IG/TikTok accept.
//
// Meme posts additionally bake Layer 3 (GIF first frame, or the video
// meme's current frame — animated GIF/video cannot survive a PNG export,
// so the still frame is the documented fallback), composited UNDER the
// text like the live preview. Video memes bake chroma-keyed (green removed,
// same CHROMA_KEY defaults as the feed) so exports match the preview.
// ---------------------------------------------------------------------------

export type ExportFormatId = '9:16' | '1:1' | '4:5'

export const EXPORT_FORMATS: Record<ExportFormatId, { W: number; H: number; label: string }> = {
  '9:16': { W: 1080, H: 1920, label: 'Reels / TikTok · 9:16' },
  '1:1': { W: 1080, H: 1080, label: 'Square · 1:1' },
  '4:5': { W: 1080, H: 1350, label: 'Portrait · 4:5' },
}

export type ExportInput = {
  url: string
  mediaType: 'image' | 'video'
  blocks: OverlayBlock[]
  /** Stored meme_url — baked as Layer 3 when present. */
  memeUrl?: string | null
  /** Layer 3 position (% composition coords); defaults to the composition. */
  gifLayer?: MemeGifLayer | null
}

function proxied(url: string): string {
  // ponytail: single helper in lib/utils — same-origin stays direct, remote via /media/proxy.
  return proxiedMediaUrl(url)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = proxied(url)
  })
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.preload = 'auto'
    v.onloadedmetadata = () => resolve(v)
    v.onerror = () => reject(new Error('video load failed'))
    v.src = proxied(url)
  })
}

async function ensureFont(weight: number) {
  try {
    await Promise.all([
      document.fonts.load(`${weight} 32px Inter`),
      document.fonts.load(`${weight} 32px "Inter Variable"`),
    ])
  } catch {
    // Fall back to whatever sans-serif is available.
  }
}

/** Draw one overlay block onto ctx for an output frame of W×H. */
function drawBlock(ctx: CanvasRenderingContext2D, block: OverlayBlock, W: number, H: number) {
  const bgOn = block.backgroundEnabled
  // Download-only scaling: the feed renders this block at a fixed 14px, so
  // scale up for the baked file (3x → ~42px headline on a 1080-wide frame).
  // The feed itself is untouched — this runs only at download time.
  const exportScale = 3
  const layout = computeOverlayLayout(
    block.text,
    { width: W, height: H },
    {
      fontSizePct: block.size,
      position: { x: block.x / 100, y: block.y / 100 },
      maxWidthPct: block.maxWidthPct ?? 0.8,
      textColor: block.color,
      fontWeight: block.fontWeight ?? (block.bold ? 800 : 500),
      ...(bgOn ? { lineHeight: HIGHLIGHT.lineHeight } : {}),
    },
    null,
    exportScale,
  )
  if (layout.lines.length === 0 || layout.fontSize <= 0) return

  const cfg = layout.config
  const cx = layout.leftPx
  const lh = Math.round(layout.fontSize * cfg.lineHeight)
  ctx.save()
  ctx.font = `${cfg.fontWeight} ${layout.fontSize}px ${cfg.fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = cfg.letterSpacing
  } catch {
    // Older browsers ignore letter-spacing on canvas.
  }

  layout.lines.forEach((line, i) => {
    const y = layout.topPx + lh * (i + 0.5)
    if (bgOn) {
      // Tight per-line highlight chip, mirroring the preview renderer.
      const w = ctx.measureText(line).width
      const padX = layout.fontSize * HIGHLIGHT.hPadEm
      const padY = layout.fontSize * HIGHLIGHT.vPadEm
      const r = layout.fontSize * HIGHLIGHT.radiusEm
      const x = cx - w / 2 - padX
      const yy = y - lh / 2 - padY
      const ww = w + padX * 2
      const hh = lh + padY * 2
      ctx.fillStyle = block.backgroundColor
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, yy, ww, hh, r)
      else ctx.rect(x, yy, ww, hh)
      ctx.fill()
      ctx.fillStyle = block.color
      ctx.fillText(line, cx, y)
    } else {
      ctx.lineWidth = layout.strokeWidth * 2
      ctx.strokeStyle = cfg.strokeColor
      ctx.lineJoin = 'round'
      ctx.strokeText(line, cx, y)
      ctx.fillStyle = block.color
      ctx.fillText(line, cx, y)
    }
  })
  ctx.restore()
}

/** Paint the source frame full-bleed (cover-crop) — Reels/TikTok native, no bars. */
function paintFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  sw: number,
  sh: number,
  W: number,
  H: number,
) {
  const scale = Math.max(W / sw, H / sh)
  const dw = sw * scale
  const dh = sh * scale
  ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

function paintBlocks(ctx: CanvasRenderingContext2D, blocks: OverlayBlock[], W: number, H: number) {
  for (const b of blocks) {
    if (b.text.trim()) drawBlock(ctx, b, W, H)
  }
}

/** Key green out of a scratch canvas in place (export path, CPU mirror of the WebGL preview). */
function keyCanvasInPlace(canvas: HTMLCanvasElement): void {
  const w = canvas.width
  const h = canvas.height
  if (!w || !h) return
  const c = canvas.getContext('2d', { willReadFrequently: true })
  if (!c) return
  const img = c.getImageData(0, 0, w, h)
  keyImageData(img)
  c.putImageData(img, 0, 0)
}

/** Paint the Layer 3 meme (GIF first frame or video current frame) at its composition position. */
function paintGifLayer(
  ctx: CanvasRenderingContext2D,
  gif: HTMLImageElement | HTMLVideoElement,
  gifLayer: MemeGifLayer | null | undefined,
  W: number,
  H: number,
  /** True for video memes: key green out so baked exports match the feed. */
  key = false,
  /** Reused scratch canvas (video exports pass one to avoid per-frame allocs). */
  scratch?: HTMLCanvasElement,
) {
  const gw = gif instanceof HTMLVideoElement ? gif.videoWidth : gif.naturalWidth
  const gh = gif instanceof HTMLVideoElement ? gif.videoHeight : gif.naturalHeight
  if (!gw || !gh) return
  const layer = gifLayer ?? { x: MEME_GIF_COMPOSITION.x, y: MEME_GIF_COMPOSITION.y }
  // Same box as the preview: width 70% of the frame, aspect preserved,
  // capped at 55% of the frame height.
  const targetW = W * MEME_GIF_COMPOSITION.widthPct
  let dw = targetW
  let dh = (gh / gw) * dw
  const maxH = H * MEME_GIF_COMPOSITION.maxHeightPct
  if (dh > maxH) {
    dh = maxH
    dw = (gw / gh) * dh
  }
  const cx = (layer.x / 100) * W
  const cy = (layer.y / 100) * H
  if (!key) {
    ctx.drawImage(gif, cx - dw / 2, cy - dh / 2, dw, dh)
    return
  }
  const off = scratch ?? document.createElement('canvas')
  off.width = Math.max(2, Math.round(dw))
  off.height = Math.max(2, Math.round(dh))
  const octx = off.getContext('2d', { willReadFrequently: true })
  if (!octx) {
    ctx.drawImage(gif, cx - dw / 2, cy - dh / 2, dw, dh)
    return
  }
  octx.clearRect(0, 0, off.width, off.height)
  octx.drawImage(gif, 0, 0, off.width, off.height)
  keyCanvasInPlace(off)
  ctx.drawImage(off, cx - dw / 2, cy - dh / 2, dw, dh)
}

async function loadGifFirstFrame(memeUrl: string | null | undefined): Promise<HTMLImageElement | HTMLVideoElement | null> {
  if (!memeUrl) return null
  try {
    if (isMemeVideoSrc(memeUrl)) {
      // Video meme: seek to the first frame so a PNG export still bakes
      // Layer 3, and a video export can play it live per frame.
      const v = await loadVideo(memeUrl)
      await new Promise<void>((resolve, reject) => {
        v.onseeked = () => resolve()
        v.onerror = () => reject(new Error('meme seek failed'))
        try {
          v.currentTime = Math.min(0.1, (v.duration || 1) / 2)
        } catch {
          resolve()
        }
      })
      return v
    }
    return await loadImage(memeUrl)
  } catch {
    return null // broken meme_url must never fail the whole export
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type)
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

/** Baked PNG download for image posts, normalized to the format frame. Throws → caller falls back to raw. */
export async function exportImageWithOverlay(input: ExportInput, filename: string, format: ExportFormatId = '9:16'): Promise<void> {
  const img = await loadImage(input.url)
  const { W, H } = EXPORT_FORMATS[format] ?? EXPORT_FORMATS['9:16']
  await ensureFont(700)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  paintFrame(ctx, img, img.naturalWidth, img.naturalHeight, W, H)
  const gif = await loadGifFirstFrame(input.memeUrl)
  if (gif) paintGifLayer(ctx, gif, input.gifLayer, W, H, isMemeVideoSrc(input.memeUrl ?? ''))
  paintBlocks(ctx, input.blocks, W, H)
  // Throws on taint (no CORS headers) — caller handles the fallback.
  downloadBlob(await canvasToBlob(canvas, 'image/png'), filename)
}

/**
 * Baked MP4 download for video posts — replays the clip through a canvas
 * with the text painted every frame, records WebM, then converts to H.264
 * MP4 via POST /media/convert (IG/TikTok don't accept WebM). Falls back to
 * a baked still frame when recording is unsupported, or the raw WebM when
 * conversion fails. Returns which artifact was produced.
 */
export async function exportVideoWithOverlay(
  input: ExportInput,
  filename: string,
  format: ExportFormatId = '9:16',
  onStillFallback?: () => void,
): Promise<'mp4' | 'webm' | 'still'> {
  const v = await loadVideo(input.url)
  const { W, H } = EXPORT_FORMATS[format] ?? EXPORT_FORMATS['9:16']
  await ensureFont(700)
  const gif = await loadGifFirstFrame(input.memeUrl)
  // Video memes animate during the recording — a paused first frame would
  // bake as a still overlay for the whole clip.
  if (gif instanceof HTMLVideoElement) {
    gif.muted = true
    gif.loop = true
    await gif.play().catch(() => {})
  }

  const canRecord =
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof (document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown }).captureStream === 'function' &&
    typeof MediaRecorder !== 'undefined'

  // Video memes bake keyed (green removed) like the feed; still GIFs paint raw.
  const keyMeme = isMemeVideoSrc(input.memeUrl ?? '')
  const memeScratch = document.createElement('canvas')
  const paint = (ctx: CanvasRenderingContext2D) => {
    paintFrame(ctx, v, v.videoWidth, v.videoHeight, W, H)
    if (gif) paintGifLayer(ctx, gif, input.gifLayer, W, H, keyMeme, memeScratch)
    paintBlocks(ctx, input.blocks, W, H)
  }

  if (!canRecord) {
    // Still-frame fallback: seek near the start and bake one PNG.
    await new Promise<void>((resolve, reject) => {
      v.onseeked = () => resolve()
      v.onerror = () => reject(new Error('seek failed'))
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2)
    })
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    paint(ctx)
    onStillFallback?.()
    downloadBlob(await canvasToBlob(canvas, 'image/png'), filename.replace(/\.webm$/i, '.png'))
    return 'still'
  }

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')

  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30)
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m)
    } catch {
      return false
    }
  })
  const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve, reject) => {
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
    rec.onerror = () => reject(new Error('record failed'))
  })

  await v.play().catch(() => {})
  // Paint every frame while recording (rAF stops when the tab hides; the
  // time cap below still terminates the recording).
  let raf = 0
  const tick = () => {
    paint(ctx)
    raf = requestAnimationFrame(tick)
  }
  tick()
  rec.start(250)
  const capMs = Math.min((v.duration || 10) * 1000, 60000)
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      window.clearTimeout(timer)
      resolve()
    }, capMs)
    v.onended = () => {
      window.clearTimeout(timer)
      resolve()
    }
  })
  cancelAnimationFrame(raf)
  try {
    v.pause()
  } catch {
    // Already stopped.
  }
  if (gif instanceof HTMLVideoElement) {
    try {
      gif.pause()
    } catch {
      // Already stopped.
    }
  }
  // Flush the last painted frame before finalising.
  paint(ctx)
  await new Promise((r) => window.setTimeout(r, 300))
  rec.stop()
  const blob = await done
  v.removeAttribute('src')
  v.load()
  // WebM → MP4 so the file uploads to Instagram/TikTok; raw WebM fallback.
  try {
    const res = await fetch('/media/convert', { method: 'POST', credentials: 'include', headers: { 'content-type': 'video/webm' }, body: blob })
    if (!res.ok) throw new Error(`convert ${res.status}`)
    const mp4 = await res.blob()
    downloadBlob(mp4, filename.replace(/\.webm$/i, '.mp4'))
    return 'mp4'
  } catch {
    downloadBlob(blob, filename)
    return 'webm'
  }
}
