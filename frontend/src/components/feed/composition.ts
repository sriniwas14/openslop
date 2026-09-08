// ---------------------------------------------------------------------------
// Single source of truth for the 9:16 video composition.
//
// Every video preview in the app is rendered inside a fixed 9:16 stage that
// scales to fit the available parent. The inner coordinate space is always
// the canonical 1080 × 1920, so a text layer at position { x: 0.5, y: 0.24 }
// lands at the exact same pixel on every preview, every editor popup, and
// every backend export.
//
// KEEP IN SYNC with backend/src/lib/overlayLayout.ts:1080×1920 is the
// canonical canvas for vertical content.
// ---------------------------------------------------------------------------

import { useEffect, useState, type RefObject } from 'react'

export const COMPOSITION = {
  width: 1080,
  height: 1920,
  aspectRatio: 9 / 16,
} as const

export type MediaLayer = {
  /** Cover = fill the stage, cropping as needed (default). */
  fit: 'cover' | 'contain'
  /** 0-1 horizontal anchor for the cover crop. Default 0.5 = centre. */
  positionX: number
  /** 0-1 vertical anchor for the cover crop. Default 0.5 = centre. */
  positionY: number
}

export const DEFAULT_MEDIA_LAYER: MediaLayer = {
  fit: 'cover',
  positionX: 0.5,
  positionY: 0.5,
}

/** Resolved stage size — the actual pixel dimensions of the rendered 9:16 box. */
export type StageSize = { width: number; height: number }

/**
 * Measure the parent element and return the largest 9:16 box that fits inside
 * it. Re-measures on resize via ResizeObserver so the stage tracks the
 * available space without recreating any media element.
 */
export function useCompositionSize(parentRef: RefObject<HTMLElement | null>): StageSize | null {
  const [size, setSize] = useState<StageSize | null>(null)

  useEffect(() => {
    const el = parentRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        setSize(null)
        return
      }
      // Fit the 9:16 canvas inside the parent without distortion.
      const w = rect.width
      const h = w / COMPOSITION.aspectRatio
      if (h <= rect.height) {
        setSize({ width: w, height: h })
      } else {
        const h2 = rect.height
        const w2 = h2 * COMPOSITION.aspectRatio
        setSize({ width: w2, height: h2 })
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [parentRef])

  return size
}
