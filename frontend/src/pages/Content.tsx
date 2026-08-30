import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CONTENT_TYPES, STATUSES, type ContentItem, type ContentStatus, type ViewMode } from '@/components/content/data'
import { ViewSwitcher } from '@/components/content/primitives'
import ListView from '@/components/content/ListView'
import CalendarView from '@/components/content/CalendarView'
import CardsView from '@/components/content/CardsView'
import CreateContentDialog from '@/components/content/CreateContentDialog'
import ContentDetailDialog from '@/components/content/ContentDetailDialog'
import { useCompany } from '@/context/CompanyContext'
import { listContent, type ContentRow } from '@/services/content'

const VIEW_STORAGE_KEY = 'geoalt.content.view'

function loadView(): ViewMode {
  const stored = localStorage.getItem(VIEW_STORAGE_KEY)
  return stored === 'calendar' || stored === 'cards' ? stored : 'list'
}

type StatusFilter = ContentStatus | 'all'

function toContentItem(row: ContentRow): ContentItem {
  const meta = CONTENT_TYPES[row.kind]
  const summary = row.scripts?.[0]?.prompt?.slice(0, 220) ?? row.images?.[0]?.text?.slice(0, 220) ?? row.title
  return {
    id: row.id,
    title: row.title,
    summary,
    type: row.kind,
    platforms: meta?.platforms?.slice(0, 2) ?? ['instagram'],
    status: row.status === 'published' ? 'published' : 'draft',
    scheduledAt: row.scheduledAt,
    aiScore: 75,
    format: row.format ?? (row.kind === 'carousel' ? 'horizontal' : 'vertical'),
    mediaUrl: row.mediaUrl,
  }
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: STATUSES.draft.label },
  { value: 'review', label: STATUSES.review.label },
  { value: 'scheduled', label: STATUSES.scheduled.label },
  { value: 'published', label: STATUSES.published.label },
]

export default function ContentPage() {
  const { selectedId } = useCompany()
  const [items, setItems] = useState<ContentItem[]>([])
  const [view, setViewState] = useState<ViewMode>(loadView)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<ContentItem | null>(null)

  useEffect(() => {
    let active = true
    if (!selectedId) { setItems([]); return () => { active = false } }
    const load = async () => {
      try {
        const rows = await listContent(selectedId)
        if (active) setItems(rows.map(toContentItem))
      } catch { if (active) setItems([]) }
    }
    void load()
    const timer = window.setInterval(() => void load(), 8000)
    return () => { active = false; window.clearInterval(timer) }
  }, [selectedId])

  const setView = (v: ViewMode) => {
    setViewState(v)
    localStorage.setItem(VIEW_STORAGE_KEY, v)
  }

  const openCreate = (date: string | null = null) => {
    setCreateDate(date)
    setCreateOpen(true)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (!q) return true
      return item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q)
    })
  }, [items, search, statusFilter])

  const counts = useMemo(() => {
    const map = new Map<StatusFilter, number>()
    map.set('all', items.length)
    for (const item of items) map.set(item.status, (map.get(item.status) ?? 0) + 1)
    return map
  }, [items])

  const handleCreate = (item: ContentItem) => setItems((prev) => [item, ...prev])

  const handleDuplicate = (item: ContentItem) =>
    setItems((prev) => [
      { ...item, id: crypto.randomUUID(), title: `${item.title} (copy)`, status: 'draft', scheduledAt: null },
      ...prev,
    ])

  const handleDelete = (item: ContentItem) => setItems((prev) => prev.filter((x) => x.id !== item.id))

  const scheduledCount = items.filter((i) => i.status === 'scheduled').length

  return (
    <div className="grid gap-5">
      {/* page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create, manage, and schedule content for your brand.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitcher value={view} onChange={setView} />
          <Button onClick={() => openCreate()}>
            <Plus data-icon="inline-start" />
            Create Content
          </Button>
        </div>
      </div>

      {/* toolbar: search + status filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content…"
            className="w-56 pl-8"
            aria-label="Search content"
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                statusFilter === f.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {f.label}
              <span className={cn('tabular-nums', statusFilter === f.value ? 'text-background/60' : 'text-muted-foreground/60')}>
                {counts.get(f.value) ?? 0}
              </span>
            </button>
          ))}
        </div>
        <span className="ml-auto hidden text-xs text-muted-foreground tabular-nums sm:block">
          {items.length} items · {scheduledCount} scheduled
        </span>
      </div>

      {/* active view */}
      {filtered.length === 0 && view !== 'calendar' ? (
        <div className="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-20 text-center">
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">No content found</p>
            <p className="text-sm text-muted-foreground">
              {search || statusFilter !== 'all'
                ? 'Try a different search or filter.'
                : 'Create your first piece of content to get started.'}
            </p>
            <Button className="mt-3 justify-self-center" onClick={() => openCreate()}>
              <Plus data-icon="inline-start" />
              Create Content
            </Button>
          </div>
        </div>
      ) : view === 'list' ? (
        <ListView items={filtered} onSelect={setDetailItem} onDuplicate={handleDuplicate} onDelete={handleDelete} />
      ) : view === 'calendar' ? (
        <CalendarView items={filtered} onSelect={setDetailItem} onCreateAt={(iso) => openCreate(iso)} />
      ) : (
        <CardsView items={filtered} onSelect={setDetailItem} />
      )}

      {/* dialogs */}
      <CreateContentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialDate={createDate}
        onCreate={handleCreate}
      />
      <ContentDetailDialog
        item={detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
    </div>
  )
}
