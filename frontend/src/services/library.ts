import type { FeedItem } from '@/services/visual'
import type { OverlayBlock } from '@/components/feed/MediaTextOverlay'

// ---------------------------------------------------------------------------
// Content Library — browser-local persistence (per brand) for posts saved
// from the Content Feed. No backend endpoint exists for this (the
// generated-content API is read-only), so saved posts + media-bank metadata
// live in localStorage while uploaded media blobs live in IndexedDB.
// ---------------------------------------------------------------------------

export type LibraryStatus = 'draft' | 'scheduled' | 'published'

export type SavedPost = {
  /** Stable id: `${companyId}:${contentId}` (upsert-safe). */
  id: string
  companyId: string
  contentId: string
  title: string | null
  hook: string | null
  body: string | null
  platform: string
  contentFormat: string
  contentType: string
  visualUrl: string | null
  mediaType: 'image' | 'video'
  posterUrl: string | null
  /** Overlay text layers exactly as shown in the feed (text, size, position, colours). */
  blocks: OverlayBlock[]
  /** Media aspect (w/h) at save time so Library renders the same frame. */
  aspect: number | null
  /** Posts whose visual needs_review surface under Need Attention. */
  needsAttention: boolean
  status: LibraryStatus
  scheduledAt: string | null
  savedAt: string
}

export type MediaBankItem = {
  id: string
  companyId: string
  name: string
  mediaType: 'image' | 'video'
  /** IndexedDB key for the blob. */
  blobId: string
  /** Byte size for display. */
  size: number
  status: LibraryStatus
  scheduledAt: string | null
  createdAt: string
}

const savedKey = (companyId: string) => `openslope.library.saved.${companyId}`
const mediaKey = (companyId: string) => `openslope.library.media.${companyId}`

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable — the UI stays usable for the session.
  }
}

// ---------------------------------------------------------------------------
// Saved posts
// ---------------------------------------------------------------------------

export function listSavedPosts(companyId: string): SavedPost[] {
  const items = read<SavedPost[]>(savedKey(companyId), [])
  // Backfill posts saved before overlay snapshots existed.
  return [...items]
    .map((p) => ({ ...p, blocks: p.blocks ?? [], aspect: p.aspect ?? null }))
    .sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''))
}

export function isPostSaved(companyId: string, contentId: string) {
  return read<SavedPost[]>(savedKey(companyId), []).some((p) => p.contentId === contentId)
}

export function saveFeedPost(
  companyId: string,
  item: FeedItem,
  visualUrl: string | null,
  mediaType: 'image' | 'video',
  extra?: { blocks?: OverlayBlock[]; aspect?: number | null },
): SavedPost {
  const { content, visualStatus } = item
  const post: SavedPost = {
    id: `${companyId}:${content.id}`,
    companyId,
    contentId: content.id,
    title: content.title,
    hook: content.hook,
    body: content.body,
    platform: content.platform,
    contentFormat: content.contentFormat,
    contentType: content.contentType,
    visualUrl,
    mediaType,
    posterUrl: item.visual?.posterUrl ?? item.visual?.previewUrl ?? null,
    blocks: extra?.blocks ?? [],
    aspect: extra?.aspect ?? null,
    needsAttention: visualStatus === 'needs_review',
    status: 'draft',
    scheduledAt: null,
    savedAt: new Date().toISOString(),
  }
  const prev = read<SavedPost[]>(savedKey(companyId), []).filter((p) => p.contentId !== content.id)
  write(savedKey(companyId), [post, ...prev])
  return post
}

export function updateSavedPost(companyId: string, contentId: string, patch: Partial<Pick<SavedPost, 'status' | 'scheduledAt'>>): SavedPost | null {
  const items = read<SavedPost[]>(savedKey(companyId), [])
  const idx = items.findIndex((p) => p.contentId === contentId)
  if (idx === -1) return null
  const next = { ...items[idx], ...patch }
  items[idx] = next
  write(savedKey(companyId), items)
  return next
}

export function removeSavedPost(companyId: string, contentId: string) {
  write(
    savedKey(companyId),
    read<SavedPost[]>(savedKey(companyId), []).filter((p) => p.contentId !== contentId),
  )
}

// ---------------------------------------------------------------------------
// Media bank metadata (blobs live in IndexedDB below)
// ---------------------------------------------------------------------------

export function listMediaBank(companyId: string): MediaBankItem[] {
  const items = read<MediaBankItem[]>(mediaKey(companyId), [])
  return [...items].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export function addMediaBankItem(companyId: string, item: Omit<MediaBankItem, 'companyId'>) {
  const full: MediaBankItem = { ...item, companyId }
  write(mediaKey(companyId), [full, ...read<MediaBankItem[]>(mediaKey(companyId), [])])
  return full
}

export function updateMediaBankItem(companyId: string, id: string, patch: Partial<Pick<MediaBankItem, 'status' | 'scheduledAt' | 'name'>>): MediaBankItem | null {
  const items = read<MediaBankItem[]>(mediaKey(companyId), [])
  const idx = items.findIndex((m) => m.id === id)
  if (idx === -1) return null
  const next = { ...items[idx], ...patch }
  items[idx] = next
  write(mediaKey(companyId), items)
  return next
}

export function removeMediaBankItem(companyId: string, id: string) {
  const items = read<MediaBankItem[]>(mediaKey(companyId), [])
  const found = items.find((m) => m.id === id)
  write(
    mediaKey(companyId),
    items.filter((m) => m.id !== id),
  )
  if (found) void deleteMediaBlob(found.blobId).catch(() => {})
}

// ---------------------------------------------------------------------------
// Media blob store (IndexedDB) — persists uploaded photos/videos across
// reloads, which localStorage cannot do for binary data.
// ---------------------------------------------------------------------------

const DB_NAME = 'openslope-library'
const STORE = 'media'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putMediaBlob(blobId: string, blob: Blob): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, blobId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function getMediaBlobUrl(blobId: string): Promise<string | null> {
  const db = await openDb()
  try {
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(blobId)
      req.onsuccess = () => resolve(req.result as Blob | undefined)
      req.onerror = () => reject(req.error)
    })
    if (!blob) return null
    return URL.createObjectURL(blob)
  } finally {
    db.close()
  }
}

export async function deleteMediaBlob(blobId: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(blobId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
