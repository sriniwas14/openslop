// ---------------------------------------------------------------------------
// Shared text-overlay layout engine — used by preview (MediaTextOverlay) and
// export (backend image.ts).  Single source of truth for font sizing, stroke,
// shadow, wrapping and positioning.
//
// KEEP IN SYNC with backend/src/lib/overlayLayout.ts if/when one exists.
// ---------------------------------------------------------------------------

export type OverlayConfig = {
  text: string
  fontFamily: string
  fontWeight: number
  /** Fraction of container width for max text width (0-1). */
  maxWidthPct: number
  lineHeight: number
  letterSpacing: string
  textAlign: 'center' | 'left' | 'right'
  textColor: string
  strokeColor: string
  /** Starting fraction of width to derive the base font size (0-1).
   *  Unused while FIXED_FONT_SIZE_PX is in force — kept for back-compat. */
  fontSizePct: number
  /** Fraction of output width — scaled proportionally to resolution. */
  strokeWidthPct: number
  shadowColor: string
  /** Fraction of output width. */
  shadowBlurPct: number
  shadowOffsetYPct: number
  shadowOffsetXPct: number
  /** 0-1 fractions for the text anchor point. */
  position: { x: number; y: number }
  /** 0-1 fractions kept away from edges. */
  safeArea: { top: number; bottom: number; left: number; right: number }
  /** Minimum font size as fraction of width (prevents unreadably small
   *  text). Unused while FIXED_FONT_SIZE_PX is in force — kept for back-compat. */
  minFontSizePct: number
}

// ---------------------------------------------------------------------------
// Fixed overlay text size — literal px everywhere (feed card AND export).
// The engine starts here and only shrinks (never grows) for long text.
// ---------------------------------------------------------------------------

/** Base overlay font size in px. */
export const FIXED_FONT_SIZE_PX = 14
/** Floor for shrink-to-fit on long text. */
export const FIXED_MIN_FONT_SIZE_PX = 10

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  text: '',
  fontFamily: "'Inter Variable', 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontWeight: 800,
  // Fixed 14px overlay text — literal px at any container width or export
  // resolution (not width-derived). Only shrinks for long text, never grows.
  // fontSizePct/minFontSizePct below are dead while FIXED_FONT_SIZE_PX holds.
  maxWidthPct: 0.80,
  lineHeight: 1.18,
  letterSpacing: '0em',
  textAlign: 'center',
  textColor: '#FFFFFF',
  strokeColor: '#000000',
  fontSizePct: 0.055,
  /** Fraction of output width — scaled proportionally to resolution. */
  strokeWidthPct: 0.004,
  shadowColor: 'rgba(0,0,0,0.45)',
  shadowBlurPct: 0.005,
  shadowOffsetYPct: 0.0025,
  shadowOffsetXPct: 0,
  position: { x: 0.50, y: 0.46 },
  safeArea: { top: 0.10, bottom: 0.12, left: 0.07, right: 0.07 },
  minFontSizePct: 0.030,
}

// ---------------------------------------------------------------------------
// Estimate average character width for a given font at a given size.
// sans-serif bold ≈ 0.55-0.60 × fontSize per character.
// ---------------------------------------------------------------------------
const CHAR_WIDTH_FACTOR = 0.58

function estimateCharWidth(fontSize: number): number {
  return fontSize * CHAR_WIDTH_FACTOR
}

function mergeConfig(base: OverlayConfig, overrides?: Partial<OverlayConfig>): OverlayConfig {
  if (!overrides) return base
  return {
    ...base,
    ...overrides,
    position: { ...base.position, ...overrides.position },
    safeArea: { ...base.safeArea, ...overrides.safeArea },
  }
}

// Aspect-ratio specific overrides — kept in sync with backend/src/lib/overlayLayout.ts.
export function aspectKey(width: number, height: number): string {
  const ratio = width / height
  if (ratio > 1.2) return '16:9'
  if (ratio < 0.8) return '9:16'
  if (Math.abs(ratio - 1) < 0.05) return '1:1'
  return '4:5'
}

const ASPECT_OVERRIDES: Record<string, Partial<OverlayConfig>> = {
  '16:9': { safeArea: { top: 0.12, bottom: 0.14, left: 0.10, right: 0.10 } },
  '9:16': { safeArea: { top: 0.10, bottom: 0.12, left: 0.07, right: 0.07 } },
  '1:1':  { safeArea: { top: 0.10, bottom: 0.12, left: 0.07, right: 0.07 } },
  '4:5':  { safeArea: { top: 0.10, bottom: 0.12, left: 0.07, right: 0.07 } },
}

