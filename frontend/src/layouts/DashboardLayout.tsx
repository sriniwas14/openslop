import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useSession } from '@/services/auth'
import { listCompanies } from '@/services/companies'
import { listAiConfigs } from '@/services/ai'
import { CompanyProvider } from '@/context/CompanyContext'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'

export default function DashboardLayout() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (isPending) return
    if (!session) { setChecking(false); return }
    let cancelled = false
    // ponytail: two fetches in parallel, no new endpoint; skip check when already on onboarding
    Promise.all([listAiConfigs().catch(() => [] as any[]), listCompanies().catch(() => [] as any[])]).then(([ai, companies]) => {
      if (cancelled) return
      const needAi = !ai || ai.length === 0
      const needCompany = !companies || companies.length === 0
      if (needAi || needCompany) navigate('/onboarding', { replace: true })
      else setChecking(false)
    })
    return () => { cancelled = true }
  }, [isPending, session, navigate])

  if (isPending || checking) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Loading…</div>
  if (!session) return <Navigate to="/onboarding" replace />

  return (
    <CompanyProvider fetcher={listCompanies}>
      <div className="flex h-svh">
        <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setMobileOpen((v) => !v)} />
          <main className="min-h-0 flex-1 overflow-auto bg-background p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </CompanyProvider>
  )
}
