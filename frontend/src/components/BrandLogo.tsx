import logo from '@/assets/logo_banner.png'
import { cn } from '@/lib/utils'

/**
 * OpenSlop brand lockup. The asset ships on a light canvas, so it blends
 * into light surfaces; in dark mode it renders as a clean white mark.
 */
export default function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="OpenSlop"
      draggable={false}
      className={cn(
        'h-8 w-auto select-none mix-blend-multiply dark:mix-blend-normal dark:brightness-0 dark:invert',
        className,
      )}
    />
  )
}
