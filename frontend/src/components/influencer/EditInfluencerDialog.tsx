import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { editPreviewInfluencer, updateInfluencer, type InfluencerRow } from '@/services/influencers'

export default function EditInfluencerDialog({
  open,
  onOpenChange,
  target,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  target: InfluencerRow | null
  onSaved: (row: InfluencerRow) => void
}) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [editedUrl, setEditedUrl] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayUrl = editedUrl ?? target?.imageUrl ?? null
  const nameChanged = target ? name.trim() !== '' && name.trim() !== target.name : false
  const canSave = !!target && (editedUrl !== null || nameChanged) && !generating && !saving

  useEffect(() => {
    if (!open || !target) return
    setName(target.name)
    setPrompt('')
    setEditedUrl(null)
    setLastPrompt(null)
    setGenerating(false)
    setSaving(false)
    setError(null)
  }, [open, target])

  const handleApply = async () => {
    if (!target || !prompt.trim() || generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await editPreviewInfluencer(target.id, { prompt: prompt.trim() })
      setEditedUrl(res.previewUrl)
      setLastPrompt(res.prompt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!target || saving) return
    const trimmed = name.trim()
    if (!trimmed) { setError('Name required'); return }
    if (!editedUrl && !nameChanged) return
    setSaving(true)
    setError(null)
    try {
      const row = await updateInfluencer(target.id, {
        name: nameChanged ? trimmed : undefined,
        imageUrl: editedUrl ?? undefined,
        prompt: lastPrompt ?? undefined,
      })
      onSaved(row)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!target) return null

  const attrs = target.attributes as any

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[64vw] max-w-[1280px] min-w-[960px] max-h-[92vh] overflow-auto gap-5 p-8 rounded-2xl">
        <DialogHeader className="gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Edit</p>
          <DialogTitle className="text-lg">Edit — {target.name}</DialogTitle>
          <DialogDescription className="leading-relaxed">Describe what to change — face stays the same unless you explicitly ask to change it. Background and pose remain neutral studio.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Influencer Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nova" className="rounded-xl" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-b from-accent/20 to-card shadow-sm aspect-video grid place-items-center">
            {generating ? (
              <div className="grid place-items-center gap-2 p-6 text-center">
                <span className="grid size-9 place-items-center rounded-full bg-accent text-primary">
                  <Sparkles className="size-4 animate-pulse" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">Applying your change…</span>
                <Loader2 className="size-4 animate-spin text-primary/60" />
              </div>
            ) : displayUrl ? (
              <img src={displayUrl} alt={target.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">No image</span>
            )}
          </div>

          {attrs && (
            <div className="flex flex-wrap gap-1.5">
              {attrs.gender && <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{String(attrs.gender)}</span>}
              {attrs.ageRange && <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs text-accent-foreground">{String(attrs.ageRange)} years</span>}
              {attrs.hairStyle && <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{String(attrs.hairStyle)} hair</span>}
              {attrs.eyeColor && <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{String(attrs.eyeColor)} eyes</span>}
              {attrs.ethnicity && <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs capitalize text-accent-foreground">{String(attrs.ethnicity)}</span>}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Prompt</Label>
            <div className="flex gap-2">
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. add aviator sunglasses, switch to old money tailored blazer"
                className="rounded-xl flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter' && prompt.trim().length >= 3) void handleApply() }}
              />
              <Button onClick={handleApply} disabled={prompt.trim().length < 3 || generating} className="rounded-full px-6 shrink-0">
                {generating ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                Apply
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Describe the change freely. Face is preserved unless you ask to change it.</p>
          </div>

          {error && <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="bg-accent/20 border-accent/30 -mx-8 -mb-8 mt-1 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave} className="rounded-full px-6 shadow-sm">
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check className="size-3" data-icon="inline-start" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
