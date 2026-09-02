import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Image as ImageIcon, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { baseUgcImage, generateUgcImage, generateUgcPost, getMediaJob, type UgcContent } from '@/services/ai'
import type { InstagramPost } from '@/services/apify'
import { useCompany } from '@/context/CompanyContext'
import UgcImageEditor, { type UgcTextSuggestion } from '@/components/instagram/UgcImageEditor'

type ImageState = 'idle' | 'generating' | 'preparing' | 'done' | 'error'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch { /* clipboard unavailable in some contexts */ }
      }}
    >
      {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
    </Button>
  )
}

export default function UgcDialog({
  post,
  companyId,
  open,
  onOpenChange,
}: {
  post: InstagramPost
  companyId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { companies, selectedId } = useCompany()
  const brandName = companies.find((c) => c.id === selectedId)?.name ?? null

  const [ugc, setUgc] = useState<UgcContent | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [imageState, setImageState] = useState<ImageState>('idle')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  async function generate() {
    if (!companyId) return
    setGenerating(true); setError(null)
    try {
      setUgc(await generateUgcPost({ companyId, postId: post.id }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (open && !ugc && !generating && !error) void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // same-origin base copy of the finished image — the editor overlays
  // editable text layers on top, so rewording never needs a new image
  async function prepareEditor(jobId: string) {
    setImageState('preparing')
    try {
      const { imageUrl: url } = await baseUgcImage({ jobId })
      setImageUrl(url)
      setImageState('done')
    } catch (e: any) {
      setImageError(e.message)
      setImageState('error')
    }
  }

  async function startImage() {
    if (!companyId || !ugc || imageState === 'generating' || imageState === 'preparing') return
    setImageState('generating'); setImageError(null); setImageUrl(null)
    try {
      const job = await generateUgcImage({ companyId, hook: ugc.hook, postId: post.id })
      if (job.status === 'completed') { await prepareEditor(job.id); return }
      if (job.status === 'failed') {
        setImageError(job.error ?? 'Image generation failed')
        setImageState('error')
        return
      }
      // poll the media job — image providers can take up to ~90s
      const startedAt = Date.now()
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const fresh = await getMediaJob(job.id)
          if (fresh.status === 'completed') {
            stopPolling()
            await prepareEditor(fresh.id)
          } else if (fresh.status === 'failed') {
            stopPolling()
            setImageError(fresh.error ?? 'Image generation failed')
            setImageState('error')
          } else if (Date.now() - startedAt > 240_000) {
            stopPolling()
            setImageError('Timed out waiting for the image. Try again, or check your image provider in Settings.')
            setImageState('error')
          }
        } catch (e: any) {
          stopPolling()
          setImageError(e.message)
          setImageState('error')
        }
      }, 4000)
    } catch (e: any) {
      setImageError(e.message)
      setImageState('error')
    }
  }

  const fullCaption = ugc ? `${ugc.caption}\n\n${ugc.hashtags.map((h) => `#${h}`).join(' ')}` : ''

  // the visual arrives text-free — these quick-add options carry wording from the generated idea
  const baseUrlReady = imageState === 'done' && !!imageUrl
  const suggestions = useMemo<UgcTextSuggestion[]>(() => {
    if (!ugc) return []
    const list: UgcTextSuggestion[] = [{ label: 'Hook', text: ugc.hook, style: 'headline' }]
    if (brandName) list.push({ label: 'Brand name', text: brandName, style: 'subtext' })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ugc?.hook, brandName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={baseUrlReady ? 'sm:max-w-3xl' : 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Generate UGC post
          </DialogTitle>
          <DialogDescription>
            An original post for your brand, inspired by {post.username ? `@${post.username}` : 'this post'} — idea first, then a clean image you add your own text to.
          </DialogDescription>
        </DialogHeader>

        {generating && (
          <div className="grid place-items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Writing your UGC idea…
          </div>
        )}

        {!generating && error && (
          <div className="grid gap-3 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={generate} className="self-start">
              <RefreshCw className="size-3" /> Try again
            </Button>
          </div>
        )}

        {!generating && !error && ugc && (
          <div className="grid max-h-[65vh] gap-4 overflow-auto pr-1">
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hook</h4>
                <CopyButton text={ugc.hook} />
              </div>
              <p className="text-sm font-medium">{ugc.hook}</p>
            </div>

            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caption</h4>
                <CopyButton text={fullCaption} />
              </div>
              <p className="text-sm whitespace-pre-wrap">{ugc.caption}</p>
            </div>

            {ugc.hashtags.length > 0 && (
              <div className="grid gap-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hashtags</h4>
                <div className="flex flex-wrap gap-1">
                  {ugc.hashtags.map((h) => (
                    <span key={h} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground/80">#{h}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {ugc.platforms.map((p) => (
                <span key={p} className="rounded-full border px-2 py-0.5 capitalize">{p}</span>
              ))}
              <span className="ml-auto">AI score: {ugc.aiScore}/100</span>
            </div>

            {/* Visual: generate the image, then edit text straight on it */}
            <div className="grid gap-3 border-t pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instagram visual</h4>

              {imageState === 'idle' && (
                <Button type="button" onClick={startImage} className="self-start">
                  <ImageIcon className="size-4" /> Generate image
                </Button>
              )}

              {(imageState === 'generating' || imageState === 'preparing') && (
                <div className="grid place-items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  {imageState === 'generating'
                    ? 'Painting the image… this can take up to a minute.'
                    : 'Preparing your editable visual…'}
                </div>
              )}

              {imageState === 'error' && (
                <div className="grid gap-2">
                  <p className="text-sm text-destructive">{imageError}</p>
                  <Button variant="outline" size="sm" onClick={startImage} className="self-start">
                    <RefreshCw className="size-3" /> Try again
                  </Button>
                </div>
              )}

              {baseUrlReady && (
                <div className="grid gap-2">
                  <UgcImageEditor key={imageUrl!} imageUrl={imageUrl!} suggestions={suggestions} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={startImage}>
                      <RefreshCw className="size-3" /> Regenerate image
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The image comes without text — add what you need (the hook from your idea is one click away), drag and restyle it, then download.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
