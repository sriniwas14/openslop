import sharp from "sharp";
import type { OverlayConfig } from "./overlayLayout";

// ponytail: 720p jpeg for provider payloads (Runway referenceImages 413s on multi-MB data URIs)
export async function toResizedDataUri(input: Buffer, maxLongEdge = 1280, quality = 80): Promise<string> {
  const buf = await sharp(input)
    .resize({ width: maxLongEdge, height: maxLongEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = w;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // ponytail: hard-ellipsis the last line if words were dropped
  const consumed = lines.join(" ").length;
  if (consumed < text.trim().length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, last.length - 1).trimEnd()}…` : `${last}…`;
  }
  return lines;
}

// ponytail: Instagram-ready square — crops the generated image to 1080x1080,
// adds a bottom scrim and renders headline + subtext as an SVG overlay via sharp
export async function overlayTextOnImage(
  input: Buffer,
  opts: { headline: string; subtext?: string | null },
  size = 1080,
): Promise<Buffer> {
  const headline = (opts.headline ?? "").trim().slice(0, 180);
  const subtext = (opts.subtext ?? "").trim().slice(0, 80);

  // shrink font until headline fits in <= 3 lines with ~90% width budget
  let fontSize = 84;
  let lines: string[] = [];
  while (fontSize >= 40) {
    const maxChars = Math.max(8, Math.floor((size * 0.9) / (fontSize * 0.52)));
    lines = wrapText(headline || "Your brand post", maxChars, 3);
    if (lines.length <= 3 && lines.every((l) => l.length <= maxChars)) break;
    fontSize -= 6;
  }
  const lineHeight = Math.round(fontSize * 1.18);
  const blockHeight = lines.length * lineHeight;
  const subtextSize = 30;
  const bottomPad = 72;
  const startY = size - bottomPad - (subtext ? subtextSize + 26 : 0) - blockHeight + fontSize;

  const textEls = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="${size / 2}" y="${y}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="#ffffff" style="paint-order: stroke;" stroke="rgba(0,0,0,0.55)" stroke-width="${Math.max(4, Math.round(fontSize / 14))}" stroke-linejoin="round">${escapeXml(line)}</text>`;
    })
    .join("\n    ");

  const subtextEl = subtext
    ? `<text x="${size / 2}" y="${size - bottomPad + 8}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="${subtextSize}" fill="rgba(255,255,255,0.92)" style="paint-order: stroke;" stroke="rgba(0,0,0,0.4)" stroke-width="3" stroke-linejoin="round">${escapeXml(subtext)}</text>`
    : "";

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.35" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.72)"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#scrim)"/>
  <g>
    ${textEls}
    ${subtextEl}
  </g>
</svg>`;

  const base = await sharp(input)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  return sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Reels/UGC-style centered text overlay — matches the feed preview exactly.
//
// Renders bold text sized/wrapped responsively using the SAME layout engine
// as the frontend (overlayLayout.ts / overlayConfig.ts). No scrim, no bottom
// pin. Optional per-line rounded background chips (`background.enabled`)
// drawn from the same geometry helper the preview uses — one chip hugging
// each line's measured width, never a container-wide box.
//
// Accepts any output size/aspect (9:16, 1:1, 4:5, 16:9) so export == preview.
// ---------------------------------------------------------------------------
export async function overlayCenteredTextOnImage(
  input: Buffer,
  text: string,
  size: { width: number; height: number } | number = 1080,
  overrides?: Partial<OverlayConfig>,
  background?: { enabled: boolean; color?: string },
): Promise<Buffer> {
  // Resolve output dimensions (number → square of that size)
  const outW = typeof size === "number" ? size : size.width;
  const outH = typeof size === "number" ? size : size.height;

  const { computeOverlayLayout, backgroundRectsForLayout, HIGHLIGHT } = await import("./overlayLayout");
  const coverWidth = 1920;
  const coverHeight = Math.round((outH / outW) * coverWidth);

  // Crop the input to the target aspect (cover), then compose the SVG overlay.
  const base = await sharp(input)
    .resize(coverWidth, coverHeight, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  // Chips need the same roomier line height the preview uses.
  const mergedOverrides = background?.enabled ? { ...overrides, lineHeight: HIGHLIGHT.lineHeight } : overrides;
  const layout = computeOverlayLayout(text, { width: outW, height: outH }, mergedOverrides);
  const cfg = layout.config;
  const cx = layout.leftPx;

  // Optional text background: one rounded rect hugging each line's measured
  // width — computed by the shared helper, never the container width.
  const rawColor = background?.color ?? "#FFFFFF";
  const bgColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "#FFFFFF";
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const rectEls = background?.enabled
    ? backgroundRectsForLayout(layout)
        .map((r) => `<rect x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.width)}" height="${r1(r.height)}" rx="${r1(r.rx)}" fill="${bgColor}"/>`)
        .join("\n    ")
    : "";

  // Vertically position the block so lines land within the layout's block.
  const firstBaselineStart = layout.topPx + layout.fontSize * 0.72;

  const textEls = layout.lines
    .map((line, i) => {
      const y = firstBaselineStart + i * Math.round(layout.fontSize * cfg.lineHeight);
      const stroke = layout.strokeWidth;
      return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${cfg.fontFamily}" font-weight="${cfg.fontWeight}" font-size="${layout.fontSize}" fill="${cfg.textColor}" style="paint-order: stroke;" stroke="${cfg.strokeColor}" stroke-width="${stroke}" stroke-linejoin="round">${escapeXml(line)}</text>`;
    })
    .join("\n    ");

  const svg = `<svg width="${outW}" height="${outH}" xmlns="http://www.w3.org/2000/svg">
  <g>
    ${rectEls}
    ${textEls}
  </g>
</svg>`;

  // Composite the SVG (scaled to full output). We render text in the same px
  // space as output so stroke/shadow stay sharp at any resolution.
  return sharp(base)
    .resize(outW, outH, { fit: "cover", position: "centre" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// fetch a remote/data/local-media image into a buffer — shared by UGC image flow
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  }
  if (url.startsWith("/media/files/")) {
    const path = await import("node:path");
    const { readFile } = await import("node:fs/promises");
    return readFile(path.join(process.cwd(), "data", "media", url.replace("/media/files/", "")));
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`image fetch failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

// ponytail: normalise any image buffer to a square PNG — used as the editable
// base for the UGC text editor (no text baked in)
export async function toSquarePng(input: Buffer, size = 1080): Promise<Buffer> {
  return sharp(input).resize(size, size, { fit: "cover", position: "centre" }).png().toBuffer();
}
