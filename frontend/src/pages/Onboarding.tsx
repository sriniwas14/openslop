import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession, signUp, signIn } from '@/services/auth'
import { AI_PROVIDERS, type AiProvider, createAiConfig, listAiConfigs } from '@/services/ai'
import { createCompanySSE, listCompanies } from '@/services/companies'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

  // step 2: AI — now after auth, direct DB write (ponytail: no sessionStorage draft needed)
  const [provider, setProvider] = useState<AiProvider>('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [aiName, setAiName] = useState('')
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // step 3: company
  const [companyName, setCompanyName] = useState('')
  const [website, setWebsite] = useState('')
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [companyProgress, setCompanyProgress] = useState<string>('')
  const [companyLoading, setCompanyLoading] = useState(false)

  const showBaseUrl = provider === 'ollama' || provider === 'custom'
  const [resolving, setResolving] = useState(false)

  // ponytail: if signed in, start at step 2 (Configure AI) — skip Create User
  useEffect(() => {
    if (isPending) return
    if (!session) {
      setStep(1)
      return
    }
    setResolving(true)
    let cancelled = false
    Promise.all([listAiConfigs().catch(() => [] as any[]), listCompanies().catch(() => [] as any[])]).then(([ai, companies]) => {
      if (cancelled) return
      if (ai.length > 0 && companies.length > 0) navigate('/dashboard', { replace: true })
      else if (ai.length === 0) setStep(2)
      else if (companies.length === 0) setStep(3)
      setResolving(false)
    })
    return () => { cancelled = true }
  }, [isPending, session, navigate])

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
    } catch (err: any) {
      setUserError(err.message ?? String(err))
    } finally {
      setUserLoading(false)
    }
  }

  async function onSubmitAi(e: FormEvent) {
    e.preventDefault()
    setAiError(null)
    if (!provider || !model.trim()) {
      setAiError('Select a provider and model')
      return
    }
    if (!session) {
      setAiError('Not authenticated — create user first')
      setStep(1)
      return
    }
    setAiLoading(true)
    try {
      await createAiConfig({
        provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
        model: model || undefined,
        name: aiName || undefined,
        isDefault: true,
      })
      setStep(3)
    } catch (err: any) {
      setAiError(err.message ?? String(err))
    } finally {
      setAiLoading(false)
    }
  }

  async function onSubmitCompany(e: FormEvent) {
    e.preventDefault()
    setCompanyError(null)
    setCompanyProgress('')
    if (!companyName.trim() || !website.trim()) {
      setCompanyError('Name and website are required')
      return
    }
    try { new URL(website) } catch { setCompanyError('Invalid website URL'); return }
    if (!session) {
      setCompanyError('Not authenticated — create user first')
      setStep(1)
      return
    }
    setCompanyLoading(true)
    try {
      setCompanyProgress('Creating company…')
      await createCompanySSE(
        { name: companyName, website },
        {
          onProgress: (ev: any) => {
            const t = typeof ev === 'string' ? ev : ev?.type ?? ev?.id ?? JSON.stringify(ev).slice(0, 120)
            setCompanyProgress(String(t))
          },
        }
      )
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setCompanyError(err.message ?? String(err))
    } finally {
      setCompanyLoading(false)
    }
  }

  if (isPending || (session && step === 1 && resolving)) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Loading…</div>

  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: 'Create User' },
    { n: 2, label: 'Configure AI Model' },
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
            <form onSubmit={onSubmitAi} className="grid gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Configure AI Model</h3>
                {!session ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Signed in</span>
                )}
              </div>
              {!session ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">No session — create user first.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Signed in as {(session as any)?.user?.email ?? 'you'}</p>
              )}
              <div className="grid gap-2">
                <Label>Provider</Label>
                <select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)} className="h-9 rounded-md border bg-transparent px-3 text-sm">
                  {AI_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-ainame">Label (optional)</Label>
                <Input id="ob-ainame" value={aiName} onChange={(e) => setAiName(e.target.value)} placeholder="My OpenRouter" maxLength={255} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-key">API Key</Label>
                <Input id="ob-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
                {provider === 'ollama' && <p className="text-xs text-muted-foreground">Ollama usually needs no key.</p>}
              </div>
              {showBaseUrl && (
                <div className="grid gap-2">
                  <Label htmlFor="ob-base">Base URL</Label>
                  <Input id="ob-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={provider === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'} />
                </div>
              )}
              <div className="grid gap-2">
                <Label>Model</Label>
                <ModelSelector provider={provider} apiKey={apiKey} baseUrl={baseUrl} value={model} onChange={setModel} />
                <p className="text-xs text-muted-foreground">Curated list — pick or type custom. Type API key above for live preview (openai/openrouter/xai/ollama).</p>
              </div>
              {aiError && <p role="alert" className="text-sm text-destructive">{aiError}</p>}
              <Button type="submit" disabled={aiLoading || !session || !provider || !model.trim()}>{aiLoading ? 'Saving…' : 'Save & continue'}</Button>
            </form>
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
                <p className="text-xs text-muted-foreground">Signed in as {(session as any)?.user?.email ?? 'you'} · AI {provider}/{model}</p>
              )}
              <div className="grid gap-2">
                <Label htmlFor="ob-cname">Company name</Label>
                <Input id="ob-cname" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-website">Website</Label>
                <Input id="ob-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" required />
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
