import { useState } from 'react'
import { updateBrandSection, type BrandIntelligenceDoc } from '@/services/brand'
import { DisplayField, DisplayGrid, DisplayList, EditorDialog, SectionCard, toList, toStr, type FieldConfig } from './shared'

type PatchableSection = 'brand' | 'identityAndProduct' | 'purposeAndPositioning' | 'toneAndVoice' | 'marketAndCompetition' | 'audience'

/**
 * Generic, config-driven section for the text/list-only parts of the Brand Brain.
 * Displays every configured field and edits them in one dialog; saving PATCHes the
 * section and bubbles the full updated document up via onSaved.
 */
export default function SimpleSection({
  companyId,
  doc,
  section,
  title,
  description,
  icon,
  fields,
  onSaved,
  children,
}: {
  companyId: string
  doc: BrandIntelligenceDoc
  section: PatchableSection
  title: string
  description?: string
  icon?: React.ElementType
  fields: FieldConfig[]
  onSaved: (doc: BrandIntelligenceDoc) => void
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const value = (doc as any)[section] as Record<string, any>

  const initial: Record<string, any> = {}
  for (const f of fields) {
    initial[f.key] = f.type === 'list' ? toList(value?.[f.key]) : f.type === 'number' ? (value?.[f.key] ?? null) : toStr(value?.[f.key])
  }

  const isEmpty =
    fields.length > 0 &&
    fields.every((f) => (f.type === 'list' ? toList(value?.[f.key]).length === 0 : !toStr(value?.[f.key]).trim()))

  async function handleSave(vals: Record<string, any>) {
    setBusy(true)
    const body: Record<string, any> = {}
    for (const f of fields) {
      if (f.type === 'list') body[f.key] = toList(vals[f.key])
      else if (f.type === 'number') body[f.key] = vals[f.key] ?? null
      else {
        const t = toStr(vals[f.key]).trim()
        body[f.key] = t ? t : null
      }
    }
    try {
      onSaved(await updateBrandSection(companyId, section, body))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionCard icon={icon} title={title} description={description} onEdit={fields.length ? () => setOpen(true) : undefined} busy={busy}>
        {fields.length > 0 && (
          <DisplayGrid empty={isEmpty}>
            {fields.map((f) =>
              f.type === 'list' ? (
                <DisplayList key={f.key} label={f.label} items={toList(value?.[f.key])} />
              ) : (
                <DisplayField key={f.key} label={f.label} value={toStr(value?.[f.key])} />
              ),
            )}
          </DisplayGrid>
        )}
        {children}
      </SectionCard>
      {fields.length > 0 && (
        <EditorDialog
          open={open}
          title={`Edit ${title}`}
          description={description}
          fields={fields}
          initial={initial}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}
    </>
  )
}
