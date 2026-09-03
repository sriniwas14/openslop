import { useCallback, useEffect, useRef, useState } from 'react'
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
import { fetchIdeas, generateFromIdea, listContentTemplates, type ContentTemplate, type Idea } from '@/services/content'
import { listInfluencers, type InfluencerRow } from '@/services/influencers'
import { CONTENT_TYPES, type ContentItem } from './data'

function toContentItem(row: any): ContentItem {
  const kind = row.kind as ContentItem['type']
  const meta = CONTENT_TYPES[kind]
  const summary = row.scripts?.[0]?.prompt?.slice(0, 220) ?? row.images?.[0]?.text?.slice(0, 220) ?? row.title
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

const TALKING_HEAD = 'talkinghead' as const

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

  // ponytail: duration locked from template, no picker
  const [duration, setDuration] = useState<15 | 30 | 45>(15)
  const [step, setStep] = useState<'templates' | 'ideas'>('templates')

  // templates — visual style for talkinghead only (ponytail: no kind, fixed)
  const [templates, setTemplates] = useState<ContentTemplate[] | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(4)
  const [selectedTemplate, setSelectedTemplate] = useState<ContentTemplate | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

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

  // reset on open
  useEffect(() => {
    if (!open) return
    setStep('templates')
    setDuration(15)
    setTemplates(null)
    setTemplatesLoading(false)
    setTemplatesError(null)
    setVisibleCount(4)
    setSelectedTemplate(null)
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

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    setTemplatesError(null)
    try {
      const rows = await listContentTemplates()
      setTemplates(rows)
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : 'Failed to load templates')
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && step === 'templates' && !templates && !templatesLoading && !templatesError) void loadTemplates()
  }, [open, step, templates, templatesLoading, templatesError, loadTemplates])

  // ponytail: auto load on scroll — IntersectionObserver sentinel increments visibleCount
  useEffect(() => {
    if (step !== 'templates' || !templates || visibleCount >= templates.length) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => Math.min(c + 4, templates.length))
      },
      { root: null, rootMargin: '200px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [step, templates, visibleCount])

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

  const loadIdeas = useCallback(async () => {
    if (!company) {
      setIdeasError('No brand selected — add a company first.')
      return
    }
    setIdeasLoading(true)
    setIdeasError(null)
    setIdeas(null)
    setSelectedId2(null)
    try {
      const res = await fetchIdeas(company.id, { kind: TALKING_HEAD, count: 5 })
      setIdeas(res.ideas)
    } catch (e) {
      setIdeasError(e instanceof Error ? e.message : 'Failed to load ideas — try again.')
    } finally {
      setIdeasLoading(false)
    }
  }, [company])

  const handleGenerate = async () => {
    if (!selectedIdea || !company || generating) return
    if (!selectedInfluencerId) {
      setGenerateError('Select an influencer for talking head')
      return
    }
    if (!selectedTemplate) {
      setGenerateError('Select a template style first')
      return
    }
    setGenerating(true)
    setGenerateError(null)
    try {
      // ponytail: structure injected into visualStyle — guides script beats without new API field
      const visualStyle = selectedTemplate.structure ? `${selectedTemplate.prompt}\nStructure: ${selectedTemplate.structure}` : selectedTemplate.prompt
      const row = await generateFromIdea(company.id, {
        idea: selectedIdea,
        selectedHook: selectedIdea.hooks[0],
        kind: TALKING_HEAD,
        duration,
        influencerId: selectedInfluencerId,
        visualStyle,
      })
      onCreate(toContentItem(row))
      onOpenChange(false)
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Generation failed — try again.')
    } finally {
      setGenerating(false)
    }
  }

  const meta = CONTENT_TYPES[TALKING_HEAD]
  const visibleTemplates = templates ? templates.slice(0, visibleCount) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 'templates' ? 'sm:max-w-[1170px]' : 'sm:max-w-2xl'}>
        {step === 'templates' ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-6 py-5">
                <h2 className="text-xl font-bold text-foreground">Choose a visual style</h2>
                <p className="mt-1 text-sm text-muted-foreground">Templates are visual styles for talking head videos — pick one to continue</p>
              </div>
              <div className="max-h-[64vh] overflow-y-auto p-6">
                {templatesLoading && (
                  <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    <p className="text-sm font-medium">Loading templates…</p>
                  </div>
                )}
                {!templatesLoading && templatesError && (
                  <div className="grid gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
                    <p className="text-sm text-destructive">{templatesError}</p>
                    <Button variant="outline" className="justify-self-center" onClick={() => loadTemplates()}>
                      <RefreshCw data-icon="inline-start" />
                      Try again
                    </Button>
                  </div>
                )}
                {!templatesLoading && !templatesError && templates && (
                  <>
                    <div
                      role="radiogroup"
                      aria-label="Visual style templates"
                      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
                    >
                      {visibleTemplates.map((t) => {
                        const sel = selectedTemplate?.id === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => {
                              setSelectedTemplate(t)
                              const d = Number(t.duration) as 15 | 30 | 45
                              if ([15, 30, 45].includes(d)) setDuration(d)
                            }}
                            className={cn(
                              'group relative isolate flex aspect-[9/16] cursor-pointer flex-col overflow-hidden rounded-[15px] border text-left shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
                              sel ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border',
                            )}
                          >
                            <img src={t.previewImage} alt={t.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                            <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white shadow">{t.duration}s</span>
                            {sel && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-white text-black shadow"><Check className="size-3.5" /></span>}
                            <div className="relative mt-auto p-3.5 pt-10">
                              <div className="line-clamp-2 text-[15px] font-extrabold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{t.title}</div>
                              {t.structure && <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-white/75">{t.structure}</div>}
                              <div className="mt-1 line-clamp-2 text-[12.5px] font-semibold leading-snug text-white/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">{t.prompt}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {/* sentinel for auto load */}
                    <div ref={sentinelRef} className="h-1" aria-hidden />
                    {visibleCount < templates.length && (
                      <p className="mt-3 text-center text-xs text-muted-foreground">Loading more… {visibleCount}/{templates.length}</p>
                    )}
                    {templates.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No templates yet.</p>}
                  </>
                )}
              </div>
            </div>
            <DialogFooter className="items-center gap-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={!selectedTemplate}
                onClick={() => {
                  if (selectedTemplate) {
                    const d = Number(selectedTemplate.duration) as 15 | 30 | 45
                    if ([15, 30, 45].includes(d)) setDuration(d)
                  }
                  setStep('ideas')
                  void loadIdeas()
                  void loadInfluencers()
                }}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-background', meta.gradient)}>
                  <meta.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg">Pick an idea</DialogTitle>
                  <DialogDescription>
                    {company ? `Ideas from ${company.name}'s brand persona` : 'Ideas from your brand persona'} — talking head, {duration}s
                    {selectedTemplate ? ` · ${selectedTemplate.title}${selectedTemplate.structure ? ` · ${selectedTemplate.structure}` : ''}` : ''}
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
                  <Button variant="outline" className="justify-self-center" onClick={() => loadIdeas()}>
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
                            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              "{h}"
                            </span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {!ideasLoading && !ideasError && ideas && (
                <div className="grid gap-2 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium">
                      Select influencer <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative ml-auto w-48">
                      <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Search..." value={influencerSearch} onChange={(e) => setInfluencerSearch(e.target.value)} className="h-8 pl-7 text-xs" />
                    </div>
                  </div>
                  {influencersLoading ? (
                    <div className="grid place-items-center py-6 text-xs text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Loading influencers…
                    </div>
                  ) : !influencers?.length ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">No influencers yet — add one in Influencers.</p>
                  ) : filteredInfluencers.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">No match for "{influencerSearch}"</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-[22vh] overflow-auto pr-1">
                      {filteredInfluencers.map((inf) => {
                        const sel = selectedInfluencerId === inf.id
                        return (
                          <button
                            key={inf.id}
                            type="button"
                            onClick={() => setSelectedInfluencerId(sel ? null : inf.id)}
                            className={cn(
                              'overflow-hidden rounded-lg border text-left transition-all outline-none',
                              sel ? 'border-foreground ring-2 ring-foreground/30' : 'hover:border-foreground/20',
                            )}
                          >
                            <div className="aspect-square overflow-hidden bg-muted">
                              <img src={inf.imageUrl} alt={inf.name} className="h-full w-full object-cover" />
                            </div>
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
              <Button variant="ghost" onClick={() => setStep('templates')} disabled={generating}>
                Back
              </Button>
              <Button onClick={handleGenerate} disabled={!selectedIdea || generating || !selectedInfluencerId}>
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
