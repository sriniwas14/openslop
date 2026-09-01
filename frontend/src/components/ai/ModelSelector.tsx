import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listModels, type AiProvider, type ModelTask } from '@/services/ai'

type Props = {
  provider: AiProvider
  task: ModelTask
  configId?: string
  apiKey?: string
  baseUrl?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

export default function ModelSelector({ provider, task, configId, apiKey, baseUrl, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [models, setModels] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    listModels({ provider, task, configId, apiKey, baseUrl, q: q || undefined })
      .then((data) => {
        if (!cancelled) setModels(data)
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [provider, task, configId, apiKey, baseUrl, q, open])

  // ponytail: show value even if not in list (custom)
  const display = value || 'Select model'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" disabled={disabled} className="w-full min-w-0 justify-between font-normal">
          <span className="min-w-0 truncate text-left">{display}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 size-4 shrink-0 opacity-50" />
          <input
            placeholder="Search models..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : models.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {q ? 'No models found' : 'No models — add API key or type custom'}
            </div>
          ) : (
            models.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">{m.name}</span>
                {value === m.id && <Check className="size-4 shrink-0" />}
              </button>
            ))
          )}
          {/* allow custom */}
          {q && !models.find((m) => m.id === q) && (
            <button
              onClick={() => {
                onChange(q)
                setOpen(false)
              }}
              className="mt-1 flex w-full items-center justify-between rounded-md bg-muted px-2 py-2 text-left text-sm"
            >
              <span>Use &quot;{q}&quot;</span>
              <span className="text-xs text-muted-foreground">custom</span>
            </button>
          )}
        </div>
        <div className="border-t p-2">
          <div className="flex gap-2">
            <Input
              placeholder="Or enter custom model"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
