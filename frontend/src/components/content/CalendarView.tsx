import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CONTENT_TYPES, STATUSES, sameDay, type ContentItem } from './data'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3

function buildGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export default function CalendarView({
  items,
  onSelect,
  onCreateAt,
}: {
  items: ContentItem[]
  onSelect: (item: ContentItem) => void
  /** called with an ISO datetime anchored to 9:00 on the clicked day */
  onCreateAt: (iso: string) => void
}) {
  const today = new Date()
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const grid = useMemo(() => buildGrid(cursor), [cursor])

  const byDay = useMemo(() => {
    const map = new Map<string, ContentItem[]>()
    for (const item of items) {
      if (!item.scheduledAt) continue
      const key = new Date(item.scheduledAt).toDateString()
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    }
    return map
  }, [items])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const moveMonth = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* month navigation */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => moveMonth(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => moveMonth(1)}>
            <ChevronRight />
          </Button>
          <span className="ml-2 text-sm font-semibold tracking-tight">{monthLabel}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
        >
          Today
        </Button>
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* day grid */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const inMonth = day.getMonth() === cursor.getMonth()
          const isToday = sameDay(day, today)
          const dayItems = byDay.get(day.toDateString()) ?? []
          const shown = dayItems.slice(0, MAX_CHIPS)
          const overflow = dayItems.length - shown.length
          const iso = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).toISOString()
          return (
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              title={`Create content on ${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}
              onClick={() => onCreateAt(iso)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateAt(iso)
              }}
              className={cn(
                'group flex min-h-24 cursor-pointer flex-col gap-1 p-1.5 outline-none transition-colors focus-visible:bg-muted/60',
                inMonth ? 'bg-card hover:bg-muted/40' : 'bg-muted/25 hover:bg-muted/50',
                i % 7 !== 0 && 'border-l',
                i >= 7 && 'border-t',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'grid size-5.5 place-items-center rounded-full text-xs tabular-nums',
                    isToday ? 'bg-foreground font-semibold text-background' : inMonth ? 'text-foreground' : 'text-muted-foreground/60',
                  )}
                >
                  {day.getDate()}
                </span>
                <span className="grid size-5 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-base leading-none">+</span>
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                {shown.map((item) => {
                  const meta = STATUSES[item.status]
                  const TypeIcon = CONTENT_TYPES[item.type].icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={`${item.title} — ${meta.label}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(item)
                      }}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight font-medium transition-transform hover:scale-[1.02]',
                        meta.chip,
                      )}
                    >
                      <TypeIcon className="size-3 shrink-0 opacity-70" />
                      <span className="truncate">{item.title}</span>
                    </button>
                  )
                })}
                {overflow > 0 && (
                  <span className="px-1.5 text-[10px] font-medium text-muted-foreground">+{overflow} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
