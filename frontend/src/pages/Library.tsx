import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, FileText, LibraryBig, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useCompany } from '@/context/CompanyContext'
import { cn } from '@/lib/utils'
import { platformMeta, typeLabel } from '@/components/feed/data'
import PostContainer, { PostMediaContainer, postSourceFromBankItem, postSourceFromSavedPost } from '@/components/feed/PostContainer'
import { StatusBadge } from '@/components/content/primitives'
import LibraryDetailDialog from '@/components/library/LibraryDetailDialog'
import {
  addMediaBankItem,
  listMediaBank,
  listSavedPosts,
  removeMediaBankItem,
  removeSavedPost,
  savedPostSrc,
  updateMediaBankItem,
  updateSavedPost,
  updateSavedPostMedia,
  type LibraryStatus,
  type MediaBankItem,
  type SavedPost,
} from '@/services/library'

// ---------------------------------------------------------------------------
// Content Library — DB-backed (user + brand scoped) home for posts saved from
// the Content Feed, the user's own uploads, and the media bank. Nothing lives
// in localStorage: Save in the feed POSTs to /companies/:id/library/posts and
// every tab reads back from the DB for the selected brand.
//
// Cards use the same reusable PostContainer media box as the feed (phone-capped
// width, content-fitted aspect, same overlay engine); clicking a card opens a
// detail dialog with the interactive PostContainer (Edit) + Library actions.
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

