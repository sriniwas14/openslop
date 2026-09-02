import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Settings } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCompany } from '@/context/CompanyContext'
import PostCard from '@/components/instagram/PostCard'
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
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  companyId={selectedId}
                  onPostChange={(updated) => setPosts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
