import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import {
  addSegment,
  deleteSegment,
  updateBrandSection,
  updateSegment,
  type BrandIntelligenceDoc,
  type CustomerSegment,
} from '@/services/brand'
import { Button } from '@/components/ui/button'
import { DisplayField, EditorDialog, EmptyNote, ItemRow, Pill, SectionCard, toList, toStr, type FieldConfig } from './shared'

const SEGMENT_FIELDS: FieldConfig[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 255, placeholder: 'e.g. Busy founders' },
  { key: 'description', label: 'Description', type: 'textarea', rows: 2, maxLength: 2000 },
  { key: 'percentage', label: 'Share of audience (%)', type: 'number', min: 0, max: 100, step: 1 },
  { key: 'problems', label: 'Problems / pain points', type: 'list', maxLength: 500 },
  { key: 'desires', label: 'Desires / outcomes', type: 'list', maxLength: 500 },
  { key: 'objections', label: 'Objections', type: 'list', maxLength: 500 },
  { key: 'buyingReasons', label: 'Buying reasons', type: 'list', maxLength: 500 },
]

const EMPTY_SEGMENT: Record<string, any> = {
  name: '',
  description: '',
  percentage: null,
  problems: [],
  desires: [],
  objections: [],
  buyingReasons: [],
}

function toDraft(s: CustomerSegment): Record<string, any> {
  return {
    name: s.name,
    description: toStr(s.description),
    percentage: s.percentage ?? null,
    problems: toList(s.problems),
    desires: toList(s.desires),
    objections: toList(s.objections),
    buyingReasons: toList(s.buyingReasons),
  }
}

export default function AudienceSection({
  companyId,
  doc,
  onSaved,
  onError,
}: {
  companyId: string
  doc: BrandIntelligenceDoc
  onSaved: (d: BrandIntelligenceDoc) => void
  onError: (msg: string) => void
}) {
  const audience = doc.audience
  const segments = audience.customerSegments ?? []
  const [primaryOpen, setPrimaryOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerSegment | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function savePrimary(vals: Record<string, any>) {
    // ponytail: PATCH the whole audience so segments are not wiped by normalization
    const updated = await updateBrandSection(companyId, 'audience', {
      primaryAudience: toStr(vals.primaryAudience).trim() || null,
      customerSegments: segments,
    })
    onSaved(updated)
  }

  async function saveSegment(vals: Record<string, any>) {
    const body = {
      name: toStr(vals.name).trim(),
      description: toStr(vals.description).trim() || null,
      percentage: vals.percentage == null || vals.percentage === '' ? null : Number(vals.percentage),
      problems: toList(vals.problems),
      desires: toList(vals.desires),
      objections: toList(vals.objections),
      buyingReasons: toList(vals.buyingReasons),
    }
    const updated =
      editing && editing !== 'new' ? await updateSegment(companyId, editing.id, body) : await addSegment(companyId, body)
    onSaved(updated)
  }

  async function handleDelete(s: CustomerSegment) {
    if (!window.confirm(`Delete the segment "${s.name}"?`)) return
    setDeletingId(s.id)
    try {
      onSaved(await deleteSegment(companyId, s.id))
    } catch (e: any) {
      onError(e?.message ?? 'Could not delete the segment')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <SectionCard
        icon={Users}
        title="Audience"
        description="Who the brand serves, broken into actionable customer segments."
        onEdit={() => setPrimaryOpen(true)}
      >
        <div className="grid gap-4">
          <DisplayField label="Primary audience" value={audience.primaryAudience} />

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium text-foreground">Customer segments</h4>
              <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
                <Plus className="size-3.5" /> Add segment
              </Button>
            </div>
            {segments.length === 0 ? (
              <EmptyNote text="No segments yet — click Add segment." />
            ) : (
              <div className="grid gap-2">
                {segments.map((s) => (
                  <ItemRow
                    key={s.id}
                    title={s.name}
                    subtitle={toStr(s.description) || toList(s.problems).slice(0, 2).join(' · ')}
                    deleting={deletingId === s.id}
                    onClick={() => setEditing(s)}
                    onDelete={() => handleDelete(s)}
                    badges={s.percentage != null ? <Pill tone="priority">{s.percentage}%</Pill> : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <EditorDialog
        open={primaryOpen}
        title="Edit primary audience"
        fields={[{ key: 'primaryAudience', label: 'Primary audience', type: 'textarea', rows: 4, maxLength: 4000 }]}
        initial={{ primaryAudience: toStr(audience.primaryAudience) }}
        onClose={() => setPrimaryOpen(false)}
        onSave={savePrimary}
      />

      <EditorDialog
        open={editing !== null}
        title={editing === 'new' ? 'Add customer segment' : 'Edit customer segment'}
        description="Segments sharpen targeting for UGC. Share of audience is 0–100%."
        fields={SEGMENT_FIELDS}
        initial={editing === 'new' || editing === null ? EMPTY_SEGMENT : toDraft(editing)}
        onClose={() => setEditing(null)}
        onSave={saveSegment}
        submitLabel={editing === 'new' ? 'Add segment' : 'Save'}
      />
    </>
  )
}
