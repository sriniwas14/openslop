import { useMemo, useRef, useState } from 'react'
import { Bold, ImagePlus, RotateCcw, Trash2, Clapperboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { OverlayBlock } from '@/components/feed/MediaTextOverlay'
import { computeOverlayLayout, HIGHLIGHT } from '@/components/feed/overlayConfig'

export const textColors = ['#ffffff', '#171717', '#FF941F', '#facc15', '#ef4444', '#38bdf8', '#22c55e']
export const bgColors = ['#ffffff', '#171717', '#FF941F', '#facc15', '#ef4444', '#38bdf8', '#22c55e']

const colorNames: Record<string, string> = {
  '#ffffff': 'White',
  '#171717': 'Black',
  '#ff941f': 'Orange',
  '#facc15': 'Yellow',
  '#ef4444': 'Red',
  '#38bdf8': 'Blue',
  '#22c55e': 'Green',
}

function colorName(hex: string) {
  return colorNames[hex.toLowerCase()] ?? hex
}

// ---------------------------------------------------------------------------
// Sidebar editor for overlay text layers — the same controls that used to
// live on the feed card, relocatable into the editor popup. Fully
// controlled: every control patches the draft layer, nothing writes to the
// feed until the popup's Done applies the draft.
//
// Sections are plainly labelled (Text → Style → Background media → Summary)
// so each button and option explains itself.
// ---------------------------------------------------------------------------

export type DraftMediaKind = 'image' | 'video'

type Props = {
  blocks: OverlayBlock[]
  selectedId: string | null
  /** Measured preview size for the live line-count readout (null = unknown). */
  previewSize: { width: number; height: number } | null
  formatLabel: string
  imageSrc: string | null
  isCustomImage: boolean
  /** Which media type this post uses — the upload accepts only this kind. */
  mediaKind: DraftMediaKind
  onSelect: (id: string) => void
  onPatch: (id: string, p: Partial<OverlayBlock>) => void
  onRemove: (id: string) => void
  onUploadMedia: (file: File) => void
  onRevertImage: () => void
}

export default function OverlayEditorPanel({
  blocks,
  selectedId,
  previewSize,
  formatLabel,
  imageSrc,
  isCustomImage,
  mediaKind,
  onSelect,
  onPatch,
  onRemove,
  onUploadMedia,
  onRevertImage,
}: Props) {
  const selected = blocks.find((b) => b.id === selectedId) ?? null
  const selectedIndex = selected ? blocks.findIndex((b) => b.id === selected.id) : -1
  const fileRef = useRef<HTMLInputElement>(null)
  const [mismatch, setMismatch] = useState<string | null>(null)
  const isVideo = mediaKind === 'video'
  const mediaNoun = isVideo ? 'video' : 'image'

  // Live line count for the info row — same engine as the render, so the
  // panel always reports what the preview actually shows.
  const selectedLineCount = useMemo(() => {
    if (!selected || !previewSize || previewSize.width <= 0) return null
    const layout = computeOverlayLayout(selected.text, previewSize, {
      fontSizePct: selected.size,
      position: { x: selected.x / 100, y: selected.y / 100 },
      maxWidthPct: selected.maxWidthPct ?? 0.70,
      textColor: selected.color,
      fontWeight: selected.bold ? 800 : 500,
      ...(selected.backgroundEnabled ? { lineHeight: HIGHLIGHT.lineHeight } : {}),
    })
    return layout.lines.length
  }, [selected, previewSize])

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const expected = isVideo ? 'video/' : 'image/'
    if (!file.type.startsWith(expected)) {
      setMismatch(`That file is not a ${mediaNoun} — please choose a ${mediaNoun} file.`)
      return
    }
    setMismatch(null)
    onUploadMedia(file)
  }

  return (
    <div className="grid content-start gap-3">
      {/* 1 · Text layers — pick which text block to edit */}
      <div className="grid gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          1 · Text layers ({blocks.length})
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Pick a layer to edit it. Tip: you can also tap the text directly in the preview.
        </p>
        {blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground">This visual has no text layers.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {blocks.map((b, i) => (
              <Button
                key={b.id}
                type="button"
                variant={b.id === selectedId ? 'secondary' : 'outline'}
                size="xs"
                aria-pressed={b.id === selectedId}
                onClick={() => onSelect(b.id)}
              >
                Layer {i + 1}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* 2 · Selected-layer controls: text, size, position, style */}
      {selected ? (
        <div className="grid gap-2 rounded-lg border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              2 · Editing layer {selectedIndex + 1}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {selectedLineCount !== null && (
                <>{selectedLineCount} {selectedLineCount === 1 ? 'line' : 'lines'} · </>
              )}
              X {Math.round(selected.x)}% · Y {Math.round(selected.y)}%
            </span>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-foreground">Text</span>
            <textarea
              rows={2}
              value={selected.text}
              onChange={(e) => onPatch(selected.id, { text: e.target.value })}
              className="w-full resize-none rounded border bg-card px-2 py-1 text-sm"
              placeholder="Your text…"
              aria-label="Edit overlay text"
            />
          </label>
          <div className="grid gap-1.5">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-16 shrink-0 font-medium text-foreground">Size {Math.round(selected.size * 100)}%</span>
              <input
                type="range"
                min={3}
                max={10}
                step={0.5}
                value={Math.round(selected.size * 100)}
                onChange={(e) => onPatch(selected.id, { size: Number(e.target.value) / 100 })}
                className="flex-1 accent-primary"
                aria-label="Font size"
                title="Drag to make the text bigger or smaller"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-16 shrink-0 font-medium text-foreground">Across {Math.round(selected.x)}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(selected.x)}
                onChange={(e) => onPatch(selected.id, { x: Number(e.target.value) })}
                className="flex-1 accent-primary"
                aria-label="Horizontal position"
                title="Drag to move the text left or right"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-16 shrink-0 font-medium text-foreground">Up/down {Math.round(selected.y)}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(selected.y)}
                onChange={(e) => onPatch(selected.id, { y: Number(e.target.value) })}
                className="flex-1 accent-primary"
                aria-label="Vertical position"
                title="Drag to move the text up or down"
              />
            </label>
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground">Text colour</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-0.5" role="group" aria-label="Text colour">
                {textColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Text colour ${colorName(c)}`}
                    aria-pressed={selected.color.toLowerCase() === c.toLowerCase()}
                    title={colorName(c)}
                    onClick={() => onPatch(selected.id, { color: c })}
                    className={cn(
                      'size-4 rounded-full border border-border transition-transform',
                      selected.color.toLowerCase() === c.toLowerCase() && 'scale-110 ring-2 ring-primary',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) => onPatch(selected.id, { color: e.target.value })}
                  className="h-4 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                  aria-label="Custom text colour"
                  title="Pick any custom text colour"
                />
              </div>
              <Button
                type="button"
                variant={selected.bold ? 'secondary' : 'ghost'}
                size="icon-xs"
                aria-label="Bold"
                aria-pressed={selected.bold}
                title={selected.bold ? 'Bold is on — click to turn off' : 'Bold is off — click to turn on'}
                onClick={() => onPatch(selected.id, { bold: !selected.bold })}
              >
                <Bold className="size-3" />
              </Button>
              <Button
                type="button"
                variant={selected.backgroundEnabled ? 'secondary' : 'ghost'}
                size="xs"
                aria-pressed={selected.backgroundEnabled}
                title={selected.backgroundEnabled
                  ? 'Highlight is on — each line sits on its own tight chip. Click to remove it.'
                  : 'Highlight is off — plain text on the media. Click to add a highlight chip behind each line.'}
                onClick={() =>
                  onPatch(
                    selected.id,
                    selected.backgroundEnabled
                      ? { backgroundEnabled: false }
                      : {
                          backgroundEnabled: true,
                          // White text is invisible on the default white chips —
                          // flip to black when enabling, keep any other choice.
                          ...(selected.color.toLowerCase() === '#ffffff' ? { color: '#000000' } : {}),
                        },
                  )
                }
              >
                Highlight {selected.backgroundEnabled ? 'on' : 'off'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Delete this text layer"
                title="Delete this text layer"
                className="ml-auto text-destructive"
                onClick={() => onRemove(selected.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
          {selected.backgroundEnabled && (
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Highlight colour</span>
              <div className="flex items-center gap-0.5" role="group" aria-label="Highlight colour">
                {bgColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Highlight colour ${colorName(c)}`}
                    aria-pressed={selected.backgroundColor.toLowerCase() === c.toLowerCase()}
                    title={colorName(c)}
                    onClick={() => onPatch(selected.id, { backgroundColor: c })}
                    className={cn(
                      'size-4 rounded-full border border-border transition-transform',
                      selected.backgroundColor.toLowerCase() === c.toLowerCase() && 'scale-110 ring-2 ring-primary',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={selected.backgroundColor}
                  onChange={(e) => onPatch(selected.id, { backgroundColor: e.target.value })}
                  className="h-4 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                  aria-label="Custom highlight colour"
                  title="Pick any custom highlight colour"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Click a text layer in the preview — or pick one above — to edit its text, colour, highlight and position.
        </p>
      )}

      {/* 3 · Background media — replace the photo/video behind the text */}
      <div className="grid gap-1.5 rounded-lg border p-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          3 · Background {mediaNoun}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Swap the {mediaNoun} behind your text. Your layers stay exactly where they are.
        </p>
        {imageSrc ? (
          isVideo ? (
            <video src={imageSrc} muted loop playsInline preload="metadata" className="max-h-28 w-full rounded-md border object-cover" aria-label="Replacement video preview" />
          ) : (
            <img src={imageSrc} alt="Replacement image preview" className="max-h-28 w-full rounded-md border object-cover" />
          )
        ) : (
          <p className="text-xs text-muted-foreground">No visual yet.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept={isVideo ? 'video/*' : 'image/*'}
            className="hidden"
            aria-label={isVideo ? 'Upload replacement video' : 'Upload replacement image'}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              handleFile(file)
            }}
          />
          <Button type="button" variant="outline" size="xs" onClick={() => fileRef.current?.click()}>
            {isVideo ? <Clapperboard className="size-3" /> : <ImagePlus className="size-3" />}{' '}
            {isCustomImage ? `Change ${mediaNoun}` : `Upload ${mediaNoun}`}
          </Button>
          {isCustomImage && (
            <Button type="button" variant="ghost" size="xs" onClick={() => { setMismatch(null); onRevertImage() }}>
              <RotateCcw className="size-3" /> Revert
            </Button>
          )}
        </div>
        {mismatch ? (
          <p role="alert" className="text-[11px] font-medium leading-snug text-destructive">{mismatch}</p>
        ) : (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {isCustomImage
              ? `Using your uploaded ${mediaNoun} — applies to the post only when you press Done.`
              : `Upload replaces the background ${mediaNoun} for this edit without affecting the feed.`}
          </p>
        )}
      </div>

      {/* Composition summary */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Format</dt>
          <dd className="font-medium">{formatLabel}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Highlight</dt>
          <dd className="font-medium">{selected ? (selected.backgroundEnabled ? 'On' : 'Off') : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
