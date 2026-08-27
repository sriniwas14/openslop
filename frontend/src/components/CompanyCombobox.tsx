import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { useCompany } from '@/context/CompanyContext'
import { createCompany } from '@/services/companies'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export default function CompanyCombobox() {
  const { companies, selectedId, setSelectedId, loading, refresh } = useCompany()
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = companies.find((c) => c.id === selectedId)

  function resetForm() {
    setName('')
    setWebsite('')
    setError(null)
  }

  function handleDialogChange(v: boolean) {
    setDialogOpen(v)
    if (!v) resetForm()
    if (v) setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedWebsite = website.trim()
    if (!trimmedName || !trimmedWebsite) {
      setError('Website is required')
      return
    }
    try { new URL(trimmedWebsite) } catch { setError('Invalid URL'); return }
    setSubmitting(true)
    setError(null)
    try {
      const c = await createCompany({
        name: trimmedName,
        website: trimmedWebsite,
      })
      await refresh()
      setSelectedId(c.id)
      setDialogOpen(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between">
            <span className="truncate">{selected ? selected.name : loading ? 'Loading…' : 'Select company'}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          <div className="max-h-60 overflow-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
            ) : companies.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No companies</div>
            ) : (
              companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id)
                    setOpen(false)
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{c.name}</span>
                  {c.id === selectedId && <Check className="size-4 shrink-0" />}
                </button>
              ))
            )}
          </div>
          <div className="mt-1 border-t pt-1">
            <button
              onClick={() => {
                setOpen(false)
                setDialogOpen(true)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
            >
              <Plus className="size-4" />
              Add New
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new company</DialogTitle>
          </DialogHeader>

          <div className="grid place-items-center gap-2 rounded-xl border border-dashed bg-muted/50 p-6 text-muted-foreground">
            <Building2 className="size-10 opacity-40" />
            <p className="text-xs">Add your first company</p>
          </div>

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="company-name">Name</Label>
              <Input
                id="company-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                maxLength={255}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-website">Website *</Label>
              <Input
                id="company-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting || !name.trim() || !website.trim()}>
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
