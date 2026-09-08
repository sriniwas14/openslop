import { z } from "zod";

// ponytail: helpers — string / string-array fields are nullish so PATCH bodies and AI output both fit;
// the service normalizes to canonical shape (strings -> "" | null, arrays -> []) before persisting.
const s = (max: number) => z.string().max(max).nullish();
const sa = (max = 40, itemMax = 500) => z.array(z.string().max(itemMax)).max(max).nullish();

// ---------------------------------------------------------------------------
// Canonical section schemas (also used to build the GET response schema)
// Array items carry a stable `id` so the frontend can edit/delete individually.
// ---------------------------------------------------------------------------

export const brandCoreSchema = z.object({
  name: s(255),
  website: s(2048),
  tagline: s(500),
  description: s(4000),
  industry: s(255),
  category: s(255),
});

export const identityAndProductSchema = z.object({
  coreIdentity: s(4000),
  productOffering: s(4000),
  productFeatures: sa(),
  productBenefits: sa(),
  useCases: sa(),
  uniqueBenefits: sa(),
  problemSolution: s(4000),
});

export const purposeAndPositioningSchema = z.object({
  mission: s(4000),
  vision: s(4000),
  valueProposition: s(4000),
  marketPositioning: s(4000),
  differentiation: s(4000),
  ownedSpace: s(4000),
});

export const customerSegmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: s(2000),
  problems: sa(30),
  desires: sa(30),
  objections: sa(30),
  buyingReasons: sa(30),
  percentage: z.number().min(0).max(100).nullish(),
});

export const audienceSchema = z.object({
  primaryAudience: s(4000),
  customerSegments: z.array(customerSegmentSchema).max(30).nullish(),
});

export const toneAndVoiceSchema = z.object({
  tone: sa(),
  personality: sa(),
  dos: sa(),
  donts: sa(),
  wordsToUse: sa(),
  wordsToAvoid: sa(),
  writingStyle: s(4000),
});

export const contentAngleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  targetAudience: s(1000),
  problem: s(2000),
  coreMessage: s(2000),
  emotionalTrigger: s(1000),
  hookIdeas: sa(30),
  contentTypes: sa(20, 100),
  platforms: sa(20, 100),
  ctaIdeas: sa(20, 300),
  priority: z.number().int().min(1).max(10).nullish(),
  isActive: z.boolean().nullish(),
});

export const competitorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  positioning: s(2000),
  strengths: sa(30),
  weaknesses: sa(30),
});

export const marketAndCompetitionSchema = z.object({
  market: s(4000),
  competitors: z.array(competitorSchema).max(30).nullish(),
  marketTrends: sa(),
});

export const metadataSchema = z.object({
  source: s(255),
  lastAnalyzedAt: s(64),
  lastUpdatedAt: s(64),
  version: z.number().int().min(0).nullish(),
  // ponytail: edit tracking — lets re-analysis preserve user changes instead of blindly overwriting
  editedSections: z.array(z.string().max(64)).max(20).nullish(),
  editedAngles: z.array(z.string().max(64)).max(200).nullish(),
  editedSegments: z.array(z.string().max(64)).max(200).nullish(),
});

// ---------------------------------------------------------------------------
// Input schemas — `id` optional (server assigns when missing); used by POST/PATCH
// ---------------------------------------------------------------------------

export const contentAngleInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  targetAudience: s(1000),
  problem: s(2000),
  coreMessage: s(2000),
  emotionalTrigger: s(1000),
  hookIdeas: sa(30),
  contentTypes: sa(20, 100),
  platforms: sa(20, 100),
  ctaIdeas: sa(20, 300),
  priority: z.number().int().min(1).max(10).nullish(),
  isActive: z.boolean().nullish(),
});
export const updateContentAngleSchema = contentAngleInputSchema.partial();

export const customerSegmentInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  description: s(2000),
  problems: sa(30),
  desires: sa(30),
  objections: sa(30),
  buyingReasons: sa(30),
  percentage: z.number().min(0).max(100).nullish(),
});
export const updateCustomerSegmentSchema = customerSegmentInputSchema.partial();

