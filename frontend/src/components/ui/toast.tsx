import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ponytail: lightweight self-contained toast — no new dependency, uses the OpenSlop semantic tokens.
type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info'
type Toast = { id: string; title: string; description?: string; variant: ToastVariant }
type ToastInput = { title: string; description?: string; variant?: ToastVariant; duration?: number }

const ToastContext = createContext<{ toast: (t: ToastInput) => void; dismiss: (id: string) => void } | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

const VARIANT: Record<ToastVariant, { bar: string; icon: React.ElementType; iconClass: string }> = {
  default: { bar: 'bg-primary', icon: Info, iconClass: 'text-primary' },
  success: { bar: 'bg-success', icon: CheckCircle2, iconClass: 'text-success' },
  error: { bar: 'bg-destructive', icon: AlertCircle, iconClass: 'text-destructive' },
  warning: { bar: 'bg-warning', icon: AlertTriangle, iconClass: 'text-warning' },
  info: { bar: 'bg-info', icon: Info, iconClass: 'text-info' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current[id]
    if (timer) {
      clearTimeout(timer)
      delete timers.current[id]
    }
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID()
      const variant = input.variant ?? 'default'
      const duration = input.duration ?? (variant === 'error' ? 6500 : 4000)
      // keep at most 4 stacked
      setToasts((prev) => [...prev, { id, title: input.title, description: input.description, variant }].slice(-4))
      timers.current[id] = setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  useEffect(() => {
    const t = timers.current
    return () => {
      Object.values(t).forEach(clearTimeout)
    }
  }, [])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => {
          const v = VARIANT[t.variant]
          const Icon = v.icon
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex overflow-hidden rounded-lg border bg-popover shadow-lg duration-200 animate-in fade-in slide-in-from-bottom-2"
            >
              <div className={cn('w-1 shrink-0', v.bar)} />
              <div className="flex flex-1 items-start gap-2.5 p-3">
                <Icon className={cn('mt-0.5 size-4 shrink-0', v.iconClass)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-popover-foreground">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs break-words text-muted-foreground">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
