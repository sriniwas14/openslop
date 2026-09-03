import { useCallback, useEffect, useRef, useState } from 'react'
import { Bold, Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type TextLayer = {
  id: string
  text: string
  x: number // canvas coords — centre of the wrapped text block
  y: number
  fontSize: number
  color: string
  fontFamily: string
  bold: boolean
  outline: boolean
  // Instagram-style background behind each line — 'pill' draws a rounded box
  bgMode: 'none' | 'pill'
  bgColor: string
  bgOpacity: number // 0-100
}

// quick-add suggestions sourced from the generated UGC idea
export type UgcTextSuggestion = {
  label: string
  text: string
  style: 'headline' | 'subtext'
}

const CANVAS = 1080
// 70% of canvas width — headline block stays centred with safe margins,
// matching the feed overlay (overlayConfig maxWidthPct 0.70).
const MAX_TEXT_WIDTH = CANVAS * 0.7

const FONTS = [
  { label: 'Sans', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"Courier New", monospace' },
  { label: 'Script', value: '"Brush Script MT", "Segoe Script", cursive' },
]

const COLORS = ['#ffffff', '#171717', '#FF941F', '#facc15', '#ef4444', '#38bdf8', '#22c55e']
// classic Instagram story palette for the text background pill
const BG_COLORS = ['#171717', '#ffffff', '#FF941F', '#ef4444', '#ec4899', '#8b5cf6', '#38bdf8', '#22c55e']

// headline size follows text length — shorter hooks render bigger.
// ~25-30% smaller than before so the text reads as a headline without
// dominating the frame; stays responsive via canvas-relative sizing.
function headlineFontSize(text: string) {
  if (text.length > 70) return 40
  if (text.length > 45) return 50
  return 58
}

type Box = { x: number; y: number; w: number; h: number }

function fontString(l: TextLayer) {
  return `${l.bold ? 800 : 500} ${l.fontSize}px ${l.fontFamily}`
}

// rounded-rect path built from arcs — works on every canvas implementation
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

// word wrap that respects explicit newlines — mirrors the server-side overlay
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of (text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) { out.push(''); continue }
    let line = words[0]
    for (const word of words.slice(1)) {
      const next = `${line} ${word}`
      if (ctx.measureText(next).width <= maxWidth) line = next
      else { out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

// the canvas starts empty — text is added by the user, never baked in
export default function UgcImageEditor({
  imageUrl,
  suggestions = [],
}: {
  imageUrl: string
  suggestions?: UgcTextSuggestion[]
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const boxesRef = useRef<Record<string, Box>>({})
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const [layers, setLayers] = useState<TextLayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // load the base image once — same-origin URL keeps the canvas untainted so we can export it
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setReady(true)
    }
    img.src = imageUrl
  }, [imageUrl])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, CANVAS, CANVAS)
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, CANVAS, CANVAS)

    const boxes: Record<string, Box> = {}
    for (const l of layers) {
      ctx.font = fontString(l)
      const lines = wrapLines(ctx, l.text, MAX_TEXT_WIDTH)
      const lineHeight = Math.round(l.fontSize * 1.18)
      const widths = lines.map((t) => ctx.measureText(t).width)
      const width = Math.max(...widths, 1)
      const height = lines.length * lineHeight
      // the pill background sticks out horizontally — include it in the hit box
      const padX = l.bgMode === 'pill' ? l.fontSize * 0.45 : 0
      boxes[l.id] = { x: l.x - width / 2 - padX - 12, y: l.y - height / 2 - 12, w: width + padX * 2 + 24, h: height + 24 }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      lines.forEach((line, i) => {
        const y = l.y - height / 2 + lineHeight / 2 + i * lineHeight
        if (l.bgMode === 'pill') {
          // Instagram look: one snug rounded box per line, sized to that line
          const pillW = widths[i] + l.fontSize * 0.9
          ctx.save()
          ctx.globalAlpha = Math.max(0, Math.min(100, l.bgOpacity)) / 100
          ctx.fillStyle = l.bgColor
          roundRectPath(ctx, l.x - pillW / 2, y - lineHeight / 2, pillW, lineHeight * 0.98, lineHeight * 0.3)
          ctx.fill()
          ctx.restore()
        }
        // outline only makes sense directly on the photo — skip it under a pill
        if (l.outline && l.bgMode === 'none') {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
          ctx.lineWidth = Math.max(3, Math.round(l.fontSize / 12))
          ctx.strokeText(line, l.x, y)
        }
        ctx.fillStyle = l.color
        ctx.fillText(line, l.x, y)
      })
    }
    boxesRef.current = boxes

    // selection outline on the active layer
    if (selectedId && boxes[selectedId]) {
      const b = boxes[selectedId]
      ctx.save()
      ctx.setLineDash([10, 8])
      ctx.lineWidth = 3
      ctx.strokeStyle = '#FF941F'
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.restore()
    }
  }, [layers, selectedId])

  useEffect(() => {
    if (ready) draw()
  }, [ready, draw])

  function patchLayer(id: string, patch: Partial<TextLayer>) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function toCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * CANVAS, y: ((e.clientY - rect.top) / rect.height) * CANVAS }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = toCanvasCoords(e)
    // topmost layer wins — walk the stack in reverse
    for (let i = layers.length - 1; i >= 0; i--) {
      const box = boxesRef.current[layers[i].id]
      if (box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        setSelectedId(layers[i].id)
        dragRef.current = { id: layers[i].id, dx: x - layers[i].x, dy: y - layers[i].y }
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }
    setSelectedId(null)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return
    const { x, y } = toCanvasCoords(e)
    const { id, dx, dy } = dragRef.current
    patchLayer(id, {
      x: Math.min(CANVAS, Math.max(0, x - dx)),
      y: Math.min(CANVAS, Math.max(0, y - dy)),
    })
  }

  function onPointerUp() {
    dragRef.current = null
  }

  function addLayer() {
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setLayers((prev) => [
      ...prev,
      { id, text: 'New text', x: CANVAS / 2, y: CANVAS / 2, fontSize: 42, color: '#ffffff', fontFamily: FONTS[0].value, bold: true, outline: true, bgMode: 'none', bgColor: '#171717', bgOpacity: 85 },
    ])
    setSelectedId(id)
  }

  // quick-add a suggestion from the UGC idea with sensible defaults —
  // the headline gets the Instagram pill background straight away
  function addSuggestion(s: UgcTextSuggestion) {
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const layer: TextLayer =
      s.style === 'headline'
        ? { id, text: s.text, x: CANVAS / 2, y: 800, fontSize: headlineFontSize(s.text), color: '#ffffff', fontFamily: FONTS[0].value, bold: true, outline: false, bgMode: 'pill', bgColor: '#171717', bgOpacity: 85 }
        : { id, text: s.text, x: CANVAS / 2, y: 1010, fontSize: 23, color: '#ffffff', fontFamily: FONTS[0].value, bold: true, outline: true, bgMode: 'none', bgColor: '#171717', bgOpacity: 85 }
    setLayers((prev) => [...prev, layer])
    setSelectedId(id)
  }

  function removeLayer(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    setExporting(true)
    setExportError(null)
    try {
      canvas.toBlob((blob) => {
        try {
          if (!blob) throw new Error('Could not export the image')
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'ugc-post.png'
          a.click()
          URL.revokeObjectURL(url)
        } catch (e: any) {
          setExportError(e?.message ?? 'Could not export the image')
        } finally {
          setExporting(false)
        }
      }, 'image/png')
    } catch (e: any) {
      setExporting(false)
      setExportError(e?.message ?? 'Could not export the image')
    }
  }

  const selected = layers.find((l) => l.id === selectedId) ?? null
  // a suggestion is offered only while its text isn't already on the canvas
  const pendingSuggestions = suggestions.filter((s) => !layers.some((l) => l.text === s.text))

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="grid gap-1.5">
        <canvas
          ref={canvasRef}
          width={CANVAS}
          height={CANVAS}
          className="w-full cursor-move touch-none rounded-lg border bg-muted"
          style={{ aspectRatio: '1 / 1' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <p className="text-xs text-muted-foreground">
          {!ready ? 'Loading image…' : 'The image is text-free — add text, then click it to select and drag to reposition.'}
        </p>
      </div>

      <div className="grid content-start gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLayer}>
            <Plus className="size-3" /> Add text
          </Button>
          <Button type="button" size="sm" onClick={download} disabled={exporting || !ready}>
            {exporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            Download PNG
          </Button>
        </div>
        {exportError && <p className="text-xs text-destructive">{exportError}</p>}

        {pendingSuggestions.length > 0 && (
          <div className="grid gap-1.5 rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium text-muted-foreground">Quick add from your idea</p>
            <div className="flex flex-wrap gap-1.5">
              {pendingSuggestions.map((s) => (
                <Button key={s.label} type="button" variant="outline" size="xs" onClick={() => addSuggestion(s)}>
                  <Plus className="size-3" /> {s.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {selected ? (
          <div className="grid gap-3 rounded-lg border p-3">
            <Textarea
              rows={2}
              value={selected.text}
              onChange={(e) => patchLayer(selected.id, { text: e.target.value })}
              placeholder="Your text…"
            />

            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Size — {selected.fontSize}px
              <input
                type="range"
                min={20}
                max={160}
                step={2}
                value={selected.fontSize}
                onChange={(e) => patchLayer(selected.id, { fontSize: Number(e.target.value) })}
                className="accent-primary"
              />
            </label>

            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Font
              <select
                value={selected.fontFamily}
                onChange={(e) => patchLayer(selected.id, { fontFamily: e.target.value })}
                className="h-8 rounded-md border bg-card px-2 text-sm text-foreground"
              >
                {FONTS.map((f) => (
                  <option key={f.label} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-1 text-xs font-medium text-muted-foreground">
              Text colour
              <div className="flex flex-wrap items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => patchLayer(selected.id, { color: c })}
                    className={cn(
                      'size-6 rounded-full border border-border transition-transform',
                      selected.color.toLowerCase() === c.toLowerCase() && 'scale-110 ring-2 ring-primary',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) => patchLayer(selected.id, { color: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
                  aria-label="Custom colour"
                />
              </div>
            </div>

            {/* Instagram-style background behind the text */}
            <div className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Background
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant={selected.bgMode === 'none' ? 'secondary' : 'outline'}
                  size="xs"
                  onClick={() => patchLayer(selected.id, { bgMode: 'none' })}
                >
                  None
                </Button>
                <Button
                  type="button"
                  variant={selected.bgMode === 'pill' ? 'secondary' : 'outline'}
                  size="xs"
                  onClick={() => patchLayer(selected.id, { bgMode: 'pill', outline: false })}
                >
                  Colour box
                </Button>
              </div>

              {selected.bgMode === 'pill' && (
                <>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {BG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Background colour ${c}`}
                        onClick={() => patchLayer(selected.id, { bgColor: c })}
                        className={cn(
                          'size-6 rounded-full border border-border transition-transform',
                          selected.bgColor.toLowerCase() === c.toLowerCase() && 'scale-110 ring-2 ring-primary',
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={selected.bgColor}
                      onChange={(e) => patchLayer(selected.id, { bgColor: e.target.value })}
                      className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
                      aria-label="Custom background colour"
                    />
                  </div>
                  <label className="grid gap-1">
                    Opacity — {selected.bgOpacity}%
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={selected.bgOpacity}
                      onChange={(e) => patchLayer(selected.id, { bgOpacity: Number(e.target.value) })}
                      className="accent-primary"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={selected.bold ? 'secondary' : 'outline'}
                size="icon-sm"
                aria-label="Bold"
                onClick={() => patchLayer(selected.id, { bold: !selected.bold })}
              >
                <Bold className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant={selected.outline && selected.bgMode === 'none' ? 'secondary' : 'outline'}
                size="sm"
                disabled={selected.bgMode === 'pill'}
                title={selected.bgMode === 'pill' ? 'Outline is not applied over a colour box' : undefined}
                onClick={() => patchLayer(selected.id, { outline: !selected.outline })}
              >
                Outline
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Delete text"
                className="ml-auto text-destructive"
                onClick={() => removeLayer(selected.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Add text to the image, then select it here to edit — or quick-add wording from your idea.</p>
        )}
      </div>
    </div>
  )
}
