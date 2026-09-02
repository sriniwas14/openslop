import { useState } from 'react'
import { Bookmark, BookmarkCheck, ExternalLink, Film, Heart, Loader2, MessageCircle, Sparkles, Image as ImageIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { savePost, unsavePost, type InstagramPost } from '@/services/apify'
import UgcDialog from '@/components/instagram/UgcDialog'

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

export default function PostCard({
  post,
  companyId,
  onPostChange,
  onRemove,
}: {
  post: InstagramPost
  companyId: string | null
  onPostChange?: (updated: InstagramPost) => void
  onRemove?: (postId: string) => void
}) {
  const media = post.mediaUrl || post.thumbnailUrl
  const saved = Boolean(post.savedAt)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [ugcOpen, setUgcOpen] = useState(false)

  async function toggleSave() {
    if (saving) return
    setSaving(true); setActionError(null)
    try {
      const updated = saved ? await unsavePost(post.id) : await savePost(post.id)
      if (saved && onRemove) onRemove(post.id)
      onPostChange?.(updated)
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardContent className="grid gap-2 p-0">
          {media ? (
            media.includes('.mp4') || post.mediaType === 'video' ? (
              <video src={media} muted loop playsInline preload="metadata" className="aspect-square w-full rounded-t-xl bg-muted object-cover" controls />
            ) : (
              <img src={media} alt={post.caption ?? ''} loading="lazy" className="aspect-square w-full rounded-t-xl bg-muted object-cover" />
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

            <p className="line-clamp-3 text-sm whitespace-pre-wrap text-foreground/90">{post.caption && post.caption.trim() ? post.caption : '(no caption)'}</p>

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

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={saved ? 'secondary' : 'outline'} size="sm" onClick={toggleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : saved ? (
                  <BookmarkCheck className="size-3 text-primary" />
                ) : (
                  <Bookmark className="size-3" />
                )}
                {saved ? 'Saved' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUgcOpen(true)}
                disabled={!companyId}
                title={companyId ? 'Generate a brand post inspired by this one' : 'Select a brand first'}
              >
                <Sparkles className="size-3" /> Generate UGC
              </Button>
              <span className="min-w-0 flex-1 truncate text-xs text-destructive">{actionError}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <UgcDialog post={post} companyId={companyId} open={ugcOpen} onOpenChange={setUgcOpen} />
    </>
  )
}
