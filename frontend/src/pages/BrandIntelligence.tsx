import { useCallback, useEffect, useState } from 'react'
import { Brain, Compass, Loader2, Mic, Package, Sparkles, Tag } from 'lucide-react'
import { useCompany } from '@/context/CompanyContext'
import { useBrandAnalysis } from '@/context/BrandAnalysisContext'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getBrandIntelligence, type BrandIntelligenceDoc } from '@/services/brand'
import BrandHeader from '@/components/brand/BrandHeader'
import SimpleSection from '@/components/brand/SimpleSection'
import AudienceSection from '@/components/brand/AudienceSection'
import ContentAnglesSection from '@/components/brand/ContentAnglesSection'
import MarketSection from '@/components/brand/MarketSection'
import type { FieldConfig } from '@/components/brand/shared'

const BRAND_FIELDS: FieldConfig[] = [
  { key: 'name', label: 'Name', type: 'text', maxLength: 255 },
  { key: 'website', label: 'Website', type: 'url', maxLength: 2048, placeholder: 'https://example.com' },
  { key: 'tagline', label: 'Tagline', type: 'text', maxLength: 500 },
  { key: 'description', label: 'Description', type: 'textarea', rows: 3, maxLength: 4000 },
  { key: 'industry', label: 'Industry', type: 'text', maxLength: 255 },
  { key: 'category', label: 'Category', type: 'text', maxLength: 255 },
]

const IDENTITY_FIELDS: FieldConfig[] = [
  { key: 'coreIdentity', label: 'Core identity', type: 'textarea', rows: 3, maxLength: 4000 },
  { key: 'productOffering', label: 'Product / offering', type: 'textarea', rows: 3, maxLength: 4000 },
  { key: 'productFeatures', label: 'Product features', type: 'list' },
  { key: 'productBenefits', label: 'Product benefits', type: 'list' },
  { key: 'useCases', label: 'Use cases', type: 'list' },
  { key: 'uniqueBenefits', label: 'Unique benefits', type: 'list' },
  { key: 'problemSolution', label: 'Problem → solution', type: 'textarea', rows: 3, maxLength: 4000 },
]

const POSITIONING_FIELDS: FieldConfig[] = [
  { key: 'mission', label: 'Mission', type: 'textarea', rows: 2, maxLength: 4000 },
  { key: 'vision', label: 'Vision', type: 'textarea', rows: 2, maxLength: 4000 },
  { key: 'valueProposition', label: 'Value proposition', type: 'textarea', rows: 2, maxLength: 4000 },
  { key: 'marketPositioning', label: 'Market positioning', type: 'textarea', rows: 2, maxLength: 4000 },
  { key: 'differentiation', label: 'Differentiation', type: 'textarea', rows: 2, maxLength: 4000 },
  { key: 'ownedSpace', label: 'Owned space', type: 'textarea', rows: 2, maxLength: 4000 },
]

const TONE_FIELDS: FieldConfig[] = [
  { key: 'tone', label: 'Tone', type: 'list' },
  { key: 'personality', label: 'Personality', type: 'list' },
  { key: 'dos', label: 'Do', type: 'list' },
  { key: 'donts', label: "Don't", type: 'list' },
  { key: 'wordsToUse', label: 'Words to use', type: 'list' },
  { key: 'wordsToAvoid', label: 'Words to avoid', type: 'list' },
  { key: 'writingStyle', label: 'Writing style', type: 'textarea', rows: 3, maxLength: 4000 },
]

function isEmptyDoc(d: BrandIntelligenceDoc | null): boolean {
  if (!d) return true
  return !d.brand.name && !d.brand.description && !d.identityAndProduct.productOffering && d.contentAngles.length === 0
}

export default function BrandIntelligence() {
  const { companies, selectedId, loading: companiesLoading } = useCompany()
  const { isAnalyzing, startAnalysis, reloadToken } = useBrandAnalysis()
  const { toast } = useToast()
  const company = companies.find((c) => c.id === selectedId) ?? null

  const [doc, setDoc] = useState<BrandIntelligenceDoc | null>(null)
  const [loading, setLoading] = useState(true)

  const companyId = selectedId
  // analyzing when the global background tracker is polling this company, or the row says so
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

  // reload on company change AND whenever the background tracker bumps the token
  // (analysis started / completed / failed) so this page reflects the new state.
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

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Brand Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Your Brand Brain — the source of truth that powers on-brand UGC. Edit anything; the database wins over the AI.
        </p>
      </div>

      {!companyId || (!company && !companiesLoading) ? (
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

          <SimpleSection
            companyId={companyId}
            doc={doc}
            section="brand"
            title="Brand"
            description="The essentials — name, site, category and one-line story."
            icon={Tag}
            fields={BRAND_FIELDS}
            onSaved={handleSaved}
          />

          <SimpleSection
            companyId={companyId}
            doc={doc}
            section="identityAndProduct"
            title="Identity & product"
            description="What the brand is, what it sells and the problem it solves."
            icon={Package}
            fields={IDENTITY_FIELDS}
            onSaved={handleSaved}
          />

          <SimpleSection
            companyId={companyId}
            doc={doc}
            section="purposeAndPositioning"
            title="Purpose & positioning"
            description="Mission, vision and the space the brand owns in the market."
            icon={Compass}
            fields={POSITIONING_FIELDS}
            onSaved={handleSaved}
          />

          <AudienceSection companyId={companyId} doc={doc} onSaved={handleSaved} onError={handleError} />

          <SimpleSection
            companyId={companyId}
            doc={doc}
            section="toneAndVoice"
            title="Tone & voice"
            description="How the brand sounds — personality, do/don't and word choices."
            icon={Mic}
            fields={TONE_FIELDS}
            onSaved={handleSaved}
          />

          <ContentAnglesSection companyId={companyId} doc={doc} onSaved={handleSaved} onError={handleError} />

          <MarketSection companyId={companyId} doc={doc} onSaved={handleSaved} onError={handleError} />
        </div>
      )}
    </div>
  )
}
