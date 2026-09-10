import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bookmark,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  LibraryBig,
  Search,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useCompany } from '@/context/CompanyContext'
import { cn } from '@/lib/utils'
import { EXPORT_FORMATS, type ExportFormatId } from '@/lib/exportOverlay'
import { platformMeta, typeLabel } from '@/components/feed/data'
import { isMemeVideoSrc } from '@/components/feed/MemeGifOverlay'
import PostContainer, { PostMediaContainer, postSourceFromBankItem, postSourceFromSavedPost } from '@/components/feed/PostContainer'
import { StatusBadge, ViewSwitcher } from '@/components/content/primitives'
import type { ViewMode } from '@/components/content/data'
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
// Content Library — redesigned around the Schedule → Post workflow.
//
// Layout (top → bottom):
//   header (title + Upload) → stats (Scheduled / Drafts / Attention, clickable)
//   → section tabs (My Content / My Post / Media Bank, with counts)
//   → toolbar (search + status pills + grid/list/calendar switcher)
//   → Up Next strip (next scheduled items across all tabs — "see the schedule")
//   → grid | list | calendar body
//
// Every card/row exposes the same two buttons: Schedule and Post. Both open
// the detail dialog (Schedule focuses the scheduler, Post publishes); the
// dialog itself is the single place for Schedule / Post now / Draft /
// Download / Remove so the user always knows where the options live.
// ---------------------------------------------------------------------------

type Tab = 'content' | 'post' | 'bank'
type SubTab = 'all' | 'scheduled' | 'draft' | 'published' | 'attention'
type Intent = 'schedule' | 'post' | null

const TABS: { value: Tab; label: string; icon: React.ElementType; hint: string }[] = [
  { value: 'content', label: 'Saved', icon: Bookmark, hint: 'Posts saved from the Content Feed' },
  { value: 'post', label: 'Posts', icon: FileText, hint: 'Your uploads with a schedule workflow' },
  { value: 'bank', label: 'Media', icon: LibraryBig, hint: 'Raw reusable media — no schedule needed' },
]

const SUB_TABS: { value: SubTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'attention', label: 'Need Attention' },
]

const VIEW_KEY = 'openslop.library.view'

function loadView(): ViewMode {
  const stored = localStorage.getItem(VIEW_KEY)
  return stored === 'list' || stored === 'calendar' ? stored : 'cards'
}

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

function matchesQuery(hay: string, q: string) {
  return hay.toLowerCase().includes(q)
}

