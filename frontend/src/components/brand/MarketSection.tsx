import { useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { updateBrandSection, type BrandIntelligenceDoc, type Competitor } from '@/services/brand'
import { Button } from '@/components/ui/button'
import { DisplayField, DisplayList, EditorDialog, EmptyNote, ItemRow, SectionCard, toList, toStr, type FieldConfig } from './shared'

const MARKET_FIELDS: FieldConfig[] = [
  { key: 'market', label: 'Market overview', type: 'textarea', rows: 3, maxLength: 4000 },
  { key: 'marketTrends', label: 'Market trends', type: 'list', maxLength: 500 },
]

const COMPETITOR_FIELDS: FieldConfig[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 255 },
  { key: 'positioning', label: 'Positioning', type: 'textarea', rows: 2, maxLength: 2000 },
  { key: 'strengths', label: 'Strengths', type: 'list', maxLength: 500 },
  { key: 'weaknesses', label: 'Weaknesses', type: 'list', maxLength: 500 },
]

const EMPTY_COMPETITOR: Record<string, any> = { name: '', positioning: '', strengths: [], weaknesses: [] }

function toDraft(c: Competitor): Record<string, any> {
  return { name: c.name, positioning: toStr(c.positioning), strengths: toList(c.strengths), weaknesses: toList(c.weaknesses) }
}

export default function MarketSection({
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
  const market = doc.marketAndCompetition
  const competitors = market.competitors ?? []
  const [marketOpen, setMarketOpen] = useState(false)
  const [editing, setEditing] = useState<Competitor | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // ponytail: no dedicated competitor endpoint — the whole market section is PATCHed,
  // so always send market + marketTrends alongside the next competitors array.
  async function patchMarket(next: { market?: string | null; marketTrends?: string[]; competitors: any[] }) {
    const updated = await updateBrandSection(companyId, 'marketAndCompetition', {
      market: next.market !== undefined ? next.market : (market.market ?? null),
      marketTrends: next.marketTrends !== undefined ? next.marketTrends : toList(market.marketTrends),
      competitors: next.competitors,
    })
    onSaved(updated)
  }

  async function saveMarketFields(vals: Record<string, any>) {
    await patchMarket({
      market: toStr(vals.market).trim() || null,
      marketTrends: toList(vals.marketTrends),
      competitors,
    })
  }

  async function saveCompetitor(vals: Record<string, any>) {
    const entry = {
      name: toStr(vals.name).trim(),
      positioning: toStr(vals.positioning).trim() || null,
      strengths: toList(vals.strengths),
      weaknesses: toList(vals.weaknesses),
    }
    const next =
      editing && editing !== 'new'
        ? competitors.map((c) => (c.id === editing.id ? { ...c, ...entry } : c))
        : [...competitors, entry]
    await patchMarket({ competitors: next })
  }

  async function handleDelete(c: Competitor) {
    if (!window.confirm(`Delete the competitor "${c.name}"?`)) return
    setBusy(c.id)
    try {
      await patchMarket({ competitors: competitors.filter((x) => x.id !== c.id) })
    } catch (e: any) {
      onError(e?.message ?? 'Could not delete the competitor')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <SectionCard
        icon={Building2}
        title="Market & competition"
        description="Market context and the competitors the brand is measured against."
        onEdit={() => setMarketOpen(true)}
      >
        <div className="grid gap-4">
          <DisplayField label="Market overview" value={market.market} />
          <DisplayList label="Market trends" items={market.marketTrends} />

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium text-foreground">Competitors</h4>
              <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
                <Plus className="size-3.5" /> Add competitor
              </Button>
            </div>
            {competitors.length === 0 ? (
              <EmptyNote text="No competitors yet — click Add competitor." />
            ) : (
              <div className="grid gap-2">
                {competitors.map((c) => (
                  <ItemRow
                    key={c.id}
                    title={c.name}
                    subtitle={toStr(c.positioning) || toList(c.strengths).slice(0, 2).join(' · ')}
                    deleting={busy === c.id}
                    onClick={() => setEditing(c)}
                    onDelete={() => handleDelete(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <EditorDialog
        open={marketOpen}
        title="Edit market & trends"
        fields={MARKET_FIELDS}
        initial={{ market: toStr(market.market), marketTrends: toList(market.marketTrends) }}
        onClose={() => setMarketOpen(false)}
        onSave={saveMarketFields}
      />

      <EditorDialog
        open={editing !== null}
        title={editing === 'new' ? 'Add competitor' : 'Edit competitor'}
        fields={COMPETITOR_FIELDS}
        initial={editing === 'new' || editing === null ? EMPTY_COMPETITOR : toDraft(editing)}
        onClose={() => setEditing(null)}
        onSave={saveCompetitor}
        submitLabel={editing === 'new' ? 'Add competitor' : 'Save'}
      />
    </>
  )
}
