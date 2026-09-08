import type { OverlayBlock } from '@/components/feed/MediaTextOverlay'
import { computeOverlayLayout, HIGHLIGHT } from '@/components/feed/overlayConfig'

// ---------------------------------------------------------------------------
// Client-side export — bakes overlay text layers into the downloaded file so
// the image/video carries the same text seen in the feed/Library preview.
//
// Layout comes from the shared engine (computeOverlayLayout), so wrapping,
// sizing and positioning match the preview: every fraction is relative to
// the full output frame, exactly like the on-screen overlay box.
// ---------------------------------------------------------------------------

export type ExportInput = {
  url: string
  mediaType: 'image' | 'video'
  blocks: OverlayBlock[]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
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
    v.src = url
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
  const layout = computeOverlayLayout(
    block.text,
    { width: W, height: H },
    {
      fontSizePct: block.size,
      position: { x: block.x / 100, y: block.y / 100 },
      maxWidthPct: block.maxWidthPct ?? 0.7,
      textColor: block.color,
      fontWeight: block.bold ? 800 : 500,
      ...(bgOn ? { lineHeight: HIGHLIGHT.lineHeight } : {}),
    },
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

/** Paint the source frame contain-fitted onto a black frame (matches feed). */
function paintFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  sw: number,
  sh: number,
  W: number,
  H: number,
) {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)
  const scale = Math.min(W / sw, H / sh)
  const dw = sw * scale
  const dh = sh * scale
  ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

function paintBlocks(ctx: CanvasRenderingContext2D, blocks: OverlayBlock[], W: number, H: number) {
  for (const b of blocks) {
    if (b.text.trim()) drawBlock(ctx, b, W, H)
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

/** Baked PNG download for image posts. Throws → caller falls back to raw. */
export async function exportImageWithOverlay(input: ExportInput, filename: string): Promise<void> {
  const img = await loadImage(input.url)
  const W = img.naturalWidth || 1080
  const H = img.naturalHeight || 1350
  await ensureFont(800)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  paintFrame(ctx, img, img.naturalWidth, img.naturalHeight, W, H)
  paintBlocks(ctx, input.blocks, W, H)
  // Throws on taint (no CORS headers) — caller handles the fallback.
  downloadBlob(await canvasToBlob(canvas, 'image/png'), filename)
}

/**
 * Baked WebM download for video posts — replays the clip through a canvas
 * with the text painted every frame. Falls back to a baked still frame
 * when recording is unsupported; throws when nothing can be produced.
 */
export async function exportVideoWithOverlay(
  input: ExportInput,
  filename: string,
  onStillFallback?: () => void,
): Promise<void> {
  const v = await loadVideo(input.url)
  const W = v.videoWidth || 720
  const H = v.videoHeight || 1280
  await ensureFont(800)

  const canRecord =
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof (document.createElement('canvas') as HTMLCanvasElement & { captureStream?: unknown }).captureStream === 'function' &&
    typeof MediaRecorder !== 'undefined'

  const paint = (ctx: CanvasRenderingContext2D) => {
    paintFrame(ctx, v, v.videoWidth, v.videoHeight, W, H)
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
    return
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
  // Flush the last painted frame before finalising.
  paint(ctx)
  await new Promise((r) => window.setTimeout(r, 300))
  rec.stop()
  const blob = await done
  v.removeAttribute('src')
  v.load()
  downloadBlob(blob, filename)
}
