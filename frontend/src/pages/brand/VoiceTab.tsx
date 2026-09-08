import { Mic } from 'lucide-react'
import type { FieldConfig } from '@/components/brand/shared'
import SimpleSection from '@/components/brand/SimpleSection'
import ContentAnglesSection from '@/components/brand/ContentAnglesSection'
import { useBrandTab } from './BrandTabContext'

const TONE_FIELDS: FieldConfig[] = [
  { key: 'tone', label: 'Tone', type: 'list' },
  { key: 'personality', label: 'Personality', type: 'list' },
  { key: 'dos', label: 'Do', type: 'list' },
  { key: 'donts', label: "Don't", type: 'list' },
  { key: 'wordsToUse', label: 'Words to use', type: 'list' },
  { key: 'wordsToAvoid', label: 'Words to avoid', type: 'list' },
  { key: 'writingStyle', label: 'Writing style', type: 'textarea', rows: 3, maxLength: 4000 },
]

export default function VoiceTab() {
  const { companyId, doc, onSaved, onError } = useBrandTab()
  return (
    <div className="grid gap-4">
      <SimpleSection
        companyId={companyId}
        doc={doc}
        section="toneAndVoice"
        title="Tone & voice"
        description="How the brand sounds — personality, do/don't and word choices."
        icon={Mic}
        fields={TONE_FIELDS}
        onSaved={onSaved}
      />
      <ContentAnglesSection companyId={companyId} doc={doc} onSaved={onSaved} onError={onError} />
    </div>
  )
}
