// ponytail: Brand Intelligence ("Brand Brain") client — types mirror the backend
// brand.schemas.ts response shape (SQLite/Drizzle is the source of truth). Every
// mutation returns the FULL updated document, so the page just replaces its state.

export type BrandCore = {
  name: string | null
  website: string | null
  tagline: string | null
  description: string | null
  industry: string | null
  category: string | null
}

export type IdentityAndProduct = {
  coreIdentity: string | null
  productOffering: string | null
  productFeatures: string[]
  productBenefits: string[]
  useCases: string[]
  uniqueBenefits: string[]
  problemSolution: string | null
}

export type PurposeAndPositioning = {
  mission: string | null
  vision: string | null
  valueProposition: string | null
  marketPositioning: string | null
  differentiation: string | null
  ownedSpace: string | null
}

export type CustomerSegment = {
  id: string
  name: string
  description: string | null
  problems: string[]
  desires: string[]
  objections: string[]
  buyingReasons: string[]
  percentage: number | null
}

export type Audience = {
  primaryAudience: string | null
  customerSegments: CustomerSegment[]
}

export type ToneAndVoice = {
  tone: string[]
  personality: string[]
  dos: string[]
  donts: string[]
  wordsToUse: string[]
  wordsToAvoid: string[]
  writingStyle: string | null
}

export type ContentAngle = {
  id: string
  name: string
  description: string
  targetAudience: string | null
  problem: string | null
  coreMessage: string | null
  emotionalTrigger: string | null
  hookIdeas: string[]
  contentTypes: string[]
  platforms: string[]
  ctaIdeas: string[]
  priority: number
  isActive: boolean
}

export type Competitor = {
  id: string
  name: string
  positioning: string | null
  strengths: string[]
  weaknesses: string[]
}

export type MarketAndCompetition = {
  market: string | null
  competitors: Competitor[]
  marketTrends: string[]
}

export type BrandMetadata = {
  source: string | null
  lastAnalyzedAt: string | null
  lastUpdatedAt: string | null
  version: number | null
  editedSections: string[]
  editedAngles: string[]
  editedSegments: string[]
}

export type BrandIntelligenceDoc = {
  id: string
  userId: string
  companyId: string
  status: string // pending | analyzing | ready | failed
  error: string | null
  brand: BrandCore
  identityAndProduct: IdentityAndProduct
  purposeAndPositioning: PurposeAndPositioning
  audience: Audience
  toneAndVoice: ToneAndVoice
  contentAngles: ContentAngle[]
  marketAndCompetition: MarketAndCompetition
  metadata: BrandMetadata
  createdAt: string
  updatedAt: string
}

// Section PATCH bodies — the service re-normalizes, so string | null and string[] both fit.
export type SectionKey =
  | 'brand'
  | 'identityAndProduct'
  | 'purposeAndPositioning'
  | 'audience'
  | 'toneAndVoice'
  | 'marketAndCompetition'
  | 'contentAngles'

export type ContentAngleInput = Partial<Omit<ContentAngle, 'id' | 'priority' | 'isActive'>> & {
  id?: string
  priority?: number | null
  isActive?: boolean | null
}
export type CustomerSegmentInput = Partial<Omit<CustomerSegment, 'id' | 'percentage'>> & {
  id?: string
  percentage?: number | null
}
export type CompetitorInput = Partial<Omit<Competitor, 'id'>> & { id?: string }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text || res.statusText || `Request failed (${res.status})`
    try {
      const j = JSON.parse(text)
      msg = j?.error || j?.message || msg
    } catch {
      /* body was plain text */
    }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

const root = (companyId: string) => `/companies/${companyId}/brand-intelligence`

/** GET the full document; returns null when it has not been generated yet (404). */
export async function getBrandIntelligence(companyId: string): Promise<BrandIntelligenceDoc | null> {
  const res = await fetch(root(companyId), { credentials: 'include' })
  if (res.status === 404) return null
  return handle<BrandIntelligenceDoc>(res)
}

export type BrandStatus = { status: string; error: string | null; updatedAt: string | null }

/**
 * POST analyze — starts a BACKGROUND job on the server and resolves immediately with the
 * accepted status ('analyzing'). The workflow runs independently of this request, so the
 * user can navigate away without cancelling it; poll getBrandStatus() for completion.
 */
export function startBrandAnalysis(
  companyId: string,
  extra?: string | null,
): Promise<{ status: string; companyId: string }> {
  return fetch(`${root(companyId)}/analyze`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extra: extra ?? null }),
  }).then(handle<{ status: string; companyId: string }>)
}

/** GET lightweight status for polling. status is 'none' when no Brand Brain exists yet. */
export async function getBrandStatus(companyId: string): Promise<BrandStatus> {
  const res = await fetch(`${root(companyId)}/status`, { credentials: 'include' })
  if (res.status === 404) return { status: 'none', error: null, updatedAt: null }
  return handle<BrandStatus>(res)
}

/** PATCH a single section (brand | identity | positioning | audience | tone | market). */
const SECTION_PATH: Record<string, string> = {
  brand: 'brand',
  identityAndProduct: 'identity',
  purposeAndPositioning: 'positioning',
  audience: 'audience',
  toneAndVoice: 'tone',
  marketAndCompetition: 'market',
}

export function updateBrandSection(companyId: string, section: keyof typeof SECTION_PATH, body: unknown): Promise<BrandIntelligenceDoc> {
  return fetch(`${root(companyId)}/${SECTION_PATH[section]}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<BrandIntelligenceDoc>)
}

export function updateBrandIntelligence(companyId: string, body: Partial<Record<SectionKey, unknown>>): Promise<BrandIntelligenceDoc> {
  return fetch(root(companyId), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<BrandIntelligenceDoc>)
}

// --- Content angles ---------------------------------------------------------
export function addContentAngle(companyId: string, body: ContentAngleInput): Promise<BrandIntelligenceDoc> {
  return fetch(`${root(companyId)}/content-angles`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<BrandIntelligenceDoc>)
}

export function updateContentAngle(companyId: string, angleId: string, body: ContentAngleInput): Promise<BrandIntelligenceDoc> {
  return fetch(`${root(companyId)}/content-angles/${angleId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<BrandIntelligenceDoc>)
}

export function deleteContentAngle(companyId: string, angleId: string): Promise<BrandIntelligenceDoc> {
  return fetch(`${root(companyId)}/content-angles/${angleId}`, { method: 'DELETE', credentials: 'include' }).then(
    handle<BrandIntelligenceDoc>,
  )
}

// --- Audience segments ------------------------------------------------------
export function addSegment(companyId: string, body: CustomerSegmentInput): Promise<BrandIntelligenceDoc> {
  return fetch(`${root(companyId)}/audience/segments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<BrandIntelligenceDoc>)
}

export function updateSegment(companyId: string, segmentId: string, body: CustomerSegmentInput): Promise<BrandIntelligenceDoc> {
  return fetch(`${root(companyId)}/audience/segments/${segmentId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<BrandIntelligenceDoc>)
}

export function deleteSegment(companyId: string, segmentId: string): Promise<BrandIntelligenceDoc> {
  return fetch(`${root(companyId)}/audience/segments/${segmentId}`, { method: 'DELETE', credentials: 'include' }).then(
    handle<BrandIntelligenceDoc>,
  )
}
