import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useCompany } from '@/context/CompanyContext'
import { createInfluencer, previewInfluencer } from '@/services/influencers'
import type { InfluencerRow } from '@/services/influencers'

type Mode = 'choice' | 'upload' | 'generate'

const GENDERS = ['female', 'male'] as const
const POPULAR_ETHNICITIES = ['mixed', 'american', 'british', 'african', 'latino', 'indian', 'chinese', 'brazilian']
const MORE_ETHNICITIES = [
  'mexican', 'italian', 'french', 'spanish', 'german', 'scandinavian', 'polish', 'russian',
  'greek', 'turkish', 'arabic', 'japanese', 'korean', 'filipino', 'vietnamese', 'thai',
]
const HAIR = ['blonde', 'brown', 'black', 'red', 'grey']
const EYES = ['blue', 'brown', 'green', 'hazel']

// vibe = fashion only — background/pose/expression stay neutral studio
const VIBES = ['Gen Z','Aesthetic','Old Money','Y2K','Minimal','Streetwear','Cottagecore','Baddie','Clean Girl','Soft Girl','Grunge','Coquette','Quiet Luxury','Indie','Athleisure'] as const
const VIBE_TO_CLOTHING: Record<string, string> = {
  'gen z': 'trendy gen z streetwear, oversized hoodie and cargo pants',
  'aesthetic': 'soft aesthetic knitwear, neutral layered outfit',
  'old money': 'old money quiet luxury, tailored blazer, cashmere sweater, loafers',
  'y2k': 'y2k early 2000s, cropped top and low-rise denim',
  'minimal': 'minimal clean monochrome, understated tailoring',
  'streetwear': 'urban streetwear, oversized tee and sneakers',
  'cottagecore': 'cottagecore linen dress, pastoral knit',
  'baddie': 'baddie glam, bodycon dress, heels',
  'clean girl': 'clean girl, slick minimal, gold jewelry, tailored',
  'soft girl': 'soft girl pastel cardigan, pleated skirt',
  'grunge': 'grunge flannel, ripped denim, layered',
  'coquette': 'coquette lace blouse, bow, tulle skirt',
  'quiet luxury': 'quiet luxury, cashmere sweater and tailored trousers',
  'indie': 'indie vintage tee, thrifted layers, artsy',
  'athleisure': 'athleisure sporty set, sneakers, clean',
}

const HAIR_SWATCH: Record<string, string> = {
  blonde: '#F3E6B8',
  brown: '#8B5A2B',
  black: '#1E1E1E',
  red: '#C45A3A',
  grey: '#A3A3A3',
}

