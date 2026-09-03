// ---------------------------------------------------------------------------
// Backend mirror of frontend/src/components/feed/overlayConfig.ts.
//
// Single source of truth for font sizing, stroke, shadow, wrapping and
// positioning — used by sharp's SVG compositing for export so the result
// matches what the frontend preview renders.
//
// KEEP IN SYNC with frontend/src/components/feed/overlayConfig.ts
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
  /** Starting fraction of width to derive the base font size (0-1). */
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
  /** Minimum font size as fraction of width (prevents unreadably small text). */
  minFontSizePct: number
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  text: '',
  fontFamily: "Inter, 'Inter Variable', Helvetica, Arial, sans-serif",
  fontWeight: 800,
  // Mirrors frontend/src/components/feed/overlayConfig.ts — ~26% smaller
  // defaults so export matches the preview headline size.
  maxWidthPct: 0.70,
  lineHeight: 1.18,
  letterSpacing: '0em',
  textAlign: 'center',
  textColor: '#FFFFFF',
  strokeColor: '#000000',
  fontSizePct: 0.05,
  strokeWidthPct: 0.004,
  shadowColor: 'rgba(0,0,0,0.45)',
  shadowBlurPct: 0.005,
  shadowOffsetYPct: 0.0025,
  shadowOffsetXPct: 0,
  position: { x: 0.5, y: 0.46 },
  safeArea: { top: 0.1, bottom: 0.12, left: 0.07, right: 0.07 },
  minFontSizePct: 0.02,
}

const ASPECT_OVERRIDES: Record<string, Partial<OverlayConfig>> = {
  '16:9': { safeArea: { top: 0.12, bottom: 0.14, left: 0.1, right: 0.1 } },
  '9:16': { safeArea: { top: 0.1, bottom: 0.12, left: 0.07, right: 0.07 } },
  '1:1': { safeArea: { top: 0.1, bottom: 0.12, left: 0.07, right: 0.07 } },
  '4:5': { safeArea: { top: 0.1, bottom: 0.12, left: 0.07, right: 0.07 } },
};

// ---------------------------------------------------------------------------
// Content-aware composition presets — mirror of
// frontend/src/components/feed/overlayConfig.ts. One entry per content
// format so export uses the same text position as the preview.
// KEEP IN SYNC with frontend/src/components/feed/overlayConfig.ts.
// ---------------------------------------------------------------------------

export type CompositionPreset = {
  /** % from left (block centre). */
  x: number;
  /** % from top (block centre). */
  y: number;
  /** Base font size as fraction of media width; defaults to 0.05. */
  size?: number;
  /** Max text width as fraction of media width; defaults to 0.70. */
  maxWidthPct?: number;
  /** One-line placement directive for AI-baked slide images. */
  directive: string;
};

export const DEFAULT_COMPOSITION = {
  x: 50,
  y: 48,
  size: 0.05,
  maxWidthPct: 0.7,
};

export const COMPOSITION_BY_FORMAT: Record<string, CompositionPreset> = {
  wall_of_text_slide: { x: 50, y: 46, directive: "Centre the headline text over the background; text is the hero of this slide." },
  video_hook: { x: 50, y: 26, size: 0.045, directive: "Place the hook text in the upper third; keep the main subject fully visible." },
  talking_head: { x: 50, y: 24, directive: "Place text in the empty space above the person; never cover the face." },
  ugc_video: { x: 50, y: 26, directive: "Place text in the space around the creator; keep face and product in hand visible." },
  spokesperson: { x: 50, y: 24, directive: "Place text above the person and product; cover neither the face nor the product." },
  green_screen: { x: 50, y: 48, directive: "Centre the text; keep the foreground person fully visible around it." },
  product_demo: { x: 50, y: 24, directive: "Place text above the product; keep product, packaging and demonstrating hands visible." },
  screen_recording: { x: 50, y: 14, size: 0.042, maxWidthPct: 0.78, directive: "Place text in the top strip only; never cover buttons, navigation or the demonstrated feature." },
  mobile_app: { x: 50, y: 86, size: 0.042, maxWidthPct: 0.78, directive: "Place text below the phone/app UI; never cover the app interaction." },
  website_demo: { x: 50, y: 14, size: 0.042, maxWidthPct: 0.78, directive: "Place text in the top strip only; never cover the website element being demonstrated." },
  clay_motion: { x: 50, y: 24, directive: "Place text above the animated subject; keep the main animation fully visible." },
};

/** Meme uses a two-block setup/punchline composition, not the single-block presets. */
export const MEME_COMPOSITION = {
  setup: { x: 50, y: 18, size: 0.045, directive: "Place the setup line at the very top of the image." },
  punchline: { x: 50, y: 82, size: 0.045, directive: "Place the punchline at the very bottom of the image." },
} as const;

/**
 * Slideshow/carousel slides are generated (and composed) one slide at a
 * time, so each slide carries this placement directive in its image prompt —
 * every slide is composed independently with clear space for its text.
 */
export const SLIDESHOW_SLIDE_DIRECTIVE =
  "Compose this slide independently: place any headline text in the upper third and keep the slide's main subject fully visible with clear space around the text.";

