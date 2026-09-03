import type { ContentAngle } from "../brand/brand.schemas";
import {
  FORMAT_GUIDE,
  FORMAT_REQUIRED_FIELDS,
  UGC_PLATFORMS,
  type UgcContentFormat,
  type UgcContentType,
  type UgcPlatform,
} from "./ugc.schemas";

// ponytail: server-side UGC creator prompt — the automatic content generator that runs
// after Brand Intelligence + content angles are ready. Kept module-local (mirrors
// brand.prompts). PROMPT_VERSION is stamped on every saved row so prompt changes are traceable.

export const PROMPT_VERSION = "ugc.v1";

/** One server-assigned writing assignment — the model fills exactly one item per slot. */
export type ContentSlot = {
  contentAngleId: string;
  platform: UgcPlatform;
  contentFormat: UgcContentFormat;
  contentType: UgcContentType;
};

export const UGC_CREATOR_SYSTEM_PROMPT = `You are a senior UGC content creator and social media content strategist.

Create authentic social media content for the brand and audience provided below.

The content must feel like something a real creator would naturally post.

DO NOT write traditional advertising copy.

DO NOT make the content sound like a corporate marketing team wrote it.

The goal is to create content that makes the target audience stop scrolling because it feels:

- relatable
- useful
- interesting
- surprising
- educational
- entertaining
- emotionally recognizable
- opinionated
- based on a realistic observation

AUTHENTICITY RULES:

1. Write like a real creator, not an advertiser.
2. Use simple, natural language.
3. Avoid unnecessary jargon.
4. Avoid corporate language.
5. Avoid generic marketing statements.
6. Do not invent statistics.
7. Do not invent testimonials.
8. Do not invent customer experiences.
9. Do not invent product capabilities.
10. Do not invent results.
11. Do not make unsupported claims.
12. Do not make unrealistic promises.
13. Do not repeatedly mention the brand.
14. Do not force a CTA into every post.
15. The content should provide value even when the brand name is removed.
16. Make the content specific to the target audience.
17. Use the selected content angle naturally.
18. Do not simply convert a product feature into a post.
19. Focus on real audience problems, behavior, mistakes, desires, questions, objections, observations, insights, stories, comparisons, and experiences.
20. Avoid repetitive structures.
21. Avoid repetitive hooks.
22. Do not generate the same idea using different words.
23. Every content piece must have a distinct perspective.
24. Do not make every post follow Problem → Solution → CTA.
25. Some content should be observations.
26. Some should be opinions.
27. Some should be educational.
28. Some should discuss mistakes.
29. Some should tell a story.
30. Some should challenge an assumption.
31. Some should compare two approaches.
32. Some should explain a common behavior.
33. Some should be relatable situations.
34. Some should demonstrate a use case.
35. Some should answer a common question.
36. Some should provide a surprising insight.
37. Some should discuss an objection.
38. Some should provide a practical lesson.

AVOID GENERIC AI/MARKETING PHRASES SUCH AS:

- game changer
- revolutionary
- unlock your potential
- take your business to the next level
- in today's fast-paced world
- here's the secret
- you won't believe
- transform your business
- ultimate solution
- cutting-edge
- powerful solution

Do not use these phrases unless they genuinely belong to the brand's established language.

AUTHENTICITY TEST:

Before returning a content piece, ask:

"Would a real creator actually post this?"

If the answer is no, rewrite it.

The content must feel specific, human, clear, and believable.

VISUAL METADATA:

Every content piece must also describe what kind of visual would fit it, because a separate
system will later search an asset library (internal assets and Pexels) for a matching photo or clip.

These are visual SEARCH SIGNALS, not image-generation prompts. Never pick an actual image.

- visualTags: 4-8 concrete, searchable subjects ("person using laptop", "modern office", "natural light")
- visualMood: the feeling of the scene ("casual, authentic, thoughtful")
- visualStyle: one of ugc | candid | lifestyle | product_photography | screen_capture | documentary | cinematic | illustration
- visualCategory: one of creator_lifestyle | workspace | product_closeup | screen_ui | people_talking | hands_and_objects | outdoor | street | home | food_and_drink | fitness | abstract_texture
- visualOrientation: portrait (default), square or landscape — must fit the platform

OUTPUT:

Return ONLY valid JSON. No markdown, no \`\`\`json fences, no commentary outside the JSON.`;

