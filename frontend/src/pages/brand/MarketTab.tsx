import MarketSection from '@/components/brand/MarketSection'
import { useBrandTab } from './BrandTabContext'

export default function MarketTab() {
  const { companyId, doc, onSaved, onError } = useBrandTab()
  return <MarketSection companyId={companyId} doc={doc} onSaved={onSaved} onError={onError} />
}
