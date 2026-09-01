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

const GENDERS = ['female', 'male', 'nonbinary']
const AGE = ['18-25', '25-35', '35-45', '45+']
const ETHNICITIES = [
  'american', 'italian', 'japanese', 'indian', 'korean', 'chinese', 'brazilian', 'mexican',
  'french', 'german', 'british', 'spanish', 'russian', 'greek', 'turkish', 'arabic',
  'african', 'latino', 'filipino', 'vietnamese', 'thai', 'polish', 'scandinavian', 'mixed',
]
const HAIR = ['blonde', 'brown', 'black', 'red', 'grey']
const EYES = ['blue', 'brown', 'green', 'hazel']
const CLOTHING = ['casual', 'business', 'streetwear', 'athletic', 'elegant']
const BG = ['studio', 'outdoor', 'urban', 'beach', 'office']
const VIBE = ['friendly', 'professional', 'edgy', 'warm', 'confident']
const POSE = ['front facing', '3/4 view', 'smiling', 'serious']

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
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
  // generate
  const [attrs, setAttrs] = useState({
    gender: 'female', ageRange: '25-35', ethnicity: 'mixed', hairStyle: 'brown', eyeColor: 'brown', clothing: 'casual', background: 'studio', vibe: 'friendly', pose: 'front facing',
  })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('choice'); setName(''); setUploadData(null); setUploadPreview(null)
    setAttrs({ gender: 'female', ageRange: '25-35', ethnicity: 'mixed', hairStyle: 'brown', eyeColor: 'brown', clothing: 'casual', background: 'studio', vibe: 'friendly', pose: 'front facing' })
    setPreviewUrl(null); setLastPrompt(null); setGenerating(false); setSaving(false); setError(null)
  }, [open])

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
      const row = await createInfluencer(companyId, { name: name.trim(), imageUrl: previewUrl, attributes: attrs as any, prompt: lastPrompt ?? undefined, source: 'generated' })
      onCreated(row); onOpenChange(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={mode === 'generate' ? 'sm:max-w-4xl' : 'sm:max-w-md'}>
        {mode === 'choice' && (
          <>
            <DialogHeader>
              <DialogTitle>Add New Influencer</DialogTitle>
              <DialogDescription>Upload a photo or generate a new AI influencer.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode('upload')} className="grid place-items-center gap-2 rounded-xl border p-8 hover:bg-muted/50">
                <Upload className="size-6" />
                <span className="text-sm font-medium">Upload</span>
                <span className="text-xs text-muted-foreground">Use a real photo</span>
              </button>
              <button onClick={() => setMode('generate')} className="grid place-items-center gap-2 rounded-xl border p-8 hover:bg-muted/50">
                <Sparkles className="size-6" />
                <span className="text-sm font-medium">Generate</span>
                <span className="text-xs text-muted-foreground">Create with AI</span>
              </button>
            </div>
          </>
        )}

        {mode === 'upload' && (
          <>
            <DialogHeader>
              <DialogTitle>Upload Influencer</DialogTitle>
              <DialogDescription>Upload a clear front-facing photo.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
              <Input type="file" accept="image/*" onChange={handleFile} />
              {uploadPreview && <img src={uploadPreview} alt="preview" className="max-h-64 w-full rounded-lg object-contain border" />}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode('choice')}>Back</Button>
              <Button onClick={handleSaveUpload} disabled={!name.trim() || !uploadData || saving}>{saving && <Loader2 className="animate-spin" data-icon="inline-start" />}Save</Button>
            </DialogFooter>
          </>
        )}

        {mode === 'generate' && (
          <>
            <DialogHeader>
              <DialogTitle>Generate Influencer</DialogTitle>
              <DialogDescription>Configure the look — preview on the right.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nova" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField label="Gender" value={attrs.gender} options={GENDERS} onChange={(v) => setAttrs((s) => ({ ...s, gender: v }))} />
                  <SelectField label="Age" value={attrs.ageRange} options={AGE} onChange={(v) => setAttrs((s) => ({ ...s, ageRange: v }))} />
                  <SelectField label="Ethnicity" value={attrs.ethnicity} options={ETHNICITIES} onChange={(v) => setAttrs((s) => ({ ...s, ethnicity: v }))} />
                  <SelectField label="Hair" value={attrs.hairStyle} options={HAIR} onChange={(v) => setAttrs((s) => ({ ...s, hairStyle: v }))} />
                  <SelectField label="Eyes" value={attrs.eyeColor} options={EYES} onChange={(v) => setAttrs((s) => ({ ...s, eyeColor: v }))} />
                  <SelectField label="Clothing" value={attrs.clothing} options={CLOTHING} onChange={(v) => setAttrs((s) => ({ ...s, clothing: v }))} />
                  <SelectField label="Background" value={attrs.background} options={BG} onChange={(v) => setAttrs((s) => ({ ...s, background: v }))} />
                  <SelectField label="Vibe" value={attrs.vibe} options={VIBE} onChange={(v) => setAttrs((s) => ({ ...s, vibe: v }))} />
                  <SelectField label="Pose" value={attrs.pose} options={POSE} onChange={(v) => setAttrs((s) => ({ ...s, pose: v }))} />
                </div>
                <Button onClick={handleGenerate} disabled={generating} variant="secondary">
                  {generating ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                  {generating ? 'Generating… uses image model' : previewUrl ? 'Regenerate' : 'Generate'}
                </Button>
                {error && <p className="text-xs text-destructive">{error}</p>}
                {!previewUrl && !generating && <p className="text-xs text-muted-foreground">Uses the image model from Settings → AI Providers.</p>}
              </div>
              <div className="grid gap-3">
                <div className="overflow-hidden rounded-xl border bg-muted/20 aspect-[3/4] grid place-items-center">
                  {previewUrl ? <img src={previewUrl} alt="generated" className="h-full w-full object-cover" /> : generating ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <span className="text-xs text-muted-foreground">Preview will appear here</span>}
                </div>
                {previewUrl && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleGenerate} disabled={generating}><Sparkles data-icon="inline-start" /> Regenerate</Button>
                    <Button onClick={handleSaveGenerated} disabled={!name.trim() || saving} className="flex-1">
                      {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check className="size-3" data-icon="inline-start" />}
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode('choice')}>Back</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
