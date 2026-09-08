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
  mediaUrl?: string | null
  duration?: number | null
  templateId?: string | null
}

/* -------------------------------- metadata -------------------------------- */

export const CONTENT_TYPES: Record<
  ContentType,
  {
    label: string
    description: string
    icon: LucideIcon
    /** monochrome tone used for thumbnails/previews */
    gradient: string
    /** suggested platforms for the creation workflow */
    platforms: Platform[]
  }
> = {
  carousel: {
    label: 'Carousel',
    description: 'Create a multi-slide social post',
    icon: GalleryHorizontal,
    gradient: 'bg-foreground',
    platforms: ['instagram', 'linkedin', 'x'],
  },
  talkinghead: {
    label: 'Talking Head',
    description: 'Generate a presenter-style video',
    icon: UserRound,
    gradient: 'bg-foreground/80',
    platforms: ['youtube', 'linkedin', 'instagram'],
  },
  greenscreen: {
    label: 'Green Screen',
    description: 'Create a green-screen overlay video',
    icon: Replace,
    gradient: 'bg-foreground/60',
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
    dot: 'bg-muted-foreground/60',
    chip: 'bg-muted text-muted-foreground',
  },
  review: {
    label: 'In review',
    badge: 'bg-warning/10 text-warning',
    dot: 'bg-warning',
    chip: 'bg-warning/15 text-warning',
  },
  scheduled: {
    label: 'Scheduled',
    badge: 'bg-info/10 text-info',
    dot: 'bg-info',
    chip: 'bg-info/15 text-info',
  },
  published: {
    label: 'Published',
    badge: 'bg-success/10 text-success',
    dot: 'bg-success',
    chip: 'bg-success/15 text-success',
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
  if (score >= 80) return 'bg-success/10 text-success'
  if (score >= 65) return 'bg-info/10 text-info'
  if (score >= 50) return 'bg-warning/10 text-warning'
  return 'bg-muted text-muted-foreground'
}

