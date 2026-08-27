export type Company = {
  id: string
  userId: string
  name: string
  website: string | null
  persona: string | null
  createdAt: string
  updatedAt: string
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || res.statusText)
  }
  return res.json() as Promise<T>
}

export function listCompanies(): Promise<Company[]> {
  return fetch('/companies', { credentials: 'include' }).then(handle<Company[]>)
}

export function createCompany(body: { name: string; website: string; persona?: string | null }): Promise<Company> {
  // ponytail: POST /companies is SSE — parse event: done
  return fetch('/companies', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) throw new Error(await res.text() || res.statusText)
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/event-stream')) return res.json() as Promise<Company>
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let doneCompany: Company | null = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
        let event = 'message', data = ''
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (event === 'done' && data) { try { doneCompany = JSON.parse(data) } catch {} }
        if (event === 'error' && data) { try { const e = JSON.parse(data); throw new Error(e.message || 'persona generation failed') } catch (err) { throw err } }
      }
    }
    if (!doneCompany) throw new Error('No done event from SSE')
    return doneCompany
  })
}

export function createCompanySSE(
  body: { name: string; website: string },
  opts: { onProgress?: (e: any) => void; onDone?: (c: Company) => void; onError?: (e: Error) => void },
): Promise<Company> {
  return fetch('/companies', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    if (!res.ok) throw new Error(await res.text() || res.statusText)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''; let company: Company | null = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
        let event = 'message', data = ''
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (!data) continue
        let parsed: any; try { parsed = JSON.parse(data) } catch { parsed = data }
        if (event === 'progress') opts.onProgress?.(parsed)
        else if (event === 'done') { company = parsed as Company; opts.onDone?.(company) }
        else if (event === 'error') { const err = new Error(parsed.message || 'failed'); opts.onError?.(err); throw err }
      }
    }
    if (!company) throw new Error('No done event')
    return company
  })
}

export function updateCompany(id: string, body: Partial<{ name: string; website: string; persona: string | null }>): Promise<Company> {
  return fetch(`/companies/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<Company>)
}

export function deleteCompany(id: string): Promise<{ success: boolean }> {
  return fetch(`/companies/${id}`, { method: 'DELETE', credentials: 'include' }).then(handle<{ success: boolean }>)
}
