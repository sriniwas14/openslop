import { Compass, Mic, Package, Tag } from 'lucide-react'
import type { FieldConfig } from '@/components/brand/shared'
import SimpleSection from '@/components/brand/SimpleSection'
import AudienceSection from '@/components/brand/AudienceSection'
import ContentAnglesSection from '@/components/brand/ContentAnglesSection'
import MarketSection from '@/components/brand/MarketSection'
import { useBrandTab } from './BrandTabContext'

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

export default function OverviewTab() {
  const { companyId, doc, onSaved, onError } = useBrandTab()
  return (
    <div className="grid gap-4">
      <SimpleSection
        companyId={companyId}
        doc={doc}
        section="brand"
        title="Brand"
        description="The essentials — name, site, category and one-line story."
        icon={Tag}
        fields={BRAND_FIELDS}
        onSaved={onSaved}
      />
      <SimpleSection
        companyId={companyId}
        doc={doc}
        section="identityAndProduct"
        title="Identity & product"
        description="What the brand is, what it sells and the problem it solves."
        icon={Package}
        fields={IDENTITY_FIELDS}
        onSaved={onSaved}
      />
      <SimpleSection
        companyId={companyId}
        doc={doc}
        section="purposeAndPositioning"
        title="Purpose & positioning"
        description="Mission, vision and the space the brand owns in the market."
        icon={Compass}
        fields={POSITIONING_FIELDS}
        onSaved={onSaved}
      />
      <AudienceSection companyId={companyId} doc={doc} onSaved={onSaved} onError={onError} />
      <SimpleSection
        companyId={companyId}
        doc={doc}
        section="toneAndVoice"
        title="Tone & voice"
        description="How the brand sounds — personality, do/don't and word choices."
        icon={Mic}
        fields={TONE_FIELDS}
        onSaved={onSaved}
      />
      <ContentAnglesSection companyId={companyId} doc={doc} onSaved={onSaved} onError={onError} />
      <MarketSection companyId={companyId} doc={doc} onSaved={onSaved} onError={onError} />
    </div>
  )
}
