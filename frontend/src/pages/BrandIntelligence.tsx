import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Brain, Loader2, Sparkles } from 'lucide-react'
import { useCompany } from '@/context/CompanyContext'
import { useBrandAnalysis } from '@/context/BrandAnalysisContext'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getBrandIntelligence, type BrandIntelligenceDoc } from '@/services/brand'
import BrandHeader from '@/components/brand/BrandHeader'
import { BrandTabProvider } from './brand/BrandTabContext'

function isEmptyDoc(d: BrandIntelligenceDoc | null): boolean {
  if (!d) return true
  return !d.brand.name && !d.brand.description && !d.identityAndProduct.productOffering && d.contentAngles.length === 0
}

type TabKey = 'overview' | 'identity' | 'audience' | 'voice' | 'market'

const TABS: { key: TabKey; label: string; path: string }[] = [
  { key: 'overview', label: 'Overview', path: '/dashboard/brand' },
  { key: 'identity', label: 'Identity', path: '/dashboard/brand/identity' },
  { key: 'audience', label: 'Audience', path: '/dashboard/brand/audience' },
  { key: 'voice', label: 'Voice', path: '/dashboard/brand/voice' },
  { key: 'market', label: 'Market', path: '/dashboard/brand/market' },
]

function TabStrip() {
  return (
    <div className="flex gap-2 border-b">
      {TABS.map((t) => (
        <NavLink
          key={t.key}
          to={t.path}
          end={t.key === 'overview'}
          className={({ isActive }) =>
            `-mb-px border-b-2 px-3 py-2 text-sm ${
              isActive
                ? 'border-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}

export default function BrandIntelligence() {
  const { companies, selectedId, loading: companiesLoading } = useCompany()
  const { isAnalyzing, startAnalysis, reloadToken } = useBrandAnalysis()
  const { toast } = useToast()
  const company = companies.find((c) => c.id === selectedId) ?? null

  const [doc, setDoc] = useState<BrandIntelligenceDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  const companyId = selectedId
  const analyzing = isAnalyzing(companyId) || doc?.status === 'analyzing'

  const load = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        setDoc(await getBrandIntelligence(id))
      } catch (e: any) {
        setDoc(null)
        toast({ title: 'Could not load Brand Intelligence', description: e?.message, variant: 'error' })
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    if (companyId) load(companyId)
    else {
      setDoc(null)
      setLoading(false)
    }
  }, [companyId, reloadToken, load])

  const handleAnalyze = () => {
    if (companyId) void startAnalysis(companyId)
  }

  const handleSaved = (d: BrandIntelligenceDoc) => {
    setDoc(d)
    toast({ title: 'Saved', variant: 'success', duration: 2000 })
  }
  const handleError = (msg: string) => toast({ title: 'Something went wrong', description: msg, variant: 'error' })

  const showShell = !!companyId && (!company ? !companiesLoading : true)

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Brand Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Your Brand Brain — the source of truth that powers on-brand UGC. Edit anything; the database wins over the AI.
        </p>
      </div>

      {!showShell ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a company to view its Brand Intelligence.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : analyzing && isEmptyDoc(doc) ? (
        <Card>
          <CardContent className="grid place-items-center gap-4 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Loader2 className="size-7 animate-spin" />
            </span>
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold">Analyzing {company?.name}'s website…</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                This runs in the background — navigate away and keep working. We'll pop up a
                notification the moment your Brand Intelligence is ready.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : !doc ? (
        <Card>
          <CardContent className="grid place-items-center gap-4 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Brain className="size-7" />
            </span>
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold">No Brand Brain yet</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Analyze <span className="font-medium text-foreground">{company?.name}</span>'s website to generate a structured
                Brand Intelligence document you can fully edit.
              </p>
              {company && !company.website && (
                <p className="text-sm text-warning">This company has no website — add one in Settings first.</p>
              )}
            </div>
            <Button onClick={handleAnalyze} disabled={!company?.website}>
              <Sparkles className="size-4" />
              Analyze website
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <BrandHeader
            doc={doc}
            companyName={company?.name ?? ''}
            companyWebsite={company?.website}
            analyzing={analyzing}
            onAnalyze={handleAnalyze}
          />
          <TabStrip />
          <BrandTabProvider value={{ companyId, doc, onSaved: handleSaved, onError: handleError }}>
            <div key={location.pathname} className="grid gap-4">
              <Outlet />
            </div>
          </BrandTabProvider>
        </div>
      )}
    </div>
  )
}
