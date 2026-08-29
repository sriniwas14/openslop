import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession, signUp, signIn } from '@/services/auth'
import { AI_PROVIDERS, type AiConfig, type AiPreferences, type AiProvider, createAiConfig, getAiPreferences, getOnboardingProgress, listAiConfigs, saveOnboardingProgress, updateAiPreferences } from '@/services/ai'
import { createCompanySSE, listCompanies } from '@/services/companies'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ModelSelector from '@/components/ai/ModelSelector'

export default function Onboarding() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // step 1: user
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userError, setUserError] = useState<string | null>(null)
  const [userLoading, setUserLoading] = useState(false)
  const [isSignInMode, setIsSignInMode] = useState(false)

  // step 2: providers (credentials only) + routing (provider+model per task, all required)
  const [configs, setConfigs] = useState<AiConfig[]>([])
  const [prefs, setPrefs] = useState<AiPreferences>({ videoConfigId: null, videoModel: null, imageConfigId: null, imageModel: null, textConfigId: null, textModel: null })
  const [provider, setProvider] = useState<AiProvider>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [aiName, setAiName] = useState('')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerSaving, setProviderSaving] = useState(false)

  // step 3: company
  const [companyName, setCompanyName] = useState('')
  const [website, setWebsite] = useState('')
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [companyProgress, setCompanyProgress] = useState<string>('')
  const [companyLoading, setCompanyLoading] = useState(false)

  const showBaseUrl = provider === 'ollama' || provider === 'custom'
  const [resolving, setResolving] = useState(false)

  const getCfg = (id: string | null) => configs.find((c) => c.id === id) ?? null

  async function refreshConfigsAndPrefs() {
    const [c, p] = await Promise.all([listAiConfigs().catch(() => [] as AiConfig[]), getAiPreferences().catch(() => ({ videoConfigId: null, videoModel: null, imageConfigId: null, imageModel: null, textConfigId: null, textModel: null } as AiPreferences))])
    setConfigs(c)
    setPrefs(p)
    return { c, p }
  }

  // resume from DB
  useEffect(() => {
    if (isPending) return
    if (!session) { setStep(1); return }
    setResolving(true)
    let cancelled = false
    Promise.all([
      listAiConfigs().catch(() => [] as AiConfig[]),
      listCompanies().catch(() => [] as any[]),
      getAiPreferences().catch(() => null),
      getOnboardingProgress().catch(() => null),
    ]).then(([ai, companies, pref, prog]) => {
      if (cancelled) return
      const hasUsableCompany = (companies as any[]).some((c: any) => !!c.persona)
      // restore progress if exists
      if (prog?.data) {
        try {
          const d = JSON.parse(prog.data as string)
          if (d.companyName) setCompanyName(d.companyName)
          if (d.website) setWebsite(d.website)
          if (d.aiName) setAiName(d.aiName)
          // prefs from progress not needed — prefs are source of truth, but restore for fresh session before prefs saved
        } catch {}
        const s = parseInt(String(prog.step), 10)
        if (s >=1 && s <=3) {
          // ponytail: only count companies with persona — orphans don't complete wizard
          if (pref && (pref as AiPreferences).videoModel && (pref as AiPreferences).imageModel && (pref as AiPreferences).textModel && ai.length>0 && hasUsableCompany) {
            navigate('/dashboard', { replace: true })
            return
          }
          if (s) setStep(s as 1|2|3)
          setResolving(false)
          return
        }
      }
      if (pref && (pref as any).videoModel && (pref as any).imageModel && (pref as any).textModel) {
        // prefs complete — check companies
        if (ai.length > 0 && hasUsableCompany) { navigate('/dashboard', { replace: true }); return }
        if (!hasUsableCompany) setStep(3)
        else setStep(2)
      } else if (ai.length === 0) setStep(2)
      else if (!hasUsableCompany) setStep(3)
      else if (ai.length > 0 && !pref?.videoModel) setStep(2)
      setResolving(false)
      if (pref) setPrefs(pref as AiPreferences)
      setConfigs(ai)
    })
    return () => { cancelled = true }
  }, [isPending, session, navigate])

  // persist progress on step/data changes (debounced via timeout)
  const saveProgress = useCallback(async (s: number, extra?: Record<string, unknown>) => {
    if (!session) return
    const data = { companyName, website, aiName, ...extra }
    try { await saveOnboardingProgress({ step: String(s), data }) } catch {}
  }, [session, companyName, website, aiName])

  useEffect(() => {
    if (!session || resolving) return
    // ponytail: fire-and-forget progress — resume from where left off
    if (step === 2 || step === 3) {
      const t = setTimeout(() => { void saveProgress(step) }, 600)
      return () => clearTimeout(t)
    }
  }, [step, companyName, website, aiName, session, resolving, saveProgress])

  async function onSubmitUser(e: FormEvent) {
    e.preventDefault()
    setUserError(null)
    setUserLoading(true)
    try {
      if (isSignInMode) {
        const { error } = await signIn.email({ email, password })
        if (error) throw new Error(error.message ?? 'Sign in failed')
      } else {
        const { error } = await signUp.email({ name, email, password })
        if (error) throw new Error(error.message ?? 'Sign up failed')
      }
      setStep(2)
      void saveOnboardingProgress({ step: "2", data: {} })
    } catch (err: any) {
      setUserError(err.message ?? String(err))
    } finally {
      setUserLoading(false)
    }
  }

  async function addProviderInOnboarding(e: FormEvent) {
    e.preventDefault()
    setAiError(null)
    if (!provider) { setAiError('Select provider'); return }
    setProviderSaving(true)
    try {
      const c = await createAiConfig({ provider, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined, name: aiName || undefined, isDefault: configs.length===0 })
      setApiKey(''); setBaseUrl(''); setAiName('')
      setProviderDialogOpen(false)
      await refreshConfigsAndPrefs()
      void saveProgress(2, { lastAddedConfigId: c.id })
    } catch (err: any) { setAiError(err.message ?? String(err)) } finally { setProviderSaving(false) }
  }

  async function onSubmitAi(e: FormEvent) {
    e.preventDefault()
    setAiError(null)
    if (!prefs.videoConfigId || !prefs.videoModel || !prefs.imageConfigId || !prefs.imageModel || !prefs.textConfigId || !prefs.textModel) {
      setAiError('Video, image and text are required — select provider + model for each.')
      return
    }
    if (!session) { setAiError('Not authenticated'); setStep(1); return }
    setAiLoading(true)
    try {
      // prefs already saved on each change; ensure final save
      await updateAiPreferences(prefs)
      await saveOnboardingProgress({ step: "3", data: { companyName, website } })
      setStep(3)
    } catch (err: any) { setAiError(err.message ?? String(err)) } finally { setAiLoading(false) }
  }

  async function onSubmitCompany(e: FormEvent) {
    e.preventDefault()
    setCompanyError(null)
    setCompanyProgress('')
    if (!companyName.trim() || !website.trim()) { setCompanyError('Name and website are required'); return }
    try { new URL(website) } catch { setCompanyError('Invalid website URL'); return }
    if (!session) { setCompanyError('Not authenticated'); setStep(1); return }
    setCompanyLoading(true)
    try {
      setCompanyProgress('Creating company…')
      await createCompanySSE({ name: companyName, website }, { onProgress: (ev: any) => setCompanyProgress(typeof ev === 'string' ? ev : ev?.type ?? ev?.id ?? JSON.stringify(ev).slice(0, 120)) })
      await saveOnboardingProgress({ step: "3", data: {} })
      navigate('/dashboard', { replace: true })
    } catch (err: any) { setCompanyError(err.message ?? String(err)) } finally { setCompanyLoading(false) }
  }

  if (isPending || (session && step === 1 && resolving)) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Loading…</div>

  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: 'Create User' },
    { n: 2, label: 'Configure AI Models' },
    { n: 3, label: 'Add Company' },
  ]

  return (
    <main className="grid min-h-svh place-items-center bg-muted/20 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Welcome — let’s get you set up</CardTitle>
          <CardDescription>3 quick steps. You’ll land in the dashboard only after the company is created successfully.</CardDescription>
          <div className="mt-4 flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s.n} className="flex flex-1 items-center gap-2">
                <div className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${step === s.n ? 'bg-primary text-primary-foreground border-primary' : step > s.n ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-background text-muted-foreground'}`}>{s.n}</div>
                <span className={`hidden text-xs sm:inline ${step === s.n ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                {i < steps.length - 1 && <div className={`mx-1 h-px flex-1 ${step > s.n ? 'bg-primary/40' : 'bg-border'}`} />}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {step === 1 && !session && (
            <form onSubmit={onSubmitUser} className="grid gap-4">
              <h3 className="font-medium">{isSignInMode ? 'Sign in' : 'Create user'}</h3>
              {!isSignInMode && (
                <div className="grid gap-2">
                  <Label htmlFor="ob-uname">Name</Label>
                  <Input id="ob-uname" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required={!isSignInMode} />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="ob-email">Email</Label>
                <Input id="ob-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-pwd">Password</Label>
                <Input id="ob-pwd" type="password" autoComplete={isSignInMode ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {userError && <p role="alert" className="text-sm text-destructive">{userError}</p>}
              <Button type="submit" disabled={userLoading}>{userLoading ? (isSignInMode ? 'Signing in…' : 'Creating…') : (isSignInMode ? 'Sign in & continue' : 'Create & continue')}</Button>
              <p className="text-center text-sm text-muted-foreground">
                {isSignInMode ? (
                  <>No account? <button type="button" className="underline underline-offset-4" onClick={() => setIsSignInMode(false)}>Create one</button></>
                ) : (
                  <>Already have an account? <button type="button" className="underline underline-offset-4" onClick={() => setIsSignInMode(true)}>Sign in</button></>
                )}
                <span className="mx-2">·</span>
                <Link to="/signin" className="underline underline-offset-4">Go to sign in</Link>
              </p>
            </form>
          )}

          {step === 2 && (
            <div className="grid gap-6">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Configure AI Models</h3>
                {!session ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Signed in</span>
                )}
              </div>
              {!session ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">No session — create user first.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Signed in as {(session as any)?.user?.email ?? 'you'} — add providers, then assign model per task (all 3 required).</p>
              )}

              {/* providers list + add dialog (provider only, no model) */}
              <div className="grid gap-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Providers</h4>
                  <Button type="button" size="sm" onClick={() => setProviderDialogOpen(true)}>Add provider</Button>
                </div>
                {configs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No providers yet — add one to configure models.</p>
                ) : (
                  <div className="grid gap-2">
                    {configs.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2"><span className="text-sm font-medium truncate">{c.name || c.provider}</span><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.provider}</span>{c.isDefault && <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">default</span>}</div>
                          <div className="truncate text-xs text-muted-foreground">{c.baseUrl ?? 'no baseUrl'} · {c.apiKeyMasked ?? 'no key'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* routing — provider+model independent, all required */}
              <div className="grid gap-4 rounded-lg border p-4">
                <h4 className="text-sm font-medium">Model routing <span className="text-destructive">*</span></h4>
                {(["video","image","text"] as const).map((task) => {
                  const cfgId = task==="video" ? prefs.videoConfigId : task==="image" ? prefs.imageConfigId : prefs.textConfigId
                  const modelVal = task==="video" ? prefs.videoModel ?? "" : task==="image" ? prefs.imageModel ?? "" : prefs.textModel ?? ""
                  const cfg = getCfg(cfgId ?? null)
                  const providerForModel = (cfg?.provider as AiProvider) ?? "openrouter"
                  return (
                    <div key={task} className="grid gap-2 rounded-md border bg-muted/20 p-3">
                      <Label className="capitalize">{task} <span className="text-destructive">*</span></Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <span className="text-xs text-muted-foreground">Provider</span>
                          <select value={cfgId ?? ""} onChange={async (e) => {
                            const v = e.target.value || null
                            const key = task==="video" ? "videoConfigId" : task==="image" ? "imageConfigId" : "textConfigId"
                            const next = { ...prefs, [key]: v } as AiPreferences
                            if (!v) (next as any)[task==="video" ? "videoModel" : task==="image" ? "imageModel" : "textModel"] = null
                            setPrefs(next)
                            try { await updateAiPreferences({ [key]: v, ...(v ? {} : { [task==="video" ? "videoModel" : task==="image" ? "imageModel" : "textModel"]: null } as any) }); void saveProgress(2) } catch {}
                          }} disabled={configs.length===0} className="h-9 rounded-md border bg-background px-3 text-sm">
                            <option value="">Select provider</option>
                            {configs.map((c) => <option key={c.id} value={c.id}>{c.name || c.provider} ({c.provider})</option>)}
                          </select>
                        </div>
                        <div className="grid gap-1.5">
                          <span className="text-xs text-muted-foreground">Model</span>
                          <ModelSelector provider={providerForModel} configId={cfgId ?? undefined} value={modelVal} onChange={async (v) => {
                            const key = task==="video" ? "videoModel" : task==="image" ? "imageModel" : "textModel"
                            const next = { ...prefs, [key]: v || null } as AiPreferences
                            setPrefs(next)
                            try { await updateAiPreferences({ [key]: v || null } as any); void saveProgress(2) } catch {}
                          }} disabled={!cfgId} />
                        </div>
                      </div>
                      {(!cfgId || !modelVal) && <p className="text-xs text-amber-600">{task} is required — select provider and model.</p>}
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground">Video = talkinghead/greenscreen · Image = carousel · Text = persona & ideas.</p>
              </div>

              {aiError && <p role="alert" className="text-sm text-destructive">{aiError}</p>}
              <Button onClick={onSubmitAi} disabled={aiLoading || !session || !prefs.videoConfigId || !prefs.videoModel || !prefs.imageConfigId || !prefs.imageModel || !prefs.textConfigId || !prefs.textModel}>{aiLoading ? 'Saving…' : 'Save & continue'}</Button>

              <Dialog open={providerDialogOpen} onOpenChange={(v) => setProviderDialogOpen(v)}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add provider</DialogTitle>
                    <DialogDescription>Credentials only — model is chosen per task above.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={addProviderInOnboarding} className="grid gap-4">
                    <div className="grid gap-2"><Label>Provider</Label><select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)} className="h-9 rounded-md border bg-transparent px-3 text-sm">{AI_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
                    <div className="grid gap-2"><Label htmlFor="ob-ainame">Label (optional)</Label><Input id="ob-ainame" value={aiName} onChange={(e) => setAiName(e.target.value)} placeholder="My OpenRouter" maxLength={255} /></div>
                    <div className="grid gap-2"><Label htmlFor="ob-key">API Key</Label><Input id="ob-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />{provider === 'ollama' && <p className="text-xs text-muted-foreground">Ollama usually needs no key.</p>}</div>
                    {showBaseUrl && <div className="grid gap-2"><Label htmlFor="ob-base">Base URL</Label><Input id="ob-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'} /></div>}
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setProviderDialogOpen(false)}>Cancel</Button>
                      <Button type="submit" disabled={providerSaving || !provider}>{providerSaving ? 'Adding…' : 'Add'}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={onSubmitCompany} className="grid gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Add Company</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)}>Back</Button>
              </div>
              {!session ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">No active session — create user first.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Signed in as {(session as any)?.user?.email ?? 'you'} · prefs saved</p>
              )}
              <div className="grid gap-2">
                <Label htmlFor="ob-cname">Company name</Label>
                <Input id="ob-cname" value={companyName} onChange={(e) => { setCompanyName(e.target.value); void saveProgress(3, { companyName: e.target.value }) }} placeholder="Acme Inc" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-website">Website</Label>
                <Input id="ob-website" type="url" value={website} onChange={(e) => { setWebsite(e.target.value); void saveProgress(3, { website: e.target.value }) }} placeholder="https://example.com" required />
                <p className="text-xs text-muted-foreground">Used to generate persona — must be reachable URL.</p>
              </div>
              {companyProgress && <p className="text-xs text-muted-foreground">Progress: {companyProgress}</p>}
              {companyError && <p role="alert" className="text-sm text-destructive">{companyError}</p>}
              <Button type="submit" disabled={companyLoading || !session}>{companyLoading ? 'Creating…' : 'Create company & go to dashboard'}</Button>
              <p className="text-xs text-muted-foreground">Only on success you’ll be routed to the dashboard.</p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
