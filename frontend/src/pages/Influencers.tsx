import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/context/CompanyContext'
import { deleteInfluencer, listInfluencers, type InfluencerRow } from '@/services/influencers'
import AddInfluencerDialog from '@/components/influencer/AddInfluencerDialog'

export default function InfluencersPage() {
  const { selectedId } = useCompany()
  const [items, setItems] = useState<InfluencerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = async () => {
    if (!selectedId) { setItems([]); return }
    setLoading(true)
    try {
      const rows = await listInfluencers(selectedId)
      setItems(rows)
    } catch { setItems([]) } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [selectedId])

  const handleCreated = (row: InfluencerRow) => setItems((prev) => [row, ...prev])

  const handleDelete = async (id: string) => {
    try { await deleteInfluencer(id); setItems((prev) => prev.filter((x) => x.id !== id)) } catch {}
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Influencers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your AI & real influencers — reuse across videos.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus data-icon="inline-start" />
          Add New
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-20 text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed bg-card/50 px-6 py-20 text-center">
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">No influencers yet</p>
            <p className="text-sm text-muted-foreground">Upload a photo or generate a new AI influencer.</p>
            <Button className="mt-3 justify-self-center" onClick={() => setDialogOpen(true)}>
              <Plus data-icon="inline-start" /> Add New
            </Button>
          </div>
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {items.map((inf) => (
            <div key={inf.id} className="mb-4 break-inside-avoid overflow-hidden rounded-xl border bg-card">
              <img src={inf.imageUrl} alt={inf.name} className="w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{inf.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{inf.source}</div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => handleDelete(inf.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddInfluencerDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />
    </div>
  )
}
