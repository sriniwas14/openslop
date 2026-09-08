import { AlertTriangle, Camera, CheckCircle2, Loader2, XCircle, type LucideIcon } from 'lucide-react'
import type { VisualSearchStatus } from '@/services/visual'

// ---------------------------------------------------------------------------
// Feed presentation metadata — data-driven so a card is rendered from config, never
// from a chain of inline conditionals. Labels mirror the backend catalogs in
// ugc.schemas.ts (UGC_PLATFORMS / UGC_CONTENT_FORMATS) and visual.schemas.ts statuses.
// ---------------------------------------------------------------------------

/** UGC platform ids → display label + accent dot (distinct from content/data.ts PLATFORMS). */
export const FEED_PLATFORMS: Record<string, { label: string; dot: string }> = {
  instagram: { label: 'Instagram', dot: 'bg-pink-500' },
  tiktok: { label: 'TikTok', dot: 'bg-teal-400' },
  linkedin: { label: 'LinkedIn', dot: 'bg-sky-500' },
  x: { label: 'X', dot: 'bg-zinc-700 dark:bg-zinc-300' },
  youtube_shorts: { label: 'YouTube Shorts', dot: 'bg-red-500' },
  facebook: { label: 'Facebook', dot: 'bg-blue-600' },
}

export const FEED_FORMATS: Record<string, string> = {
  wall_of_text_slide: 'Wall of text',
  video_hook: 'Video hook',
  talking_head: 'Talking head',
  screen_recording: 'Screen recording',
  product_demo: 'Product demo',
  spokesperson: 'Spokesperson',
  green_screen: 'Green screen',
  mobile_app: 'Mobile app',
  clay_motion: 'Clay motion',
  website_demo: 'Website demo',
  meme: 'Meme',
  ugc_video: 'UGC video',
}

export type VisualStatusMeta = {
  label: string
  /** chip tone — semantic tokens only, no hardcoded hex */
  badge: string
  dot: string
  icon: LucideIcon
  spin?: boolean
  /** shown on the card while the visual is not usable yet */
  hint: string
}

export const VISUAL_STATUS: Record<VisualSearchStatus, VisualStatusMeta> = {
  pending: {
    label: 'Queued',
    badge: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/60',
    icon: Loader2,
    spin: true,
    hint: 'Waiting for visual search',
  },
  searching: {
    label: 'Finding visual',
    badge: 'bg-info/10 text-info',
    dot: 'bg-info',
    icon: Loader2,
    spin: true,
    hint: 'Searching for the best match',
  },
  matched: {
    label: 'Visual ready',
    badge: 'bg-success/10 text-success',
    dot: 'bg-success',
    icon: CheckCircle2,
    hint: '',
  },
  needs_review: {
    label: 'Needs review',
    badge: 'bg-warning/10 text-warning',
    dot: 'bg-warning',
    icon: AlertTriangle,
    hint: 'No photo matched this post well enough — pick one manually',
  },
  failed: {
    label: 'Search failed',
    badge: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
    icon: XCircle,
    hint: 'Visual search could not complete',
  },
}

export function platformMeta(id: string) {
  return FEED_PLATFORMS[id] ?? { label: id || 'Platform', dot: 'bg-muted-foreground/60' }
}

export function formatLabel(id: string) {
  return FEED_FORMATS[id] ?? (id ? id.replace(/_/g, ' ') : 'Format')
}

export function visualStatusMeta(status: VisualSearchStatus): VisualStatusMeta {
  return VISUAL_STATUS[status] ?? VISUAL_STATUS.pending
}

/** "observation" → "Observation"; content types have no fixed catalog worth mirroring. */
export function typeLabel(id: string) {
  if (!id) return ''
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Compact camera/credit line for a Pexels visual. */
export function creditLine(photographer: string | null) {
  if (!photographer) return null
  return `Photo by ${photographer} · Pexels`
}

export const CAMERA_ICON = Camera
