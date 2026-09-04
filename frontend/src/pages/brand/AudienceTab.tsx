import AudienceSection from '@/components/brand/AudienceSection'
import { useBrandTab } from './BrandTabContext'

export default function AudienceTab() {
  const { companyId, doc, onSaved, onError } = useBrandTab()
  return <AudienceSection companyId={companyId} doc={doc} onSaved={onSaved} onError={onError} />
}
