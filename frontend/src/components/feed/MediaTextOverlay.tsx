import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { GeneratedContentDoc } from '@/services/visual'
import { computeOverlayLayout, compositionForFormat, HIGHLIGHT, MEME_COMPOSITION, type OverlayConfig } from '@/components/feed/overlayConfig'

// ---------------------------------------------------------------------------
// Editable text overlay for a feed post's media — Instagram Reels / TikTok UGC.
//
// Renders ONE large, centered, bold white text block with a thick black stroke
// and subtle shadow (matching a Reels/UGC reference). The block auto-wraps via
// the shared layout engine (overlayConfig.ts) so preview == export and sizing is
// proportional to the media at any resolution/aspect ratio.
//
// The user can:
//   - click a block to select it
//   - edit its text inline (double-click)
//   - drag it to reposition (percentage coords)
//   - restyle it (size / colour / bold / optional text-hugging background)
// ---------------------------------------------------------------------------

export type OverlayBlock = {
  id: string
  text: string
  /** % of media width from left (centre) */
  x: number
  /** % of media height from top (centre) */
  y: number
  /** size as a fraction of media width (0-1); from the per-format composition preset */
  size: number
  /** max text width as fraction of media width; from the preset (defaults 0.70) */
  maxWidthPct?: number
  /**
   * Explicit text-background switch. OFF by default for every block:
   * text-only is rendered directly on the media with no box of any kind.
   * When ON, each wrapped line gets its own tight rounded chip in
   * `backgroundColor` — never one big rectangle.
   */
  backgroundEnabled: boolean
  /** Chip colour used when `backgroundEnabled` is on (default #FFFFFF). */
  backgroundColor: string
  color: string
  bold: boolean
}

// Reusable primary hook text for the overlay — prefers hook, then body, then
// lines merged into a paragraph, then on-screen text. Kept as ONE block so the
// title reads like a single bold Reels headline rather than fragmented captions.
function primaryText(content: GeneratedContentDoc): string {
  const hook = content.hook?.trim()
  const body = content.body?.trim()
  if (hook) return hook
  if (body) return body
  const fromLines = (content.lines ?? []).filter((l) => l?.trim()).join(' ')
  if (fromLines) return fromLines
  const onScreen = (content.onScreenText ?? []).filter((t) => t?.trim()).join(' ')
  if (onScreen) return onScreen
  return ''
}

// Pre-populated text blocks for a content item, derived from its format via
// the shared composition table (overlayConfig.ts) — each visual type gets its
// own position/size instead of one global coordinate.
export function overlayBlocksForContent(content: GeneratedContentDoc): OverlayBlock[] {
  const id = () => `ov_${Math.random().toString(36).slice(2, 8)}`
  const blocks: OverlayBlock[] = []
  const push = (
    text: string | null | undefined,
    x: number,
    y: number,
    size: number,
    maxWidthPct?: number,
    bold = true,
    color = '#ffffff',
  ): OverlayBlock => {
    const t = (text ?? '').trim()
    const block: OverlayBlock = {
      id: id(),
      text: t,
      x,
      y,
      size,
      maxWidthPct,
      // Background is always OFF until the user explicitly enables it —
      // adding text never creates a box, whatever the image looks like.
      backgroundEnabled: false,
      backgroundColor: '#FFFFFF',
      color,
      bold,
    }
    blocks.push(block)
    return block
  }

  const hook = content.hook
  const body = content.body
  const preset = compositionForFormat(content.contentFormat)
  const size = preset.size ?? 0.05

  switch (content.contentFormat) {
    case 'meme':
      // meme keeps the setup/punchline split: top setup + bottom punchline
      push(hook, MEME_COMPOSITION.setup.x, MEME_COMPOSITION.setup.y, MEME_COMPOSITION.setup.size)
      push(body, MEME_COMPOSITION.punchline.x, MEME_COMPOSITION.punchline.y, MEME_COMPOSITION.punchline.size)
      break
    default:
      // every format: single text-only block at that format's composed
      // position. Positioning and background are independent concerns.
      push(primaryText(content), preset.x, preset.y, size, preset.maxWidthPct)
      break
  }

  return blocks
}

