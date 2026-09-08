export type InfluencerRow = {
  id: string
  userId: string
  companyId: string
  name: string
  imageUrl: string
  prompt: string | null
  attributes: Record<string, unknown> | null
  source: string
  createdAt: string
  updatedAt: string
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText
    try {
      const b = JSON.parse(await res.text())
      if (b?.error) msg = b.error
      else if (typeof b === 'string') msg = b
    } catch {}
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export function listInfluencers(companyId: string): Promise<InfluencerRow[]> {
  return fetch(`/companies/${companyId}/influencers`, { credentials: 'include' }).then(handle<InfluencerRow[]>)
}

export function previewInfluencer(
  companyId: string,
  body: { attributes: Record<string, string>; prompt?: string },
): Promise<{ previewUrl: string; prompt: string }> {
  return fetch(`/companies/${companyId}/influencers/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<{ previewUrl: string; prompt: string }>)
}

export function createInfluencer(
  companyId: string,
  body: { name: string; imageUrl?: string; imageData?: string; attributes?: Record<string, string>; prompt?: string; source?: string },
): Promise<InfluencerRow> {
  return fetch(`/companies/${companyId}/influencers`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<InfluencerRow>)
}

export function editPreviewInfluencer(id: string, body: { prompt: string }): Promise<{ previewUrl: string; prompt: string }> {
  return fetch(`/influencers/${id}/edit-preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<{ previewUrl: string; prompt: string }>)
}

export function updateInfluencer(id: string, body: { name?: string; imageUrl?: string; prompt?: string }): Promise<InfluencerRow> {
  return fetch(`/influencers/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<InfluencerRow>)
}

export function deleteInfluencer(id: string): Promise<{ success: boolean }> {
  return fetch(`/influencers/${id}`, { method: 'DELETE', credentials: 'include' }).then(handle<{ success: boolean }>)
}
