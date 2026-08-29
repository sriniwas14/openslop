import {
  Clapperboard,
  GalleryHorizontal,
  Image,
  Newspaper,
  Type,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

/* ---------------------------------- types --------------------------------- */

export type ContentType = 'carousel' | 'talking-head' | 'short-video' | 'image' | 'text' | 'article'
export type Platform = 'instagram' | 'linkedin' | 'x' | 'tiktok' | 'youtube' | 'blog'
export type ContentStatus = 'draft' | 'review' | 'scheduled' | 'published'
export type ViewMode = 'list' | 'calendar' | 'cards'

export type ContentItem = {
  id: string
  title: string
  summary: string
  type: ContentType
  platforms: Platform[]
  status: ContentStatus
  /** ISO datetime — null means unscheduled draft */
  scheduledAt: string | null
  /** AI visibility / relevance score, 0–100 */
  aiScore: number
}

/* -------------------------------- metadata -------------------------------- */

export const CONTENT_TYPES: Record<
  ContentType,
  {
    label: string
    description: string
    icon: LucideIcon
    /** tailwind gradient used for thumbnails/previews */
    gradient: string
    /** suggested platforms for the creation workflow */
    platforms: Platform[]
  }
> = {
  carousel: {
    label: 'Carousel',
    description: 'Create a multi-slide social post',
    icon: GalleryHorizontal,
    gradient: 'from-violet-500 via-indigo-500 to-blue-500',
    platforms: ['instagram', 'linkedin', 'x'],
  },
  'talking-head': {
    label: 'Talking Head Video',
    description: 'Generate a presenter-style video',
    icon: UserRound,
    gradient: 'from-sky-500 via-cyan-500 to-teal-400',
    platforms: ['youtube', 'linkedin', 'instagram'],
  },
  'short-video': {
    label: 'Short Video',
    description: 'Create short-form video content',
    icon: Clapperboard,
    gradient: 'from-rose-500 via-pink-500 to-fuchsia-500',
    platforms: ['tiktok', 'instagram', 'youtube'],
  },
  image: {
    label: 'Image Post',
    description: 'Generate a visual social post',
    icon: Image,
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    platforms: ['instagram', 'x', 'linkedin'],
  },
  text: {
    label: 'Text Post',
    description: 'Create text-based content',
    icon: Type,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    platforms: ['x', 'linkedin'],
  },
  article: {
    label: 'Article',
    description: 'Create long-form content',
    icon: Newspaper,
    gradient: 'from-slate-500 via-zinc-500 to-neutral-600',
    platforms: ['blog', 'linkedin'],
  },
}

export const PLATFORMS: Record<Platform, { label: string; dot: string }> = {
  instagram: { label: 'Instagram', dot: 'bg-pink-500' },
  linkedin: { label: 'LinkedIn', dot: 'bg-sky-500' },
  x: { label: 'X', dot: 'bg-zinc-700 dark:bg-zinc-300' },
  tiktok: { label: 'TikTok', dot: 'bg-teal-400' },
  youtube: { label: 'YouTube', dot: 'bg-red-500' },
  blog: { label: 'Blog', dot: 'bg-violet-500' },
}

export const STATUSES: Record<
  ContentStatus,
  { label: string; badge: string; dot: string; /** compact chip tone used on the calendar */ chip: string }
> = {
  draft: {
    label: 'Draft',
    badge: 'bg-muted text-muted-foreground',
    dot: 'bg-zinc-400',
    chip: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  },
  review: {
    label: 'In review',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  scheduled: {
    label: 'Scheduled',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
    chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  published: {
    label: 'Published',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
}

/* --------------------------------- helpers -------------------------------- */

export function formatDate(iso: string | null): string {
  if (!iso) return 'No date'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateLong(iso: string | null): string {
  if (!iso) return 'Not scheduled'
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function scoreTone(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  if (score >= 65) return 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
  if (score >= 50) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  return 'bg-muted text-muted-foreground'
}

/* -------------------------------- mock data ------------------------------- */
/* Dates are generated relative to "today" so the calendar is always populated. */

function at(daysFromToday: number, hour = 9): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

let mockSeq = 0
function item(
  title: string,
  summary: string,
  type: ContentType,
  platforms: Platform[],
  status: ContentStatus,
  scheduledAt: string | null,
  aiScore: number,
): ContentItem {
  mockSeq += 1
  return { id: `mock-${mockSeq}`, title, summary, type, platforms, status, scheduledAt, aiScore }
}

export function buildMockContent(): ContentItem[] {
  mockSeq = 0
  return [
    item(
      'Design systems that scale: lessons from 40 brands',
      'A 7-slide breakdown of the patterns the fastest-growing brands reuse across every channel.',
      'carousel',
      ['instagram', 'linkedin'],
      'scheduled',
      at(2),
      88,
    ),
    item(
      'POV: your analytics dashboard finally makes sense',
      'A 20-second screen-capture cut with punchy captions and a strong hook in the first second.',
      'short-video',
      ['tiktok', 'instagram'],
      'scheduled',
      at(1, 12),
      91,
    ),
    item(
      'Founder update: what we shipped in August',
      'Talking-head recap of the month — new calendar view, AI scoring, and what is coming next.',
      'talking-head',
      ['youtube', 'linkedin'],
      'scheduled',
      at(4, 15),
      74,
    ),
    item(
      'Behind the scenes: GeoAlt offsite',
      'Photo set from the team offsite with a light brand overlay and captions.',
      'image',
      ['instagram'],
      'published',
      at(-3),
      67,
    ),
    item(
      'Hot take: dashboards are dead. Workflows win.',
      'Text post arguing that content tools should start from the workflow, not the chart.',
      'text',
      ['x', 'linkedin'],
      'published',
      at(-1, 11),
      82,
    ),
    item(
      'The complete guide to AI-assisted content ops',
      'Long-form walkthrough of a modern content pipeline: brief, generate, review, schedule, track.',
      'article',
      ['blog', 'linkedin'],
      'scheduled',
      at(6, 10),
      79,
    ),
    item(
      'Before / after: our onboarding redesign',
      'Side-by-side slides showing the old vs. new onboarding flow with conversion numbers.',
      'carousel',
      ['instagram'],
      'review',
      at(3),
      71,
    ),
    item(
      '3 keyboard shortcuts that save an hour a day',
      'Fast-paced short video demoing the three most-used shortcuts in the workspace.',
      'short-video',
      ['tiktok', 'youtube'],
      'draft',
      null,
      64,
    ),
    item(
      'Product teaser: the calendar view is coming',
      'Single visual post teasing the new scheduling calendar, dark mode, gradient accents.',
      'image',
      ['instagram', 'x'],
      'scheduled',
      at(8, 16),
      85,
    ),
    item(
      'How we cut content production time by 60%',
      'Case-study article with real numbers from the last quarter and the exact stack we use.',
      'article',
      ['blog'],
      'review',
      at(5),
      77,
    ),
    item(
      "We're hiring: founding designer (remote)",
      'Hiring post for a founding designer — mission, scope, and what great looks like.',
      'text',
      ['linkedin'],
      'published',
      at(-6),
      58,
    ),
    item(
      'Customer story: scaling content with Loom Labs',
      'Interview-style talking head with the Loom Labs growth lead on their content engine.',
      'talking-head',
      ['youtube'],
      'draft',
      null,
      69,
    ),
    item(
      '2026 content trends you cannot ignore',
      'Ten-slide carousel covering the shifts in AI-native publishing and short-form video.',
      'carousel',
      ['linkedin', 'x'],
      'published',
      at(-9),
      90,
    ),
    item(
      'Quote card: consistency beats intensity',
      'Minimal quote card on a soft gradient — part of the recurring motivation series.',
      'image',
      ['instagram'],
      'scheduled',
      at(0, 8),
      73,
    ),
  ]
}
