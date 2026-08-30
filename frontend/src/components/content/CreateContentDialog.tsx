import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCompany } from '@/context/CompanyContext'
import { fetchIdeas, generateFromIdea, type Idea } from '@/services/content'
import { CONTENT_TYPES, type ContentItem, type ContentType } from './data'

const TYPE_OPTIONS = Object.entries(CONTENT_TYPES) as [ContentType, (typeof CONTENT_TYPES)[ContentType]][]

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
  const [step, setStep] = useState<'type' | 'ideas'>('type')

  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [ideasError, setIdeasError] = useState<string | null>(null)
  const [selectedId2, setSelectedId2] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const selectedIdea = ideas?.find((i) => i.id === selectedId2) ?? null

  useEffect(() => {
    if (!open) return
    setKind(null)
    setStep('type')
    setIdeas(null)
    setIdeasLoading(false)
    setIdeasError(null)
    setSelectedId2(null)
    setGenerating(false)
    setGenerateError(null)
  }, [open])

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
    setStep('ideas')
    void loadIdeas(k)
  }

  const handleGenerate = async () => {
    if (!selectedIdea || !kind || !company || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const row = await generateFromIdea(company.id, {
        idea: selectedIdea,
        selectedHook: selectedIdea.hooks[0],
        kind,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 'type' ? 'sm:max-w-2xl' : 'sm:max-w-xl'}>
        {step === 'type' ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">Create Content</DialogTitle>
              <DialogDescription>Pick a content type — we'll generate ideas from your brand persona.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Content type">
              {TYPE_OPTIONS.map(([value, m]) => {
                const selected = kind === value
                const Icon = m.icon
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handlePickKind(value)}
                    className={cn(
                      'group relative flex flex-col items-start gap-3 rounded-xl border p-3.5 text-left transition-all outline-none',
                      'hover:border-foreground/25 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
                      selected && 'border-foreground bg-muted/60 ring-2 ring-foreground/70',
                    )}
                  >
                    <div className={cn('grid size-9 place-items-center rounded-lg bg-gradient-to-br text-white shadow-xs', m.gradient)}>
                      <Icon className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{m.label}</div>
                      <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{m.description}</div>
                    </div>
                    {selected && (
                      <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                {meta && (
                  <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white', meta.gradient)}>
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

              {generateError && <p className="text-sm text-destructive">{generateError}</p>}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => { setStep('type'); setGenerateError(null) }} disabled={generating}>
                Back
              </Button>
              <Button onClick={handleGenerate} disabled={!selectedIdea || generating}>
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
