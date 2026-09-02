import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, RefreshCw, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useCompany } from '@/context/CompanyContext'
import { fetchIdeas, generateFromIdea, type Idea } from '@/services/content'
import { listInfluencers, type InfluencerRow } from '@/services/influencers'
import { CONTENT_TYPES, type ContentItem, type ContentType } from './data'
import { CONTENT_FORMATS } from './formats'
import ContentFormatSelector from './ContentFormatSelector'

function toContentItem(row: any): ContentItem {
  // ponytail: map backend content row to local ContentItem (platforms/aiScore are UI-only)
  const kind = row.kind as ContentType
  const meta = CONTENT_TYPES[kind]
  const summary =
    row.scripts?.[0]?.prompt?.slice(0, 220) ??
    row.images?.[0]?.text?.slice(0, 220) ??
    row.title
  const rawFormat = row.format as string | null
  const format: 'vertical' | 'horizontal' | null =
    rawFormat === 'vertical' || rawFormat === 'horizontal' ? rawFormat : kind === 'carousel' ? 'horizontal' : 'vertical'
  return {
    id: row.id ?? crypto.randomUUID(),
    title: row.title,
    summary,
    type: kind,
    platforms: meta?.platforms?.slice(0, 2) ?? ['instagram'],
    status: row.status === 'published' ? 'published' : 'draft',
    scheduledAt: row.scheduledAt ?? null,
    aiScore: Math.round(55 + Math.random() * 35),
    format,
    mediaUrl: row.mediaUrl ?? null,
  }
}

