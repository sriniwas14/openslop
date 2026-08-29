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

export function generateFromIdea(
  companyId: string,
  body: { idea: Idea; selectedHook: string; kind?: string; title?: string },
): Promise<unknown> {
  return fetch(`/companies/${companyId}/contents/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<unknown>)
}