export default function MediaTextOverlay({
  blocks,
  selectedId,
  disabled = false,
  draggable = true,
  onSelect,
  onPatch,
  onTextClick,
  allowInlineEdit = true,
}: {
  /** Layers owned by the parent (feed card or editor popup draft). */
  blocks: OverlayBlock[]
  selectedId: string | null
  disabled?: boolean
  /** Drag-to-move on the canvas — the feed card disables this (tap opens the
      popup instead); the popup enables full drag editing. */
  draggable?: boolean
  onSelect: (id: string | null) => void
  onPatch: (id: string, p: Partial<OverlayBlock>) => void
  /** Genuine tap (not the end of a drag) on a block — the feed card opens the
      editor popup here. Never a navigation: always stopped + prevented. */
  onTextClick?: (id: string) => void
  /** Inline double-click-to-type editing — on in the popup (draft edits), off
      on the feed card so card gestures can never mutate the feed outside the
      popup (a double-tap there opens the popup instead). */
  allowInlineEdit?: boolean
}) {
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState<{ width: number; height: number } | null>(null)

  // Measure the media region so text scales to actual output dimensions, and
  // stay in sync on resize (responsive at any container / aspect ratio).
  useEffect(() => {
    const el = regionRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setContainer({ width: rect.width, height: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Empty-area tap tracking for dismissal: a real tap (down + up with almost
  // no movement) on empty media deselects, but a scroll/swipe gesture must
  // never dismiss. Block handlers stopPropagation, so presses that start on a
  // layer never reach the outer handlers.
  const emptyTapRef = useRef<{ x: number; y: number } | null>(null)
  const dismissTap = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = emptyTapRef.current
      emptyTapRef.current = null
      if (!start) return
      // Release landed on a layer — not an empty-area tap.
      const target = e.target as HTMLElement | null
      if (target?.closest?.('[data-overlay-block]')) return
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
      if (moved < 8) onSelect(null)
    },
    [onSelect],
  )

  // Tap-vs-drag tracking for onTextClick: ending a drag over a block must not
  // count as a tap (otherwise every drag would pop the editor open).
  const downPosRef = useRef<{ id: string; x: number; y: number } | null>(null)

  if (!container || container.width <= 0) {
    return <div ref={regionRef} className="pointer-events-none absolute inset-0 z-10" />
  }

  return (
    <div
      className="absolute inset-0"
      // Tapping empty media (outside any text layer) deselects / closes the
      // editor — but only for a genuine tap. Scroll/swipe gestures (pointer
      // travels) are ignored so scrolling the feed never kills the editor.
      onPointerDown={
        disabled
          ? undefined
          : (e) => {
              emptyTapRef.current = { x: e.clientX, y: e.clientY }
            }
      }
      onPointerUp={disabled ? undefined : dismissTap}
      onPointerCancel={() => {
        emptyTapRef.current = null
      }}
    >
      {/* draggable / selectable overlay blocks */}
      <div ref={regionRef} className="pointer-events-none absolute inset-0 z-10">
        {blocks.map((b) => (
          <OverlayBlockView
            key={b.id}
            block={b}
            container={container}
            disabled={disabled}
            selected={selectedId === b.id}
            onPointerDown={
              disabled
                ? undefined
                : (e) => {
                    // Select this layer BEFORE any parent handler runs.
                    e.stopPropagation()
                    onSelect(b.id)
                    downPosRef.current = { id: b.id, x: e.clientX, y: e.clientY }
                    if (!draggable) return
                    const rect = regionRef.current!.getBoundingClientRect()
                    setDrag({
                      id: b.id,
                      dx: e.clientX - rect.left - (b.x / 100) * rect.width,
                      dy: e.clientY - rect.top - (b.y / 100) * rect.height,
                    })
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  }
            }
            onClick={
              disabled
                ? undefined
                : (e) => {
                    // Tap = select layer (+ open the editor popup when the
                    // parent provides onTextClick). Never a navigation: stop
                    // the event so no parent post/video/link handler fires.
                    // A drag ending over the block is NOT a tap.
                    e.stopPropagation()
                    e.preventDefault()
                    onSelect(b.id)
                    const start = downPosRef.current
                    downPosRef.current = null
                    if (!onTextClick) return
                    if (start && start.id === b.id) {
                      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
                      if (moved < 8) onTextClick(b.id)
                    } else if (!start) {
                      onTextClick(b.id)
                    }
                  }
            }
            onKeyDown={
              disabled
                ? undefined
                : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      e.preventDefault()
                      onSelect(b.id)
                      onTextClick?.(b.id)
                    }
                  }
            }
            onPointerMove={
              disabled || !draggable
                ? undefined
                : (e) => {
                    if (!drag || drag.id !== b.id) return
                    const rect = regionRef.current!.getBoundingClientRect()
                    const nx = ((e.clientX - rect.left - drag.dx) / rect.width) * 100
                    const ny = ((e.clientY - rect.top - drag.dy) / rect.height) * 100
                    onPatch(b.id, { x: Math.min(100, Math.max(0, nx)), y: Math.min(100, Math.max(0, ny)) })
                  }
            }
            onPointerUp={disabled ? undefined : () => setDrag(null)}
            onDoubleClick={
              disabled
                ? undefined
                : (e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onSelect(b.id)
                    if (!allowInlineEdit) {
                      // Feed card: double-tap opens the popup for editing
                      // instead of mutating the feed in place.
                      onTextClick?.(b.id)
                      return
                    }
                    const el = e.currentTarget
                    el.setAttribute('contenteditable', 'true')
                    el.focus()
                    const range = document.createRange()
                    range.selectNodeContents(el)
                    const sel = window.getSelection()
                    sel?.removeAllRanges()
                    sel?.addRange(range)
                  }
            }
            onBlur={
              !allowInlineEdit
                ? undefined
                : (e) => {
                    const el = e.currentTarget
                    el.removeAttribute('contenteditable')
                    onPatch(b.id, { text: el.textContent ?? '' })
                  }
            }
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Renders one overlay block at the correct responsive size using the shared
// layout engine. The block is a single element so wrapping, stroke, shadow and
// sizing all come from one calculation (preview === export).
// ---------------------------------------------------------------------------

function OverlayBlockView({
  block,
  container,
  disabled,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
  onKeyDown,
  onDoubleClick,
  onBlur,
}: {
  block: OverlayBlock
  container: { width: number; height: number }
  disabled: boolean
  selected: boolean
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp?: () => void
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void
}) {
  // One editable layer: the background (when enabled) is part of this same
  // layer and can never detach — it moves, resizes and recalculates with the
  // text because it IS the text's own per-line rendering.
  const bgOn = block.backgroundEnabled

  const cfg: Partial<OverlayConfig> = useMemo(() => {
    const c: Partial<OverlayConfig> = {
      fontSizePct: block.size,
      position: { x: block.x / 100, y: block.y / 100 },
      // Per-format composed width (strip layouts get a wider, thinner block).
      maxWidthPct: block.maxWidthPct ?? 0.70,
      textColor: block.color,
      fontWeight: block.bold ? 800 : 500,
    }
    // Chips need breathing room between lines; the wrapping engine uses this
    // for its shrink-to-fit height check as well.
    if (bgOn) c.lineHeight = HIGHLIGHT.lineHeight
    return c
  }, [block.size, block.x, block.y, block.maxWidthPct, block.color, block.bold, bgOn])

  // The layout engine is shared with backend export (estimate-based wrapping),
  // so the browser preview wraps identically to the rendered output — no
  // separate layout logic between preview and export.
  const layout = useMemo(
    () => computeOverlayLayout(block.text, container, cfg),
    [block.text, container, cfg],
  )

  // The block renders text wrapped into individual lines. Lines are plain
  // <span>s (React-escaped text, never innerHTML / <a>), so even URL-like
  // content such as "https://example.com" stays inert text — clicking selects
  // the layer, it never navigates.
  //
  // Background OFF (default): text sits directly on the media. The container
  // shrink-wraps the text bounding box — no box, no full-width hit area.
  //
  // Background ON: NO container background or fixed-width box. The outer div
  // shrink-wraps (fit-content) and each engine-split line is its own
  // inline-block chip with nowrap, measured live by the browser, so every
  // chip hugs its own line width — short lines like "HELLO" get tiny chips.
  // Any text / font / size / position change re-renders through the same
  // layout memo, so chips always match the actual rendered text.
  const maxWidth = `${layout.config.maxWidthPct * 100}%`

  // Keep the block inside the image: the anchor is the block CENTRE (the div
  // is translated -50%), so a tall block parked at y=14% (or dragged near an
  // edge) would otherwise spill outside the media. Clamp the rendered anchor
  // so no edge crosses the safe area. The stored x/y are untouched — this is
  // render-only, so drag values and export math stay intact.
  const boxRef = useRef<HTMLDivElement>(null)
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      // CSS px — same space as container.width/height (translate transforms
      // don't affect rect dimensions), so no conversion is needed.
      const rect = el.getBoundingClientRect()
      setBoxSize({ w: rect.width, h: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container.width, container.height])

  const safe = layout.config.safeArea
  const availTop = container.height * safe.top
  const availBottom = container.height * (1 - safe.bottom)
  const availLeft = container.width * safe.left
  const availRight = container.width * (1 - safe.right)
  // Measured box when available, engine estimates before first measure.
  const halfW = ((boxSize?.w ?? layout.textWidthPx) || 0) / 2
  const halfH = ((boxSize?.h ?? layout.blockHeight) || 0) / 2
  const clampNum = (v: number, lo: number, hi: number) => (hi <= lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))
  const clampedX = clampNum((block.x / 100) * container.width, availLeft + halfW, availRight - halfW)
  const clampedY = clampNum((block.y / 100) * container.height, availTop + halfH, availBottom - halfH)

  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      data-overlay-block
      aria-label={`Overlay text: ${block.text}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      onBlur={onBlur}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 whitespace-normal outline-none select-text',
        disabled ? 'pointer-events-none' : 'pointer-events-auto',
        selected && !disabled && 'ring-2 ring-primary/80',
      )}
      style={{
        left: `${(clampedX / container.width) * 100}%`,
        top: `${(clampedY / container.height) * 100}%`,
        // Shrink-wrap the text bounding box in BOTH modes — the hit area is
        // the text itself, never a full-width invisible container.
        width: 'fit-content',
        maxWidth,
        fontFamily: layout.config.fontFamily,
        fontWeight: layout.config.fontWeight,
        fontSize: `${layout.fontSize}px`,
        lineHeight: layout.config.lineHeight,
        letterSpacing: layout.config.letterSpacing,
        textAlign: layout.config.textAlign,
        color: block.color,
        // Chips carry their own shadow; no text stroke in that mode.
        // Text-only mode keeps the stroke + shadow so type reads on any image.
        WebkitTextStroke: bgOn ? undefined : `${layout.strokeWidth}px ${layout.config.strokeColor}`,
        paintOrder: 'stroke fill',
        textShadow: bgOn
          ? undefined
          : `${layout.shadowOffsetX}px ${layout.shadowOffsetY}px ${layout.shadowBlur}px ${layout.config.shadowColor}`,
        backgroundColor: 'transparent',
        opacity: 0.97,
      }}
    >
      {layout.lines.map((line, i) =>
        bgOn ? (
          <span
            key={i}
            style={{
              display: 'inline-block',
              whiteSpace: 'nowrap',
              backgroundColor: block.backgroundColor,
              borderRadius: `${HIGHLIGHT.radiusEm}em`,
              padding: `${HIGHLIGHT.vPadEm}em ${HIGHLIGHT.hPadEm}em`,
              margin: '0.03em 0',
              boxShadow: HIGHLIGHT.shadow,
            }}
          >
            {line}
          </span>
        ) : (
          <span key={i} className="block">
            {line}
          </span>
        ),
      )}
    </div>
  )
}