export function compositionForFormat(contentFormat: string | null | undefined): CompositionPreset {
  if (!contentFormat) return { ...DEFAULT_COMPOSITION, directive: "Centre the text; keep the main subject visible." };
  return COMPOSITION_BY_FORMAT[contentFormat] ?? { ...DEFAULT_COMPOSITION, directive: "Centre the text; keep the main subject visible." };
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

const CHAR_WIDTH_FACTOR = 0.58

function estimateCharWidth(fontSize: number): number {
  return fontSize * CHAR_WIDTH_FACTOR
}

export function wrapTextLines(text: string, maxWidthPx: number, fontSize: number): string[] {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return [""];

  const charW = estimateCharWidth(fontSize);
  const lines: string[] = [];
  let line = words[0];

  for (let i = 1; i < words.length; i++) {
    const next = line + " " + words[i];
    if (next.length * charW <= maxWidthPx) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

export type OverlayLayout = {
  fontSize: number
  strokeWidth: number
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  lines: string[]
  blockHeight: number
  topPx: number
  leftPx: number
  textWidthPx: number
  availableHeight: number
  config: OverlayConfig
}

/**
 * Resolve the aspect override key from container dimensions.
 * e.g. 1080x1920 → '9:16', 1920x1080 → '16:9', 1080x1080 → '1:1'.
 */
export function aspectKey(width: number, height: number): string {
  const ratio = width / height;
  if (ratio > 1.2) return "16:9";
  if (ratio < 0.8) return "9:16";
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  return "4:5";
}

export function computeOverlayLayout(
  rawText: string,
  container: { width: number; height: number },
  overrides?: Partial<OverlayConfig>,
): OverlayLayout {
  const aspect = ASPECT_OVERRIDES[aspectKey(container.width, container.height)];
  const cfg = mergeConfig(mergeConfig(DEFAULT_OVERLAY_CONFIG, aspect), overrides);
  const text = rawText.trim();

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
    };
  }

  const w = container.width;
  const h = container.height;
  const safeTop = h * cfg.safeArea.top;
  const safeBottom = h * cfg.safeArea.bottom;
  const availableHeight = h - safeTop - safeBottom;
  const maxWidthPx = w * cfg.maxWidthPct;

  let fontSize = w * cfg.fontSizePct;
  const minFontSize = w * cfg.minFontSizePct;
  const lineHeightPx = () => Math.round(fontSize * cfg.lineHeight);

  let lines: string[] = [];
  let blockHeight = 0;

  for (let attempt = 0; attempt < 30; attempt++) {
    const lh = lineHeightPx();
    lines = wrapTextLines(text, maxWidthPx, fontSize);
    blockHeight = lines.length * lh;
    if (blockHeight <= availableHeight && lines.length <= 12) break;
    fontSize -= w * 0.003;
    if (fontSize < minFontSize) {
      fontSize = minFontSize;
      const lh2 = lineHeightPx();
      lines = wrapTextLines(text, maxWidthPx, fontSize);
      blockHeight = lines.length * lh2;
      break;
    }
  }

  const strokeWidth = clamp(w * cfg.strokeWidthPct, 4, Math.round(w * 0.008));
  const shadowBlur = clamp(w * cfg.shadowBlurPct, 1, 8);
  const shadowOffsetY = clamp(w * cfg.shadowOffsetYPct, 0.5, 4);
  const shadowOffsetX = clamp(w * cfg.shadowOffsetXPct, 0, 4);

  const topPx = h * cfg.position.y - blockHeight / 2;
  const leftPx = w * cfg.position.x;

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
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// Optional text background — mirror of frontend overlayConfig HIGHLIGHT.
// Same em-based metrics so export chips match the preview chips exactly.
// ---------------------------------------------------------------------------

export const HIGHLIGHT = {
  hPadEm: 0.28,
  vPadEm: 0.1,
  radiusEm: 0.22,
  lineHeight: 1.45,
} as const;

/**
 * Estimated pixel width of one rendered line at the given font size.
 * Same character-width model the wrapping engine uses, so chip widths stay
 * consistent with line breaks in both preview and export.
 */
export function estimateLineWidth(line: string, fontSize: number): number {
  return line.length * fontSize * CHAR_WIDTH_FACTOR;
}

export type BackgroundRect = {
  x: number
  y: number
  width: number
  height: number
  rx: number
};

/**
 * Per-line rounded background chips for a computed layout — one rect hugging
 * each line's estimated width (plus padding), never the container width.
 * Pure geometry: shared by the image exporter and any future renderer
 * (e.g. video burn-in) so every output uses identical numbers.
 */
export function backgroundRectsForLayout(layout: OverlayLayout): BackgroundRect[] {
  const fs = layout.fontSize;
  if (!fs || layout.lines.length === 0) return [];
  const hPad = fs * HIGHLIGHT.hPadEm;
  const vPad = fs * HIGHLIGHT.vPadEm;
  const lh = Math.round(fs * layout.config.lineHeight);
  const firstBaseline = layout.topPx + fs * 0.72;
  return layout.lines.map((line, i) => {
    const width = estimateLineWidth(line, fs) + hPad * 2;
    const baseline = firstBaseline + i * lh;
    return {
      x: layout.leftPx - width / 2,
      y: baseline - fs * 0.8 - vPad,
      width,
      height: fs * 1.05 + vPad * 2,
      rx: fs * HIGHLIGHT.radiusEm,
    };
  });
}