// ---------------------------------------------------------------------------
// Content-aware composition presets — ONE entry per content format.
//
// There is deliberately no single global text position: each visual type
// declares where its text lives (anchor as % of media, plus optional size /
// width tuning). `overlayBlocksForContent` (MediaTextOverlay) reads this
// table for the preview, and the backend mirror
// (backend/src/lib/overlayLayout.ts) keeps the identical table so export
// matches preview. Carousel slide prompts (media.service.ts) reuse the
// `directive` line so baked-in slide text follows the same intent.
//
// KEEP IN SYNC with backend/src/lib/overlayLayout.ts.
// ---------------------------------------------------------------------------

export type CompositionPreset = {
  /** % from left (block centre). */
  x: number
  /** % from top (block centre). */
  y: number
  /** Base font size as fraction of media width; unused while FIXED_FONT_SIZE_PX holds. */
  size?: number
  /** Max text width as fraction of media width; defaults to 0.80. */
  maxWidthPct?: number
  /** One-line placement directive for AI-baked slide images. */
  directive: string
}

export const DEFAULT_COMPOSITION: Required<Pick<CompositionPreset, 'x' | 'y'>> &
  Pick<CompositionPreset, 'size' | 'maxWidthPct'> = {
  x: 50,
  y: 48,
  size: 0.055,
  maxWidthPct: 0.80,
}

export const COMPOSITION_BY_FORMAT: Record<string, CompositionPreset> = {
  // Text IS the hero — centred, controlled width.
  wall_of_text_slide: { x: 50, y: 46, directive: 'Centre the headline text over the background; text is the hero of this slide.' },
  // Scroll-stopping hook — upper third, prominent but not enormous.
  video_hook: { x: 50, y: 26, size: 0.055, directive: 'Place the hook text in the upper third; keep the main subject fully visible.' },
  // Person is the hero — text above, clear of the face zone.
  talking_head: { x: 50, y: 24, directive: 'Place text in the empty space above the person; never cover the face.' },
  ugc_video: { x: 50, y: 26, directive: 'Place text in the space around the creator; keep face and product in hand visible.' },
  spokesperson: { x: 50, y: 24, directive: 'Place text above the person and product; cover neither the face nor the product.' },
  // Foreground person is the hero over a usable background — centred support.
  green_screen: { x: 50, y: 48, directive: 'Centre the text; keep the foreground person fully visible around it.' },
  // Product is the hero — text above it.
  product_demo: { x: 50, y: 24, directive: 'Place text above the product; keep product, packaging and demonstrating hands visible.' },
  // Screen/UI is the hero — thin top strip, UI stays interactive-looking.
  screen_recording: { x: 50, y: 14, size: 0.053, maxWidthPct: 0.84, directive: 'Place text in the top strip only; never cover buttons, navigation or the demonstrated feature.' },
  mobile_app: { x: 50, y: 86, size: 0.053, maxWidthPct: 0.84, directive: 'Place text below the phone/app UI; never cover the app interaction.' },
  website_demo: { x: 50, y: 14, size: 0.053, maxWidthPct: 0.84, directive: 'Place text in the top strip only; never cover the website element being demonstrated.' },
  // Animated subject is the hero — text above it.
  clay_motion: { x: 50, y: 24, directive: 'Place text above the animated subject; keep the main animation fully visible.' },
}

/** Meme feed position: a single top overlay layer (the overlay text only).
 * Layer 2 of the 3-layer meme composition: top 20%, centered, ~80% width.
 * 32px reference size at a 400px-wide composition → size 0.08 (responsive). */
export const MEME_COMPOSITION = {
  setup: { x: 50, y: 20, size: 0.08, maxWidthPct: 0.80, fontWeight: 700, directive: 'Place the overlay text at the very top of the image.' },
  punchline: { x: 50, y: 82, size: 0.069, directive: 'Place the punchline at the very bottom of the image.' },
} as const

/** Meme GIF overlay (Layer 3): default position in the same composition
 * coordinate system — below the text, width 70%. */
export const MEME_GIF_COMPOSITION = {
  x: 50,
  y: 65,
  widthPct: 0.70,
  maxHeightPct: 0.55,
} as const

// ---------------------------------------------------------------------------
// Layer-type presets — the single-select picker in the editor popup
// (OverlayEditorPanel). Static list; picking a type applies its style preset
// (position/size/colours/highlight) to the selected layer via onPatch. The
// layer text itself stays user-editable, so each layer is text + style.
// ---------------------------------------------------------------------------

export type LayerTypePreset = {
  id: string
  label: string
  x: number
  y: number
  size: number
  color: string
  backgroundEnabled: boolean
  backgroundColor: string
  bold: boolean
}

