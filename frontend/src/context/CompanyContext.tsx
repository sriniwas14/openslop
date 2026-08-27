import { createContext, useContext, useEffect, useState } from 'react'
import type { Company } from '@/services/companies'

type Ctx = {
  companies: Company[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  refresh: () => Promise<void>
  loading: boolean
}

const CompanyContext = createContext<Ctx | null>(null)

export function useCompany() {
  const v = useContext(CompanyContext)
  if (!v) throw new Error('useCompany must be inside CompanyProvider')
  return v
}

export function CompanyProvider({
  children,
  fetcher,
}: {
  children: React.ReactNode
  fetcher: () => Promise<Company[]>
}) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedId, setSelectedIdRaw] = useState<string | null>(() => localStorage.getItem('selectedCompanyId'))
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const data = await fetcher()
      setCompanies(data)
      // auto-select first if nothing selected
      if (!selectedId && data.length) {
        const id = data[0].id
        setSelectedIdRaw(id)
        localStorage.setItem('selectedCompanyId', id)
      }
      // clear stale selection
      if (selectedId && !data.find((c) => c.id === selectedId)) {
        setSelectedIdRaw(null)
        localStorage.removeItem('selectedCompanyId')
      }
    } catch {
      // keep empty on 401 etc.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setSelectedId(id: string | null) {
    setSelectedIdRaw(id)
    if (id) localStorage.setItem('selectedCompanyId', id)
    else localStorage.removeItem('selectedCompanyId')
  }

  return (
    <CompanyContext.Provider value={{ companies, selectedId, setSelectedId, refresh, loading }}>
      {children}
    </CompanyContext.Provider>
  )
}
