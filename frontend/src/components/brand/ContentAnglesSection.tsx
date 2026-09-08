import { useState } from 'react'
import { Lightbulb, Plus } from 'lucide-react'
import { addContentAngle, deleteContentAngle, updateContentAngle, type BrandIntelligenceDoc, type ContentAngle } from '@/services/brand'
import { Button } from '@/components/ui/button'
import { EditorDialog, EmptyNote, ItemRow, Pill, SectionCard, toList, toStr, type FieldConfig } from './shared'

const ANGLE_FIELDS: FieldConfig[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 255, placeholder: 'e.g. Founder story' },
  { key: 'description', label: 'Description', type: 'textarea', required: true, rows: 2, maxLength: 2000 },
  { key: 'targetAudience', label: 'Target audience', type: 'text', maxLength: 1000 },
  { key: 'problem', label: 'Problem it addresses', type: 'textarea', rows: 2, maxLength: 2000 },
  { key: 'coreMessage', label: 'Core message', type: 'textarea', rows: 2, maxLength: 2000 },
  { key: 'emotionalTrigger', label: 'Emotional trigger', type: 'text', maxLength: 1000 },
  { key: 'hookIdeas', label: 'Hook ideas', type: 'list', maxLength: 500 },
  { key: 'contentTypes', label: 'Content types', type: 'list', maxLength: 100 },
  { key: 'platforms', label: 'Platforms', type: 'list', maxLength: 100 },
  { key: 'ctaIdeas', label: 'CTA ideas', type: 'list', maxLength: 300 },
  { key: 'priority', label: 'Priority', type: 'number', min: 1, max: 10, step: 1, hint: '1 (low) – 10 (high)' },
  { key: 'isActive', label: 'Status', type: 'boolean' },
]

const EMPTY_ANGLE: Record<string, any> = {
  name: '',
  description: '',
  targetAudience: '',
  problem: '',
  coreMessage: '',
  emotionalTrigger: '',
  hookIdeas: [],
  contentTypes: [],
  platforms: [],
  ctaIdeas: [],
  priority: 5,
  isActive: true,
}

function toDraft(a: ContentAngle): Record<string, any> {
  return {
    name: a.name,
    description: a.description,
    targetAudience: toStr(a.targetAudience),
    problem: toStr(a.problem),
    coreMessage: toStr(a.coreMessage),
    emotionalTrigger: toStr(a.emotionalTrigger),
    hookIdeas: toList(a.hookIdeas),
    contentTypes: toList(a.contentTypes),
    platforms: toList(a.platforms),
    ctaIdeas: toList(a.ctaIdeas),
    priority: a.priority ?? 5,
    isActive: a.isActive !== false,
  }
}

export default function ContentAnglesSection({
  companyId,
  doc,
  onSaved,
  onError,
}: {
  companyId: string
  doc: BrandIntelligenceDoc
  onSaved: (doc: BrandIntelligenceDoc) => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState<ContentAngle | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const angles = doc.contentAngles ?? []
  const open = editing !== null
  const initial = editing === 'new' || editing === null ? EMPTY_ANGLE : toDraft(editing)

  async function handleSave(vals: Record<string, any>) {
    const body = {
      name: toStr(vals.name).trim(),
      description: toStr(vals.description).trim(),
      targetAudience: toStr(vals.targetAudience).trim() || null,
      problem: toStr(vals.problem).trim() || null,
      coreMessage: toStr(vals.coreMessage).trim() || null,
      emotionalTrigger: toStr(vals.emotionalTrigger).trim() || null,
      hookIdeas: toList(vals.hookIdeas),
      contentTypes: toList(vals.contentTypes),
      platforms: toList(vals.platforms),
      ctaIdeas: toList(vals.ctaIdeas),
      priority: vals.priority == null || vals.priority === '' ? null : Number(vals.priority),
      isActive: !!vals.isActive,
    }
    const updated =
      editing && editing !== 'new'
        ? await updateContentAngle(companyId, editing.id, body)
        : await addContentAngle(companyId, body)
    onSaved(updated)
  }

  async function handleDelete(a: ContentAngle) {
    if (!window.confirm(`Delete the content angle "${a.name}"?`)) return
    setDeletingId(a.id)
    try {
      onSaved(await deleteContentAngle(companyId, a.id))
    } catch (e: any) {
      onError(e?.message ?? 'Could not delete the content angle')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <SectionCard
        icon={Lightbulb}
        title="Content angles"
        description="Reusable narrative angles UGC is generated from. Only active angles feed generation."
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" /> Add
          </Button>
        }
      >
        {angles.length === 0 ? (
          <EmptyNote text="No content angles yet — click Add to create one, or analyze the brand." />
        ) : (
          <div className="grid gap-2">
            {angles.map((a) => (
              <ItemRow
                key={a.id}
                title={a.name}
                subtitle={a.description}
                deleting={deletingId === a.id}
                onClick={() => setEditing(a)}
                onDelete={() => handleDelete(a)}
                badges={
                  <>
                    <Pill tone={a.isActive !== false ? 'active' : 'muted'}>{a.isActive !== false ? 'Active' : 'Inactive'}</Pill>
                    {a.priority != null && <Pill tone="priority">P{a.priority}</Pill>}
                    {toList(a.platforms).slice(0, 3).map((p) => (
                      <Pill key={p} tone="neutral">
                        {p}
                      </Pill>
                    ))}
                  </>
                }
              />
            ))}
          </div>
        )}
      </SectionCard>
      <EditorDialog
        open={open}
        title={editing === 'new' ? 'Add content angle' : 'Edit content angle'}
        description="Angles drive on-brand UGC. Priority 1–10; inactive angles are ignored during generation."
        fields={ANGLE_FIELDS}
        initial={initial}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        submitLabel={editing === 'new' ? 'Add angle' : 'Save'}
      />
    </>
  )
}
