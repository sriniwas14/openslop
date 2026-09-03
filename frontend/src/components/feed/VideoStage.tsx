import { useRef, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  COMPOSITION,
  DEFAULT_MEDIA_LAYER,
  useCompositionSize,
  type MediaLayer,
  type StageSize,
} from '@/components/feed/composition'

// ---------------------------------------------------------------------------
// 9:16 video stage — a fixed-aspect, responsive composition for the feed
// card, editor popup, and detail preview.
//
// Outer wrapper takes the parent's width. Inner stage is a 9:16 box sized
// to the largest dimension that fits the parent. Children render inside
// the inner stage; the MediaTextOverlay engine measures the inner stage's
// getBoundingClientRect, so its 0-1 math resolves against a true 9:16
// canvas at whatever the actual rendered size is (360×640 on mobile,
// 720×1280 on desktop, 540×960 on tablet, etc.).
//
// Backend export (lib/image.ts overlayCenteredTextOnImage) uses 1080×1920
// for vertical content, so the same 0-1 fractions produce the same result
// at any preview resolution — preview === export.
// ---------------------------------------------------------------------------

type Props = {
  children: ReactNode | ((stage: StageSize) => ReactNode)
  className?: string
  /** Class applied to the inner 9:16 stage. */
  stageClassName?: string
  /** Optional media-layer config (fit, position X/Y) for the video cover crop. */
  media?: MediaLayer
  /**
   * Fill the parent vertically instead of using the natural 9:16 height.
   * The stage still keeps the 9:16 ratio — it just uses the parent's full
   * height and the matching width. Used when the parent already controls
   * height (e.g. the editor popup's max-h-[70vh] column).
   */
  fillHeight?: boolean
  /** Optional inline style on the outer wrapper. */
  style?: CSSProperties
  /** Ref forwarded to the inner 9:16 stage (NOT the outer wrapper). */
  innerRef?: React.Ref<HTMLDivElement>
}

export default function VideoStage({
  children,
  className,
  stageClassName,
  media = DEFAULT_MEDIA_LAYER,
  fillHeight = false,
  style,
  innerRef,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const stage = useCompositionSize(outerRef)

  // CSS variables the inner media element reads for object-position so the
  // cover crop can be re-anchored without re-rendering the video element.
  const mediaStyle: CSSProperties = {
    '--media-x': `${media.positionX * 100}%`,
    '--media-y': `${media.positionY * 100}%`,
  }

  return (
    <div
      ref={outerRef}
      className={cn('relative w-full', className)}
      style={{
        // When fillHeight is on, the outer wrapper stretches to the parent's
        // height and the inner stage (9:16) picks the largest box that fits.
        // Otherwise the outer keeps the natural 9:16 height derived from its
        // width, so the card never exceeds the 9:16 aspect.
        height: fillHeight ? '100%' : undefined,
        ...style,
      }}
    >
      {stage && (
        <div
          ref={innerRef}
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-black',
            stageClassName,
          )}
          style={{
            width: stage.width,
            height: stage.height,
          }}
        >
          <div
            className="relative h-full w-full"
            style={mediaStyle}
            data-composition-width={COMPOSITION.width}
            data-composition-height={COMPOSITION.height}
            data-aspect={String(COMPOSITION.aspectRatio)}
          >
            {typeof children === 'function' ? children(stage) : children}
          </div>
        </div>
      )}
    </div>
  )
}
