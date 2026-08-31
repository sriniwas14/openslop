import { useEffect, useState } from 'react'
import { ExternalLink, Heart, Loader2, MessageCircle, RefreshCw, Settings, Film, Image as ImageIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCompany } from '@/context/CompanyContext'
import {
  getApifyKey,
  listCreators,
  listCreatorPosts,
  scrapePosts,
  type InstagramCreator,
  type InstagramPost,
} from '@/services/apify'

const RESULT_LIMIT_DEFAULT = 20
const RESULT_LIMIT_MAX = 200

function formatCount(n: number | null): string {
  if (n == null) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function PostCard({ post }: { post: InstagramPost }) {
  const media = post.mediaUrl || post.thumbnailUrl
  return (
    <Card>
      <CardContent className="grid gap-2 p-0">
        {media ? (
          media.includes('.mp4') || post.mediaType === 'video' ? (
            <video src={media} muted loop playsInline preload="metadata" className="aspect-square w-full object-cover rounded-t-xl bg-muted" controls />
          ) : (
            <img src={media} alt={post.caption ?? ''} loading="lazy" className="aspect-square w-full object-cover rounded-t-xl bg-muted" />
          )
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-t-xl bg-muted text-muted-foreground">
            <ImageIcon className="size-8" />
          </div>
        )}
        <div className="grid gap-2 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {post.username && <span className="text-sm font-medium text-foreground">@{post.username}</span>}
            {post.mediaType === 'video' ? (
              <span className="inline-flex items-center gap-1 rounded bg-pink-500/15 px-1.5 py-0.5 text-[11px] font-medium text-pink-600"><Film className="size-3" /> Video</span>
            ) : post.mediaType === 'image' ? (
              <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-600"><ImageIcon className="size-3" /> Image</span>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Post</span>
            )}
            <span className="ml-auto">{formatDate(post.publishedAt)}</span>
          </div>

          <p className="line-clamp-3 text-sm text-foreground/90 whitespace-pre-wrap">{post.caption && post.caption.trim() ? post.caption : '(no caption)'}</p>

          {post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.slice(0, 6).map((h) => <span key={h} className="text-xs text-sky-600">#{h}</span>)}
            </div>
          )}

          <div className="flex items-center gap-4 border-t pt-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Heart className="size-4" /> {formatCount(post.likes)}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="size-4" /> {formatCount(post.comments)}</span>
            <a href={post.postUrl ?? '#'} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-foreground/70 hover:underline">
              View on Instagram <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Creators() {
  const { selectedId } = useCompany()
  const [hasKey, setHasKey] = useState(false)
  const [keyLoaded, setKeyLoaded] = useState(false)

  const [creatorInput, setCreatorInput] = useState('')
  const [resultLimit, setResultLimit] = useState(RESULT_LIMIT_DEFAULT)
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null)

  const [creators, setCreators] = useState<InstagramCreator[]>([])
  const [selectedCreator, setSelectedCreator] = useState<InstagramCreator | null>(null)
  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)

  async function refreshKey() {
    try {
      const info = await getApifyKey()
      setHasKey(info.hasKey)
    } catch {
      setHasKey(false)
    } finally {
      setKeyLoaded(true)
    }
  }

  async function refreshCreators() {
    try {
      setCreators(await listCreators(selectedId ?? undefined))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => { refreshKey() }, [])
  useEffect(() => { refreshCreators() }, [selectedId])

  async function loadPosts(creator: InstagramCreator) {
    setSelectedCreator(creator)
    setPostsLoading(true)
    try {
      setPosts(await listCreatorPosts(creator.id))
    } catch {
      setPosts([])
    } finally {
      setPostsLoading(false)
    }
  }

  async function doScrape(e: React.FormEvent) {
    e.preventDefault()
    if (!creatorInput.trim()) return
    setScraping(true); setScrapeError(null); setScrapeMessage(null)
    try {
      const result = await scrapePosts(creatorInput.trim(), resultLimit, selectedId ?? undefined)
      setScrapeMessage(result.message)
      await refreshCreators()
      setSelectedCreator(result.creator)
      setPosts(result.posts)
    } catch (e: any) {
      setScrapeError(e.message)
    } finally {
      setScraping(false)
    }
  }

  if (keyLoaded && !hasKey) {
    return (
      <div className="grid gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Instagram Creators</h1>
          <p className="text-sm text-muted-foreground">Scrape posts from Instagram creators using Apify.</p>
        </div>
        <Card>
          <CardContent className="grid place-items-center gap-2 py-14 text-center">
            <p className="text-sm font-medium">Connect your Apify account before scraping Instagram posts.</p>
            <Button onClick={() => { window.location.href = '/dashboard/settings' }} className="mt-1">
              <Settings className="size-4" /> Go to Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Instagram Creators</h1>
        <p className="text-sm text-muted-foreground">Scrape posts from a creator and store them for your workspace.</p>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-4">
          <form onSubmit={doScrape} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="creator-input">Instagram Creator</Label>
              <Input
                id="creator-input"
                value={creatorInput}
                onChange={(e) => setCreatorInput(e.target.value)}
                placeholder="@creator_username"
              />
              <p className="text-xs text-muted-foreground">Enter @username, a bare username, or a full instagram.com profile URL.</p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="grid gap-2">
                <Label htmlFor="result-limit">Results limit</Label>
                <Input
                  id="result-limit"
                  type="number"
                  min={1}
                  max={RESULT_LIMIT_MAX}
                  value={resultLimit}
                  onChange={(e) => setResultLimit(Number(e.target.value))}
                  className="w-28"
                />
              </div>
              <Button type="submit" disabled={scraping || !creatorInput.trim()}>
                {scraping ? <><Loader2 className="size-4 animate-spin" /> Scraping Instagram posts…</> : 'Scrape Posts'}
              </Button>
            </div>
          </form>
          {scrapeError && <p className="text-sm text-destructive">{scrapeError}</p>}
          {scrapeMessage && <p className="text-sm text-emerald-600">{scrapeMessage}</p>}
        </CardContent>
      </Card>

      {/* Creator management */}
      {creators.length > 0 && (
        <div className="grid gap-2">
          <h2 className="text-lg font-medium">Creators</h2>
          {creators.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center gap-4 pt-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{c.displayName || c.username}</span>
                    <span className="text-xs text-muted-foreground">@{c.username}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{c.postCount} posts</span>
                    {c.lastScrapedAt && <span>Last scraped {new Date(c.lastScrapedAt).toLocaleString()}</span>}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setScrapeError(null); setScrapeMessage(null)
                    try {
                      const result = await scrapePosts(c.username, resultLimit, selectedId ?? undefined)
                      setScrapeMessage(result.message)
                      await refreshCreators()
                      setSelectedCreator(result.creator)
                      setPosts(result.posts)
                    } catch (e: any) {
                      setScrapeError(e.message)
                    }
                  }}
                >
                  <RefreshCw className="size-3" /> Scrape Posts
                </Button>
                <Button variant="ghost" size="sm" onClick={() => loadPosts(c)}>View Posts</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Posts */}
      {selectedCreator && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-medium">@{selectedCreator.username}</h2>
            {selectedCreator.displayName && <span className="text-sm text-muted-foreground">{selectedCreator.displayName}</span>}
            <span className="text-xs text-muted-foreground">{posts.length} posts scraped</span>
          </div>
          {postsLoading ? (
            <div className="grid place-items-center py-12 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
          ) : posts.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No posts were found for this creator.</CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => <PostCard key={p.id} post={p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
