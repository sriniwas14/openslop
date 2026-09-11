import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Eye, EyeOff } from 'lucide-react'
import { useSession, signUp, signIn } from '@/services/auth'
import { getOnboardingProgress, saveOnboardingProgress } from '@/services/ai'
import { createCompanySSE, listCompanies } from '@/services/companies'
import BrandLogo from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Onboarding() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

  const [step, setStep] = useState<1 | 2>(1)

  // step 1: user
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userError, setUserError] = useState<string | null>(null)
  const [userLoading, setUserLoading] = useState(false)
  const [isSignInMode, setIsSignInMode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // step 2: company (AI keys are server-managed via OPENROUTER_API_KEY)
  const [companyName, setCompanyName] = useState('')
  const [website, setWebsite] = useState('')
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [companyProgress, setCompanyProgress] = useState<string>('')
  const [companyLoading, setCompanyLoading] = useState(false)

  const [resolving, setResolving] = useState(false)

  // resume from DB
  useEffect(() => {
    if (isPending) return
    if (!session) { setStep(1); return }
    setResolving(true)
    let cancelled = false
    Promise.all([
      listCompanies().catch(() => [] as any[]),
      getOnboardingProgress().catch(() => null),
    ]).then(([companies, prog]) => {
      if (cancelled) return
      const hasUsableCompany = (companies as any[]).some((c: any) => !!c.persona)
      if (hasUsableCompany) {
        navigate('/dashboard', { replace: true })
        return
      }
      if (prog?.data) {
        try {
          const d = JSON.parse(prog.data as string)
          if (d.companyName) setCompanyName(d.companyName)
          if (d.website) setWebsite(d.website)
        } catch {}
        const s = parseInt(String(prog.step), 10)
        if (s === 1 || s === 2) setStep(s as 1 | 2)
        else setStep(2)
      } else {
        setStep(2)
      }
      setResolving(false)
    })
    return () => { cancelled = true }
  }, [isPending, session, navigate])

  // persist progress on step/data changes (debounced via timeout)
  const saveProgress = useCallback(async (s: number, extra?: Record<string, unknown>) => {
    if (!session) return
    const data = { companyName, website, ...extra }
    try { await saveOnboardingProgress({ step: String(s), data }) } catch {}
  }, [session, companyName, website])

  useEffect(() => {
    if (!session || resolving) return
    // ponytail: fire-and-forget progress — resume from where left off
    if (step === 2) {
      const t = setTimeout(() => { void saveProgress(step) }, 600)
      return () => clearTimeout(t)
    }
  }, [step, companyName, website, session, resolving, saveProgress])

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
      const company = await createCompanySSE({ name: companyName, website }, { onProgress: (ev: any) => {
        // ponytail: backend auto-starts brand analysis — surface it, don't block on it
        if (ev?.type === 'brand-analysis-started') setCompanyProgress('Brand Intelligence analyzing in background…')
        else setCompanyProgress(typeof ev === 'string' ? ev : ev?.type ?? ev?.id ?? JSON.stringify(ev).slice(0, 120))
      } })
      if ((company as any)?.id) {
        try { localStorage.setItem('selectedCompanyId', (company as any).id) } catch {}
      }
      await saveOnboardingProgress({ step: "2", data: {} })
      navigate('/dashboard', { replace: true })
    } catch (err: any) { setCompanyError(err.message ?? String(err)) } finally { setCompanyLoading(false) }
  }

  if (isPending || (session && step === 1 && resolving)) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Loading…</div>

  const steps: { n: 1 | 2; label: string }[] = [
    { n: 1, label: 'Create User' },
    { n: 2, label: 'Add Company' },
  ]

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="grid w-full max-w-2xl gap-6">
        <div className="flex justify-center"><BrandLogo className="h-9" /></div>
        <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-xl">Welcome — let’s get you set up</CardTitle>
          <CardDescription>2 quick steps. You’ll land in the dashboard only after the company is created successfully.</CardDescription>
          <div className="mt-2 flex items-center gap-3">
            {steps.map((s, i) => (
              <div key={s.n} className="flex flex-1 items-center gap-3">
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${step === s.n ? 'border-foreground bg-foreground text-background' : step > s.n ? 'border-foreground/30 bg-foreground/10 text-foreground' : 'bg-background text-muted-foreground'}`}>{s.n}</div>
                <span className={`hidden text-xs sm:inline ${step === s.n ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                {i < steps.length - 1 && <div className={`h-px flex-1 ${step > s.n ? 'bg-foreground/40' : 'bg-border'}`} />}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {step === 1 && !session && (
            <form onSubmit={onSubmitUser} className="grid gap-5">
              <h3 className="text-base font-medium">{isSignInMode ? 'Sign in' : 'Create user'}</h3>
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
                <div className="relative">
                  <Input id="ob-pwd" type={showPassword ? 'text' : 'password'} autoComplete={isSignInMode ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" required />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground transition-colors hover:text-foreground">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {userError && <p role="alert" className="text-sm text-destructive">{userError}</p>}
              <Button type="submit" disabled={userLoading} size="lg" className="mt-1 w-full">{userLoading ? (isSignInMode ? 'Signing in…' : 'Creating…') : (isSignInMode ? 'Sign in & continue' : 'Create & continue')}</Button>
              <p className="mt-1 text-center text-sm text-muted-foreground">
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
            <form onSubmit={onSubmitCompany} className="grid gap-5">
              <h3 className="text-base font-medium">Add Company</h3>
              {!session ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">No active session — create user first.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Signed in as {(session as any)?.user?.email ?? 'you'} · AI is managed by us, no keys needed</p>
              )}
              <div className="grid gap-2">
                <Label htmlFor="ob-cname">Company name</Label>
                <Input id="ob-cname" value={companyName} onChange={(e) => { setCompanyName(e.target.value); void saveProgress(2, { companyName: e.target.value }) }} placeholder="Acme Inc" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-website">Website</Label>
                <Input id="ob-website" type="url" value={website} onChange={(e) => { setWebsite(e.target.value); void saveProgress(2, { website: e.target.value }) }} placeholder="https://example.com" required />
                <p className="text-xs text-muted-foreground">Used to generate persona — must be reachable URL.</p>
              </div>
              {companyProgress && <p className="text-xs text-muted-foreground">Progress: {companyProgress}</p>}
              {companyError && <p role="alert" className="text-sm text-destructive">{companyError}</p>}
              <div className="mt-1 flex gap-2">
                {!session && (
                  <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
                    <ChevronLeft className="size-4" /> Back
                  </Button>
                )}
                <Button type="submit" disabled={companyLoading || !session} size="lg" className="flex-1">{companyLoading ? 'Creating…' : 'Create company & go to dashboard'}</Button>
              </div>
              <p className="text-xs text-muted-foreground">Only on success you’ll be routed to the dashboard.</p>
            </form>
          )}
        </CardContent>
      </Card>
      </div>
    </main>
  )
}
