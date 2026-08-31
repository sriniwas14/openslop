import { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { listSources, createSource, deleteSource, scrapeSource, type SocialSource, type ScrapeJob } from '@/services/social'

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
]

export default function Sources() {
  const [sources, setSources] = useState<SocialSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newPlatform, setNewPlatform] = useState('instagram')
  const [newUrl, setNewUrl] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // scrape status
  const [scrapeJobs, setScrapeJobs] = useState<Record<string, ScrapeJob>>({})

  async function refresh() {
    setLoading(true); setError(null)
    try {
      const s = await listSources()
      setSources(s)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function doCreate() {
    if (!newUrl.trim()) return
    setCreateLoading(true); setCreateError(null)
    try {
      await createSource({ platform: newPlatform, sourceUrl: newUrl.trim() })
      setCreateOpen(false); setNewUrl('')
      refresh()
    } catch (e: any) { setCreateError(e.message) }
    finally { setCreateLoading(false) }
  }

  async function doDelete(id: string) {
    try {
      await deleteSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function doScrape(id: string) {
    try {
      const job = await scrapeSource(id)
      setScrapeJobs((prev) => ({ ...prev, [id]: job }))
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
          <p className="text-sm text-muted-foreground">Manage social media profiles to scrape for trending content.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Add Source</Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin mb-2" />Loading sources…
        </div>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center py-16 text-center">
            <p className="text-sm font-medium">No sources yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add an Instagram or LinkedIn profile to start scraping posts.</p>
            <Button className="mt-3" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Add Source</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sources.map((s) => {
            const job = scrapeJobs[s.id]
            return (
              <Card key={s.id}>
                <CardContent className="flex items-center gap-4 pt-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.platform === 'instagram' ? 'bg-pink-500/15 text-pink-600' : 'bg-sky-500/15 text-sky-600'}`}>{s.platform}</span>
                      <span className="text-sm font-medium truncate">{s.sourceName}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{s.postCount} posts</span>
                      <span>{s.status}</span>
                      {s.lastScrapedAt && <span>Last scraped {new Date(s.lastScrapedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {job && <span className="text-xs text-muted-foreground tabular-nums">{job.status}</span>}
                    {s.sourceUrl && <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"><ExternalLink className="size-3.5" /></a>}
                    <Button variant="ghost" size="sm" onClick={() => doScrape(s.id)} className="h-7 text-xs">
                      <RefreshCw className="size-3" /> Scrape
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => doDelete(s.id)} className="h-7 text-xs text-destructive hover:text-destructive">
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateError(null); setNewUrl('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Source</DialogTitle>
            <DialogDescription>Add a social media profile to scrape for trending content.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Platform</Label>
              <div className="flex gap-2">
                {PLATFORMS.map((p) => (
                  <button key={p.value} type="button" onClick={() => setNewPlatform(p.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${newPlatform === p.value ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Profile URL</Label>
              <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                placeholder={newPlatform === 'instagram' ? 'https://instagram.com/username' : 'https://linkedin.com/company/name'} />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={doCreate} disabled={createLoading || !newUrl.trim()}>
              {createLoading ? <><Loader2 className="size-4 animate-spin" /> Adding…</> : 'Add Source'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
