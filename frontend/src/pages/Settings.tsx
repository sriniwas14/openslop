import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Company, createCompanySSE, deleteCompany, listCompanies, updateCompany } from '@/services/companies'
import { useCompany } from '@/context/CompanyContext'
import { cn } from '@/lib/utils'
import ApifySettings from '@/components/integrations/ApifySettings'

function CompanyDetailDialog({
  company,
  isActive,
  onClose,
  onRefresh,
  onSetActive,
}: {
  company: Company
  isActive: boolean
  onClose: () => void
  onRefresh: () => Promise<void>
  onSetActive: (id: string) => void
}) {
  const [name, setName] = useState(company.name)
  const [website, setWebsite] = useState(company.website ?? '')
  const [persona, setPersona] = useState(company.persona ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    try { new URL(website) } catch { setError('Invalid website URL'); return }
    setSaving(true)
    try {
      await updateCompany(company.id, { name: name.trim(), website: website.trim(), persona: persona.trim() ? persona.trim() : null })
      await onRefresh()
      onClose()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${company.name}?`)) return
    setDeleting(true)
    try { await deleteCompany(company.id); await onRefresh(); onClose() } catch (e: any) { setError(e.message); setDeleting(false) }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="truncate">{company.name}</DialogTitle>
            {isActive && <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">Active</span>}
          </div>
          <DialogDescription>Company info — the persona powers idea & content generation.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-3.5 text-sm">
            <div className="min-w-0 grid gap-0.5">
              <dt className="text-xs text-muted-foreground">Website</dt>
              <dd className="truncate font-medium">
                {company.website ? (
                  <a href={company.website} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80">{company.website.replace(/^https?:\/\//, '')}</a>
                ) : '—'}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd className="font-medium tabular-nums">{new Date(company.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="col-span-2 grid gap-0.5">
              <dt className="text-xs text-muted-foreground">Persona</dt>
              <dd className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {company.persona ? (company.persona.length > 240 ? `${company.persona.slice(0, 240)}…` : company.persona) : 'No persona yet — generated when the company is created.'}
              </dd>
            </div>
          </dl>

          <div className="grid gap-2">
            <Label htmlFor="cd-name">Name</Label>
            <Input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cd-website">Website</Label>
            <Input id="cd-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cd-persona">Persona</Label>
            <textarea
              id="cd-persona"
              value={persona}
              onChange={(e) => setPersona(e.target.value.slice(0, 10000))}
              maxLength={10000}
              rows={6}
              placeholder="Audience, voice, values… (max 10k)"
              className="min-h-[100px] rounded-md border bg-transparent p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{persona.length} / 10,000</span>
              {persona && <button type="button" className="underline hover:text-foreground" onClick={() => setPersona('')}>Clear</button>}
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="destructive" disabled={deleting} onClick={handleDelete}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          <div className="flex gap-2">
            {!isActive && <Button variant="outline" onClick={() => { onSetActive(company.id); onClose() }}>Set active</Button>}
            <Button disabled={saving || !name.trim() || !website.trim()} onClick={handleSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GeneralTab() {
  const { selectedId, setSelectedId } = useCompany()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<string>('')

  async function refresh() {
    try {
      setLoading(true)
      setCompanies(await listCompanies())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const detail = companies.find((c) => c.id === detailId) ?? null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try { new URL(website) } catch { setError('Invalid website URL'); return }
    setSaving(true)
    setProgress('Creating…')
    try {
      await createCompanySSE({ name, website }, { onProgress: (ev: any) => setProgress(typeof ev === 'string' ? ev : ev?.type ?? JSON.stringify(ev).slice(0, 120)) })
      setName(''); setWebsite('')
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false); setProgress('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies</CardTitle>
        <CardDescription>Select a company to view its details, persona and edit them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : companies.length === 0 ? (
          <div className="text-sm text-muted-foreground">No companies yet — add one below.</div>
        ) : (
          <div className="grid gap-2">
            {companies.map((c) => {
              const isActive = c.id === selectedId
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailId(c.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(c.id) } }}
                  className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors outline-none hover:bg-muted/30 focus-visible:bg-muted/30', isActive && 'border-foreground/40 bg-muted/30')}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.name}</span>
                      {isActive && <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">Active</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{c.website ?? '—'} {c.persona ? `· ${c.persona.slice(0, 80)}…` : '· no persona'}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
              )
            })}
          </div>
        )}

        <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">Add company</h3>
          <div className="grid gap-2">
            <Label htmlFor="co-name">Name</Label>
            <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" required maxLength={255} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="co-website">Website</Label>
            <Input id="co-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" required />
            <p className="text-xs text-muted-foreground">Persona is generated from the website during creation.</p>
          </div>
          {progress && <p className="text-xs text-muted-foreground">Progress: {progress}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !name || !website}>{saving ? 'Saving…' : 'Create'}</Button>
          </div>
        </form>
      </CardContent>
      {detail && (
        <CompanyDetailDialog
          key={detail.id}
          company={detail}
          isActive={detail.id === selectedId}
          onClose={() => setDetailId(null)}
          onRefresh={refresh}
          onSetActive={setSelectedId}
        />
      )}
    </Card>
  )
}

function AiProvidersTab() {
  // ponytail: server-managed keys (OPENROUTER_API_KEY) — per-user key UI removed
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Providers</CardTitle>
        <CardDescription>AI is managed by us via OpenRouter — no API keys needed.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Models are configured server-side. Contact support if generation fails.</p>
      </CardContent>
    </Card>
  )
}

export default function Settings() {
  const [tab, setTab] = useState<'general' | 'ai' | 'integrations'>('general')
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="flex gap-2 border-b">
        <button onClick={() => setTab('general')} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === 'general' ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>General</button>
        <button onClick={() => setTab('ai')} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === 'ai' ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>AI Providers</button>
        <button onClick={() => setTab('integrations')} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === 'integrations' ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Integrations</button>
      </div>
      {tab === 'general' ? <GeneralTab /> : tab === 'ai' ? <AiProvidersTab /> : <ApifySettings />}
    </div>
  )
}
