import { useEffect, useState } from 'react'
import { Bookmark, Loader2, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/context/CompanyContext'
import PostCard from '@/components/instagram/PostCard'
import { listAllPosts, listSavedPosts, type InstagramPost } from '@/services/apify'
import { cn } from '@/lib/utils'

type Tab = 'trending' | 'saved'

export default function Trending() {
  const { selectedId } = useCompany()
  const [tab, setTab] = useState<Tab>('trending')
  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [savedPosts, setSavedPosts] = useState<InstagramPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true); setError(null)
    try {
      const [all, saved] = await Promise.all([
        listAllPosts(selectedId ?? undefined),
        listSavedPosts(selectedId ?? undefined),
      ])
      setPosts(all)
      setSavedPosts(saved)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [selectedId])

  function handlePostChange(updated: InstagramPost) {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    if (updated.savedAt) setSavedPosts((prev) => (prev.some((p) => p.id === updated.id) ? prev : [updated, ...prev]))
    else setSavedPosts((prev) => prev.filter((p) => p.id !== updated.id))
  }

  function handleRemove(postId: string) {
    setSavedPosts((prev) => prev.filter((p) => p.id !== postId))
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, savedAt: null } : p)))
  }

  const visible = tab === 'trending' ? posts : savedPosts

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trending</h1>
        <p className="text-sm text-muted-foreground">
          Scraped creator posts ranked by engagement. Save the ones you love, then generate a UGC post for your brand inspired by them.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('trending')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors duration-200',
            tab === 'trending' ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <TrendingUp className="size-4" /> Trending ({posts.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('saved')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors duration-200',
            tab === 'saved' ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <Bookmark className="size-4" /> Saved ({savedPosts.length})
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : visible.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="grid place-items-center gap-2 py-14 text-center">
            <p className="text-sm font-medium">
              {tab === 'trending' ? 'No scraped posts yet.' : 'Nothing saved yet.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {tab === 'trending'
                ? 'Scrape an Instagram creator from the Creators page — posts will show up here ranked by likes.'
                : 'Hit Save on any post to keep it in your inspiration library.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              companyId={selectedId}
              onPostChange={handlePostChange}
              onRemove={tab === 'saved' ? handleRemove : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