export default function CreateContentDialog({
  open,
  onOpenChange,
  initialDate: _initialDate,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string | null
  onCreate: (item: ContentItem) => void
}) {
  const { companies, selectedId } = useCompany()
  const company = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null

  const [kind, setKind] = useState<ContentType | null>(null)
  const [formatId, setFormatId] = useState('slideshow')
  const [duration, setDuration] = useState<15 | 30 | 45>(15)
  const [step, setStep] = useState<'type' | 'duration' | 'ideas'>('type')

  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [ideasError, setIdeasError] = useState<string | null>(null)
  const [selectedId2, setSelectedId2] = useState<string | null>(null)
  const [influencers, setInfluencers] = useState<InfluencerRow[] | null>(null)
  const [influencersLoading, setInfluencersLoading] = useState(false)
  const [influencerSearch, setInfluencerSearch] = useState('')
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const selectedIdea = ideas?.find((i) => i.id === selectedId2) ?? null
  const filteredInfluencers = (influencers ?? []).filter((inf) => inf.name.toLowerCase().includes(influencerSearch.toLowerCase()))

  useEffect(() => {
    if (!open) return
    setKind(null)
    setFormatId('slideshow')
    setDuration(15)
    setStep('type')
    setIdeas(null)
    setIdeasLoading(false)
    setIdeasError(null)
    setSelectedId2(null)
    setInfluencers(null)
    setInfluencersLoading(false)
    setInfluencerSearch('')
    setSelectedInfluencerId(null)
    setGenerating(false)
    setGenerateError(null)
  }, [open])

  const loadInfluencers = useCallback(async () => {
    if (!company) return
    setInfluencersLoading(true)
    try {
      const rows = await listInfluencers(company.id)
      setInfluencers(rows)
    } catch {
      setInfluencers([])
    } finally {
      setInfluencersLoading(false)
    }
  }, [company])

  const loadIdeas = useCallback(async (k: ContentType) => {
    if (!company) {
      setIdeasError('No brand selected — add a company first.')
      return
    }
    setIdeasLoading(true)
    setIdeasError(null)
    setIdeas(null)
    setSelectedId2(null)
    try {
      const res = await fetchIdeas(company.id, { kind: k, count: 5 })
      setIdeas(res.ideas)
    } catch (e) {
      setIdeasError(e instanceof Error ? e.message : 'Failed to load ideas — try again.')
    } finally {
      setIdeasLoading(false)
    }
  }, [company])

  const handlePickKind = (k: ContentType) => {
    setKind(k)
    if (k === 'carousel') {
      setStep('ideas')
      void loadIdeas(k)
    } else {
      setStep('duration')
    }
  }

  const handleGenerate = async () => {
    if (!selectedIdea || !kind || !company || generating) return
    if (kind === 'talkinghead' && !selectedInfluencerId) {
      setGenerateError('Select an influencer for talking head')
      return
    }
    setGenerating(true)
    setGenerateError(null)
    try {
      const row = await generateFromIdea(company.id, {
        idea: selectedIdea,
        selectedHook: selectedIdea.hooks[0],
        kind,
        duration: kind === 'carousel' ? undefined : duration,
        influencerId: kind === 'talkinghead' ? selectedInfluencerId ?? undefined : undefined,
      })
      onCreate(toContentItem(row))
      onOpenChange(false)
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Generation failed — try again.')
    } finally {
      setGenerating(false)
    }
  }

  const meta = kind ? CONTENT_TYPES[kind] : null
  const selectedFormat = CONTENT_FORMATS.find((f) => f.id === formatId) ?? CONTENT_FORMATS[0]

  const showInfluencerPicker = kind === 'talkinghead'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 'type' ? 'sm:max-w-[1170px]' : step === 'duration' ? 'sm:max-w-md' : showInfluencerPicker ? 'sm:max-w-2xl' : 'sm:max-w-xl'}>
        {step === 'type' ? (
          <>
            <ContentFormatSelector selectedId={formatId} onSelect={setFormatId} />

            <DialogFooter className="items-center gap-3">
              {selectedFormat.kind === null && (
                <span className="mr-auto text-xs text-muted-foreground">Generation for this format is coming soon.</span>
              )}
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={selectedFormat.kind === null} onClick={() => selectedFormat.kind && handlePickKind(selectedFormat.kind)}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : step === 'duration' ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">Pick duration</DialogTitle>
              <DialogDescription>How long should the video be? We’ll split it into 5s clips chained frame-to-frame.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2" role="radiogroup" aria-label="Duration">
              {[15, 30, 45].map((d) => {
                const sel = duration === d
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => setDuration(d as 15 | 30 | 45)}
                    className={cn(
                      'flex items-center justify-between rounded-xl border p-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      sel ? 'border-foreground bg-muted/60' : 'hover:bg-muted/40',
                    )}
                  >
                    <div>
                      <div className="text-sm font-semibold">{d}s</div>
                      <div className="text-xs text-muted-foreground">{d / 5} clips · 5s each · last frame → next</div>
                    </div>
                    {sel && <span className="grid size-5 place-items-center rounded-full bg-foreground text-background"><Check className="size-3" /></span>}
                  </button>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('type')}>Back</Button>
              <Button onClick={() => { setStep('ideas'); if (kind) { void loadIdeas(kind); if (kind === 'talkinghead') void loadInfluencers() } }}>Continue</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                {meta && (
                  <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-background', meta.gradient)}>
                    <meta.icon className="size-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <DialogTitle className="text-lg">Pick an idea</DialogTitle>
                  <DialogDescription>
                    {company ? `Ideas from ${company.name}'s brand persona` : 'Ideas from your brand persona'} — select a row to generate.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-3">
              {ideasLoading && (
                <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <p className="text-sm font-medium">Loading ideas…</p>
                </div>
              )}

              {!ideasLoading && ideasError && (
                <div className="grid gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
                  <p className="text-sm text-destructive">{ideasError}</p>
                  <Button variant="outline" className="justify-self-center" onClick={() => kind && loadIdeas(kind)}>
                    <RefreshCw data-icon="inline-start" />
                    Try again
                  </Button>
                </div>
              )}

              {!ideasLoading && !ideasError && ideas && (
                <div className="grid max-h-[42vh] gap-2 overflow-auto pr-1">
                  {ideas.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No ideas returned — try again.</p>}
                  {ideas.map((idea) => {
                    const sel = selectedId2 === idea.id
                    return (
                      <button
                        key={idea.id}
                        type="button"
                        onClick={() => setSelectedId2(idea.id)}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                          sel ? 'border-foreground bg-muted/60' : 'hover:bg-muted/40',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold leading-tight">{idea.title}</div>
                          {sel && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-background"><Check className="size-3" /></span>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{idea.painPoint}</div>
                        {idea.angle && <div className="mt-1 text-xs italic text-muted-foreground/80">{idea.angle}</div>}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {idea.hooks.slice(0, 3).map((h, i) => (
                            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">"{h}"</span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {showInfluencerPicker && !ideasLoading && !ideasError && ideas && (
                <div className="grid gap-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium">Select influencer <span className="text-destructive">*</span></Label>
                    <div className="relative ml-auto w-48">
                      <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Search..." value={influencerSearch} onChange={(e) => setInfluencerSearch(e.target.value)} className="h-8 pl-7 text-xs" />
                    </div>
                  </div>
                  {influencersLoading ? (
                    <div className="grid place-items-center py-6 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading influencers…</div>
                  ) : !influencers?.length ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">No influencers yet — add one in Influencers.</p>
                  ) : filteredInfluencers.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">No match for "{influencerSearch}"</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-[22vh] overflow-auto pr-1">
                      {filteredInfluencers.map((inf) => {
                        const sel = selectedInfluencerId === inf.id
                        return (
                          <button key={inf.id} type="button" onClick={() => setSelectedInfluencerId(sel ? null : inf.id)} className={cn('overflow-hidden rounded-lg border text-left transition-all outline-none', sel ? 'border-foreground ring-2 ring-foreground/30' : 'hover:border-foreground/20')}>
                            <div className="aspect-square overflow-hidden bg-muted"><img src={inf.imageUrl} alt={inf.name} className="h-full w-full object-cover" /></div>
                            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                              <span className="truncate text-xs font-medium">{inf.name}</span>
                              {sel && <span className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-background"><Check className="size-2.5" /></span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {!selectedInfluencerId && <p className="text-xs text-destructive">Select an influencer for talking head.</p>}
                </div>
              )}

              {generateError && <p className="text-sm text-destructive">{generateError}</p>}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => { setStep('type'); setGenerateError(null) }} disabled={generating}>
                Back
              </Button>
              <Button onClick={handleGenerate} disabled={!selectedIdea || generating || (showInfluencerPicker && !selectedInfluencerId)}>
                {generating && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {generating ? 'Generating…' : 'Generate'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
