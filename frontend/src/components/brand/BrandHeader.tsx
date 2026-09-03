import { Globe, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import type { BrandIntelligenceDoc } from '@/services/brand'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Not analyzed', className: 'bg-muted text-muted-foreground' },
  analyzing: { label: 'Analyzing…', className: 'bg-accent text-accent-foreground' },
  ready: { label: 'Ready', className: 'bg-success/15 text-success' },
  failed: { label: 'Failed', className: 'bg-destructive/15 text-destructive' },
}

function formatDate(v?: string | null) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString()
}

export default function BrandHeader({
  doc,
  companyName,
  companyWebsite,
  analyzing,
  onAnalyze,
}: {
  doc: BrandIntelligenceDoc
  companyName: string
  companyWebsite?: string | null
  analyzing: boolean
  onAnalyze: () => void
}) {
  const name = doc.brand.name ?? companyName
  const website = doc.brand.website ?? companyWebsite ?? null
  const status = STATUS[doc.status] ?? STATUS.pending
  const hasBeenAnalyzed = doc.status === 'ready' || (doc.metadata?.lastAnalyzedAt ?? null) !== null
  const lastAnalyzed = formatDate(doc.metadata?.lastAnalyzedAt)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{name}</h2>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', status.className)}>{status.label}</span>
            {doc.metadata?.version != null && (
              <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">v{doc.metadata.version}</span>
            )}
          </div>
          {doc.brand.tagline && <p className="mt-1 text-sm text-muted-foreground">{doc.brand.tagline}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {website && (
              <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">
                <Globe className="size-3.5" />
                {website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {lastAnalyzed && <span>Last analyzed {lastAnalyzed}</span>}
          </div>
          {doc.status === 'failed' && doc.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {doc.error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <Button onClick={onAnalyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="size-4 animate-spin" /> : hasBeenAnalyzed ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
            {analyzing ? 'Analyzing…' : hasBeenAnalyzed ? 'Re-analyze' : 'Analyze website'}
          </Button>
          {analyzing && (
            <p className="text-xs text-muted-foreground sm:text-right">Running in the background — you can navigate away.</p>
          )}
          {!analyzing && hasBeenAnalyzed && (
            <p className="text-xs text-muted-foreground sm:text-right">Re-analyzing keeps your edits.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
