export type SocialSource = {
  id: string
  userId: string
  platform: string
  sourceUrl: string
  sourceName: string
  status: string
  lastScrapedAt: string | null
  postCount: number
  createdAt: string
  updatedAt: string
}

export type ScrapedPost = {
  id: string
  sourceId: string
  platform: string
  externalPostId: string
  postUrl: string | null
  authorName: string | null
  authorUsername: string | null
  text: string | null
  mediaType: string | null
  mediaUrl: string | null
  thumbnailUrl: string | null
  publishedAt: string | null
  likes: number
  comments: number
  shares: number
  views: number
  hashtags: string[]
  scrapedAt: string
  performanceScore: number
  contentType: string
}

export type ContentAnalysis = {
  id: string
  userId: string
  postId: string
  topic: string | null
  hook: string | null
  format: string | null
  structure: string | null
  tone: string | null
  CTA: string | null
  audience: string | null
  keyIdea: string | null
  reasoning: string | null
  createdAt: string
}

export type TrendReport = {
  topics: { label: string; count: number }[]
  patterns: { title: string; description: string }[]
}

export type ScrapeJob = {
  id: string
  userId: string
  sourceId: string
  provider: string
  status: string
  postsFound: number | null
  error: string | null
  createdAt: string
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
  return res.json() as Promise<T>
}

export function listSources(): Promise<SocialSource[]> {
  return fetch('/social/sources', { credentials: 'include' }).then(handle<SocialSource[]>)
}

export function createSource(body: { platform: string; sourceUrl: string }): Promise<SocialSource> {
  return fetch('/social/sources', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<SocialSource>)
}

export function deleteSource(id: string): Promise<{ success: boolean }> {
  return fetch(`/social/sources/${id}`, { method: 'DELETE', credentials: 'include' }).then(handle<{ success: boolean }>)
}

export function scrapeSource(id: string): Promise<ScrapeJob> {
  return fetch(`/social/sources/${id}/scrape`, {
    method: 'POST',
    credentials: 'include',
  }).then(handle<ScrapeJob>)
}

export function listPosts(params?: { platform?: string; sourceId?: string; contentType?: string; q?: string; minScore?: number }): Promise<ScrapedPost[]> {
  const sp = new URLSearchParams()
  if (params?.platform) sp.set('platform', params.platform)
  if (params?.sourceId) sp.set('sourceId', params.sourceId)
  if (params?.contentType) sp.set('contentType', params.contentType)
  if (params?.q) sp.set('q', params.q)
  if (params?.minScore != null) sp.set('minScore', String(params.minScore))
  const qs = sp.toString()
  return fetch(`/social/posts${qs ? `?${qs}` : ''}`, { credentials: 'include' }).then(handle<ScrapedPost[]>)
}

export function getPostAnalysis(postId: string): Promise<ContentAnalysis> {
  return fetch(`/social/posts/${postId}/analysis`, { credentials: 'include' }).then(handle<ContentAnalysis>)
}

export function analyzePost(postId: string): Promise<ContentAnalysis> {
  return fetch(`/social/posts/${postId}/analyze`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).then(handle<ContentAnalysis>)
}

export function getAnalysis(postId: string): Promise<ContentAnalysis | null> {
  return fetch(`/social/posts/${postId}/analysis`, { credentials: 'include' }).then(async (res) => {
    if (res.status === 404) return null
    if (!res.ok) return null
    return res.json() as Promise<ContentAnalysis>
  })
}

export function createSimilar(postId: string, body: { companyId?: string; contentType?: string; tone?: string }): Promise<any> {
  return fetch(`/social/posts/${postId}/create-similar`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<any>)
}

export function getTrends(): Promise<TrendReport> {
  return fetch('/social/trends', { credentials: 'include' }).then(handle<TrendReport>)
}

export function startTrendingScrape(limit?: number): Promise<ScrapeJob> {
  return fetch('/social/instagram/trending', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: limit ?? 30 }),
  }).then(handle<ScrapeJob>)
}
