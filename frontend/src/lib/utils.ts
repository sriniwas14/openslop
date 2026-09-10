import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ponytail: R2 public buckets send no CORS headers, so <video>/<img>
// with crossOrigin="anonymous" is blocked. Same-origin /media/proxy
// (Vite → :3000 in dev) avoids CORS + canvas taint; exportOverlay.ts
// already proxies for canvas baking — preview reuses the same helper.
export function proxiedMediaUrl(url: string): string {
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) return url
  if (typeof window !== "undefined" && url.startsWith(window.location.origin)) return url
  if (/^https?:\/\//i.test(url)) return `/media/proxy?url=${encodeURIComponent(url)}`
  return url
}
