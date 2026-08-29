import { GalleryHorizontal, UserRound, Replace, type LucideIcon } from 'lucide-react'

/* ---------------------------------- types --------------------------------- */

// ponytail: strictly backend kinds (backend/src/modules/content/content.schemas.ts:3)
export type ContentType = 'carousel' | 'talkinghead' | 'greenscreen'
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
  /** vertical = 9:16 (reel/tiktok), horizontal = 16:9 */
  format: 'vertical' | 'horizontal' | null
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
  talkinghead: {
    label: 'Talking Head',
    description: 'Generate a presenter-style video',
    icon: UserRound,
    gradient: 'from-sky-500 via-cyan-500 to-teal-400',
    platforms: ['youtube', 'linkedin', 'instagram'],
  },
  greenscreen: {
    label: 'Green Screen',
    description: 'Create a green-screen overlay video',
    icon: Replace,
    gradient: 'from-rose-500 via-pink-500 to-fuchsia-500',
    platforms: ['tiktok', 'instagram', 'youtube'],
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


