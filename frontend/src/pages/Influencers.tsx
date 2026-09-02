import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCompany } from '@/context/CompanyContext'
import { deleteInfluencer, listInfluencers, type InfluencerRow } from '@/services/influencers'
import AddInfluencerDialog from '@/components/influencer/AddInfluencerDialog'
import EditInfluencerDialog from '@/components/influencer/EditInfluencerDialog'

export default function InfluencersPage() {
  const { selectedId } = useCompany()
  const [items, setItems] = useState<InfluencerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<InfluencerRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InfluencerRow | null>(null)

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
    setError(null)
    try { await deleteInfluencer(id); setItems((prev) => prev.filter((x) => x.id !== id)) } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed — try again') }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await handleDelete(deleteTarget.id)
    setDeleteTarget(null)
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

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {items.map((inf) => (
            <button key={inf.id} type="button" onClick={() => setEditTarget(inf)} className="overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              <img src={inf.imageUrl} alt={inf.name} className="aspect-video w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{inf.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{inf.source}</div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(inf) }}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </button>
          ))}
        </div>
      )}

      <AddInfluencerDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={handleCreated} />
      <EditInfluencerDialog open={editTarget !== null} onOpenChange={(v) => { if (!v) setEditTarget(null) }} target={editTarget} onSaved={(row) => setItems((prev) => prev.map((x) => x.id === row.id ? row : x))} />

      <Dialog open={deleteTarget !== null} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete influencer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