// Session object URL (Edit-replaced visual) → data: URL for the DB upload.
function blobUrlToDataUrl(url: string): Promise<string | null> {
  return fetch(url)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const fr = new FileReader()
          fr.onload = () => resolve(String(fr.result ?? ''))
          fr.onerror = () => reject(fr.error ?? new Error('read failed'))
          fr.readAsDataURL(blob)
        }),
    )
    .catch(() => null)
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
  const [loading, setLoading] = useState(false)
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
    setLoading(true)
    void (async () => {
      try {
        const [posts, media] = await Promise.all([listSavedPosts(selectedId), listMediaBank(selectedId)])
        setSaved(posts)
        setBank(media)
      } catch (e: any) {
        toast({ title: 'Could not load Library', description: String(e?.message ?? ''), variant: 'error' })
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedId, toast])

  useEffect(() => {
    refresh()
  }, [refresh])

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
    (id: string, patch: Partial<Pick<SavedPost, 'status' | 'scheduledAt'>>, label: string) => {
      if (!selectedId) return
      void (async () => {
        try {
          const next = await updateSavedPost(selectedId, id, patch)
          setSaved((prev) => prev.map((p) => (p.id === id ? next : p)))
          toast({ title: label, variant: 'success' })
        } catch (e: any) {
          toast({ title: 'Update failed', description: String(e?.message ?? ''), variant: 'error' })
        }
      })()
    },
    [selectedId, toast],
  )

  const patchBank = useCallback(
    (id: string, patch: Partial<Pick<MediaBankItem, 'status' | 'scheduledAt'>>, label: string) => {
      if (!selectedId) return
      void (async () => {
        try {
          const next = await updateMediaBankItem(selectedId, id, patch)
          setBank((prev) => prev.map((m) => (m.id === id ? next : m)))
          toast({ title: label, variant: 'success' })
        } catch (e: any) {
          toast({ title: 'Update failed', description: String(e?.message ?? ''), variant: 'error' })
        }
      })()
    },
    [selectedId, toast],
  )

  const removeSaved = useCallback(
    (post: SavedPost) => {
      if (!selectedId) return
      void (async () => {
        try {
          await removeSavedPost(selectedId, post.id)
          setSaved((prev) => prev.filter((p) => p.id !== post.id))
          setSelectedSavedId(null)
          toast({ title: 'Removed from Library', variant: 'default' })
        } catch (e: any) {
          toast({ title: 'Remove failed', description: String(e?.message ?? ''), variant: 'error' })
        }
      })()
    },
    [selectedId, toast],
  )

  const removeBank = useCallback(
    (item: MediaBankItem) => {
      if (!selectedId) return
      void (async () => {
        try {
          await removeMediaBankItem(selectedId, item.id)
          setBank((prev) => prev.filter((m) => m.id !== item.id))
          setSelectedBankId(null)
          toast({ title: 'Removed', variant: 'default' })
        } catch (e: any) {
          toast({ title: 'Remove failed', description: String(e?.message ?? ''), variant: 'error' })
        }
      })()
    },
    [selectedId, toast],
  )

  // Persist an editor Done from the detail PostContainer: overlay layers always,
  // plus the replacement visual when the session produced a new object URL.
  const persistSavedEdit = useCallback(
    (
      post: SavedPost,
      edit: { blocks: SavedPost['blocks']; gifLayer: SavedPost['gifLayer']; aspect: number | null; url: string | null; kind: 'image' | 'video' },
    ) => {
      if (!selectedId) return
      void (async () => {
        try {
          let next = post
          if (edit.url?.startsWith('blob:')) {
            const dataUrl = await blobUrlToDataUrl(edit.url)
            if (dataUrl) next = await updateSavedPostMedia(selectedId, post.id, { dataUrl, mediaType: edit.kind })
          }
          next = await updateSavedPost(selectedId, post.id, { blocks: edit.blocks, aspect: edit.aspect, gifLayer: edit.gifLayer })
          setSaved((prev) => prev.map((p) => (p.id === post.id ? next : p)))
          toast({ title: 'Edits saved to Library', variant: 'success' })
        } catch (e: any) {
          toast({ title: 'Could not save edits', description: String(e?.message ?? ''), variant: 'error' })
        }
      })()
    },
    [selectedId, toast],
  )

  const persistBankEdit = useCallback(
    (
      item: MediaBankItem,
      edit: { blocks: MediaBankItem['blocks']; gifLayer: MediaBankItem['gifLayer']; aspect: number | null; url: string | null; kind: 'image' | 'video' },
    ) => {
      if (!selectedId) return
      void (async () => {
        try {
          let patch: Parameters<typeof updateMediaBankItem>[2] = { blocks: edit.blocks, aspect: edit.aspect, gifLayer: edit.gifLayer }
          if (edit.url?.startsWith('blob:')) {
            const dataUrl = await blobUrlToDataUrl(edit.url)
            if (dataUrl) patch = { ...patch, fileDataUrl: dataUrl, mediaType: edit.kind }
          }
          const next = await updateMediaBankItem(selectedId, item.id, patch)
          setBank((prev) => prev.map((m) => (m.id === item.id ? next : m)))
          toast({ title: 'Edits saved', variant: 'success' })
        } catch (e: any) {
          toast({ title: 'Could not save edits', description: String(e?.message ?? ''), variant: 'error' })
        }
      })()
    },
    [selectedId, toast],
  )

  const handleDownloadSaved = useCallback(
    async (post: SavedPost) => {
      const src = savedPostSrc(post)
      if (!src) {
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
              { url: src, mediaType: 'video', blocks: post.blocks, memeUrl: post.memeUrl, gifLayer: post.gifLayer },
              `${base}.webm`,
              () => toast({ title: 'Saved as still image', description: 'Video recording is unsupported here — exported one frame with text.', variant: 'info' }),
            )
          } else {
            await exportImageWithOverlay(
              { url: src, mediaType: 'image', blocks: post.blocks, memeUrl: post.memeUrl, gifLayer: post.gifLayer },
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
      const result = await downloadFile(src, slugFilename(post.title ?? post.hook ?? 'post', post.mediaType))
      toast({
        title: result === 'downloaded' ? 'Download started' : 'Opened in a new tab',
        description: result === 'downloaded' ? undefined : 'The file could not be fetched directly.',
        variant: 'success',
      })
    },
    [toast],
  )

  const handleDownloadBank = useCallback(
    async (item: MediaBankItem) => {
      if (!item.fileUrl) {
        toast({ title: 'Media is still loading', variant: 'warning' })
        return
      }
      setDownloadingId(item.id)
      try {
        const result = await downloadFile(item.fileUrl, slugFilename(item.name, item.mediaType))
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
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast({ title: 'Please choose a photo or video file', variant: 'warning' })
        return
      }
      setUploading(true)
      try {
        const next = await addMediaBankItem(selectedId, { file })
        setBank((prev) => [next, ...prev])
        toast({ title: 'Added to Media Bank', description: 'Use it later from My Post.', variant: 'success' })
      } catch (e: any) {
        toast({ title: 'Upload failed', description: String(e?.message ?? ''), variant: 'error' })
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
        loading ? (
          <EmptyState title="Loading…" body="Fetching your saved posts for this brand." />
        ) : visibleSaved.length === 0 ? (
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
        loading ? (
          <EmptyState title="Loading…" body="Fetching your posts for this brand." />
        ) : myPosts.length === 0 ? (
          <EmptyState
            title="No posts yet"
            body="Upload photos or videos in My Media Bank and they will show up here as drafts."
          />
        ) : (
          <div className="w-full columns-1 gap-4 @min-[480px]:columns-2 @min-[720px]:columns-3 @min-[1000px]:columns-4 @min-[1280px]:columns-5">
            {myPosts.map((m) => (
              <BankCard key={m.id} item={m} onOpen={() => setSelectedBankId(m.id)} />
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
              {bank.length} {bank.length === 1 ? 'item' : 'items'} saved for this brand
            </span>
          </div>
          {bank.length === 0 ? (
            <EmptyState title="Media bank is empty" body="Upload photos or videos you want to reuse later." />
          ) : (
            <div className="w-full columns-1 gap-4 @min-[480px]:columns-2 @min-[720px]:columns-3 @min-[1000px]:columns-4 @min-[1280px]:columns-5">
              {bank.map((m) => (
                <BankCard key={m.id} item={m} onOpen={() => setSelectedBankId(m.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail dialog for the selected saved post — interactive PostContainer
          (Edit persists layers + replacement to the DB row) plus the Library
          workflow actions (Download / Schedule / Publish / Draft / Remove). */}
      <LibraryDetailDialog
        open={selectedSaved !== null}
        onOpenChange={(o) => !o && setSelectedSavedId(null)}
        title={selectedSaved?.title ?? 'Content'}
        subtitle={selectedSaved?.hook ?? selectedSaved?.body ?? null}
        status={selectedSaved?.status ?? 'draft'}
        needsAttention={selectedSaved?.needsAttention ?? false}
        scheduledAt={selectedSaved?.scheduledAt ?? null}
        meta={selectedSaved ? `${platformMeta(selectedSaved.platform).label} · ${typeLabel(selectedSaved.contentType) || selectedSaved.contentFormat.replace(/_/g, ' ')}` : ''}
        media={selectedSaved ? <SavedPostDetail post={selectedSaved} onApplyEdit={(p) => persistSavedEdit(selectedSaved, p)} /> : null}
        downloading={selectedSaved ? downloadingId === selectedSaved.id : false}
        canDownload={!!selectedSaved && !!savedPostSrc(selectedSaved)}
        onDownload={() => selectedSaved && void handleDownloadSaved(selectedSaved)}
        onSchedule={(iso) => selectedSaved && patchSaved(selectedSaved.id, { status: 'scheduled', scheduledAt: iso }, 'Scheduled')}
        onPublish={() => selectedSaved && patchSaved(selectedSaved.id, { status: 'published', scheduledAt: null }, 'Marked as published')}
        onDraft={() => selectedSaved && patchSaved(selectedSaved.id, { status: 'draft', scheduledAt: null }, 'Moved to drafts')}
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
        media={selectedBank ? <BankMediaDetail item={selectedBank} onApplyEdit={(p) => persistBankEdit(selectedBank, p)} /> : null}
        downloading={selectedBank ? downloadingId === selectedBank.id : false}
        canDownload={!!selectedBank?.fileUrl}
        onDownload={() => selectedBank && void handleDownloadBank(selectedBank)}
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
  // Same reusable media box as the Content Feed card: phone-capped width,
  // content-fitted aspect from the saved snapshot, contain-fit full frame,
  // and the same overlay engine — so text size/position match the feed.
  // ponytail: postSourceFromSavedPost runs per render — cheap object build,
  // no memo needed; PostMediaContainer owns measured aspect internally.
  const source = postSourceFromSavedPost(post)
  const isMeme = post.contentFormat === 'meme'
  return (
    <div className="mx-auto w-full max-w-[24rem]">
      <PostMediaContainer
        src={source.visualUrl}
        poster={source.posterUrl}
        alt={source.altText ?? undefined}
        mediaType={source.mediaType}
        aspect={source.aspect}
        resetKey={source.key}
        blocks={source.initialBlocks ?? []}
        gifLayer={source.initialGifLayer}
        memeSrc={isMeme ? source.memeUrl : null}
        memeAlt={post.hook ?? 'Meme overlay'}
        visualStatus={source.visualStatus}
        framed={false}
        className="w-full"
      />
    </div>
  )
}

function SavedPostDetail({
  post,
  onApplyEdit,
}: {
  post: SavedPost
  onApplyEdit: (patch: { blocks: SavedPost['blocks']; gifLayer: SavedPost['gifLayer']; aspect: number | null; url: string | null; kind: 'image' | 'video' }) => void
}) {
  return (
    <div className="mx-auto w-full max-w-[24rem]">
      <PostContainer
        key={post.id}
        source={postSourceFromSavedPost(post)}
        showPills={false}
        showReject={false}
        onApplyEdit={onApplyEdit}
        className="max-w-none"
      />
    </div>
  )
}

function BankMedia({ item }: { item: MediaBankItem }) {
  // Same reusable media box as the feed card — bank uploads render through
  // the identical width/aspect/overlay pipeline via postSourceFromBankItem.
  const source = postSourceFromBankItem(item)
  return (
    <div className="mx-auto w-full max-w-[24rem]">
      <PostMediaContainer
        src={source.visualUrl}
        alt={source.altText ?? undefined}
        mediaType={source.mediaType}
        aspect={source.aspect}
        resetKey={source.key}
        blocks={source.initialBlocks ?? []}
        gifLayer={source.initialGifLayer}
        visualStatus={source.visualStatus}
        framed={false}
        className="w-full"
      />
    </div>
  )
}

function BankMediaDetail({
  item,
  onApplyEdit,
}: {
  item: MediaBankItem
  onApplyEdit: (patch: { blocks: MediaBankItem['blocks']; gifLayer: MediaBankItem['gifLayer']; aspect: number | null; url: string | null; kind: 'image' | 'video' }) => void
}) {
  return (
    <div className="mx-auto w-full max-w-[24rem]">
      <PostContainer
        key={item.id}
        source={postSourceFromBankItem(item)}
        showPills={false}
        showReject={false}
        onApplyEdit={onApplyEdit}
        className="max-w-none"
      />
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

function BankCard({ item, onOpen }: { item: MediaBankItem; onOpen: () => void }) {
  return (
    <CardButton label={`Open ${item.name}`} onOpen={onOpen}>
      <BankMedia item={item} />
      <CardInfo
        status={item.status}
        title={item.name}
        summary={`${item.mediaType === 'video' ? 'Video' : 'Image'} · ${(item.size / 1024 / 1024).toFixed(1)} MB`}
        footer={item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString() : 'Not scheduled'}
      />
    </CardButton>
  )
}
