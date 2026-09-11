import { z } from "zod";
import { MEME_VARIATIONS_PER_MEME, type MemeEntry } from "./meme.store";

// ponytail: Meme Engine prompt — the behavioral standard for meme-overlay generation.
// The model must understand the meme (joke, reaction, emotion, pattern) from the
// description + metadata FIRST, then map the brand onto it. Never generic ad copy.

export const MEME_PROMPT_VERSION = "meme.v1";

export const MEME_CREATIVE_ANGLES = [
  "POV",
  "Me When",
  "Relatable",
  "Reaction",
  "Plot Twist",
  "Expectation vs Reality",
  "Nobody",
  "When",
  "That moment when",
  "Before vs After",
  "Founder Situation",
  "Customer Situation",
  "Story",
  "Funny",
] as const;

export const MEME_EMOTIONS = [
  "Funny",
  "Happy",
  "Sad",
  "Surprise",
  "Shock",
  "Frustration",
  "Excitement",
  "Disbelief",
  "Relief",
  "Anger",
  "Confusion",
] as const;

export const MEME_CREATOR_SYSTEM_PROMPT = `You are a meme creator who makes branded memes that feel native to social media.

You are NOT a copywriter. You are NOT writing advertisements. You understand memes first, then you let the brand walk into the joke naturally.

For every meme you receive, FIRST understand it:
1. What is happening in the meme (the visual / situation).
2. What the joke is (the underlying pattern, not just the caption).
3. What reaction it represents (who would post this and why).
4. What emotion it communicates.
5. What type of real-life situation naturally fits this meme.

The meme description and metadata are your PRIMARY context for this. Do not rely only on the meme title or URL.

THEN map the brand onto the meme:
- Find the brand's real pain points, customer situations, founder problems, or product moments that ALREADY match the meme's joke pattern.
- The brand becomes part of the joke. The meme must influence the actual text you write.
- Write like a creator, not a marketing team: short, punchy, conversational, meme-native.

OVERLAY TEXT RULES:
- Short and easy to read on the visual (1-2 lines, <= 140 characters ideally, never over 280).
- Conversational, creator-like, social-media friendly.
- NEVER write: generic marketing copy, long explanations, forced CTAs, sales copy,
  promotional slogans, "try our product", "learn more", or corporate language.

BAD: "WhatsPilot is the best AI automation platform!"
GOOD: "POV: WhatsPilot already handled the replies and you're still refreshing the inbox."

BRAND INTEGRATION TEST — before returning each variation, ask:
"Does this feel like a real meme that naturally became about the brand?"
If it feels like an advertisement placed on top of a meme, rewrite it.

Return exactly ${MEME_VARIATIONS_PER_MEME} variations with meaningfully different creative angles.
Choose angles that genuinely fit the meme — never force one.
Every variation must have a clear brand connection AND structured metadata.`;

export function buildMemeBatchPrompt(input: {
  brandBlock: string;
  meme: MemeEntry;
  recentOverlays: string[];
  attemptNote?: string | null;
}): string {
  const parts = [
    `BRAND INTELLIGENCE:\n\n${input.brandBlock}`,
    "",
    `MEME:\n${input.meme.meme}`,
    "",
    `MEME URL:\n${input.meme.meme_url}`,
    "",
    `MEME DESCRIPTION:\n${input.meme.meme_description}`,
    "",
    `MEME TAGS / METADATA:\n${input.meme.meme_metadata.join(", ")}`,
    "",
    `TASK: Understand the meme above, then write exactly ${MEME_VARIATIONS_PER_MEME} different branded meme overlay variations for it.`,
    "Use different creative angles per variation.",
    `CREATIVE ANGLES (pick fitting ones): ${MEME_CREATIVE_ANGLES.join(", ")}`,
    `EMOTIONS (pick one per variation): ${MEME_EMOTIONS.join(", ")}`,
    "",
    `ALREADY WRITTEN FOR THIS BRAND (do NOT repeat these overlays or ideas):\n${
      input.recentOverlays.length ? input.recentOverlays.map((x) => `- ${x}`).join("\n") : "(none yet)"
    }`,
  ];
  if (input.attemptNote && input.attemptNote.trim()) {
    parts.push("", `PREVIOUS ATTEMPT WAS REJECTED: ${input.attemptNote.trim()}`, "Fix exactly that and write fresh variations.");
  }
  parts.push(
    "",
    "Return ONLY this JSON object (no markdown, no fences, no commentary):",
    `{
  "meme_url": "${input.meme.meme_url}",
  "meme_description": ${JSON.stringify(input.meme.meme_description.slice(0, 500))},
  "variations": [
    {
      "variation_id": 1,
      "creative_angle": "POV",
      "overlay_text": "...",
      "description": "...",
      "tags": ["POV", "Funny", "Automation"],
      "emotion": "Surprise",
      "brand_angle": "Automation"
    }
  ]
}`,
    "",
    `- variations: exactly ${MEME_VARIATIONS_PER_MEME} items, variation_id 1-${MEME_VARIATIONS_PER_MEME}`,
    "- overlay_text: 1-280 chars, short, punchy, meme-native, no corporate language, no CTA",
    "- description: one sentence on why this variation works (<= 280 chars)",
    "- tags: 2-6 items mixing the creative angle and the content topic",
    "- emotion: one of the EMOTIONS list above",
    "- brand_angle: how the brand was integrated (e.g. Product Feature, Customer Pain, Product Reaction, Automation, Time Saving, Customer Experience, Founder Problem, Creator Problem, Product Outcome, Brand Personality)",
  );
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Validation — exactly 5 variations per meme, structured metadata present
// ---------------------------------------------------------------------------

export const memeVariationSchema = z.object({
  variation_id: z.coerce.number().int().min(1).max(MEME_VARIATIONS_PER_MEME),
  creative_angle: z.string().trim().min(1).max(64),
  overlay_text: z.string().trim().min(1).max(280),
  description: z.string().trim().min(1).max(2000).nullish(),
  tags: z.array(z.string().trim().min(1).max(80)).min(2).max(8),
  emotion: z.string().trim().min(1).max(64),
  brand_angle: z.string().trim().min(1).max(200),
});

export type MemeVariation = z.infer<typeof memeVariationSchema>;

const obj = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};

/** Extract exactly-5 variations from an AI response; returns a reason when unusable. */
export function parseMemeVariations(
  raw: unknown,
): { ok: true; variations: MemeVariation[] } | { ok: false; reason: string } {
  const root = obj(raw);
  const list = Array.isArray(root.variations) ? root.variations : Array.isArray(raw) ? raw : null;
  if (!list) return { ok: false, reason: "response contained no variations array" };
  if (list.length !== MEME_VARIATIONS_PER_MEME)
    return { ok: false, reason: `expected exactly ${MEME_VARIATIONS_PER_MEME} variations, got ${list.length}` };
  const out: MemeVariation[] = [];
  const seenAngles = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const parsed = memeVariationSchema.safeParse(obj(list[i]));
    if (!parsed.success)
      return { ok: false, reason: `variation ${i + 1} is invalid (${parsed.error.issues[0]?.message ?? "bad shape"})` };
    const angle = parsed.data.creative_angle.toLowerCase();
    if (seenAngles.has(angle)) return { ok: false, reason: `creative_angle "${parsed.data.creative_angle}" is repeated — angles must differ` };
    seenAngles.add(angle);
    out.push(parsed.data);
  }
  return { ok: true, variations: out };
}