function slugFilename(name: string, mediaType: 'image' | 'video') {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'media'
  return `${base}.${mediaType === 'video' ? 'mp4' : 'jpg'}`
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Not scheduled'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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
  const [view, setViewState] = useState<ViewMode>(loadView)
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState<SavedPost[]>([])
  const [bank, setBank] = useState<MediaBankItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadTarget, setDownloadTarget] = useState<{ kind: 'saved' | 'bank'; id: string } | null>(null)
  const [downloadFormat, setDownloadFormat] = useState<ExportFormatId>('9:16')

  // Media-type-aware suggestion: videos (or image memes carrying an MP4
  // overlay) → Reels 9:16 (MP4), plain images → 1:1 square feed post (PNG).
  // All ratios stay selectable; this only presets and badges the recommended one.
  const downloadSuggestion = useMemo(() => {
    if (!downloadTarget) return null
    const entry =
      downloadTarget.kind === 'saved'
        ? saved.find((p) => p.id === downloadTarget.id)
        : bank.find((m) => m.id === downloadTarget.id)
    const mediaType = entry?.mediaType
    const memeUrl = entry?.memeUrl ?? null
    const isVideo = mediaType === 'video' || (!!memeUrl && isMemeVideoSrc(memeUrl))
    return {
      isVideo,
      suggested: (isVideo ? '9:16' : '1:1') as ExportFormatId,
      note: isVideo
        ? 'Suggested for Instagram Reels & TikTok — full length plus 1 second, downloads as MP4.'
        : 'Suggested as a square Instagram feed post — downloads as PNG.',
    }
  }, [downloadTarget, saved, bank])
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null)
  const [, setIntent] = useState<Intent>(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [bulk, setBulk] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const setView = (v: ViewMode) => {
    setViewState(v)
    localStorage.setItem(VIEW_KEY, v)
  }

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

  const q = query.trim().toLowerCase()

  const visibleSaved = useMemo(
    () =>
      saved.filter(
        (p) =>
          matchesSub(p.status, p.needsAttention, sub) &&
          (!q || matchesQuery(`${p.title ?? ''} ${p.hook ?? ''} ${p.body ?? ''}`, q)),
      ),
    [saved, sub, q],
  )
  const visiblePosts = useMemo(
    () =>
      bank.filter(
        (m) => matchesSub(m.status, false, sub) && (!q || matchesQuery(m.name, q)),
      ),
    [bank, sub, q],
  )
  const visibleBank = useMemo(
    // Media tab is the raw asset bank — status filter does not apply here,
    // only search. Scheduling lives in the Posts tab.
    () => bank.filter((m) => !q || matchesQuery(m.name, q)),
    [bank, q],
  )

  // Global schedule queue across both sources — the "see the schedule" strip.
  const scheduledAll = useMemo(() => {
    const s = saved
      .filter((p) => p.status === 'scheduled' && p.scheduledAt)
      .map((p) => ({ kind: 'saved' as const, id: p.id, title: p.title ?? 'Content', at: p.scheduledAt! }))
    const b = bank
      .filter((m) => m.status === 'scheduled' && m.scheduledAt)
      .map((m) => ({ kind: 'bank' as const, id: m.id, title: m.name, at: m.scheduledAt! }))
    return [...s, ...b].sort((a, b2) => new Date(a.at).getTime() - new Date(b2.at).getTime())
  }, [saved, bank])

  const counts = useMemo(
    () => ({
      content: saved.length,
      post: bank.length,
      bank: bank.length,
      scheduled: scheduledAll.length,
      drafts: saved.filter((p) => p.status === 'draft').length + bank.filter((m) => m.status === 'draft').length,
      attention: saved.filter((p) => p.needsAttention).length,
    }),
    [saved, bank, scheduledAll],
  )

  const selectedSaved = selectedSavedId ? (saved.find((p) => p.id === selectedSavedId) ?? null) : null
  const selectedBank = selectedBankId ? (bank.find((m) => m.id === selectedBankId) ?? null) : null

  const openSaved = (id: string, intent: Intent = null) => {
    setIntent(intent)
    setSelectedSavedId(id)
  }
  const openBank = (id: string, intent: Intent = null) => {
    setIntent(intent)
    setSelectedBankId(id)
  }

  const patchSaved = useCallback(
    (id: string, patch: Partial<Pick<SavedPost, 'status' | 'scheduledAt' | 'title' | 'hook' | 'body'>>, label: string) => {
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
    (id: string, patch: Partial<Pick<MediaBankItem, 'status' | 'scheduledAt' | 'name'>>, label: string) => {
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

  // Details editing — title/caption (saved) or name (bank) via backend PATCH.
  const saveSavedDetails = useCallback(
    (post: SavedPost, patch: { title?: string; hook?: string; body?: string }) => {
      if (!selectedId) return
      setSavingDetails(true)
      void (async () => {
        try {
          const next = await updateSavedPost(selectedId, post.id, patch)
          setSaved((prev) => prev.map((p) => (p.id === post.id ? next : p)))
          toast({ title: 'Details saved', variant: 'success' })
        } catch (e: any) {
          toast({ title: 'Save failed', description: String(e?.message ?? ''), variant: 'error' })
        } finally {
          setSavingDetails(false)
        }
      })()
    },
    [selectedId, toast],
  )

  const saveBankDetails = useCallback(
    (item: MediaBankItem, patch: { name?: string }) => {
      if (!selectedId) return
      setSavingDetails(true)
      void (async () => {
        try {
          const next = await updateMediaBankItem(selectedId, item.id, patch)
          setBank((prev) => prev.map((m) => (m.id === item.id ? next : m)))
          toast({ title: 'Details saved', variant: 'success' })
        } catch (e: any) {
          toast({ title: 'Save failed', description: String(e?.message ?? ''), variant: 'error' })
        } finally {
          setSavingDetails(false)
        }
      })()
    },
    [selectedId, toast],
  )

  // Items within ±30 min of `iso` (excluding `excludeId`) — double-booking warning.
  const conflictsFor = useCallback(
    (iso: string | null, excludeId: string | null) => {
      if (!iso) return []
      const t = new Date(iso).getTime()
      if (Number.isNaN(t)) return []
      const out: { title: string; at: string }[] = []
      for (const p of saved) {
        if (p.id === excludeId || !p.scheduledAt) continue
        if (Math.abs(new Date(p.scheduledAt).getTime() - t) <= 30 * 60 * 1000) out.push({ title: p.title ?? 'Content', at: p.scheduledAt })
      }
      for (const m of bank) {
        if (m.id === excludeId || !m.scheduledAt) continue
        if (Math.abs(new Date(m.scheduledAt).getTime() - t) <= 30 * 60 * 1000) out.push({ title: m.name, at: m.scheduledAt })
      }
      return out.slice(0, 3)
    },
    [saved, bank],
  )

  // Unscheduled drafts for the calendar "schedule here" picker.
  const unscheduled = useMemo(() => {
    const s = saved
      .filter((p) => !p.scheduledAt && p.status === 'draft')
      .map((p) => ({ kind: 'saved' as const, id: p.id, title: p.title ?? 'Content' }))
    const b = bank
      .filter((m) => !m.scheduledAt && m.status === 'draft')
      .map((m) => ({ kind: 'bank' as const, id: m.id, title: m.name }))
    return [...s, ...b].slice(0, 6)
  }, [saved, bank])

  const scheduleAtDay = useCallback(
    (kind: 'saved' | 'bank', id: string, day: Date) => {
      const at = new Date(day)
      at.setHours(9, 0, 0, 0)
      const iso = at.toISOString()
      if (kind === 'saved') patchSaved(id, { status: 'scheduled', scheduledAt: iso }, `Scheduled · ${formatWhen(iso)}`)
      else patchBank(id, { status: 'scheduled', scheduledAt: iso }, `Scheduled · ${formatWhen(iso)}`)
    },
    [patchSaved, patchBank],
  )

  // Bulk actions — parallel PATCH/DELETE over existing endpoints (no backend change).
  const toggleBulk = useCallback((key: string) => {
    setBulk((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const bulkRun = useCallback(
    (label: string, fn: (companyId: string, kind: 'saved' | 'bank', id: string) => Promise<unknown>) => {
      if (!selectedId || bulk.size === 0) return
      setBulkBusy(true)
      void (async () => {
        try {
          await Promise.all(
            [...bulk].map((key) => {
              const [kind, id] = key.split(':') as ['saved' | 'bank', string]
              return fn(selectedId, kind, id)
            }),
          )
          refresh()
          setBulk(new Set())
          toast({ title: label, variant: 'success' })
        } catch (e: any) {
          toast({ title: 'Bulk action failed', description: String(e?.message ?? ''), variant: 'error' })
        } finally {
          setBulkBusy(false)
        }
      })()
    },
    [selectedId, bulk, refresh, toast],
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
    async (post: SavedPost, format: ExportFormatId = '9:16') => {
      const src = savedPostSrc(post)
      if (!src) {
        toast({ title: 'No file to download', variant: 'warning' })
        return
      }
      // Routing follows the real file, not the stored mediaType label —
      // a video mislabeled "image" would otherwise download whole (e.g.
      // the 27s original). Videos record full length + 1s tail; an MP4
      // meme overlay on an image base records meme length + 1s.
      // ponytail: isMemeVideoSrc is the single video-meme detector (feed overlay).
      const hasVideoMeme = !!post.memeUrl && isMemeVideoSrc(post.memeUrl)
      const storedVideo = post.mediaType === 'video' || hasVideoMeme
      // Spinner covers the probe below so double-clicks can't queue two bakes.
      setDownloadingId(post.id)
      let probedSecs: number | null = null
      try {
        const { probeVideoDuration } = await import('@/lib/exportOverlay')
        probedSecs = await probeVideoDuration(src)
      } catch {
        probedSecs = null
      }
      const baseIsVideo = probedSecs !== null || post.mediaType === 'video'
      if (post.blocks.length > 0 || storedVideo || baseIsVideo) {
        try {
          const { exportImageWithOverlay, exportVideoWithOverlay, exportImageWithAnimatedMeme, probeVideoDuration, EXPORT_FORMATS } = await import('@/lib/exportOverlay')
          const { W, H } = EXPORT_FORMATS[format] ?? EXPORT_FORMATS['9:16']
          const base = slugFilename(post.title ?? post.hook ?? 'post', post.mediaType).replace(/\.(mp4|jpg)$/i, '')
          const tag = `${W}x${H}`
          const stillFallback = () => toast({ title: 'Saved as still image', description: 'Video recording is unsupported here — exported one frame with text.', variant: 'info' })
          const secsNote = (s: number | null) => (s !== null ? ` ~${Math.round(s + 1)}s clip (full length + 1s).` : '')
          // ponytail: one diagnostic line so a bad download is traceable from a screenshot.
          console.info('[download]', { kind: 'saved', id: post.id, stored: post.mediaType, probedSecs, hasVideoMeme, route: baseIsVideo ? 'video' : hasVideoMeme ? 'meme' : 'image' })
          if (baseIsVideo) {
            const result = await exportVideoWithOverlay(
              { url: src, mediaType: 'video', blocks: post.blocks, memeUrl: post.memeUrl, gifLayer: post.gifLayer },
              `${base}_${tag}.webm`,
              format,
              stillFallback,
            )
            if (result === 'mp4') {
              toast({ title: 'Download started', description: `MP4 ${tag} with your overlay text — ready for Instagram & TikTok.${secsNote(probedSecs)}`, variant: 'success' })
            } else if (result === 'webm') {
              toast({ title: 'MP4 conversion failed', description: `Downloaded WebM instead — convert to MP4 before uploading.${secsNote(probedSecs)}`, variant: 'warning' })
            } else {
              toast({ title: 'Download started', description: 'Still frame with your overlay text.', variant: 'success' })
            }
          } else if (hasVideoMeme && post.memeUrl) {
            const memeSecs = await probeVideoDuration(post.memeUrl)
            const result = await exportImageWithAnimatedMeme(
              { url: src, mediaType: 'image', blocks: post.blocks, memeUrl: post.memeUrl, gifLayer: post.gifLayer },
              `${base}_${tag}.webm`,
              format,
              stillFallback,
            )
            if (result === 'mp4') {
              toast({ title: 'Download started', description: `MP4 ${tag} with the animated meme — ready for Instagram & TikTok.${secsNote(memeSecs)}`, variant: 'success' })
            } else if (result === 'webm') {
              toast({ title: 'MP4 conversion failed', description: `Downloaded WebM instead — convert to MP4 before uploading.${secsNote(memeSecs)}`, variant: 'warning' })
            } else {
              toast({ title: 'Download started', description: 'Still frame with the meme overlay.', variant: 'success' })
            }
          } else {
            await exportImageWithOverlay(
              { url: src, mediaType: 'image', blocks: post.blocks, memeUrl: post.memeUrl, gifLayer: post.gifLayer },
              `${base}_${tag}.png`,
              format,
            )
            toast({ title: 'Download started', description: `PNG ${tag} with your overlay text — ready for Instagram & TikTok.`, variant: 'success' })
          }
          return
        } catch {
          if (storedVideo || baseIsVideo) {
            // Never silently hand back the full-length original for video —
            // the whole point of the bake is the 5s cap.
            toast({ title: 'Could not prepare this video', description: 'Please try again — the original file was not downloaded.', variant: 'error' })
            return
          }
          toast({ title: 'Baking text failed', description: 'Downloading the original file instead.', variant: 'warning' })
        } finally {
          setDownloadingId(null)
        }
      }
      // Raw originals are images only here — every video bakes above.
      try {
        const result = await downloadFile(src, slugFilename(post.title ?? post.hook ?? 'post', post.mediaType))
        toast({
          title: result === 'downloaded' ? 'Download started' : 'Opened in a new tab',
          description: result === 'downloaded' ? undefined : 'The file could not be fetched directly.',
          variant: 'success',
        })
      } finally {
        setDownloadingId(null)
      }
    },
    [toast],
  )

  const handleDownloadBank = useCallback(
    async (item: MediaBankItem, format: ExportFormatId = '9:16') => {
      if (!item.fileUrl) {
        toast({ title: 'Media is still loading', variant: 'warning' })
        return
      }
      // Same rule as saved posts: routing follows the real file, not the
      // stored label. Videos record full length + 1s tail; an MP4 meme
      // overlay on an image records meme length + 1s.
      // ponytail: isMemeVideoSrc is the single video-meme detector (feed overlay).
      const hasVideoMeme = !!item.memeUrl && isMemeVideoSrc(item.memeUrl)
      const storedVideo = item.mediaType === 'video' || hasVideoMeme
      // Spinner covers the probe below so double-clicks can't queue two bakes.
      setDownloadingId(item.id)
      let probedSecs: number | null = null
      try {
        const { probeVideoDuration } = await import('@/lib/exportOverlay')
        probedSecs = await probeVideoDuration(item.fileUrl)
      } catch {
        probedSecs = null
      }
      const baseIsVideo = probedSecs !== null || item.mediaType === 'video'
      if (item.blocks.length > 0 || storedVideo || baseIsVideo) {
        try {
          const { exportImageWithOverlay, exportVideoWithOverlay, exportImageWithAnimatedMeme, probeVideoDuration, EXPORT_FORMATS } = await import('@/lib/exportOverlay')
          const { W, H } = EXPORT_FORMATS[format] ?? EXPORT_FORMATS['9:16']
          const base = slugFilename(item.name, item.mediaType).replace(/\.(mp4|jpg)$/i, '')
          const tag = `${W}x${H}`
          const stillFallback = () => toast({ title: 'Saved as still image', description: 'Video recording is unsupported here — exported one frame with text.', variant: 'info' })
          const secsNote = (s: number | null) => (s !== null ? ` ~${Math.round(s + 1)}s clip (full length + 1s).` : '')
          // ponytail: one diagnostic line so a bad download is traceable from a screenshot.
          console.info('[download]', { kind: 'bank', id: item.id, stored: item.mediaType, probedSecs, hasVideoMeme, route: baseIsVideo ? 'video' : hasVideoMeme ? 'meme' : 'image' })
          if (baseIsVideo) {
            const result = await exportVideoWithOverlay(
              { url: item.fileUrl, mediaType: 'video', blocks: item.blocks, memeUrl: item.memeUrl, gifLayer: item.gifLayer },
              `${base}_${tag}.webm`,
              format,
              stillFallback,
            )
            toast({
              title: result === 'mp4' ? 'Download started' : result === 'webm' ? 'MP4 conversion failed' : 'Download started',
              description: result === 'mp4' ? `MP4 ${tag} with your overlay text — ready for Instagram & TikTok.${secsNote(probedSecs)}` : result === 'webm' ? `Downloaded WebM instead — convert to MP4 before uploading.${secsNote(probedSecs)}` : 'Still frame with your overlay text.',
              variant: result === 'webm' ? 'warning' : 'success',
            })
          } else if (hasVideoMeme && item.memeUrl) {
            const memeSecs = await probeVideoDuration(item.memeUrl)
            const result = await exportImageWithAnimatedMeme(
              { url: item.fileUrl, mediaType: 'image', blocks: item.blocks, memeUrl: item.memeUrl, gifLayer: item.gifLayer },
              `${base}_${tag}.webm`,
              format,
              stillFallback,
            )
            toast({
              title: result === 'mp4' ? 'Download started' : result === 'webm' ? 'MP4 conversion failed' : 'Download started',
              description: result === 'mp4' ? `MP4 ${tag} with the animated meme — ready for Instagram & TikTok.${secsNote(memeSecs)}` : result === 'webm' ? `Downloaded WebM instead — convert to MP4 before uploading.${secsNote(memeSecs)}` : 'Still frame with the meme overlay.',
              variant: result === 'webm' ? 'warning' : 'success',
            })
          } else {
            await exportImageWithOverlay(
              { url: item.fileUrl, mediaType: 'image', blocks: item.blocks, memeUrl: item.memeUrl, gifLayer: item.gifLayer },
              `${base}_${tag}.png`,
              format,
            )
            toast({ title: 'Download started', description: `PNG ${tag} with your overlay text — ready for Instagram & TikTok.`, variant: 'success' })
          }
          return
        } catch {
          if (storedVideo || baseIsVideo) {
            // Never silently hand back the full-length original for video.
            toast({ title: 'Could not prepare this video', description: 'Please try again — the original file was not downloaded.', variant: 'error' })
            return
          }
          toast({ title: 'Baking text failed', description: 'Downloading the original file instead.', variant: 'warning' })
        } finally {
          setDownloadingId(null)
        }
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

  // Text layers, video memes, or stored videos open the format picker
  // before baking (video → Reels 9:16, image → 1:1). Stored-plain-images
  // without text download direct — the handler probes the real file and
  // bakes on the spot if it's actually video.
  const requestDownload = useCallback(
    (target: { kind: 'saved' | 'bank'; id: string }) => {
      const entry =
        target.kind === 'saved'
          ? saved.find((p) => p.id === target.id)
          : bank.find((m) => m.id === target.id)
      const needsBake =
        (entry?.blocks.length ?? 0) > 0 || entry?.mediaType === 'video' || (!!entry?.memeUrl && isMemeVideoSrc(entry.memeUrl))
      if (!needsBake) {
        if (target.kind === 'saved') {
          const post = saved.find((p) => p.id === target.id)
          if (post) void handleDownloadSaved(post, '9:16')
        } else {
          const item = bank.find((m) => m.id === target.id)
          if (item) void handleDownloadBank(item, '9:16')
        }
        return
      }
      const isVideo = entry?.mediaType === 'video' || (!!entry?.memeUrl && isMemeVideoSrc(entry.memeUrl))
      setDownloadFormat(isVideo ? '9:16' : '1:1')
      setDownloadTarget(target)
    },
    [saved, bank, handleDownloadSaved, handleDownloadBank],
  )

  const runPickerDownload = useCallback(() => {
    if (!downloadTarget) return
    const target = downloadTarget
    setDownloadTarget(null)
    if (target.kind === 'saved') {
      const post = saved.find((p) => p.id === target.id)
      if (post) void handleDownloadSaved(post, downloadFormat)
    } else {
      const item = bank.find((m) => m.id === target.id)
      if (item) void handleDownloadBank(item, downloadFormat)
    }
  }, [downloadTarget, downloadFormat, saved, bank, handleDownloadSaved, handleDownloadBank])

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
        toast({ title: 'Added to Media Bank', description: 'Schedule or post it from Posts.', variant: 'success' })
      } catch (e: any) {
        toast({ title: 'Upload failed', description: String(e?.message ?? ''), variant: 'error' })
      } finally {
        setUploading(false)
      }
    },
    [selectedId, toast],
  )

  // Clear bulk selection when the visible set changes.
  useEffect(() => {
    setBulk(new Set())
  }, [tab, sub, query])

  const bodyItems: { saved: SavedPost[]; bank: MediaBankItem[] } = useMemo(() => {
    if (tab === 'content') return { saved: visibleSaved, bank: [] }
    if (tab === 'post') return { saved: [], bank: visiblePosts }
    return { saved: [], bank: visibleBank }
  }, [tab, visibleSaved, visiblePosts, visibleBank])

  const isEmpty = bodyItems.saved.length === 0 && bodyItems.bank.length === 0

  return (
    <div className="grid gap-5 @container">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Saved posts, your uploads, and reusable media — schedule and post from one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <ViewSwitcher value={view} onChange={setView} />
          <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || !selectedId}>
            <Upload className="size-4" data-icon="inline-start" />
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </div>

      {/* Stats — clickable shortcuts into the status filter */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'scheduled' as SubTab, label: 'Scheduled', value: counts.scheduled, icon: Clock },
          { key: 'draft' as SubTab, label: 'Drafts', value: counts.drafts, icon: FileText },
          { key: 'attention' as SubTab, label: 'Need attention', value: counts.attention, icon: AlertTriangle },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSub((cur) => (cur === s.key ? 'all' : s.key))}
            aria-pressed={sub === s.key}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/20',
              sub === s.key && 'border-foreground/30 bg-muted/40',
            )}
          >
            <s.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="grid">
              <span className="text-lg leading-none font-semibold tabular-nums">{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Section tabs with counts */}
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Library sections">
        {TABS.map((t) => {
          const n = t.value === 'content' ? counts.content : t.value === 'post' ? counts.post : counts.bank
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              type="button"
              title={t.hint}
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
              <span className={cn('text-xs tabular-nums', tab === t.value ? 'text-background/60' : 'text-muted-foreground/60')}>
                {n}
              </span>
            </button>
          )
        })}
        <span className="ml-1 hidden text-xs text-muted-foreground @min-[720px]:block">
          {tab === 'content' ? 'Saved from the feed' : tab === 'post' ? 'Uploads with a schedule workflow' : 'Raw media — schedule from Posts'}
        </span>
      </div>

      {/* Toolbar: search + status pills (status hidden on Media — raw assets) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'content' ? 'Search saved posts…' : 'Search media…'}
            className="w-52 pl-8"
            aria-label="Search library"
          />
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
      </div>

      {/* Bulk bar — appears when 1+ rows/cards are selected */}
      {bulk.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-foreground px-3 py-2 text-background">
          <span className="text-xs font-semibold tabular-nums">{bulk.size} selected</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulkRun('Posted', (c, k, id) => (k === 'saved' ? updateSavedPost(c, id, { status: 'published', scheduledAt: null }) : updateMediaBankItem(c, id, { status: 'published', scheduledAt: null })))} aria-label="Post selected now">
              <Send className="size-3.5" data-icon="inline-start" />
              Post now
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulkRun('Moved to drafts', (c, k, id) => (k === 'saved' ? updateSavedPost(c, id, { status: 'draft', scheduledAt: null }) : updateMediaBankItem(c, id, { status: 'draft', scheduledAt: null })))} aria-label="Move selected to drafts">
              Drafts
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={bulkBusy} onClick={() => bulkRun('Removed', (c, k, id) => (k === 'saved' ? removeSavedPost(c, id) : removeMediaBankItem(c, id)))} aria-label="Delete selected">
              <Trash2 className="size-3.5" data-icon="inline-start" />
              Delete
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-background/80 hover:text-background" disabled={bulkBusy} onClick={() => setBulk(new Set())}>
              Clear
            </Button>
          </span>
        </div>
      )}

      {/* Up Next — the visible schedule queue */}
      {scheduledAll.length > 0 && (
        <section aria-label="Up next" className="grid gap-2 rounded-xl border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <CalendarDays className="size-3.5" />
            Up next · {scheduledAll.length} scheduled
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {scheduledAll.slice(0, 8).map((s) => (
              <button
                key={`${s.kind}-${s.id}`}
                type="button"
                onClick={() => (s.kind === 'saved' ? openSaved(s.id, 'schedule') : openBank(s.id, 'schedule'))}
                className="flex min-w-44 items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors hover:border-foreground/25"
                title={`Open schedule for ${s.title}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-info/10 text-xs font-bold text-info tabular-nums">
                  {new Date(s.at).getDate()}
                </span>
                <span className="grid min-w-0">
                  <span className="truncate text-xs font-medium">{s.title}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{formatWhen(s.at)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Body */}
      {loading ? (
        <EmptyState title="Loading…" body="Fetching your library for this brand." />
      ) : view === 'calendar' ? (
        <ScheduleCalendar
          saved={saved}
          bank={bank}
          unscheduled={unscheduled}
          onScheduleAt={scheduleAtDay}
          onOpenSaved={(id) => openSaved(id, 'schedule')}
          onOpenBank={(id) => openBank(id, 'schedule')}
        />
      ) : isEmpty ? (
        <EmptyState
          title={tab === 'content' ? 'Nothing here yet' : tab === 'post' ? 'No posts yet' : 'Media is empty'}
          body={
            tab === 'content'
              ? 'Save posts from the Content Feed with the Review button and they will appear here.'
              : tab === 'post'
                ? 'Upload photos or videos with the Upload button, then schedule or post them.'
                : 'Upload raw photos or videos to reuse later. Scheduling lives in the Posts tab.'
          }
          actionLabel={tab === 'content' ? undefined : uploading ? 'Uploading…' : 'Upload photo or video'}
          onAction={tab === 'content' ? undefined : () => fileRef.current?.click()}
        />
      ) : view === 'list' ? (
        <div className="grid gap-2">
          {bodyItems.saved.map((p) => (
            <LibraryRow
              key={p.id}
              thumb={savedPostSrc(p)}
              mediaType={p.mediaType}
              status={p.status}
              needsAttention={p.needsAttention}
              title={p.title ?? 'Content'}
              meta={`${platformMeta(p.platform).label} · ${typeLabel(p.contentType) || p.contentFormat.replace(/_/g, ' ')}`}
              when={p.scheduledAt}
              selected={bulk.has(`saved:${p.id}`)}
              onToggleSelect={() => toggleBulk(`saved:${p.id}`)}
              onOpen={() => openSaved(p.id)}
              onSchedule={() => openSaved(p.id, 'schedule')}
              onPost={() => patchSaved(p.id, { status: 'published', scheduledAt: null }, 'Posted')}
            />
          ))}
          {bodyItems.bank.map((m) => (
            <LibraryRow
              key={m.id}
              thumb={m.fileUrl}
              mediaType={m.mediaType}
              status={m.status}
              title={m.name}
              meta={`${m.mediaType === 'video' ? 'Video' : 'Image'} · ${(m.size / 1024 / 1024).toFixed(1)} MB`}
              when={m.scheduledAt}
              selected={bulk.has(`bank:${m.id}`)}
              onToggleSelect={() => toggleBulk(`bank:${m.id}`)}
              onOpen={() => openBank(m.id)}
              onSchedule={() => openBank(m.id, 'schedule')}
              onPost={() => patchBank(m.id, { status: 'published', scheduledAt: null }, 'Posted')}
            />
          ))}
        </div>
      ) : (
        <div className="w-full columns-1 gap-4 @min-[480px]:columns-2 @min-[720px]:columns-3 @min-[1000px]:columns-4 @min-[1280px]:columns-5">
          {bodyItems.saved.map((p) => (
            <SavedCard key={p.id} post={p} selected={bulk.has(`saved:${p.id}`)} onToggleSelect={() => toggleBulk(`saved:${p.id}`)} onOpen={() => openSaved(p.id)} onSchedule={() => openSaved(p.id, 'schedule')} onPost={() => patchSaved(p.id, { status: 'published', scheduledAt: null }, 'Posted')} />
          ))}
          {bodyItems.bank.map((m) => (
            <BankCard key={m.id} item={m} selected={bulk.has(`bank:${m.id}`)} onToggleSelect={() => toggleBulk(`bank:${m.id}`)} onOpen={() => openBank(m.id)} onSchedule={() => openBank(m.id, 'schedule')} onPost={() => patchBank(m.id, { status: 'published', scheduledAt: null }, 'Posted')} />
          ))}
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
        media={selectedSaved ? <SavedPostDetail post={selectedSaved} onApplyEdit={(p) => persistSavedEdit(selectedSaved, p)} /> : null}
        downloading={selectedSaved ? downloadingId === selectedSaved.id : false}
        canDownload={!!selectedSaved && !!savedPostSrc(selectedSaved)}
        onDownload={() => selectedSaved && requestDownload({ kind: 'saved', id: selectedSaved.id })}
        onSchedule={(iso) => selectedSaved && patchSaved(selectedSaved.id, { status: 'scheduled', scheduledAt: iso }, `Scheduled · ${formatWhen(iso)}`)}
        onPublish={() => selectedSaved && patchSaved(selectedSaved.id, { status: 'published', scheduledAt: null }, 'Posted — caption copied ready to paste')}
        onDraft={() => selectedSaved && patchSaved(selectedSaved.id, { status: 'draft', scheduledAt: null }, 'Moved to drafts')}
        onRemove={() => selectedSaved && removeSaved(selectedSaved)}
        initialTitle={selectedSaved?.title ?? 'Content'}
        initialCaption={selectedSaved?.hook ?? selectedSaved?.body ?? ''}
        savingDetails={savingDetails}
        onSaveDetails={(patch) => selectedSaved && saveSavedDetails(selectedSaved, patch)}
        conflicts={selectedSaved ? conflictsFor(selectedSaved.scheduledAt, selectedSaved.id) : []}
        captionText={selectedSaved?.hook ?? selectedSaved?.body ?? null}
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
        onDownload={() => selectedBank && requestDownload({ kind: 'bank', id: selectedBank.id })}
        onSchedule={(iso) => selectedBank && patchBank(selectedBank.id, { status: 'scheduled', scheduledAt: iso }, `Scheduled · ${formatWhen(iso)}`)}
        onPublish={() => selectedBank && patchBank(selectedBank.id, { status: 'published', scheduledAt: null }, 'Posted')}
        onDraft={() => selectedBank && patchBank(selectedBank.id, { status: 'draft', scheduledAt: null }, 'Moved to drafts')}
        onRemove={() => selectedBank && removeBank(selectedBank)}
        initialTitle={selectedBank?.name ?? 'Media'}
        initialCaption={null}
        isBank
        savingDetails={savingDetails}
        onSaveDetails={(patch) => selectedBank && patch.name !== undefined && saveBankDetails(selectedBank, { name: patch.name })}
        conflicts={selectedBank ? conflictsFor(selectedBank.scheduledAt, selectedBank.id) : []}
      />

      {/* Download format picker — per-post IG/TikTok frame choice */}
      <Dialog open={downloadTarget !== null} onOpenChange={(o) => !o && setDownloadTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-left">
              {downloadSuggestion?.isVideo ? 'Download for Reels' : 'Download post'}
            </DialogTitle>
            <DialogDescription className="text-left">
              {downloadSuggestion?.note ?? 'Text is baked at download size and the frame is full-bleed.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5" role="radiogroup" aria-label="Export format">
            {(Object.keys(EXPORT_FORMATS) as ExportFormatId[]).map((f) => {
              const meta = EXPORT_FORMATS[f]
              const active = downloadFormat === f
              const isSuggested = downloadSuggestion?.suggested === f
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDownloadFormat(f)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    active ? 'border-foreground bg-muted/50 font-medium' : 'hover:bg-muted/40',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {meta.label}
                    {isSuggested && (
                      <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-semibold text-background">
                        Suggested
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {meta.W}×{meta.H}
                  </span>
                </button>
              )
            })}
          </div>
          <Button type="button" onClick={runPickerDownload} disabled={downloadingId !== null}>
            <Download className="size-4" data-icon="inline-start" />
            {downloadingId !== null ? 'Preparing…' : downloadSuggestion?.isVideo ? 'Download MP4' : 'Download PNG'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <div className="grid max-w-sm gap-1.5 justify-items-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        {actionLabel && onAction && (
          <Button type="button" size="sm" className="mt-2" onClick={onAction}>
            <Upload className="size-3.5" data-icon="inline-start" />
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clickable card shell — now with always-visible Schedule / Post buttons so
// the workflow is discoverable without opening the dialog first.
// ---------------------------------------------------------------------------

function CardButton({ label, onOpen, selected, onToggleSelect, children }: { label: string; onOpen: () => void; selected?: boolean; onToggleSelect?: () => void; children: React.ReactNode }) {
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
      className="group relative mb-4 break-inside-avoid cursor-pointer outline-none"
    >
      {onToggleSelect && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={`Select ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className={cn(
            'absolute top-2 left-2 z-10 grid size-6 place-items-center rounded-md border bg-background/90 shadow-xs transition-opacity',
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <span className={cn('grid size-3.5 place-items-center rounded border text-[10px] leading-none', selected && 'border-foreground bg-foreground text-background')}>
            {selected ? '✓' : ''}
          </span>
        </button>
      )}
      <div className={cn('overflow-hidden rounded-xl border bg-card transition-colors outline-none group-hover:border-foreground/20 group-focus-visible:ring-3 group-focus-visible:ring-ring/50', selected && 'border-foreground/50 ring-2 ring-foreground/20')}>
        {children}
      </div>
    </div>
  )
}

function QuickActions({ when, onSchedule, onPost }: { when: string | null; onSchedule: () => void; onPost: () => void }) {
  return (
    <div className="flex items-center gap-1.5 border-t bg-muted/30 px-3 py-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onSchedule}
        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border bg-background px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        aria-label={when ? `Reschedule, currently ${formatWhen(when)}` : 'Schedule'}
        title={when ? `Scheduled · ${formatWhen(when)} — click to reschedule` : 'Schedule'}
      >
        <CalendarPlus className="size-3.5 text-muted-foreground" />
        {when ? formatWhen(when) : 'Schedule'}
      </button>
      <button
        type="button"
        onClick={onPost}
        className="inline-flex items-center justify-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
        aria-label="Post now"
        title="Post now"
      >
        <Send className="size-3.5" />
        Post
      </button>
    </div>
  )
}

function LibraryRow({
  thumb,
  mediaType,
  status,
  needsAttention,
  title,
  meta,
  when,
  selected,
  onToggleSelect,
  onOpen,
  onSchedule,
  onPost,
}: {
  thumb: string | null
  mediaType: 'image' | 'video'
  status: LibraryStatus
  needsAttention?: boolean
  title: string
  meta: string
  when: string | null
  selected?: boolean
  onToggleSelect?: () => void
  onOpen: () => void
  onSchedule: () => void
  onPost: () => void
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-card px-2.5 py-2 transition-colors hover:border-foreground/20', selected && 'border-foreground/50 bg-muted/40')}>
      {onToggleSelect && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selected}
          aria-label={`Select ${title}`}
          onClick={onToggleSelect}
          className="grid size-5 shrink-0 place-items-center rounded border bg-background text-[11px] leading-none"
        >
          {selected ? '✓' : ''}
        </button>
      )}
      <button type="button" onClick={onOpen} className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted" aria-label={`Open ${title}`}>
        {thumb ? (
          mediaType === 'video' ? (
            <video src={thumb} className="size-full object-cover" muted playsInline preload="metadata" />
          ) : (
            <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
          )
        ) : (
          <FileText className="size-5 text-muted-foreground" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="grid min-w-0 flex-1 text-left" aria-label={`Open ${title}`}>
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {meta} · {formatWhen(when)}
        </span>
      </button>
      <span className="hidden shrink-0 @min-[720px]:block">
        <StatusBadge status={status} />
        {needsAttention && (
          <span className="ml-1 inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            Attention
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onSchedule} aria-label={`Schedule ${title}`}>
          <CalendarPlus className="size-3.5" data-icon="inline-start" />
          <span className="hidden @min-[720px]:inline">{when ? 'Reschedule' : 'Schedule'}</span>
        </Button>
        <Button type="button" size="sm" onClick={onPost} aria-label={`Post ${title} now`}>
          <Send className="size-3.5" data-icon="inline-start" />
          <span className="hidden @min-[720px]:inline">Post</span>
        </Button>
      </span>
    </div>
  )
}

// Month calendar over all scheduled items — the global "see the schedule" view.
function ScheduleCalendar({
  saved,
  bank,
  unscheduled,
  onScheduleAt,
  onOpenSaved,
  onOpenBank,
}: {
  saved: SavedPost[]
  bank: MediaBankItem[]
  unscheduled: { kind: 'saved' | 'bank'; id: string; title: string }[]
  onScheduleAt: (kind: 'saved' | 'bank', id: string, day: Date) => void
  onOpenSaved: (id: string) => void
  onOpenBank: (id: string) => void
}) {
  const today = new Date()
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [dayKey, setDayKey] = useState<string | null>(null)

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const byDay = useMemo(() => {
    const map = new Map<string, { kind: 'saved' | 'bank'; id: string; title: string; at: string }[]>()
    const push = (key: string, entry: { kind: 'saved' | 'bank'; id: string; title: string; at: string }) => {
      const list = map.get(key) ?? []
      list.push(entry)
      map.set(key, list)
    }
    for (const p of saved) {
      if (!p.scheduledAt) continue
      push(new Date(p.scheduledAt).toDateString(), { kind: 'saved', id: p.id, title: p.title ?? 'Content', at: p.scheduledAt })
    }
    for (const m of bank) {
      if (!m.scheduledAt) continue
      push(new Date(m.scheduledAt).toDateString(), { kind: 'bank', id: m.id, title: m.name, at: m.scheduledAt })
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    return map
  }, [saved, bank])

  const dayItems = dayKey ? (byDay.get(dayKey) ?? []) : []
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="grid gap-2">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
              <ChevronRight />
            </Button>
            <span className="ml-2 text-sm font-semibold tracking-tight">{monthLabel}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setDayKey(today.toDateString()) }}>
            Today
          </Button>
        </div>
        <div className="grid grid-cols-7 border-b">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-1.5 text-center text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((day, i) => {
            const inMonth = day.getMonth() === cursor.getMonth()
            const key = day.toDateString()
            const items = byDay.get(key) ?? []
            const isSel = dayKey === key
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setDayKey(key)}
                className={cn(
                  'flex min-h-20 flex-col gap-1 p-1.5 text-left outline-none transition-colors focus-visible:bg-muted/40',
                  inMonth ? 'bg-card hover:bg-muted/25' : 'bg-muted/15 hover:bg-muted/30',
                  isSel && 'bg-muted/40 ring-1 ring-inset ring-foreground/20',
                  i % 7 !== 0 && 'border-l',
                  i >= 7 && 'border-t',
                )}
                aria-label={`${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${items.length} scheduled`}
              >
                <span
                  className={cn(
                    'grid size-5.5 place-items-center rounded-full text-xs tabular-nums',
                    day.toDateString() === today.toDateString()
                      ? 'bg-foreground font-semibold text-background'
                      : inMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground/60',
                  )}
                >
                  {day.getDate()}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  {items.slice(0, 3).map((it) => (
                    <span
                      key={`${it.kind}-${it.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (it.kind === 'saved') onOpenSaved(it.id)
                        else onOpenBank(it.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation()
                          if (it.kind === 'saved') onOpenSaved(it.id)
                          else onOpenBank(it.id)
                        }
                      }}
                      className="truncate rounded-md bg-info/15 px-1.5 py-0.5 text-left text-[11px] leading-tight font-medium text-info"
                      title={`${it.title} · ${formatWhen(it.at)}`}
                    >
                      {it.title}
                    </span>
                  ))}
                  {items.length > 3 && <span className="px-1.5 text-[10px] font-medium text-muted-foreground">+{items.length - 3} more</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {dayKey && (
        <div className="grid gap-2 rounded-xl border bg-card p-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {new Date(dayKey).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {dayItems.length} scheduled
          </p>
          {dayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled this day.</p>
          ) : (
            dayItems.map((it) => (
              <button
                key={`${it.kind}-${it.id}`}
                type="button"
                onClick={() => (it.kind === 'saved' ? onOpenSaved(it.id) : onOpenBank(it.id))}
                className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-foreground/25"
              >
                <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatWhen(it.at)}</span>
              </button>
            ))
          )}
          {unscheduled.length > 0 && (
            <div className="grid gap-1.5 border-t pt-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Schedule here · 9:00 AM
              </p>
              {unscheduled.map((u) => (
                <div key={`${u.kind}-${u.id}`} className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{u.title}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onScheduleAt(u.kind, u.id, new Date(dayKey))}
                    aria-label={`Schedule ${u.title} on ${dayKey} at 9 AM`}
                  >
                    <CalendarPlus className="size-3.5" data-icon="inline-start" />
                    9 AM
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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

function SavedCard({ post, onOpen, onSchedule, onPost, selected, onToggleSelect }: { post: SavedPost; onOpen: () => void; onSchedule: () => void; onPost: () => void; selected?: boolean; onToggleSelect?: () => void }) {
  return (
    <CardButton label={`Open ${post.title ?? 'saved post'}`} onOpen={onOpen} selected={selected} onToggleSelect={onToggleSelect}>
      <div className="relative">
        <SavedMedia post={post} />
        {post.needsAttention && (
          <span
            title="Needs attention"
            aria-label="Needs attention"
            className="absolute top-2 right-2 size-2.5 rounded-full bg-warning ring-2 ring-background"
          />
        )}
      </div>
      <QuickActions when={post.scheduledAt} onSchedule={onSchedule} onPost={onPost} />
    </CardButton>
  )
}

function BankCard({ item, onOpen, onSchedule, onPost, selected, onToggleSelect }: { item: MediaBankItem; onOpen: () => void; onSchedule: () => void; onPost: () => void; selected?: boolean; onToggleSelect?: () => void }) {
  return (
    <CardButton label={`Open ${item.name}`} onOpen={onOpen} selected={selected} onToggleSelect={onToggleSelect}>
      <BankMedia item={item} />
      <QuickActions when={item.scheduledAt} onSchedule={onSchedule} onPost={onPost} />
    </CardButton>
  )
}
