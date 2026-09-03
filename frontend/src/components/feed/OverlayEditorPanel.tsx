import { useMemo, useRef } from 'react'
import { Bold, ImagePlus, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { OverlayBlock } from '@/components/feed/MediaTextOverlay'
import { computeOverlayLayout, HIGHLIGHT } from '@/components/feed/overlayConfig'

export const textColors = ['#ffffff', '#171717', '#FF941F', '#facc15', '#ef4444', '#38bdf8', '#22c55e']
export const bgColors = ['#ffffff', '#171717', '#FF941F', '#facc15', '#ef4444', '#38bdf8', '#22c55e']

// ---------------------------------------------------------------------------
// Sidebar editor for overlay text layers — the same controls that used to
// live on the feed card, relocatable into the editor popup. Fully
// controlled: every control patches the draft layer, nothing writes to the
// feed until the popup's Done applies the draft.
// ---------------------------------------------------------------------------

type Props = {
  blocks: OverlayBlock[]
  selectedId: string | null
  /** Measured preview size for the live line-count readout (null = unknown). */
  previewSize: { width: number; height: number } | null
  formatLabel: string
  imageSrc: string | null
  isCustomImage: boolean
  onSelect: (id: string) => void
  onPatch: (id: string, p: Partial<OverlayBlock>) => void
  onRemove: (id: string) => void
  onUploadImage: (file: File) => void
  onRevertImage: () => void
}

export default function OverlayEditorPanel({
  blocks,
  selectedId,
  previewSize,
  formatLabel,
  imageSrc,
  isCustomImage,
  onSelect,
  onPatch,
  onRemove,
  onUploadImage,
  onRevertImage,
}: Props) {
  const selected = blocks.find((b) => b.id === selectedId) ?? null
  const selectedIndex = selected ? blocks.findIndex((b) => b.id === selected.id) : -1
  const fileRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="grid content-start gap-3">
      {/* Layer switcher */}
      <div className="grid gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Text layers ({blocks.length})
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
                onClick={() => onSelect(b.id)}
              >
                Layer {i + 1}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Selected-layer controls */}
      {selected ? (
        <div className="grid gap-2 rounded-lg border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Layer {selectedIndex + 1}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {selectedLineCount !== null && (
                <>{selectedLineCount} {selectedLineCount === 1 ? 'line' : 'lines'} · </>
              )}
              X {Math.round(selected.x)}% · Y {Math.round(selected.y)}%
            </span>
          </div>
          <textarea
            rows={2}
            value={selected.text}
            onChange={(e) => onPatch(selected.id, { text: e.target.value })}
            className="w-full resize-none rounded border bg-card px-2 py-1 text-sm"
            placeholder="Your text…"
            aria-label="Edit overlay text"
          />
          <div className="grid gap-1.5">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Size {Math.round(selected.size * 100)}%
              <input
                type="range"
                min={3}
                max={10}
                step={0.5}
                value={Math.round(selected.size * 100)}
                onChange={(e) => onPatch(selected.id, { size: Number(e.target.value) / 100 })}
                className="flex-1 accent-primary"
                aria-label="Font size"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              X {Math.round(selected.x)}%
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(selected.x)}
                onChange={(e) => onPatch(selected.id, { x: Number(e.target.value) })}
                className="flex-1 accent-primary"
                aria-label="Horizontal position"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Y {Math.round(selected.y)}%
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(selected.y)}
                onChange={(e) => onPatch(selected.id, { y: Number(e.target.value) })}
                className="flex-1 accent-primary"
                aria-label="Vertical position"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-0.5" role="group" aria-label="Text colour">
              {textColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  title={c}
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
                title="Custom text colour"
              />
            </div>
            <Button
              type="button"
              variant={selected.bold ? 'secondary' : 'ghost'}
              size="icon-xs"
              aria-label="Bold"
              title={selected.bold ? 'Bold on' : 'Bold off'}
              onClick={() => onPatch(selected.id, { bold: !selected.bold })}
            >
              <Bold className="size-3" />
            </Button>
            <div className="flex items-center gap-0.5" role="group" aria-label="Text background">
              <Button
                type="button"
                variant={selected.backgroundEnabled ? 'secondary' : 'ghost'}
                size="icon-xs"
                aria-label="Toggle text background"
                title={selected.backgroundEnabled ? 'Text background on — tight highlight hugging each line' : 'Text background off — text only'}
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
                Bg
              </Button>
            </div>
            {selected.backgroundEnabled && (
              <div className="flex items-center gap-0.5" role="group" aria-label="Background colour">
                {bgColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Background colour ${c}`}
                    title={c}
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
                  aria-label="Custom background colour"
                  title="Custom background colour"
                />
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Delete text"
              className="ml-auto text-destructive"
              onClick={() => onRemove(selected.id)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Click a text layer in the preview — or pick one above — to edit its text, background and position.
        </p>
      )}

      {/* Image section — replace the visual without touching the feed */}
      <div className="grid gap-1.5 rounded-lg border p-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Image</p>
        {imageSrc ? (
          <img src={imageSrc} alt="Visual preview" className="max-h-28 w-full rounded-md border object-cover" />
        ) : (
          <p className="text-xs text-muted-foreground">No visual yet.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload replacement image"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onUploadImage(file)
            }}
          />
          <Button type="button" variant="outline" size="xs" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-3" /> {isCustomImage ? 'Change image' : 'Upload image'}
          </Button>
          {isCustomImage && (
            <Button type="button" variant="ghost" size="xs" onClick={onRevertImage}>
              <RotateCcw className="size-3" /> Revert
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {isCustomImage
            ? 'Using your uploaded image — applies to the post only when you press Done.'
            : 'Upload replaces the background image for this edit without affecting the feed.'}
        </p>
      </div>

      {/* Composition summary */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Format</dt>
          <dd className="font-medium">{formatLabel}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground">Background</dt>
          <dd className="font-medium">{selected ? (selected.backgroundEnabled ? 'On' : 'Off') : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