export const LAYER_TYPE_PRESETS: LayerTypePreset[] = [
  { id: 'funny', label: 'Funny', x: 50, y: 18, size: 0.055, color: '#ffffff', backgroundEnabled: false, backgroundColor: '#FFFFFF', bold: true },
  { id: 'relatable', label: 'Relatable', x: 50, y: 48, size: 0.055, color: '#ffffff', backgroundEnabled: false, backgroundColor: '#FFFFFF', bold: true },
  { id: 'pov', label: 'POV', x: 50, y: 26, size: 0.055, color: '#ffffff', backgroundEnabled: false, backgroundColor: '#FFFFFF', bold: true },
  { id: 'reaction', label: 'Reaction', x: 50, y: 82, size: 0.055, color: '#ffffff', backgroundEnabled: false, backgroundColor: '#FFFFFF', bold: true },
  { id: 'plot-twist', label: 'Plot Twist', x: 50, y: 48, size: 0.055, color: '#171717', backgroundEnabled: true, backgroundColor: '#FFFFFF', bold: true },
]

export function layerTypePreset(id: string | null | undefined): LayerTypePreset | null {
  if (!id) return null
  return LAYER_TYPE_PRESETS.find((p) => p.id === id) ?? null
}

export function compositionForFormat(contentFormat: string | null | undefined): CompositionPreset {
  if (!contentFormat) return { ...DEFAULT_COMPOSITION, directive: 'Centre the text; keep the main subject visible.' }
  return COMPOSITION_BY_FORMAT[contentFormat] ?? { ...DEFAULT_COMPOSITION, directive: 'Centre the text; keep the main subject visible.' }
}

// ---------------------------------------------------------------------------
// Optional text background (any format, explicit opt-in per layer) — tight
// per-line chips with rounded corners and a subtle shadow.
//
// Everything is em-based so padding / radius scale with the responsive font
// size at any aspect ratio or resolution — never hardcoded pixels. The chips
// are rendered as shrink-to-fit inline-blocks over the engine-split lines,
// so each chip hugs its own line width instead of forming one big box.
// lineHeight 1.45 leaves a tight visible gap between chips: distinct but
// connected, like a single composition.
//
// The backend mirror (backend/src/lib/overlayLayout.ts) keeps identical
// metrics plus estimateLineWidth/backgroundRectsForLayout so export draws
// the same chips from the same numbers.
// ---------------------------------------------------------------------------

export const HIGHLIGHT = {
  /** Horizontal padding inside each chip, × font size. */
  hPadEm: 0.28,
  /** Vertical padding inside each chip, × font size. */
  vPadEm: 0.10,
  /** Corner radius of each chip, × font size (≈8–12px at headline sizes). */
  radiusEm: 0.22,
  /** Line height while highlighted — room for chips plus a tight gap. */
  lineHeight: 1.45,
  /** Chip colour. */
  bgColor: '#FFFFFF',
  /** Subtle drop shadow under each chip (no text stroke in this mode). */
  shadow: '0 2px 8px rgba(0,0,0,0.25)',
} as const

// ---------------------------------------------------------------------------
// Word-wrap text into lines that fit within maxWidthPx.
// Uses character-width estimation (consistent across frontend canvas & backend
// where canvas is unavailable).
//
// After greedy wrapping, the last pair is rebalanced: the split minimizing
// the longest line wins, so a wrap to line 2 fills the available width with
// even halves (e.g. "Stop posting daily" / "without a content system")
// instead of stranding an orphan ("system") — or the reverse ("This" / …).
// ---------------------------------------------------------------------------
function balanceLastPair(lines: string[], maxWidthPx: number, measure: (s: string) => number): string[] {
  if (lines.length < 2) return lines
  const words = `${lines[lines.length - 2]} ${lines[lines.length - 1]}`.split(' ').filter(Boolean)
  if (words.length < 2) return lines
  let best = -1
  let bestMax = Infinity
  for (let k = 1; k < words.length; k++) {
    const first = words.slice(0, k).join(' ')
    const rest = words.slice(k).join(' ')
    const w1 = measure(first)
    const w2 = measure(rest)
    if (w1 > maxWidthPx || w2 > maxWidthPx) continue
    const m = Math.max(w1, w2)
    if (m < bestMax) {
      bestMax = m
      best = k
    }
  }
  if (best < 0) return lines
  const out = [...lines]
  out[out.length - 2] = words.slice(0, best).join(' ')
  out[out.length - 1] = words.slice(best).join(' ')
  return out
}

