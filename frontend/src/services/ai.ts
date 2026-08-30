export type AiProvider = "openai" | "anthropic" | "google" | "vertex" | "xai" | "openrouter" | "runway" | "fal" | "luma" | "ollama" | "custom"
export const AI_PROVIDERS: AiProvider[] = ["openai","anthropic","google","vertex","xai","openrouter","runway","fal","luma","ollama","custom"]
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  vertex: 'Google Vertex AI',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  runway: 'Runway',
  fal: 'fal.ai',
  luma: 'Luma',
  ollama: 'Ollama',
  custom: 'Custom OpenAI-compatible',
}

export type AiConfig = {
  id: string
  userId: string
  provider: string
  apiKeyMasked: string | null
  serviceAccountConfigured: boolean
  baseUrl: string | null
  projectId: string | null
  location: string | null
  model: string | null
  name: string | null
  isDefault: boolean
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

export function listAiConfigs(): Promise<AiConfig[]> {
  return fetch('/ai/configs', { credentials: 'include' }).then(handle<AiConfig[]>)
}

export function createAiConfig(body: { provider: AiProvider; apiKey?: string; serviceAccountJson?: string; baseUrl?: string; projectId?: string; location?: string; model?: string; name?: string; isDefault?: boolean }): Promise<AiConfig> {
  return fetch('/ai/configs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<AiConfig>)
}

export function updateAiConfig(id: string, body: Partial<{ provider: AiProvider; apiKey: string; serviceAccountJson: string; baseUrl: string; projectId: string; location: string; model: string; name: string; isDefault: boolean }>): Promise<AiConfig> {
  return fetch(`/ai/configs/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<AiConfig>)
}

export function deleteAiConfig(id: string): Promise<{ success: boolean }> {
  return fetch(`/ai/configs/${id}`, { method: 'DELETE', credentials: 'include' }).then(handle<{ success: boolean }>)
}

export function setDefaultAiConfig(id: string): Promise<AiConfig> {
  return fetch(`/ai/configs/${id}/default`, { method: 'POST', credentials: 'include' }).then(handle<AiConfig>)
}

export type AiPreferences = {
  videoConfigId: string | null
  videoModel: string | null
  imageConfigId: string | null
  imageModel: string | null
  textConfigId: string | null
  textModel: string | null
}

export function getAiPreferences(): Promise<AiPreferences> {
  return fetch('/ai/preferences', { credentials: 'include' }).then(handle<AiPreferences>)
}

export function updateAiPreferences(body: Partial<AiPreferences>): Promise<AiPreferences> {
  return fetch('/ai/preferences', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<AiPreferences>)
}

export type OnboardingProgress = { step: string; data: string | null; updatedAt: string }

export function getOnboardingProgress(): Promise<OnboardingProgress> {
  return fetch('/ai/onboarding/progress', { credentials: 'include' }).then(handle<OnboardingProgress>)
}

export function saveOnboardingProgress(body: { step: string | number; data?: Record<string, unknown> | null }): Promise<OnboardingProgress> {
  return fetch('/ai/onboarding/progress', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle<OnboardingProgress>)
}

export type ModelOption = { id: string; name: string }
export type ModelTask = 'video' | 'image' | 'text'

export type MediaJob = {
  id: string
  userId: string
  companyId: string
  contentId: string | null
  provider: string
  model: string
  task: 'image' | 'video'
  prompt: string
  inputUrl: string | null
  outputIndex: string | null
  providerTaskId: string | null
  status: 'queued' | 'processing' | 'completed' | 'failed'
  outputUrl: string | null
  error: string | null
  attempts: string
  createdAt: string
  updatedAt: string
}

export function listMediaJobs(contentId: string): Promise<MediaJob[]> {
  return fetch(`/contents/${contentId}/media-jobs`, { credentials: 'include' }).then(handle<MediaJob[]>)
}

export function listModels(params: { provider: AiProvider; task?: ModelTask; configId?: string; apiKey?: string; baseUrl?: string; q?: string }): Promise<ModelOption[]> {
  const sp = new URLSearchParams({ provider: params.provider })
  if (params.task) sp.set('task', params.task)
  if (params.configId) sp.set('configId', params.configId)
  if (params.apiKey) sp.set('apiKey', params.apiKey)
  if (params.baseUrl) sp.set('baseUrl', params.baseUrl)
  if (params.q) sp.set('q', params.q)
  return fetch(`/ai/models?${sp.toString()}`, { credentials: 'include' }).then(handle<ModelOption[]>)
}

export type GeneratedContent = {
  title: string
  summary: string
  platforms: string[]
  aiScore: number
}

export async function generateContent(body: { type: string; companyId: string }): Promise<GeneratedContent> {
  const res = await fetch('/ai/generate-content', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const parsed = JSON.parse(await res.text())
      if (parsed?.error) message = parsed.error
    } catch {}
    throw new Error(message)
  }
  return res.json() as Promise<GeneratedContent>
}
