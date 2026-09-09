import type { FeedItem } from '@/services/visual'
import { visualSrc } from '@/services/visual'
import type { OverlayBlock } from '@/components/feed/MediaTextOverlay'
import type { MemeGifLayer } from '@/components/feed/MemeGifOverlay'

// ---------------------------------------------------------------------------
// Content Library — DB-backed persistence, scoped by (user, brand).
// Every row belongs to the brand it was saved for (companyId); the backend
// enforces ownership via the parent company row. No localStorage, no
// IndexedDB — uploads and Edit-replacements live in data/media behind
// /media/files. PostContainer renders the same box everywhere.
// ---------------------------------------------------------------------------

export type LibraryStatus = 'draft' | 'scheduled' | 'published'

export type SavedPost = {
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
  /** Layer 3 meme GIF position (x/y % of the composition); null when not a meme. */
  gifLayer: MemeGifLayer | null
  /** Stored meme_url snapshot so the GIF renders even if the feed row changes. */
  memeUrl: string | null
  /** Media aspect (w/h) at save time so Library renders the same frame. */
  aspect: number | null
  /** Edit-replaced visual (/media/files/...); wins over visualUrl at render. */
  editedFile: string | null
  editedMediaType: 'image' | 'video' | null
  /** Posts whose visual needs_review surface under Need Attention. */
  needsAttention: boolean
  status: LibraryStatus
  scheduledAt: string | null
  savedAt: string
  createdAt: string
  updatedAt: string
}

export type MediaBankItem = {
  id: string
  companyId: string
  name: string
  mediaType: 'image' | 'video'
  fileUrl: string | null
  /** Byte size for display. */
  size: number
  /** Overlay text layers (same engine as the feed card); empty = no text. */
  blocks: OverlayBlock[]
  /** Layer 3 meme GIF position; null when not a meme. */
  gifLayer: MemeGifLayer | null
  /** Stored meme overlay source for meme posts. */
  memeUrl: string | null
  /** Fitted media aspect (w/h) measured by PostMediaContainer. */
  aspect: number | null
  status: LibraryStatus
  scheduledAt: string | null
  createdAt: string
  updatedAt: string
}

/** Render source for a saved post — the persisted replacement wins. */
export function savedPostSrc(post: SavedPost): string | null {
  return post.editedFile ?? post.visualUrl
}

export class LibraryApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'LibraryApiError'
    this.status = status
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text || res.statusText || `Request failed (${res.status})`
    try {
      const j = JSON.parse(text)
      msg = j?.error || j?.message || msg
    } catch {
      /* body was plain text */
    }
    throw new LibraryApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

const postsRoot = (companyId: string) => `/companies/${companyId}/library/posts`
const mediaRoot = (companyId: string) => `/companies/${companyId}/library/media`

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(file)
  })
}

async function blobUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob()
    return await fileToDataUrl(blob)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Saved posts
// ---------------------------------------------------------------------------

export async function listSavedPosts(
  companyId: string,
  opts: { status?: LibraryStatus; attention?: boolean } = {},
): Promise<SavedPost[]> {
  const sp = new URLSearchParams()
  if (opts.status) sp.set('status', opts.status)
  if (opts.attention) sp.set('attention', 'true')
  const qs = sp.toString()
  const rows = await fetch(qs ? `${postsRoot(companyId)}?${qs}` : postsRoot(companyId), {
    credentials: 'include',
  }).then(handle<SavedPost[]>)
  // Backend returns createdAt/updatedAt; expose savedAt for the existing sort/UI.
  const mapped = rows.map((r) => ({ ...r, savedAt: (r as SavedPost).savedAt ?? r.createdAt }))
  return [...mapped].sort((a, b) => (b.savedAt ?? b.createdAt ?? '').localeCompare(a.savedAt ?? a.createdAt ?? ''))
}

export async function isPostSaved(companyId: string, contentId: string): Promise<boolean> {
  const res = await fetch(`${postsRoot(companyId)}/check?contentId=${encodeURIComponent(contentId)}`, {
    credentials: 'include',
  }).then(handle<{ saved: boolean }>)
  return res.saved
}

