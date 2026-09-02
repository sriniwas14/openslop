import sharp from "sharp";

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
