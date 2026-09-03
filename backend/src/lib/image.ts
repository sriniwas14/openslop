import sharp from "sharp";

// ponytail: 720p jpeg for provider payloads (Runway referenceImages 413s on multi-MB data URIs)
export async function toResizedDataUri(input: Buffer, maxLongEdge = 1280, quality = 80): Promise<string> {
  const buf = await sharp(input)
    .resize({ width: maxLongEdge, height: maxLongEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
