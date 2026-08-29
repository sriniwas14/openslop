import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, RefreshCw, Sparkles } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { generateContent } from '@/services/ai'
import { useCompany } from '@/context/CompanyContext'
import {
  CONTENT_TYPES,
  PLATFORMS,
  type ContentItem,
  type ContentType,
  type Platform,
} from './data'
import { AiScorePill } from './primitives'

const TYPE_OPTIONS = Object.entries(CONTENT_TYPES) as [ContentType, (typeof CONTENT_TYPES)[ContentType]][]

function toDateString(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isPlatform(value: string): value is Platform {
  return value in PLATFORMS
}

export default function CreateContentDialog({
  open,
  onOpenChange,
  initialDate,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** optional ISO date used to pre-fill the schedule field (e.g. from calendar click) */
  initialDate: string | null
  onCreate: (item: ContentItem) => void
}) {
  const { companies, selectedId } = useCompany()
  const company = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null

  const [type, setType] = useState<ContentType | null>(null)
  const [step, setStep] = useState<'type' | 'details'>('type')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // AI-generated, user-editable plan
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [aiScore, setAiScore] = useState<number | null>(null)
  const [date, setDate] = useState('')

  const generated = aiScore !== null && title !== ''

  // reset the workflow every time the dialog opens
  useEffect(() => {
    if (!open) return
    setType(null)
    setStep('type')
    setGenerating(false)
    setError(null)
    setTitle('')
    setSummary('')
    setPlatforms([])
    setAiScore(null)
    setDate(toDateString(initialDate))
  }, [open, initialDate])

  // persona-driven generation — the only input is the content type
  const handleGenerate = useCallback(async () => {
    if (!type || generating) return
    if (!company) {
      setError('No brand selected — add a company first.')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const result = await generateContent({ type, companyId: company.id })
      setTitle(result.title)
      setSummary(result.summary)
      setPlatforms(result.platforms.filter(isPlatform))
      setAiScore(result.aiScore)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Content generation failed — try again.')
    } finally {
      setGenerating(false)
    }
  }, [type, generating, company])

  // generate automatically as soon as a type is picked
  useEffect(() => {
    if (open && step === 'details' && type && !generated && !generating && !error) {
      void handleGenerate()
    }
  }, [open, step, type, generated, generating, error, handleGenerate])

  const handleCreate = () => {
    if (!type || !title.trim()) return
    onCreate({
      id: crypto.randomUUID(),
      title: title.trim(),
      summary: summary.trim() || 'Planned from your brand persona.',
      type,
      platforms: platforms.length > 0 ? platforms : [CONTENT_TYPES[type].platforms[0]],
      status: date ? 'scheduled' : 'draft',
      scheduledAt: date ? new Date(`${date}T09:00:00`).toISOString() : null,
      aiScore: aiScore ?? Math.round(55 + Math.random() * 35),
    })
    onOpenChange(false)
  }

  const backToTypes = () => {
    setStep('type')
    setError(null)
    setTitle('')
    setSummary('')
    setPlatforms([])
    setAiScore(null)
  }

  const meta = type ? CONTENT_TYPES[type] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 'type' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>
        {step === 'type' || !meta ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">Create Content</DialogTitle>
              <DialogDescription>
                Pick a content type — AI will plan it from your brand persona.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Content type">
              {TYPE_OPTIONS.map(([value, m]) => {
                const selected = type === value
                const Icon = m.icon
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setType(value)
                      setStep('details')
                    }}
                    className={cn(
                      'group relative flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all outline-none',
                      'hover:border-foreground/25 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
                      selected && 'border-foreground bg-muted/60 ring-2 ring-foreground/70',
                    )}
                  >
                    <div
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-xs',
                        m.gradient,
                      )}
                    >
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
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white', meta.gradient)}>
                  <meta.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg">New {meta.label.toLowerCase()}</DialogTitle>
                  <DialogDescription>
                    {company ? `Generated from ${company.name}'s brand persona.` : 'Generated from your brand persona.'}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-4">
              {generating && (
                <div className="grid place-items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <div className="grid gap-1">
                    <p className="text-sm font-medium">Generating from your brand persona…</p>
                    <p className="text-xs text-muted-foreground">
                      AI is matching {meta.label.toLowerCase()} ideas to your audience, voice and positioning.
                    </p>
                  </div>
                </div>
              )}

              {!generating && error && (
                <div className="grid gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button variant="outline" className="justify-self-center" onClick={handleGenerate}>
                    <RefreshCw data-icon="inline-start" />
                    Try again
                  </Button>
                </div>
              )}

              {!generating && !error && generated && (
                <div className="grid gap-3.5 rounded-xl border bg-muted/30 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Sparkles className="size-3" />
                      AI plan
                    </span>
                    <div className="flex items-center gap-2">
                      <AiScorePill score={aiScore} />
                      <Button variant="ghost" size="xs" onClick={handleGenerate} title="Regenerate">
                        <RefreshCw data-icon="inline-start" />
                        Regenerate
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="content-title">Title</Label>
                    <Input id="content-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="content-summary">Description</Label>
                    <Textarea id="content-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>Platforms</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(platforms.length > 0 ? platforms : meta.platforms.slice(0, 2)).map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          <span className={cn('size-1.5 rounded-full', PLATFORMS[p].dot)} />
                          {PLATFORMS[p].label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="content-date">Schedule</Label>
                    <Input id="content-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Leave empty to save as a draft.</p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={backToTypes} disabled={generating}>
                Back
              </Button>
              <Button disabled={!generated || !title.trim() || generating} onClick={handleCreate}>
                {date ? 'Create & schedule' : 'Create draft'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
