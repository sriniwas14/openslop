import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, FileText, LibraryBig, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useCompany } from '@/context/CompanyContext'
import { cn } from '@/lib/utils'
import { platformMeta, typeLabel } from '@/components/feed/data'
import MediaTextOverlay from '@/components/feed/MediaTextOverlay'
import MemeGifOverlay, { DEFAULT_MEME_GIF_LAYER } from '@/components/feed/MemeGifOverlay'
import { StatusBadge } from '@/components/content/primitives'
import LibraryDetailDialog from '@/components/library/LibraryDetailDialog'
import {
  addMediaBankItem,
  getMediaBlobUrl,
  listMediaBank,
  listSavedPosts,
  putMediaBlob,
  removeMediaBankItem,
  removeSavedPost,
  updateMediaBankItem,
  updateSavedPost,
  type LibraryStatus,
  type MediaBankItem,
  type SavedPost,
} from '@/services/library'

// ---------------------------------------------------------------------------
// Content Library — browser-local (per brand) home for posts saved from the
// Content Feed, the user's own uploads, and the media bank.
//
// Cards follow the Content page language (masonry grid, cover media, status
// row, title, meta footer); clicking a card opens a detail dialog where all
// Library actions live. Saved cards keep their overlay-text preview.
// Tabs: My Content (saved feed posts) · My Post (own uploads) · Media Bank.
// ---------------------------------------------------------------------------

type Tab = 'content' | 'post' | 'bank'
type SubTab = 'all' | 'scheduled' | 'draft' | 'published' | 'attention'

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'content', label: 'My Content', icon: Bookmark },
  { value: 'post', label: 'My Post', icon: FileText },
  { value: 'bank', label: 'My Media Bank', icon: LibraryBig },
]

const SUB_TABS: { value: SubTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'attention', label: 'Need Attention' },
]

function matchesSub(status: LibraryStatus, needsAttention: boolean, sub: SubTab) {
  switch (sub) {
    case 'all':
      return true
    case 'attention':
      return needsAttention
    default:
      return status === sub
  }
}

function slugFilename(name: string, mediaType: 'image' | 'video') {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'media'
  return `${base}.${mediaType === 'video' ? 'mp4' : 'jpg'}`
}

// Download helper — fetches remote URLs to a blob so the download
// attribute works cross-origin; falls back to opening the file.
async function downloadFile(url: string, filename: string): Promise<'downloaded' | 'opened' | 'failed'> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('fetch failed')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
    }
    return 'downloaded'
  } catch {
    window.open(url, '_blank', 'noopener')
    return 'opened'
  }
}

