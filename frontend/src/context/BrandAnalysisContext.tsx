import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useCompany } from '@/context/CompanyContext'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getBrandStatus, startBrandAnalysis } from '@/services/brand'

// ponytail: Brand Intelligence analysis runs as a BACKGROUND job on the server. This
// provider is mounted once (in DashboardLayout) above the routes, so it keeps polling
// and can pop the "ready" dialog no matter which page the user navigates to.
const POLL_MS = 4000

type Ctx = {
  analyzingIds: string[]
  isAnalyzing: (companyId: string | null | undefined) => boolean
  startAnalysis: (companyId: string, extra?: string | null) => Promise<void>
  reloadToken: number
}

const BrandAnalysisContext = createContext<Ctx | null>(null)

export function useBrandAnalysis() {
  const v = useContext(BrandAnalysisContext)
  if (!v) throw new Error('useBrandAnalysis must be used within BrandAnalysisProvider')
  return v
}

export function BrandAnalysisProvider({ children }: { children: React.ReactNode }) {
  const { selectedId, setSelectedId } = useCompany()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [analyzingIds, setAnalyzingIds] = useState<string[]>([])
  const [reloadToken, setReloadToken] = useState(0)
  const [completedId, setCompletedId] = useState<string | null>(null)

  // ref mirror so the single polling interval always reads the latest in-flight ids
  const idsRef = useRef<string[]>([])
  const resumedRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    idsRef.current = analyzingIds
  }, [analyzingIds])

  const addId = useCallback((id: string) => {
    setAnalyzingIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])
  const removeId = useCallback((id: string) => {
    setAnalyzingIds((prev) => prev.filter((x) => x !== id))
  }, [])

  const startAnalysis = useCallback(
    async (companyId: string, extra?: string | null) => {
      addId(companyId) // optimistic: reflect "analyzing" immediately
      try {
        await startBrandAnalysis(companyId, extra)
        setReloadToken((t) => t + 1)
        toast({
          title: 'Analyzing in the background',
          description: 'Feel free to keep working — we\u2019ll notify you when it\u2019s done.',
          variant: 'info',
        })
      } catch (e: any) {
        removeId(companyId)
        toast({ title: 'Could not start analysis', description: e?.message ?? 'Please try again.', variant: 'error' })
      }
    },
    [addId, removeId, toast],
  )

  // One interval for all in-flight analyses; set up once (stable deps).
  useEffect(() => {
    const iv = setInterval(async () => {
      const ids = idsRef.current
      if (!ids.length) return
      await Promise.all(
        ids.map(async (id) => {
          try {
            const st = await getBrandStatus(id)
            if (st.status === 'ready') {
              removeId(id)
              setReloadToken((t) => t + 1)
              setCompletedId(id)
            } else if (st.status === 'failed') {
              removeId(id)
              setReloadToken((t) => t + 1)
              toast({ title: 'Brand analysis failed', description: st.error ?? 'Please try again.', variant: 'error' })
            }
          } catch {
            /* transient poll error — keep trying on the next tick */
          }
        }),
      )
    }, POLL_MS)
    return () => clearInterval(iv)
  }, [removeId, toast])

  // Resume tracking after a page refresh: if the selected company is mid-analysis, re-attach.
  useEffect(() => {
    if (!selectedId || resumedRef.current[selectedId]) return
    resumedRef.current[selectedId] = true
    getBrandStatus(selectedId)
      .then((st) => {
        if (st.status === 'analyzing') addId(selectedId)
      })
      .catch(() => {})
  }, [selectedId, addId])

  const isAnalyzing = useCallback(
    (companyId: string | null | undefined) => !!companyId && analyzingIds.includes(companyId),
    [analyzingIds],
  )

  const value = useMemo(
    () => ({ analyzingIds, isAnalyzing, startAnalysis, reloadToken }),
    [analyzingIds, isAnalyzing, startAnalysis, reloadToken],
  )

  const closeCompleted = () => setCompletedId(null)
  const viewCompleted = () => {
    if (completedId) {
      setSelectedId(completedId)
      navigate('/dashboard/brand')
    }
    setCompletedId(null)
  }

  return (
    <BrandAnalysisContext.Provider value={value}>
      {children}
      <Dialog
        open={!!completedId}
        onOpenChange={(o) => {
          if (!o) closeCompleted()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="size-5" />
            </span>
            <DialogTitle>Brand Intelligence ready</DialogTitle>
            <DialogDescription>Your brand intelligence is now completed. You can check it out.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeCompleted}>
              Close
            </Button>
            <Button onClick={viewCompleted}>View Brand Intelligence</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BrandAnalysisContext.Provider>
  )
}