export const competitorInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(255),
  positioning: s(2000),
  strengths: sa(30),
  weaknesses: sa(30),
});

// Section-level PATCH bodies (replace the whole section; ids normalized on write)
export const patchBrandSchema = brandCoreSchema;
export const patchIdentitySchema = identityAndProductSchema;
export const patchPositioningSchema = purposeAndPositioningSchema;
export const patchToneSchema = toneAndVoiceSchema;
export const patchAudienceSchema = z.object({
  primaryAudience: s(4000),
  customerSegments: z.array(customerSegmentInputSchema).max(30).nullish(),
});
export const patchMarketSchema = z.object({
  market: s(4000),
  competitors: z.array(competitorInputSchema).max(30).nullish(),
  marketTrends: sa(),
});

// Whole-document PATCH — any subset of sections
export const updateBrandIntelligenceSchema = z
  .object({
    brand: patchBrandSchema.optional(),
    identityAndProduct: patchIdentitySchema.optional(),
    purposeAndPositioning: patchPositioningSchema.optional(),
    audience: patchAudienceSchema.optional(),
    toneAndVoice: patchToneSchema.optional(),
    marketAndCompetition: patchMarketSchema.optional(),
    contentAngles: z.array(contentAngleInputSchema).max(40).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty patch" });

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1) });
export const angleIdParamsSchema = z.object({ companyId: z.string().min(1), angleId: z.string().min(1) });
export const segmentIdParamsSchema = z.object({ companyId: z.string().min(1), segmentId: z.string().min(1) });

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const brandIntelligenceResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  brand: brandCoreSchema,
  identityAndProduct: identityAndProductSchema,
  purposeAndPositioning: purposeAndPositioningSchema,
  audience: audienceSchema,
  toneAndVoice: toneAndVoiceSchema,
  contentAngles: z.array(contentAngleSchema),
  marketAndCompetition: marketAndCompetitionSchema,
  metadata: metadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const errorResponseSchema = z.object({ error: z.string() });

// POST analyze starts a background job and returns 202 immediately (no streaming).
export const analyzeAcceptedSchema = z.object({
  status: z.string(),
  companyId: z.string(),
});

// Lightweight status for client polling — status is "none" when no Brand Brain row exists yet.
export const brandStatusSchema = z.object({
  status: z.string(),
  error: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// AI output — lenient top-level shape check (the service normalizes + coerces fields,
// then validates against the canonical schemas above before persisting).
// ---------------------------------------------------------------------------

export const aiOutputShapeSchema = z.object({
  brand: z.record(z.string(), z.any()).nullish(),
  identityAndProduct: z.record(z.string(), z.any()).nullish(),
  purposeAndPositioning: z.record(z.string(), z.any()).nullish(),
  audience: z.record(z.string(), z.any()).nullish(),
  toneAndVoice: z.record(z.string(), z.any()).nullish(),
  contentAngles: z.array(z.any()).nullish(),
  marketAndCompetition: z.record(z.string(), z.any()).nullish(),
});

export type BrandCore = z.infer<typeof brandCoreSchema>;
export type IdentityAndProduct = z.infer<typeof identityAndProductSchema>;
export type PurposeAndPositioning = z.infer<typeof purposeAndPositioningSchema>;
export type CustomerSegment = z.infer<typeof customerSegmentSchema>;
export type Audience = z.infer<typeof audienceSchema>;
export type ToneAndVoice = z.infer<typeof toneAndVoiceSchema>;
export type ContentAngle = z.infer<typeof contentAngleSchema>;
export type Competitor = z.infer<typeof competitorSchema>;
export type MarketAndCompetition = z.infer<typeof marketAndCompetitionSchema>;
export type BrandMetadata = z.infer<typeof metadataSchema>;
export type BrandIntelligenceDoc = z.infer<typeof brandIntelligenceResponseSchema>;
export type ContentAngleInput = z.infer<typeof contentAngleInputSchema>;
export type CustomerSegmentInput = z.infer<typeof customerSegmentInputSchema>;
export type CompetitorInput = z.infer<typeof competitorInputSchema>;
