export type Idea = {
  id: string
  title: string
  painPoint: string
  hooks: string[]
  angle?: string
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText
    try {
      const b = JSON.parse(await res.text())
      if (b?.error) msg = b.error
      else if (typeof b === 'string') msg = b
    } catch {
      // use statusText
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export function fetchIdeas(
  companyId: string,
  body: { kind?: string; count?: number },
): Promise<{ ideas: Idea[] }> {
  return fetch(`/companies/${companyId}/ideas`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<{ ideas: Idea[] }>)
}

export type ContentRow = {
  id: string
  userId: string
  companyId: string
  kind: 'carousel' | 'talkinghead' | 'greenscreen'
  title: string
  status: string
  images: { url: string; text: string; font?: string; background?: string; color?: string }[] | null
  scripts: { type: 'aroll' | 'broll'; prompt: string }[] | null
  mediaUrl: string | null
  format: 'vertical' | 'horizontal' | null
  duration: number | null
  influencerId: string | null
  scheduledAt: string | null
  createdAt: string
  updatedAt: string
}

export function listContent(companyId: string): Promise<ContentRow[]> {
  return fetch(`/companies/${companyId}/contents`, { credentials: 'include' }).then(handle<ContentRow[]>)
}

export function getContent(contentId: string): Promise<ContentRow> {
  return fetch(`/contents/${contentId}`, { credentials: 'include' }).then(handle<ContentRow>)
}

export function renderVideo(contentId: string): Promise<ContentRow> {
  return fetch(`/contents/${contentId}/render`, { method: 'POST', credentials: 'include' }).then(handle<ContentRow>)
}

export type ContentTemplate = {
  id: string
  title: string
  prompt: string
  previewImage: string
  duration: "15" | "30" | "45"
  structure: string | null
  createdAt: string
  updatedAt: string
}

export function listContentTemplates(): Promise<ContentTemplate[]> {
  return fetch('/content-templates').then(handle<ContentTemplate[]>)
}

export function generateFromIdea(
  companyId: string,
  body: { idea: Idea; selectedHook: string; kind?: string; title?: string; duration?: 15 | 30 | 45; influencerId?: string; visualStyle?: string },
): Promise<unknown> {
  return fetch(`/companies/${companyId}/contents/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<unknown>)
}