const list = (label: string, items: (string | null | undefined)[] | null | undefined) => {
  const clean = (items ?? []).map((x) => (x ?? "").trim()).filter(Boolean);
  return clean.length ? `${label}: ${clean.join("; ")}` : null;
};
const line = (label: string, value: string | null | undefined) => (value && value.trim() ? `${label}: ${value.trim()}` : null);

/** Brand Intelligence rendered into the placeholder blocks of the core prompt (never invents fields). */
export function buildBrandPromptBlock(brandBlock: string): string {
  return `BRAND:\n\n${brandBlock}`;
}

function buildAnglePromptBlock(angle: ContentAngle): string {
  return [
    "CONTENT ANGLE:",
    "",
    line("Name", angle.name),
    line("Description", angle.description),
    line("Target audience", angle.targetAudience),
    line("Problem", angle.problem),
    line("Core message", angle.coreMessage),
    line("Emotional trigger", angle.emotionalTrigger),
    list("Hook ideas", angle.hookIdeas),
    list("Suggested content types", angle.contentTypes),
    list("Suggested platforms", angle.platforms),
    list("CTA ideas (optional, do not force)", angle.ctaIdeas),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAssignmentsBlock(slots: ContentSlot[]): string {
  const rows = slots.map((slot, i) => {
    const required = FORMAT_REQUIRED_FIELDS[slot.contentFormat].join(", ");
    return `${i + 1}. platform: ${slot.platform} | contentFormat: ${slot.contentFormat} | contentType: ${slot.contentType}
   fill these fields: ${required}
   how: ${FORMAT_GUIDE[slot.contentFormat]}`;
  });
  return `ASSIGNMENTS (write exactly ${slots.length} distinct content pieces, one per line below, in this order):\n\n${rows.join("\n\n")}`;
}

export function buildUgcBatchPrompt(input: {
  brandBlock: string;
  angle: ContentAngle;
  slots: ContentSlot[];
  recentContent: string[];
  attemptNote?: string | null;
}): string {
  const platforms = [...new Set(input.slots.map((s) => s.platform))];
  const formats: UgcContentFormat[] = [...new Set(input.slots.map((s) => s.contentFormat))];
  const parts = [
    buildBrandPromptBlock(input.brandBlock),
    "",
    buildAnglePromptBlock(input.angle),
    "",
    `PLATFORM: ${platforms.join(", ")} (allowed values: ${UGC_PLATFORMS.join(", ")})`,
    `CONTENT FORMAT: ${formats.join(", ")}`,
    "",
    buildAssignmentsBlock(input.slots),
    "",
    `RECENTLY GENERATED CONTENT (already written for this brand — do NOT repeat these hooks, ideas, structures or perspectives):\n${
      input.recentContent.length ? input.recentContent.map((x) => `- ${x}`).join("\n") : "(none yet)"
    }`,
  ];
  if (input.attemptNote && input.attemptNote.trim()) {
    parts.push("", `PREVIOUS ATTEMPT WAS REJECTED: ${input.attemptNote.trim()}`, "Fix exactly that and write fresh content.");
  }
  parts.push(
    "",
    "Every piece must have a distinct perspective and a distinct hook — changing one word is not enough.",
    "Adapt structure, length and language to the platform of that piece (LinkedIn reads differently from TikTok).",
    "Only use facts, problems, desires and objections that appear in the brand or content angle above.",
    "",
    "Return ONLY this JSON object:",
    `{
  "contents": [
    {
      "hook": "...",
      "title": "...",
      "body": "...",
      "lines": [],
      "script": null,
      "onScreenText": [],
      "cta": null,
      "contentType": "...",
      "platform": "...",
      "contentFormat": "...",
      "contentAngleId": "${input.angle.id}",
      "contentAngleName": "${input.angle.name.replace(/"/g, "'")}",
      "visualTags": [],
      "visualMood": "...",
      "visualStyle": "...",
      "visualCategory": "...",
      "visualOrientation": "portrait"
    }
  ]
}`,
    "",
    `- contents: exactly ${input.slots.length} items, in assignment order`,
    "- only populate the fields that belong to that piece's content format",
    "- title: short working title in the brand's voice, <= 90 characters",
    "- visualTags: 4-8 concrete searchable subjects; visualMood/visualStyle/visualCategory/visualOrientation: always present",
  );
  return parts.join("\n");
}
