export type ApifyStatus = 'not_connected' | 'connected' | 'invalid'

export type ApifyKeyInfo = {
  provider: string
  apiKeyMasked: string | null
  hasKey: boolean
  status: ApifyStatus
  createdAt: string | null
  updatedAt: string | null
}

export type InstagramCreator = {
  id: string
  userId: string
  companyId: string
  username: string
  profileUrl: string
  displayName: string | null
  status: string
  lastScrapedAt: string | null
  postCount: number
  createdAt: string
  updatedAt: string
}

export type InstagramPost = {
  id: string
  sourceId: string
  externalPostId: string
  shortcode: string | null
  postUrl: string | null
  username: string | null
  ownerFullName: string | null
  caption: string | null
  mediaType: string | null
  mediaUrl: string | null
  thumbnailUrl: string | null
  publishedAt: string | null
  likes: number | null
  comments: number | null
  shares: number | null
  views: number | null
  hashtags: string[]
  mentions: string[]
  source: string
  scrapedAt: string | null
  savedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ScrapeResult = {
  creator: InstagramCreator
  job: { id: string; status: string; postsFound: number; error: string | null }
  posts: InstagramPost[]
  newCount: number
  message: string
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText
    try {
      const parsed = await res.json()
      if (parsed?.error) message = parsed.error
    } catch {
      /* keep statusText */
    }
    throw new Error(message || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ---------- Apify credential ----------
export function getApifyKey(): Promise<ApifyKeyInfo> {
  return fetch('/api/integrations/apify/key', { credentials: 'include' }).then(handle<ApifyKeyInfo>)
}

export function saveApifyKey(apiKey: string): Promise<ApifyKeyInfo> {
  return fetch('/api/integrations/apify/key', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  }).then(handle<ApifyKeyInfo>)
}

export function deleteApifyKey(): Promise<{ success: boolean }> {
  return fetch('/api/integrations/apify/key', { method: 'DELETE', credentials: 'include' }).then(handle<{ success: boolean }>)
}

export function testApifyKey(apiKey?: string): Promise<ApifyKeyInfo> {
  return fetch('/api/integrations/apify/test', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  }).then(handle<ApifyKeyInfo>)
}

// ---------- Creators ----------
export function listCreators(companyId?: string): Promise<InstagramCreator[]> {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return fetch(`/api/integrations/instagram/creators${qs}`, { credentials: 'include' }).then(handle<InstagramCreator[]>)
}

export function listCreatorPosts(creatorId: string, limit?: number): Promise<InstagramPost[]> {
  const qs = limit ? `?limit=${limit}` : ''
  return fetch(`/api/integrations/instagram/creators/${creatorId}/posts${qs}`, { credentials: 'include' }).then(handle<InstagramPost[]>)
}

export function scrapePosts(creator: string, resultsLimit: number, companyId?: string): Promise<ScrapeResult> {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return fetch(`/api/integrations/apify/instagram/scrape${qs}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator, resultsLimit }),
  }).then(handle<ScrapeResult>)
}

// ---------- All scraped posts (Trending view) ----------
export function listAllPosts(companyId?: string, limit?: number): Promise<InstagramPost[]> {
  const sp = new URLSearchParams()
  if (companyId) sp.set('companyId', companyId)
  if (limit) sp.set('limit', String(limit))
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  return fetch(`/api/integrations/instagram/posts${qs}`, { credentials: 'include' }).then(handle<InstagramPost[]>)
}

// ---------- Saved posts (UGC inspiration library) ----------
export function listSavedPosts(companyId?: string): Promise<InstagramPost[]> {
  const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return fetch(`/api/integrations/instagram/saved${qs}`, { credentials: 'include' }).then(handle<InstagramPost[]>)
}

export function savePost(postId: string): Promise<InstagramPost> {
  return fetch(`/api/integrations/instagram/posts/${postId}/save`, {
    method: 'POST',
    credentials: 'include',
  }).then(handle<InstagramPost>)
}

export function unsavePost(postId: string): Promise<InstagramPost> {
  return fetch(`/api/integrations/instagram/posts/${postId}/save`, {
    method: 'DELETE',
    credentials: 'include',
  }).then(handle<InstagramPost>)
}
