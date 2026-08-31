import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, MessageCircle, Share2, Eye, Loader2, Wand2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listPosts, type ScrapedPost } from '@/services/social'

export default function SocialPostPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [post, setPost] = useState<ScrapedPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    listPosts()
      .then((posts) => {
        const found = posts.find((p) => p.id === id)
        setPost(found ?? null)
        if (!found) setError('Post not found')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="grid place-items-center py-16 text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin mb-2" />Loading post…
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="grid gap-4 py-8">
        <p className="text-sm text-destructive">{error || 'Post not found'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/trending')}>
          <ArrowLeft className="size-4" /> Back to Trending
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-5 max-w-2xl">
      <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/trending')} className="w-fit">
        <ArrowLeft className="size-4" /> Back to Trending
      </Button>

      {post.mediaUrl && (
        <img src={post.mediaUrl} alt="" className="w-full rounded-xl object-cover max-h-[400px]" />
      )}

      <Card>
        <CardContent className="grid gap-3 pt-4">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${post.platform === 'instagram' ? 'bg-pink-500/15 text-pink-600' : 'bg-sky-500/15 text-sky-600'}`}>{post.platform}</span>
            {post.authorName && <span className="text-sm font-medium">{post.authorName}</span>}
            {post.authorUsername && <span className="text-xs text-muted-foreground">@{post.authorUsername}</span>}
          </div>

          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.text || '(visual post — no caption)'}</p>

          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {post.hashtags.map((h) => <span key={h} className="text-xs text-sky-600">#{h}</span>)}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2 border-t">
            <span className="inline-flex items-center gap-1"><Heart className="size-4" /> {post.likes}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="size-4" /> {post.comments}</span>
            <span className="inline-flex items-center gap-1"><Share2 className="size-4" /> {post.shares}</span>
            {post.views > 0 && <span className="inline-flex items-center gap-1"><Eye className="size-4" /> {post.views}</span>}
            <span className="ml-auto font-semibold">Score: {post.performanceScore}</span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={() => navigate('/dashboard/trending')}>
              <Wand2 className="size-4" /> Analyze
            </Button>
            {post.postUrl && (
              <a href={post.postUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">View Original</Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