export default function Library() {
  const { selectedId } = useCompany()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('content')
  const [sub, setSub] = useState<SubTab>('all')
  const [saved, setSaved] = useState<SavedPost[]>([])
  const [bank, setBank] = useState<MediaBankItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    if (!selectedId) {
      setSaved([])
      setBank([])
      return
    }
    setSaved(listSavedPosts(selectedId))
    setBank(listMediaBank(selectedId))
  }, [selectedId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Resolve media-bank blobs to object URLs (revoked on change/unmount).
  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    async function load() {
      const entries: Record<string, string> = {}
      for (const m of bank) {
        const url = await getMediaBlobUrl(m.blobId).catch(() => null)
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        if (url) {
          entries[m.id] = url
          created.push(url)
        }
      }
      if (!cancelled) setUrls(entries)
    }
    void load()
    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, bank.map((m) => m.id).join('|')])

  const visibleSaved = useMemo(
    () => saved.filter((p) => matchesSub(p.status, p.needsAttention, sub)),
    [saved, sub],
  )
  const myPosts = useMemo(
    () => bank.filter((m) => matchesSub(m.status, false, sub)),
    [bank, sub],
  )

  const selectedSaved = selectedSavedId ? (saved.find((p) => p.id === selectedSavedId) ?? null) : null
  const selectedBank = selectedBankId ? (bank.find((m) => m.id === selectedBankId) ?? null) : null

  const patchSaved = useCallback(
    (contentId: string, patch: Partial<Pick<SavedPost, 'status' | 'scheduledAt'>>, label: string) => {
      if (!selectedId) return
      updateSavedPost(selectedId, contentId, patch)
      setSaved(listSavedPosts(selectedId))
      toast({ title: label, variant: 'success' })
    },
    [selectedId, toast],
  )

  const patchBank = useCallback(
    (id: string, patch: Partial<Pick<MediaBankItem, 'status' | 'scheduledAt'>>, label: string) => {
      if (!selectedId) return
      updateMediaBankItem(selectedId, id, patch)
      setBank(listMediaBank(selectedId))
      toast({ title: label, variant: 'success' })
    },
    [selectedId, toast],
  )

  const removeSaved = useCallback(
    (post: SavedPost) => {
      if (!selectedId) return
      removeSavedPost(selectedId, post.contentId)
      setSaved(listSavedPosts(selectedId))
      setSelectedSavedId(null)
      toast({ title: 'Removed from Library', variant: 'default' })
    },
    [selectedId, toast],
  )

  const removeBank = useCallback(
    (item: MediaBankItem) => {
      if (!selectedId) return
      removeMediaBankItem(selectedId, item.id)
      setBank(listMediaBank(selectedId))
      setSelectedBankId(null)
      toast({ title: 'Removed', variant: 'default' })
    },
    [selectedId, toast],
  )

  const handleDownloadSaved = useCallback(
    async (post: SavedPost) => {
      if (!post.visualUrl) {
        toast({ title: 'No file to download', variant: 'warning' })
        return
      }
      // Bake the on-screen overlay text into the file so the download
      // carries the same text seen in the feed. Falls back to the raw
      // file when baking is impossible (e.g. no CORS headers).
      if (post.blocks.length > 0) {
        setDownloadingId(post.id)
        try {
          const { exportImageWithOverlay, exportVideoWithOverlay } = await import('@/lib/exportOverlay')
          const base = slugFilename(post.title ?? post.hook ?? 'post', post.mediaType).replace(/\.(mp4|jpg)$/i, '')
          if (post.mediaType === 'video') {
            await exportVideoWithOverlay(
              { url: post.visualUrl, mediaType: 'video', blocks: post.blocks, memeUrl: post.memeUrl, gifLayer: post.gifLayer },
              `${base}.webm`,
              () => toast({ title: 'Saved as still image', description: 'Video recording is unsupported here — exported one frame with text.', variant: 'info' }),
            )
          } else {
            await exportImageWithOverlay(
              { url: post.visualUrl, mediaType: 'image', blocks: post.blocks, memeUrl: post.memeUrl, gifLayer: post.gifLayer },
              `${base}.png`,
            )
          }
          toast({ title: 'Download started', description: 'Includes your overlay text.', variant: 'success' })
          return
        } catch {
          toast({ title: 'Baking text failed', description: 'Downloading the original file instead.', variant: 'warning' })
        } finally {
          setDownloadingId(null)
        }
      }
      const result = await downloadFile(post.visualUrl, slugFilename(post.title ?? post.hook ?? 'post', post.mediaType))
      toast({
        title: result === 'downloaded' ? 'Download started' : 'Opened in a new tab',
        description: result === 'downloaded' ? undefined : 'The file could not be fetched directly.',
        variant: 'success',
      })
    },
    [toast],
  )

  const handleDownloadBank = useCallback(
    async (item: MediaBankItem, url: string | null) => {
      if (!url) {
        toast({ title: 'Media is still loading', variant: 'warning' })
        return
      }
      setDownloadingId(item.id)
      try {
        const result = await downloadFile(url, slugFilename(item.name, item.mediaType))
        toast({ title: result === 'downloaded' ? 'Download started' : 'Opened in a new tab', variant: 'success' })
      } finally {
        setDownloadingId(null)
      }
    },
    [toast],
  )

  const handleUpload = useCallback(
    async (file: File | undefined) => {
      if (!file || !selectedId) return
      const kind = file.type.startsWith('video/') ? 'video' : 'image'
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast({ title: 'Please choose a photo or video file', variant: 'warning' })
        return
      }
      setUploading(true)
      try {
        const id = crypto.randomUUID()
        await putMediaBlob(id, file)
        addMediaBankItem(selectedId, {
          id,
          name: file.name || `Upload ${new Date().toLocaleDateString()}`,
          mediaType: kind,
          blobId: id,
          size: file.size,
          status: 'draft',
          scheduledAt: null,
          createdAt: new Date().toISOString(),
        })
        setBank(listMediaBank(selectedId))
        toast({ title: 'Added to Media Bank', description: 'Use it later from My Post.', variant: 'success' })
      } catch {
        toast({ title: 'Upload failed', variant: 'error' })
      } finally {
        setUploading(false)
      }
    },
    [selectedId, toast],
  )

  return (
    <div className="grid gap-5 @container">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Posts you saved from the feed, your own uploads, and reusable media.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Library sections">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.value
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'bank' && (
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Status filter">
          {SUB_TABS.map((s) => (
            <button
              key={s.value}
              role="tab"
              aria-selected={sub === s.value}
              type="button"
              onClick={() => setSub(s.value)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                sub === s.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* My Content — saved feed posts */}
      {tab === 'content' && (
        visibleSaved.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="Save posts from the Content Feed with the Review button and they will appear here."
          />
        ) : (
          <div className="w-full columns-1 gap-4 @min-[480px]:columns-2 @min-[720px]:columns-3 @min-[1000px]:columns-4 @min-[1280px]:columns-5">
            {visibleSaved.map((p) => (
              <SavedCard key={p.id} post={p} onOpen={() => setSelectedSavedId(p.id)} />
            ))}
          </div>
        )
      )}

      {/* My Post — own uploads */}
      {tab === 'post' && (
        myPosts.length === 0 ? (
          <EmptyState
            title="No posts yet"
            body="Upload photos or videos in My Media Bank and they will show up here as drafts."
          />
        ) : (
          <div className="w-full columns-1 gap-4 @min-[480px]:columns-2 @min-[720px]:columns-3 @min-[1000px]:columns-4 @min-[1280px]:columns-5">
            {myPosts.map((m) => (
              <BankCard key={m.id} item={m} url={urls[m.id] ?? null} onOpen={() => setSelectedBankId(m.id)} />
            ))}
          </div>
        )
      )}

      {/* My Media Bank — uploads for later reuse */}
      {tab === 'bank' && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              aria-label="Upload media"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                void handleUpload(file)
              }}
            />
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || !selectedId}>
              <Upload className="size-4" data-icon="inline-start" />
              {uploading ? 'Uploading…' : 'Upload photo or video'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {bank.length} {bank.length === 1 ? 'item' : 'items'} stored on this device
            </span>
          </div>
          {bank.length === 0 ? (
            <EmptyState title="Media bank is empty" body="Upload photos or videos you want to reuse later." />
          ) : (
            <div className="w-full columns-1 gap-4 @min-[480px]:columns-2 @min-[720px]:columns-3 @min-[1000px]:columns-4 @min-[1280px]:columns-5">
              {bank.map((m) => (
                <BankCard key={m.id} item={m} url={urls[m.id] ?? null} onOpen={() => setSelectedBankId(m.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail dialog for the selected saved post */}
      <LibraryDetailDialog
        open={selectedSaved !== null}
        onOpenChange={(o) => !o && setSelectedSavedId(null)}
        title={selectedSaved?.title ?? 'Content'}
        subtitle={selectedSaved?.hook ?? selectedSaved?.body ?? null}
        status={selectedSaved?.status ?? 'draft'}
        needsAttention={selectedSaved?.needsAttention ?? false}
        scheduledAt={selectedSaved?.scheduledAt ?? null}
        meta={selectedSaved ? `${platformMeta(selectedSaved.platform).label} · ${typeLabel(selectedSaved.contentType) || selectedSaved.contentFormat.replace(/_/g, ' ')}` : ''}
        media={selectedSaved ? <SavedMedia post={selectedSaved} /> : null}
        downloading={selectedSaved ? downloadingId === selectedSaved.id : false}
        canDownload={!!selectedSaved?.visualUrl}
        onDownload={() => selectedSaved && void handleDownloadSaved(selectedSaved)}
        onSchedule={(iso) => selectedSaved && patchSaved(selectedSaved.contentId, { status: 'scheduled', scheduledAt: iso }, 'Scheduled')}
        onPublish={() => selectedSaved && patchSaved(selectedSaved.contentId, { status: 'published', scheduledAt: null }, 'Marked as published')}
        onDraft={() => selectedSaved && patchSaved(selectedSaved.contentId, { status: 'draft', scheduledAt: null }, 'Moved to drafts')}
        onRemove={() => selectedSaved && removeSaved(selectedSaved)}
      />

      {/* Detail dialog for the selected media bank item */}
      <LibraryDetailDialog
        open={selectedBank !== null}
        onOpenChange={(o) => !o && setSelectedBankId(null)}
        title={selectedBank?.name ?? 'Media'}
        subtitle={null}
        status={selectedBank?.status ?? 'draft'}
        scheduledAt={selectedBank?.scheduledAt ?? null}
        meta={selectedBank ? `${selectedBank.mediaType === 'video' ? 'Video' : 'Image'} · ${(selectedBank.size / 1024 / 1024).toFixed(1)} MB` : ''}
        media={selectedBank ? <BankMedia item={selectedBank} url={urls[selectedBank.id] ?? null} /> : null}
        downloading={selectedBank ? downloadingId === selectedBank.id : false}
        canDownload={!!selectedBank && !!urls[selectedBank.id]}
        onDownload={() => selectedBank && void handleDownloadBank(selectedBank, urls[selectedBank.id] ?? null)}
        onSchedule={(iso) => selectedBank && patchBank(selectedBank.id, { status: 'scheduled', scheduledAt: iso }, 'Scheduled')}
        onPublish={() => selectedBank && patchBank(selectedBank.id, { status: 'published', scheduledAt: null }, 'Marked as published')}
        onDraft={() => selectedBank && patchBank(selectedBank.id, { status: 'draft', scheduledAt: null }, 'Moved to drafts')}
        onRemove={() => selectedBank && removeBank(selectedBank)}
      />
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <div className="grid max-w-sm gap-1.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clickable card shell in the Content page language: masonry-safe, hover
// border, keyboard operable. All actions live in the detail dialog.
// ---------------------------------------------------------------------------

function CardButton({ label, onOpen, children }: { label: string; onOpen: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="group mb-4 break-inside-avoid cursor-pointer outline-none"
    >
      <div className="overflow-hidden rounded-xl border bg-card transition-colors outline-none group-hover:border-foreground/20 group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
        {children}
      </div>
    </div>
  )
}

function SavedMedia({ post }: { post: SavedPost }) {
  // Same layout numbers as the Content Feed card: phone-capped width,
  // content-fitted aspect from the saved snapshot, contain-fit full frame,
  // and the same overlay engine — so text size/position match the feed.
  return (
    <div className="mx-auto w-full max-w-[24rem]">
      <div className="relative w-full bg-black" style={{ aspectRatio: post.aspect ?? 4 / 5 }}>
        {post.visualUrl ? (
          post.mediaType === 'video' ? (
            <video src={post.visualUrl} poster={post.posterUrl ?? undefined} muted loop playsInline preload="metadata" className="h-full w-full object-contain" />
          ) : (
            <img src={post.visualUrl} alt={post.hook ?? 'Saved visual'} loading="lazy" className="h-full w-full object-contain" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/50">No visual</div>
        )}
        {/* Saved overlay text — same layers, size and position as the feed. */}
        {post.visualUrl && post.blocks.length > 0 && (
          <MediaTextOverlay
            blocks={post.blocks}
            selectedId={null}
            draggable={false}
            allowInlineEdit={false}
            onSelect={() => {}}
            onPatch={() => {}}
          />
        )}
        {/* Layer 3: saved meme GIF overlay — same position as the feed. */}
        {post.contentFormat === 'meme' && post.visualUrl && post.memeUrl && (
          <MemeGifOverlay
            src={post.memeUrl}
            alt={post.hook ?? 'Meme overlay'}
            layer={post.gifLayer ?? DEFAULT_MEME_GIF_LAYER}
          />
        )}
      </div>
    </div>
  )
}

function BankMedia({ item, url }: { item: MediaBankItem; url: string | null }) {
  return (
    <div className="relative aspect-[4/5] w-full bg-black">
      {url ? (
        item.mediaType === 'video' ? (
          <video src={url} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <img src={url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-white/50">Loading…</div>
      )}
    </div>
  )
}

function CardInfo({
  status,
  needsAttention,
  title,
  summary,
  footer,
}: {
  status: LibraryStatus
  needsAttention?: boolean
  title: string
  summary: string | null
  footer: string
}) {
  return (
    <div className="grid gap-2 p-3">
      <div className="flex items-center gap-1.5">
        <StatusBadge status={status} />
        {needsAttention && (
          <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            Needs Attention
          </span>
        )}
      </div>
      <div className="line-clamp-2 text-sm leading-snug font-medium">{title}</div>
      {summary && <div className="line-clamp-1 text-xs text-muted-foreground">{summary}</div>}
      <div className="border-t pt-2 text-xs text-muted-foreground tabular-nums">{footer}</div>
    </div>
  )
}

function SavedCard({ post, onOpen }: { post: SavedPost; onOpen: () => void }) {
  const platform = platformMeta(post.platform)
  return (
    <CardButton label={`Open ${post.title ?? 'saved post'}`} onOpen={onOpen}>
      <SavedMedia post={post} />
      <CardInfo
        status={post.status}
        needsAttention={post.needsAttention}
        title={post.title ?? 'Content'}
        summary={post.hook}
        footer={`${platform.label} · ${typeLabel(post.contentType) || post.contentFormat.replace(/_/g, ' ')}${post.scheduledAt ? ` · ${new Date(post.scheduledAt).toLocaleDateString()}` : ''}`}
      />
    </CardButton>
  )
}

function BankCard({ item, url, onOpen }: { item: MediaBankItem; url: string | null; onOpen: () => void }) {
  return (
    <CardButton label={`Open ${item.name}`} onOpen={onOpen}>
      <BankMedia item={item} url={url} />
      <CardInfo
        status={item.status}
        title={item.name}
        summary={`${item.mediaType === 'video' ? 'Video' : 'Image'} · ${(item.size / 1024 / 1024).toFixed(1)} MB`}
        footer={item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString() : 'Not scheduled'}
      />
    </CardButton>
  )
}
