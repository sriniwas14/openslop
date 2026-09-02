import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Plug, Trash2, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteApifyKey, getApifyKey, saveApifyKey, testApifyKey, type ApifyKeyInfo } from '@/services/apify'

export default function ApifySettings() {
  const [info, setInfo] = useState<ApifyKeyInfo | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function refresh() {
    try {
      setError(null)
      setInfo(await getApifyKey())
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => { refresh() }, [])

  async function doSave(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const updated = await saveApifyKey(apiKey.trim())
      setInfo(updated)
      setApiKey('')
      setSuccess('Apify API key saved.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function doTest() {
    setTesting(true); setError(null); setSuccess(null)
    try {
      const result = await testApifyKey(apiKey.trim() || undefined)
      if (result.status === 'connected') setSuccess('Connection successful.')
      else setError('Invalid key')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTesting(false)
    }
  }

  async function doDelete() {
    if (!confirm('Remove your Apify API key?')) return
    try {
      await deleteApifyKey()
      setInfo({ provider: 'apify', apiKeyMasked: null, hasKey: false, status: 'not_connected', createdAt: null, updatedAt: null })
      setSuccess('Apify key removed.')
    } catch (e: any) {
      setError(e.message)
    }
  }

  const status = info?.status ?? 'not_connected'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apify</CardTitle>
        <CardDescription>Connect your Apify account to scrape Instagram creator posts.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form onSubmit={doSave} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="apify-key">Apify API Key</Label>
            <Input
              id="apify-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={info?.hasKey ? '•••••••••• (saved — enter a new value to replace)' : 'apify_api_...'}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Get your API token from your{' '}
              <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                Apify account settings
              </a>
              . The key is stored server-side and never shown after saving.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : 'Save API Key'}
            </Button>
            <Button type="button" variant="outline" onClick={doTest} disabled={testing || (!apiKey.trim() && !info?.hasKey)}>
              {testing ? <><Loader2 className="size-4 animate-spin" /> Testing…</> : 'Test Connection'}
            </Button>
            {info?.hasKey && (
              <Button type="button" variant="ghost" onClick={doDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="size-4" /> Remove
              </Button>
            )}
          </div>
        </form>

        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Status:</span>
          {status === 'connected' ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 className="size-4" /> Connected</span>
          ) : status === 'invalid' ? (
            <span className="inline-flex items-center gap-1 font-medium text-destructive"><XCircle className="size-4" /> Invalid key</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Plug className="size-4" /> Not connected</span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}
      </CardContent>
    </Card>
  )
}
