import { createContext, useContext } from 'react'
import type { BrandIntelligenceDoc } from '@/services/brand'

type Ctx = {
  companyId: string
  doc: BrandIntelligenceDoc
  onSaved: (doc: BrandIntelligenceDoc) => void
  onError: (msg: string) => void
}

const BrandTabContext = createContext<Ctx | null>(null)

export function BrandTabProvider({ value, children }: { value: Ctx; children: React.ReactNode }) {
  return <BrandTabContext.Provider value={value}>{children}</BrandTabContext.Provider>
}

export function useBrandTab() {
  const v = useContext(BrandTabContext)
  if (!v) throw new Error('useBrandTab must be used within BrandTabProvider')
  return v
}