export async function saveFeedPost(
  companyId: string,
  item: FeedItem,
  visualUrl: string | null,
  mediaType: 'image' | 'video',
  extra?: { blocks?: OverlayBlock[]; aspect?: number | null; gifLayer?: MemeGifLayer | null },
): Promise<SavedPost> {
  const { content, visualStatus } = item
  // Edit-replaced media arrives as a session object URL — inline the bytes as a
  // data: URL so the backend persists them to data/media (survives reload).
  let editedFileDataUrl: string | null = null
  let storedUrl = visualUrl
  if (visualUrl?.startsWith('blob:')) {
    editedFileDataUrl = await blobUrlToDataUrl(visualUrl)
    if (editedFileDataUrl) storedUrl = null
    else storedUrl = visualSrc(item.visual)
  }
  return fetch(postsRoot(companyId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contentId: content.id,
      title: content.title,
      hook: content.hook,
      body: content.body,
      platform: content.platform,
      contentFormat: content.contentFormat,
      contentType: content.contentType,
      visualUrl: storedUrl,
      mediaType,
      posterUrl: item.visual?.posterUrl ?? item.visual?.previewUrl ?? null,
      blocks: extra?.blocks ?? [],
      gifLayer: extra?.gifLayer ?? null,
      memeUrl: content.memeUrl ?? null,
      aspect: extra?.aspect ?? null,
      needsAttention: visualStatus === 'needs_review',
      ...(editedFileDataUrl ? { editedFileDataUrl, editedMediaType: mediaType } : {}),
    }),
  }).then(handle<SavedPost>)
}

export async function updateSavedPost(
  companyId: string,
  id: string,
  patch: Partial<
    Pick<
      SavedPost,
      'title' | 'hook' | 'body' | 'status' | 'scheduledAt' | 'blocks' | 'aspect' | 'gifLayer' | 'memeUrl' | 'needsAttention' | 'visualUrl' | 'mediaType' | 'posterUrl'
    >
  >,
): Promise<SavedPost> {
  return fetch(`${postsRoot(companyId)}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then(handle<SavedPost>)
}

export async function removeSavedPost(companyId: string, id: string): Promise<void> {
  await fetch(`${postsRoot(companyId)}/${id}`, { method: 'DELETE', credentials: 'include' }).then(handle<{ saved: boolean }>)
}

/** Swap the persisted Edit-replaced media. dataUrl null clears back to the remote visual. */
export async function updateSavedPostMedia(
  companyId: string,
  id: string,
  patch: { dataUrl: string | null; mediaType: 'image' | 'video' | null },
): Promise<SavedPost> {
  return fetch(`${postsRoot(companyId)}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editedFileDataUrl: patch.dataUrl, editedMediaType: patch.mediaType }),
  }).then(handle<SavedPost>)
}

// ---------------------------------------------------------------------------
// Media bank (uploads live in data/media behind /media/files)
// ---------------------------------------------------------------------------

export async function listMediaBank(
  companyId: string,
  opts: { status?: LibraryStatus } = {},
): Promise<MediaBankItem[]> {
  const sp = new URLSearchParams()
  if (opts.status) sp.set('status', opts.status)
  const qs = sp.toString()
  const rows = await fetch(qs ? `${mediaRoot(companyId)}?${qs}` : mediaRoot(companyId), {
    credentials: 'include',
  }).then(handle<MediaBankItem[]>)
  return [...rows].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export async function addMediaBankItem(
  companyId: string,
  input: { file: File; name?: string; blocks?: OverlayBlock[]; aspect?: number | null },
): Promise<MediaBankItem> {
  const kind = input.file.type.startsWith('video/') ? 'video' : 'image'
  const fileDataUrl = await fileToDataUrl(input.file)
  return fetch(mediaRoot(companyId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: input.name ?? input.file.name ?? 'Upload',
      mediaType: kind,
      fileDataUrl,
      blocks: input.blocks ?? [],
      aspect: input.aspect ?? null,
    }),
  }).then(handle<MediaBankItem>)
}

export async function updateMediaBankItem(
  companyId: string,
  id: string,
  patch: Partial<Pick<MediaBankItem, 'name' | 'status' | 'scheduledAt' | 'blocks' | 'aspect' | 'gifLayer' | 'memeUrl'>> & {
    fileDataUrl?: string | null
    mediaType?: 'image' | 'video'
  },
): Promise<MediaBankItem> {
  return fetch(`${mediaRoot(companyId)}/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then(handle<MediaBankItem>)
}

export async function removeMediaBankItem(companyId: string, id: string): Promise<void> {
  await fetch(`${mediaRoot(companyId)}/${id}`, { method: 'DELETE', credentials: 'include' }).then(handle<{ saved: boolean }>)
}