export function wrapTextLines(text: string, maxWidthPx: number, fontSize: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ['']

  const charW = estimateCharWidth(fontSize)
  const measure = (s: string) => s.length * charW
  const lines: string[] = []
  let line = words[0]

  for (let i = 1; i < words.length; i++) {
    const next = line + ' ' + words[i]
    if (measure(next) <= maxWidthPx) {
      line = next
    } else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return balanceLastPair(lines, maxWidthPx, measure)
}

// ---------------------------------------------------------------------------
// Canvas-aware wrap (used in browser for precise measurement when canvas is
// available). Falls back to estimate if canvas unavailable.
// ---------------------------------------------------------------------------
export function wrapTextLinesMeasured(
  text: string,
  maxWidthPx: number,
  ctx: CanvasRenderingContext2D | null,
): string[] {
  if (!ctx) {
    return wrapTextLines(text, maxWidthPx, 14)
  }

  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const next = line + ' ' + words[i]
    if (ctx.measureText(next).width <= maxWidthPx) {
      line = next
    } else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return balanceLastPair(lines, maxWidthPx, (s) => ctx.measureText(s).width)
}

// ---------------------------------------------------------------------------
// Main layout calculator — returns everything needed to render the overlay.
// This is pure (no side-effects) so both frontend and backend can use it with
// the same constants.
// ---------------------------------------------------------------------------

export type OverlayLayout = {
  fontSize: number
  strokeWidth: number
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  lines: string[]
  blockHeight: number
  /** px from top of container to the top of the text block */
  topPx: number
  /** px from left of container to the left of the text block */
  leftPx: number
  textWidthPx: number
  availableHeight: number
  config: OverlayConfig
}

export function computeOverlayLayout(
  rawText: string,
  container: { width: number; height: number },
  overrides?: Partial<OverlayConfig>,
  ctx?: CanvasRenderingContext2D | null,
): OverlayLayout {
  const aspect = ASPECT_OVERRIDES[aspectKey(container.width, container.height)]
  const cfg = mergeConfig(mergeConfig(DEFAULT_OVERLAY_CONFIG, aspect), overrides)
  const text = rawText.trim()
  if (!text) {
    return {
      fontSize: 0,
      strokeWidth: 0,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      lines: [],
      blockHeight: 0,
      topPx: container.height * cfg.position.y,
      leftPx: container.width * cfg.position.x,
      textWidthPx: 0,
      availableHeight: 0,
      config: cfg,
    }
  }

  const w = container.width
  const h = container.height

  const safeTop = h * cfg.safeArea.top
  const safeBottom = h * cfg.safeArea.bottom
  const availableHeight = h - safeTop - safeBottom
  const maxWidthPx = w * cfg.maxWidthPct

  // Fixed 14px start; shrink only until lines fit (never grow).
  let fontSize = FIXED_FONT_SIZE_PX
  const minFontSize = FIXED_MIN_FONT_SIZE_PX
  const lineHeightPx = () => Math.round(fontSize * cfg.lineHeight)

  let lines: string[] = []
  let blockHeight = 0

  for (let attempt = 0; attempt < 30; attempt++) {
    const lh = lineHeightPx()
    lines = ctx
      ? wrapTextLinesMeasured(text, maxWidthPx, ctx)
      : wrapTextLines(text, maxWidthPx, fontSize)
    blockHeight = lines.length * lh
    if (blockHeight <= availableHeight && lines.length <= 12) break
    fontSize -= 0.5
    if (fontSize < minFontSize) {
      fontSize = minFontSize
      // Final attempt with minimum size
      const lh2 = lineHeightPx()
      lines = ctx
        ? wrapTextLinesMeasured(text, maxWidthPx, ctx)
        : wrapTextLines(text, maxWidthPx, fontSize)
      blockHeight = lines.length * lh2
      break
    }
  }

  const strokeWidth = clamp(w * cfg.strokeWidthPct, 2, Math.round(w * 0.008))
  const shadowBlur = clamp(w * cfg.shadowBlurPct, 1, 8)
  const shadowOffsetY = clamp(w * cfg.shadowOffsetYPct, 0.5, 4)
  const shadowOffsetX = clamp(w * cfg.shadowOffsetXPct, 0, 4)

  const topPx = h * cfg.position.y - blockHeight / 2
  const leftPx = w * cfg.position.x

  return {
    fontSize,
    strokeWidth,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    lines,
    blockHeight,
    topPx: Math.max(safeTop, Math.min(topPx, h - safeBottom - blockHeight)),
    leftPx,
    textWidthPx: maxWidthPx,
    availableHeight,
    config: cfg,
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