function ToggleRow({
  value,
  options,
  onChange,
  swatches,
}: {
  value: string
  options: readonly string[] | string[]
  onChange: (v: string) => void
  swatches?: Record<string, string>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all ${
              active
                ? 'border-primary/20 bg-accent text-accent-foreground shadow-sm'
                : 'border-input bg-card hover:border-primary/15 hover:bg-accent/40'
            }`}
          >
            {swatches?.[o] && (
              <span
                className="size-3 shrink-0 rounded-full border border-black/10"
                style={{ background: swatches[o] }}
                aria-hidden
              />
            )}
            {o}
            {active && <Check className="size-3 opacity-70" />}
          </button>
        )
      })}
    </div>
  )
}

export default function AddInfluencerDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: InfluencerRow) => void }) {
  const { selectedId } = useCompany()
  const companyId = selectedId
  const [mode, setMode] = useState<Mode>('choice')
  const [name, setName] = useState('')
  // upload
  const [uploadData, setUploadData] = useState<string | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  // generate — 3-step wizard
  const [genStep, setGenStep] = useState<1 | 2 | 3>(1)
  const [age, setAge] = useState(28)
  const [gender, setGender] = useState<string>('female')
  const [ethnicity, setEthnicity] = useState('mixed')
  const [hairStyle, setHairStyle] = useState('brown')
  const [eyeColor, setEyeColor] = useState('brown')
  const [vibe, setVibe] = useState<string>('Aesthetic')
  const [showMoreEth, setShowMoreEth] = useState(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // vibe only changes fashion — background/pose/expression locked neutral
  const attrs = {
    gender,
    ageRange: String(age),
    ethnicity,
    hairStyle,
    eyeColor,
    clothing: VIBE_TO_CLOTHING[vibe.toLowerCase()] ?? VIBE_TO_CLOTHING['aesthetic'],
    background: 'studio',
    vibe: 'neutral',
    pose: 'front facing',
  }

  const displayEthnicities = showMoreEth ? [...POPULAR_ETHNICITIES, ...MORE_ETHNICITIES] : POPULAR_ETHNICITIES
  const agePct = ((age - 18) / (95 - 18)) * 100
  const isGenerate = mode === 'generate'
  const dialogWidth = isGenerate ? 'w-[64vw] max-w-[1280px] min-w-[960px]' : 'w-[520px] max-w-[520px]'

  useEffect(() => {
    if (!open) return
    setMode('choice'); setName(''); setUploadData(null); setUploadPreview(null)
    setGenStep(1); setAge(28); setGender('female'); setEthnicity('mixed'); setHairStyle('brown'); setEyeColor('brown'); setVibe('Aesthetic'); setShowMoreEth(false)
    setPreviewUrl(null); setLastPrompt(null); setGenerating(false); setSaving(false); setError(null)
  }, [open])

  useEffect(() => {
    if (mode === 'generate' && genStep === 3 && !previewUrl && !generating && companyId) {
      void handleGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genStep, mode])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => { const s = String(reader.result); setUploadData(s); setUploadPreview(s) }
    reader.readAsDataURL(f)
  }

  const handleGenerate = async () => {
    if (!companyId || generating) return
    setGenerating(true); setError(null)
    try {
      const res = await previewInfluencer(companyId, { attributes: attrs as any })
      setPreviewUrl(res.previewUrl); setLastPrompt(res.prompt)
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed') } finally { setGenerating(false) }
  }

  const handleSaveUpload = async () => {
    if (!companyId || !name.trim() || !uploadData || saving) return
    setSaving(true); setError(null)
    try {
      const row = await createInfluencer(companyId, { name: name.trim(), imageData: uploadData, source: 'upload' })
      onCreated(row); onOpenChange(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') } finally { setSaving(false) }
  }

  const handleSaveGenerated = async () => {
    if (!companyId || !name.trim() || !previewUrl || saving) return
    setSaving(true); setError(null)
    try {
      const row = await createInfluencer(companyId, { name: name.trim(), imageUrl: previewUrl, attributes: { ...attrs, vibe: vibe.toLowerCase() } as any, prompt: lastPrompt ?? undefined, source: 'generated' })
      onCreated(row); onOpenChange(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`gap-5 p-8 rounded-2xl max-h-[92vh] overflow-auto ${dialogWidth}`}>
        {mode === 'choice' && (
          <>
            <DialogHeader className="gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Start here</p>
              <DialogTitle className="text-lg">Who will represent you?</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">Upload someone real, or conjure someone new — your brand, your face.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => setMode('upload')}
                className="group grid place-items-center gap-2.5 rounded-2xl border bg-gradient-to-b from-accent/60 to-card p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground ring-1 ring-primary/10">
                  <Upload className="size-5" />
                </span>
                <span className="text-sm font-semibold">A real photo</span>
                <span className="text-xs leading-relaxed text-muted-foreground">Upload a clear front-facing shot</span>
              </button>
              <button
                onClick={() => setMode('generate')}
                className="group grid place-items-center gap-2.5 rounded-2xl border bg-gradient-to-b from-accent/60 to-card p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground ring-1 ring-primary/10">
                  <Sparkles className="size-5" />
                </span>
                <span className="text-sm font-semibold">Dream them up</span>
                <span className="text-xs leading-relaxed text-muted-foreground">Mix, match, and make them yours</span>
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground">You can add more later — start with one.</p>
          </>
        )}

        {mode === 'upload' && (
          <>
            <DialogHeader className="gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Real is beautiful</p>
              <DialogTitle>Upload a photo</DialogTitle>
              <DialogDescription>A clear, front-facing shot works best. We’ll handle the rest.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Photo</Label>
                <Input type="file" accept="image/*" onChange={handleFile} className="cursor-pointer" />
              </div>
              {uploadPreview && <img src={uploadPreview} alt="preview" className="max-h-64 w-full rounded-2xl object-contain border bg-accent/20" />}
              {error && <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter className="bg-accent/20 border-accent/30 -mx-8 -mb-8 mt-1">
              <Button variant="ghost" onClick={() => setMode('choice')}>Back</Button>
              <Button onClick={handleSaveUpload} disabled={!name.trim() || !uploadData || saving} className="rounded-full">{saving && <Loader2 className="animate-spin" data-icon="inline-start" />}Save</Button>
            </DialogFooter>
          </>
        )}

        {mode === 'generate' && (
          <>
            <DialogHeader className="gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                {genStep === 1 && '01 — The basics'}
                {genStep === 2 && '02 — The look'}
                {genStep === 3 && '03 — The reveal'}
              </p>
              <DialogTitle className="text-lg">
                {genStep === 1 && 'Who are they?'}
                {genStep === 2 && 'How do they look?'}
                {genStep === 3 && 'Name & reveal ✨'}
              </DialogTitle>
              <DialogDescription className="leading-relaxed">
                {genStep === 1 && 'Pick a starting point — you can regenerate anytime.'}
                {genStep === 2 && 'From sun-kissed to silver — make them yours.'}
                {genStep === 3 && 'Give them a name, then keep the one you love.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1.5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${genStep >= n ? 'bg-primary' : 'bg-accent'}`} />
                ))}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">0{genStep} / 03</span>
            </div>

            {genStep === 1 && (
              <div className="grid gap-6 py-1">
                <div className="grid gap-2.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Gender</Label>
                  <ToggleRow value={gender} options={GENDERS} onChange={setGender} />
                  <p className="text-xs text-muted-foreground">Select gender.</p>
                </div>
                <div className="grid gap-3 rounded-2xl border border-accent bg-accent/20 p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Age</Label>
                    <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground ring-1 ring-primary/15 tabular-nums">{age}</span>
                  </div>
                  <div className="relative py-2">
                    <div className="h-2 w-full rounded-full bg-accent border border-primary/10 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${agePct}%` }} />
                    </div>
                    <input
                      type="range"
                      min={18}
                      max={95}
                      step={1}
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-white"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>18</span><span>95</span>
                  </div>
                </div>
              </div>
            )}

            {genStep === 2 && (
              <div className="grid gap-5 py-1">
                <div className="grid gap-2.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Hair Color</Label>
                  <ToggleRow value={hairStyle} options={HAIR} onChange={setHairStyle} swatches={HAIR_SWATCH} />
                </div>
                <div className="grid gap-2.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Eye Color</Label>
                  <ToggleRow value={eyeColor} options={EYES} onChange={setEyeColor} />
                </div>
                <div className="grid gap-2.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Fashion Style</Label>
                  <select
                    value={vibe}
                    onChange={(e) => setVibe(e.target.value)}
                    className="h-10 rounded-xl border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
                  >
                    {VIBES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Changes outfit only — background and pose remain neutral.</p>
                </div>
                <div className="grid gap-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Ethnicity</Label>
                    <span className="text-[11px] text-muted-foreground">{showMoreEth ? 'All 24' : 'Popular 8'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-auto pr-1">
                    {displayEthnicities.map((o) => {
                      const active = ethnicity === o
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setEthnicity(o)}
                          className={`inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                            active ? 'border-primary/20 bg-accent text-accent-foreground shadow-sm' : 'border-input bg-card hover:bg-accent/40'
                          }`}
                        >
                          {o}
                          {active && <Check className="size-3 opacity-60" />}
                        </button>
                      )
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowMoreEth((v) => !v)}
                    className="justify-self-start h-7 rounded-full text-xs text-primary hover:text-primary hover:bg-accent"
                  >
                    {showMoreEth ? 'Show less' : `Show 16 more`}
                  </Button>
                  <p className="text-xs text-muted-foreground">Popular options shown first. Select Show more for all 24.</p>
                </div>
              </div>
            )}

            {genStep === 3 && (
              <div className="grid gap-4 py-1">
                <div className="grid gap-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Influencer Name <span className="text-destructive">*</span></Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nova, Alex, Mira…" className="rounded-xl" />
                </div>

                <div className="overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-accent/20 to-card shadow-sm aspect-video grid place-items-center">
                  {previewUrl ? (
                    <img src={previewUrl} alt="generated" className="h-full w-full object-cover" />
                  ) : generating ? (
                    <div className="grid place-items-center gap-2 p-6 text-center">
                      <span className="grid size-9 place-items-center rounded-full bg-accent text-primary">
                        <Sparkles className="size-4 animate-pulse" />
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">Generating preview…</span>
                      <Loader2 className="size-4 animate-spin text-primary/60" />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Preview will appear here</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{gender}</span>
                  <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs text-accent-foreground">{age} years</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">
                    <span className="size-2.5 rounded-full border border-black/10" style={{ background: HAIR_SWATCH[hairStyle] ?? '#fff' }} />
                    {hairStyle} hair
                  </span>
                  <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{eyeColor} eyes</span>
                  <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{vibe}</span>
                  <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{ethnicity}</span>
                </div>

                {error && <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
                {!previewUrl && !generating && !error && <p className="text-xs leading-relaxed text-muted-foreground">We’ll use your image model from Settings → AI Providers. Takes ~30–60s.</p>}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleGenerate} disabled={generating} className="rounded-full">
                    {generating ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                    {generating ? 'Generating…' : 'Regenerate'}
                  </Button>
                  <Button onClick={handleSaveGenerated} disabled={!name.trim() || !previewUrl || saving || generating} className="flex-1 rounded-full shadow-sm">
                    {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check className="size-3" data-icon="inline-start" />}
                    Save
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter className="bg-accent/20 border-accent/30 -mx-8 -mb-8 mt-1 gap-2">
              {genStep === 1 && <Button variant="ghost" onClick={() => setMode('choice')} className="rounded-full">Back</Button>}
              {genStep === 1 && <Button onClick={() => { setError(null); setGenStep(2) }} className="rounded-full px-6">Next</Button>}
              {genStep === 2 && <Button variant="ghost" onClick={() => setGenStep(1)} className="rounded-full">Back</Button>}
              {genStep === 2 && <Button onClick={() => { setError(null); setGenStep(3) }} className="rounded-full px-6">Next</Button>}
              {genStep === 3 && <Button variant="ghost" onClick={() => setGenStep(2)} disabled={generating} className="rounded-full">Back</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
