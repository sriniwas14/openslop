// ponytail: static seed — no DB call here, imported by migrate.ts and inserted once
export const CONTENT_TEMPLATES = [
  {
    title: "Product Launch Carousel",
    prompt: "Create a bold 1080x1080 carousel announcing a new product drop — 5 slides: hook, problem, feature breakdown, social proof, CTA. Vibrant, modern, clean typography on pastel gradients.",
    previewImage: "https://picsum.photos/seed/template-product-launch/540/960",
    duration: "15",
    structure: "hook (5s) → problem (5s) → CTA (5s)",
  },
  {
    title: "Founder Story Talking Head",
    prompt: "A founder speaking directly to camera in a bright office, 15s vertical script: personal pain point, why they built the product, one surprising insight, warm confident tone, a-roll only.",
    previewImage: "https://picsum.photos/seed/template-founder-story/540/960",
    duration: "15",
    structure: "hook (5s) → story (5s) → insight (5s)",
  },
  {
    title: "Before / After Greenscreen",
    prompt: "Greenscreen overlay video — creator reacts to a before/after product result, split-screen b-roll of transformation, 30s vertical, punchy captions, upbeat hook in first 2 seconds.",
    previewImage: "https://picsum.photos/seed/template-before-after/540/960",
    duration: "30",
    structure: "hook (5s) → before (10s) → after (10s) → CTA (5s)",
  },
  {
    title: "Myth Busting Carousel",
    prompt: "Myth-busting carousel: 6 slides debunking the top 3 myths in your niche. Each myth on its own slide with a bold X overlay, corrected truth underneath, minimal icon style.",
    previewImage: "https://picsum.photos/seed/template-myth-busting/540/960",
    duration: "30",
    structure: "myth 1 (10s) → truth 1 (10s) → myth 2+3 (10s)",
  },
  {
    title: "Testimonial Talking Head",
    prompt: "Customer testimonial talking head — authentic UGC style, 30s vertical, opens with the result achieved, then journey, then recommendation. Natural light, handheld feel.",
    previewImage: "https://picsum.photos/seed/template-testimonial/540/960",
    duration: "30",
    structure: "result (5s) → journey (15s) → recommend (10s)",
  },
  {
    title: "How-It-Works Greenscreen",
    prompt: "Greenscreen explainer — presenter points to screen-recorded workflow behind them, 3 steps, 45s horizontal, clear callouts and arrow overlays, professional screencast backdrop.",
    previewImage: "https://picsum.photos/seed/template-how-it-works/540/960",
    duration: "45",
    structure: "problem (10s) → 3 steps (25s) → CTA (10s)",
  },
  {
    title: "Weekly Tips Carousel",
    prompt: "Weekly tips carousel — 7 slides, one actionable tip per slide, consistent brand color header, numbered badges, final slide CTA to save and share.",
    previewImage: "https://picsum.photos/seed/template-weekly-tips/540/960",
    duration: "45",
    structure: "intro (5s) → 3 tips (30s) → CTA (10s)",
  },
  {
    title: "Problem → Solution Talking Head",
    prompt: "Problem → solution talking head, 15s vertical: agitate the pain in 3 seconds, reveal the fix, end with a memorable one-liner hook. Fast cuts, captioned.",
    previewImage: "https://picsum.photos/seed/template-problem-solution/540/960",
    duration: "15",
    structure: "pain (5s) → solution (5s) → hook (5s)",
  },
] as const;
