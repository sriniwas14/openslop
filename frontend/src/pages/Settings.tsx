import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AI_PROVIDERS, AI_PROVIDER_LABELS, type AiConfig, type AiPreferences, type AiProvider, createAiConfig, deleteAiConfig, getAiPreferences, listAiConfigs, setDefaultAiConfig, updateAiConfig, updateAiPreferences } from '@/services/ai'
import { type Company, createCompanySSE, deleteCompany, listCompanies, updateCompany } from '@/services/companies'
import { useCompany } from '@/context/CompanyContext'
import { cn } from '@/lib/utils'
import ModelSelector from '@/components/ai/ModelSelector'
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
  const [configs, setConfigs] = useState<AiConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<AiProvider>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [serviceAccountJson, setServiceAccountJson] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [location, setLocation] = useState('')
  const [configId, setConfigId] = useState('')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [prefs, setPrefs] = useState<AiPreferences>({ videoConfigId: null, videoModel: null, imageConfigId: null, imageModel: null, textConfigId: null, textModel: null })
  const [prefsSaving, setPrefsSaving] = useState(false)

  async function refresh() {
    try {
      setLoading(true)
      const [c, p] = await Promise.all([listAiConfigs(), getAiPreferences().catch(() => ({ videoConfigId: null, videoModel: null, imageConfigId: null, imageModel: null, textConfigId: null, textModel: null } as AiPreferences))])
      setConfigs(c); setPrefs(p as AiPreferences)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])
  function resetForm() { setProvider('openrouter'); setApiKey(''); setAccessKey(''); setSecretKey(''); setServiceAccountJson(''); setBaseUrl(''); setProjectId(''); setLocation(''); setConfigId(''); setName(''); setEditingId(null); setError(null) }
  function openAdd() { resetForm(); setDialogOpen(true) }
  function openEdit(c: AiConfig) { setEditingId(c.id); setProvider(c.provider as AiProvider); setApiKey(''); setAccessKey(''); setSecretKey(''); setServiceAccountJson(''); setBaseUrl(c.baseUrl ?? ''); setProjectId(c.projectId ?? ''); setLocation(c.location ?? ''); setConfigId((c as any).configId ?? ''); setName(c.name ?? ''); setDialogOpen(true) }
  function closeDialog() { setDialogOpen(false); resetForm() }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      if (editingId) await updateAiConfig(editingId, { provider, apiKey: apiKey || undefined, accessKey: accessKey || undefined, secretKey: secretKey || undefined, serviceAccountJson: serviceAccountJson || undefined, baseUrl: baseUrl || undefined, projectId: projectId || undefined, location: location || undefined, configId: configId || undefined, name: name || undefined })
      else await createAiConfig({ provider, apiKey: apiKey || undefined, accessKey: accessKey || undefined, secretKey: secretKey || undefined, serviceAccountJson: serviceAccountJson || undefined, baseUrl: baseUrl || undefined, projectId: projectId || undefined, location: location || undefined, configId: configId || undefined, name: name || undefined, isDefault: configs.length === 0 })
      closeDialog(); await refresh()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }
  const showBaseUrl = provider === 'ollama' || provider === 'custom'
  const showVertexSettings = provider === 'vertex'
  const showRunwayConfig = provider === 'runway'
  const showKlingAuth = provider === 'kling'
  const getCfg = (id: string | null) => configs.find((c) => c.id === id) ?? null
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>AI Providers</CardTitle>
            <CardDescription>Store API keys per provider (plaintext, per-user). Select your default model for persona generation.</CardDescription>
          </div>
          <Button size="sm" onClick={openAdd}>Add provider</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : configs.length === 0 ? <div className="text-sm text-muted-foreground">No providers yet — click Add provider.</div> : (
          <div className="grid gap-2">
            {configs.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="min-w-0 truncate font-medium">{c.name || AI_PROVIDER_LABELS[c.provider as AiProvider] || c.provider}</span><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{AI_PROVIDER_LABELS[c.provider as AiProvider] || c.provider}</span>{c.isDefault && <span className="rounded bg-foreground px-1.5 py-0.5 text-xs text-background">default</span>}</div>
                  <div className="truncate text-xs text-muted-foreground">{(c as any).configId || c.model || 'no model'} · {c.provider === 'vertex' ? (c.serviceAccountConfigured ? 'service account configured' : 'no service account') : c.provider === 'kling' ? (c.accessKeyMasked ?? 'no key') : (c.apiKeyMasked ?? 'no key')} {c.baseUrl ? `· ${c.baseUrl}` : ''} {c.provider === 'vertex' && c.projectId ? `· ${c.projectId}/${c.location || 'default'}` : ''} {(c as any).configId ? `· config ${ (c as any).configId}` : ''}</div>
                </div>
                <div className="flex gap-1">{!c.isDefault && <Button variant="outline" size="sm" onClick={async () => { await setDefaultAiConfig(c.id); await refresh() }}>Default</Button>}<Button variant="outline" size="sm" onClick={() => openEdit(c)}>Edit</Button><Button variant="ghost" size="sm" onClick={async () => { await deleteAiConfig(c.id); await refresh() }}>Delete</Button></div>
              </div>
            ))}
          </div>
        )}

        {/* ponytail: per-task routing — provider + model independent */}
        <div className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">Model routing <span className="text-xs text-muted-foreground font-normal">— each task requires provider + model</span></h3>
          <p className="text-xs text-muted-foreground">Provider holds credentials, model is chosen per task. Adding a provider does not pick a model.</p>
          {(["video", "image", "text"] as const).map((task) => {
            const cfgId = task === "video" ? prefs.videoConfigId : task === "image" ? prefs.imageConfigId : prefs.textConfigId
            const modelVal = task === "video" ? prefs.videoModel ?? "" : task === "image" ? prefs.imageModel ?? "" : prefs.textModel ?? ""
            const cfg = getCfg(cfgId ?? null)
            const providerForModel: AiProvider = (cfg?.provider as AiProvider) ?? "openrouter"
            return (
              <div key={task} className="grid gap-3 rounded-md border bg-background p-3">
                <Label className="capitalize">{task} <span className="text-destructive">*</span></Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid min-w-0 gap-1.5">
                    <span className="text-xs text-muted-foreground">Provider</span>
                    <select
                      value={cfgId ?? ""}
                      onChange={async (e) => {
                        const v = e.target.value || null
                        const key = task === "video" ? "videoConfigId" : task === "image" ? "imageConfigId" : "textConfigId"
                        const next = { ...prefs, [key]: v } as AiPreferences
                        // clear model if provider cleared
                        if (!v) (next as any)[task === "video" ? "videoModel" : task === "image" ? "imageModel" : "textModel"] = null
                        setPrefs(next)
                        setPrefsSaving(true)
                        try { await updateAiPreferences({ [key]: v, ...(v ? {} : { [task === "video" ? "videoModel" : task === "image" ? "imageModel" : "textModel"]: null } as any) }) } catch (err: any) { setError(err.message) } finally { setPrefsSaving(false) }
                      }}
                      disabled={configs.length === 0 || prefsSaving}
                      className="h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
                    >
                      <option value="">Select provider</option>
                      {configs.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || AI_PROVIDER_LABELS[c.provider as AiProvider] || c.provider} ({AI_PROVIDER_LABELS[c.provider as AiProvider] || c.provider})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid min-w-0 gap-1.5">
                    <span className="text-xs text-muted-foreground">Model</span>
                    <ModelSelector
                      provider={providerForModel}
                      task={task}
                      configId={cfgId ?? undefined}
                      value={modelVal}
                      onChange={async (v) => {
                        const key = task === "video" ? "videoModel" : task === "image" ? "imageModel" : "textModel"
                        const next = { ...prefs, [key]: v || null } as AiPreferences
                        setPrefs(next)
                        setPrefsSaving(true)
                        try { await updateAiPreferences({ [key]: v || null } as any) } catch (err: any) { setError(err.message) } finally { setPrefsSaving(false) }
                      }}
                      disabled={!cfgId || prefsSaving}
                    />
                  </div>
                </div>
                {!cfgId || !modelVal ? <p className="text-xs text-warning">Required — select provider and model for {task}.</p> : null}
              </div>
            )
          })}
          {prefsSaving && <p className="text-xs text-muted-foreground">Saving…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(v) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit provider' : 'Add provider'}</DialogTitle>
              <DialogDescription>Provider holds credentials only. Pick its model per task in routing above.</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2"><Label>Provider</Label><select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)} className="h-10 rounded-md border bg-transparent px-3 text-sm">{AI_PROVIDERS.map((p) => <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>)}</select></div>
              <div className="grid gap-2"><Label htmlFor="ai-name">Label (optional)</Label><Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My OpenRouter" maxLength={255} /></div>
              {provider !== 'vertex' && provider !== 'kling' && <div className="grid gap-2"><Label htmlFor="ai-key">API Key</Label><Input id="ai-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={editingId ? 'leave blank to keep' : 'sk-...'} />{provider === 'ollama' && <p className="text-xs text-muted-foreground">Ollama usually needs no key.</p>}{provider === 'fal' && <p className="text-xs text-muted-foreground">Use a fal.ai API key.</p>}</div>}
              {showKlingAuth && <>
                <div className="grid gap-2"><Label htmlFor="ai-ak">Kling Access Key (Ak)</Label><Input id="ai-ak" type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder={editingId ? 'leave blank to keep' : 'ak-...'} required={!editingId} /></div>
                <div className="grid gap-2"><Label htmlFor="ai-sk">Kling Secret Key (Sk)</Label><Input id="ai-sk" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={editingId ? 'leave blank to keep' : 'sk-...'} required={!editingId} /></div>
                <p className="text-xs text-muted-foreground">Get Ak/Sk from the Kling AI dashboard.</p>
              </>}
              {showVertexSettings && <>
                <div className="grid gap-2"><Label htmlFor="ai-service-account">Google service-account JSON</Label><textarea id="ai-service-account" value={serviceAccountJson} onChange={(e) => setServiceAccountJson(e.target.value)} placeholder={editingId ? 'leave blank to keep existing credentials' : '{"client_email":"...","private_key":"..."}'} className="min-h-28 rounded-md border bg-transparent px-3 py-2 font-mono text-xs" required={!editingId} /></div>
                <div className="grid gap-2"><Label htmlFor="ai-project">Google Cloud project ID</Label><Input id="ai-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="my-gcp-project" required /></div>
                <div className="grid gap-2"><Label htmlFor="ai-location">Vertex location</Label><Input id="ai-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="us-central1" required /></div>
              </>}
              {showRunwayConfig && <div className="grid gap-2"><Label htmlFor="ai-configId">Runway Router configId</Label><Input id="ai-configId" value={configId} onChange={(e) => setConfigId(e.target.value)} placeholder="preview-fast" maxLength={255} /><p className="text-xs text-muted-foreground">Router slug from Runway dashboard (e.g. preview-fast). Required for image/video via Runway.</p></div>}
              {showBaseUrl && <div className="grid gap-2"><Label htmlFor="ai-base">Base URL</Label><Input id="ai-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'} /></div>}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={saving || !provider}>{saving ? 'Saving…' : editingId ? 'Update' : 'Add'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
