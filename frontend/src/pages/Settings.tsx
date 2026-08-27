import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AI_PROVIDERS, type AiConfig, type AiProvider, createAiConfig, deleteAiConfig, listAiConfigs, setDefaultAiConfig, updateAiConfig } from '@/services/ai'
import { type Company, createCompanySSE, deleteCompany, listCompanies, updateCompany } from '@/services/companies'
import ModelSelector from '@/components/ai/ModelSelector'

function GeneralTab() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [persona, setPersona] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
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

  function resetForm() {
    setName(''); setWebsite(''); setPersona(''); setEditingId(null); setProgress(''); setError(null)
  }

  function startEdit(c: Company) {
    setEditingId(c.id); setName(c.name); setWebsite(c.website ?? ''); setPersona(c.persona ?? '')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try { new URL(website) } catch { setError('Invalid website URL'); return }
    setSaving(true)
    try {
      if (editingId) {
        await updateCompany(editingId, { name, website, persona: persona.trim() ? persona.trim() : null })
        resetForm()
        await refresh()
      } else {
        setProgress('Creating…')
        await createCompanySSE({ name, website }, { onProgress: (ev: any) => setProgress(typeof ev === 'string' ? ev : ev?.type ?? JSON.stringify(ev).slice(0, 120)) })
        resetForm()
        await refresh()
      }
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
        <CardDescription>Create, edit and delete companies. Creation streams persona generation via SSE.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : companies.length === 0 ? (
          <div className="text-sm text-muted-foreground">No companies yet — add one below.</div>
        ) : (
          <div className="grid gap-2">
            {companies.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.website ?? '—'} {c.persona ? `· ${c.persona.slice(0, 80)}…` : '· no persona'}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => startEdit(c)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={async () => { if (!confirm(`Delete ${c.name}?`)) return; await deleteCompany(c.id); await refresh() }}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">{editingId ? 'Edit company' : 'Add company'}</h3>
          <div className="grid gap-2">
            <Label htmlFor="co-name">Name</Label>
            <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" required maxLength={255} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="co-website">Website</Label>
            <Input id="co-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" required />
          </div>
          {editingId && (
            <div className="grid gap-2">
              <Label htmlFor="co-persona">Persona</Label>
              <textarea
                id="co-persona"
                value={persona}
                onChange={(e) => setPersona(e.target.value.slice(0, 10000))}
                maxLength={10000}
                rows={8}
                placeholder="Audience, voice, values… (max 10k)"
                className="min-h-[120px] rounded-md border bg-transparent p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{persona.length} / 10,000</span>
                {persona && <button type="button" className="underline hover:text-foreground" onClick={() => setPersona('')}>Clear</button>}
              </div>
            </div>
          )}
          {progress && <p className="text-xs text-muted-foreground">Progress: {progress}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !name || !website}>{saving ? 'Saving…' : editingId ? 'Update' : 'Create'}</Button>
            {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function AiProvidersTab() {
  const [configs, setConfigs] = useState<AiConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<AiProvider>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function refresh() {
    try { setLoading(true); setConfigs(await listAiConfigs()) } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])
  function resetForm() { setProvider('openrouter'); setApiKey(''); setBaseUrl(''); setModel(''); setName(''); setEditingId(null) }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      if (editingId) await updateAiConfig(editingId, { provider, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined, model: model || undefined, name: name || undefined })
      else await createAiConfig({ provider, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined, model: model || undefined, name: name || undefined, isDefault: configs.length === 0 })
      resetForm(); await refresh()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }
  function startEdit(c: AiConfig) { setEditingId(c.id); setProvider(c.provider as AiProvider); setApiKey(''); setBaseUrl(c.baseUrl ?? ''); setModel(c.model ?? ''); setName(c.name ?? '') }
  const showBaseUrl = provider === 'ollama' || provider === 'custom'
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Providers</CardTitle>
        <CardDescription>Store API keys per provider (plaintext, per-user). Select your default model for persona generation.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : configs.length === 0 ? <div className="text-sm text-muted-foreground">No providers yet — add one below.</div> : (
          <div className="grid gap-2">
            {configs.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="font-medium">{c.name || c.provider}</span><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.provider}</span>{c.isDefault && <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">default</span>}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.model || 'no model'} · {c.apiKeyMasked ?? 'no key'} {c.baseUrl ? `· ${c.baseUrl}` : ''}</div>
                </div>
                <div className="flex gap-1">{!c.isDefault && <Button variant="outline" size="sm" onClick={async () => { await setDefaultAiConfig(c.id); await refresh() }}>Default</Button>}<Button variant="outline" size="sm" onClick={() => startEdit(c)}>Edit</Button><Button variant="ghost" size="sm" onClick={async () => { await deleteAiConfig(c.id); await refresh() }}>Delete</Button></div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">{editingId ? 'Edit provider' : 'Add provider'}</h3>
          <div className="grid gap-2"><Label>Provider</Label><select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)} className="h-9 rounded-md border bg-transparent px-3 text-sm">{AI_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div className="grid gap-2"><Label htmlFor="ai-name">Label (optional)</Label><Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My OpenRouter" maxLength={255} /></div>
          <div className="grid gap-2"><Label htmlFor="ai-key">API Key</Label><Input id="ai-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={editingId ? 'leave blank to keep' : 'sk-...'} />{provider === 'ollama' && <p className="text-xs text-muted-foreground">Ollama usually needs no key.</p>}</div>
          {showBaseUrl && <div className="grid gap-2"><Label htmlFor="ai-base">Base URL</Label><Input id="ai-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'} /></div>}
          <div className="grid gap-2"><Label>Model</Label><ModelSelector provider={provider} configId={editingId ?? undefined} apiKey={apiKey || undefined} baseUrl={baseUrl || undefined} value={model} onChange={setModel} /><p className="text-xs text-muted-foreground">Curated list shown immediately — type API key above for live preview (openai/openrouter/xai/ollama).</p></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2"><Button type="submit" disabled={saving || !provider}>{saving ? 'Saving…' : editingId ? 'Update' : 'Add'}</Button>{editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}</div>
        </form>
      </CardContent>
    </Card>
  )
}

export default function Settings() {
  const [tab, setTab] = useState<'general' | 'ai'>('general')
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="flex gap-2 border-b">
        <button onClick={() => setTab('general')} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === 'general' ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>General</button>
        <button onClick={() => setTab('ai')} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === 'ai' ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>AI Providers</button>
      </div>
      {tab === 'general' ? <GeneralTab /> : <AiProvidersTab />}
    </div>
  )
}
