import ContentFormatCard from './ContentFormatCard'
import { CONTENT_FORMATS } from './formats'

export default function ContentFormatSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* header */}
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-xl font-bold text-foreground">Create new content</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick a format to start</p>
      </div>

      {/* scrollable format grid */}
      <div className="max-h-[56vh] overflow-y-auto p-6">
        <div
          role="radiogroup"
          aria-label="Content format"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
        >
          {CONTENT_FORMATS.map((format) => (
            <ContentFormatCard
              key={format.id}
              format={format}
              selected={format.id === selectedId}
              onSelect={() => onSelect(format.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
