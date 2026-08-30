import type { AiProvider } from "../../lib/mastra";

export type MediaTask = "image" | "video";
export type MediaStatus = "queued" | "processing" | "completed" | "failed";

export type MediaInput = {
  provider: AiProvider;
  model: string;
  apiKey?: string | null;
  serviceAccountJson?: string | null;
  projectId?: string | null;
  location?: string | null;
  task: MediaTask;
  prompt: string;
  inputUrl?: string | null;
  format?: "vertical" | "horizontal" | null;
};

export type MediaPollResult = {
  status: MediaStatus;
  providerTaskId?: string;
  outputUrl?: string;
  error?: string;
};

const RUNWAY_VERSION = "2024-11-06";

function jsonHeaders(headers: Record<string, string>) {
  return { "Content-Type": "application/json", Accept: "application/json", ...headers };
}

async function providerJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const body = await response.text();
  let parsed: any = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { parsed = null; }
  if (!response.ok) {
    const message = parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? body;
    throw new Error(`${response.status} ${response.statusText}${message ? `: ${String(message).slice(0, 500)}` : ""}`);
  }
  return parsed;
}

function ratio(format?: "vertical" | "horizontal" | null) {
  return format === "horizontal" ? "16:9" : "9:16";
}

function runwayHeaders(apiKey: string) {
  return jsonHeaders({ Authorization: `Bearer ${apiKey}`, "X-Runway-Version": RUNWAY_VERSION });
}

async function startRunway(input: MediaInput): Promise<MediaPollResult> {
  if (!input.apiKey) throw new Error("Runway API key is required");
  const endpoint = input.task === "image" ? "text_to_image" : "image_to_video";
  const body: Record<string, unknown> = {
    model: input.model,
    promptText: input.prompt,
    ratio: ratio(input.format),
  };
  if (input.task === "video") {
    body.duration = 5;
    if (input.inputUrl) body.promptImage = input.inputUrl;
  }
  const result = await providerJson(`https://api.dev.runwayml.com/v1/${endpoint}`, {
    method: "POST",
    headers: runwayHeaders(input.apiKey),
    body: JSON.stringify(body),
  });
  const id = result?.id ?? result?.task?.id;
  if (!id) throw new Error("Runway did not return a task id");
  return { status: "processing", providerTaskId: String(id) };
}

async function pollRunway(input: MediaInput, taskId: string): Promise<MediaPollResult> {
  if (!input.apiKey) throw new Error("Runway API key is required");
  const result = await providerJson(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: runwayHeaders(input.apiKey),
  });
  const state = String(result?.status ?? "").toUpperCase();
  if (["SUCCEEDED", "COMPLETED"].includes(state)) {
    const output = result?.output?.[0] ?? result?.output?.url ?? result?.result?.output?.[0];
    if (!output) throw new Error("Runway completed without an output URL");
    return { status: "completed", providerTaskId: taskId, outputUrl: String(output) };
  }
  if (["FAILED", "CANCELED", "CANCELLED"].includes(state)) {
    return { status: "failed", providerTaskId: taskId, error: String(result?.failure ?? result?.error ?? "Runway task failed") };
  }
  return { status: "processing", providerTaskId: taskId };
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToBytes(pem: string) {
  const raw = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(raw);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function vertexAccessToken(serviceAccountJson: string) {
  let account: { client_email?: string; private_key?: string };
  try { account = JSON.parse(serviceAccountJson); } catch { throw new Error("Vertex service-account JSON is invalid"); }
  if (!account.client_email || !account.private_key) throw new Error("Vertex service-account JSON needs client_email and private_key");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const tokenBody: any = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) throw new Error(tokenBody.error_description ?? "Vertex authentication failed");
  return String(tokenBody.access_token);
}

function vertexBase(input: MediaInput) {
  if (!input.projectId || !input.location) throw new Error("Vertex project ID and location are required");
  return `https://${input.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(input.projectId)}/locations/${encodeURIComponent(input.location)}/publishers/google/models/${encodeURIComponent(input.model)}`;
}

async function startVertex(input: MediaInput): Promise<MediaPollResult> {
  if (!input.serviceAccountJson) throw new Error("Vertex service-account JSON is required");
  const token = await vertexAccessToken(input.serviceAccountJson);
  const base = vertexBase(input);
  const isImage = input.task === "image";
  const body = isImage
    ? { instances: [{ prompt: input.prompt }], parameters: { sampleCount: 1, aspectRatio: ratio(input.format) } }
    : { instances: [{ prompt: input.prompt }], parameters: { aspectRatio: ratio(input.format), sampleCount: 1, durationSeconds: 5 } };
  const result = await providerJson(`${base}:${isImage ? "predict" : "predictLongRunning"}`, {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify(body),
  });
  if (isImage) {
    const prediction = result?.predictions?.[0];
    const uri = prediction?.gcsUri ?? prediction?.uri;
    if (uri) return { status: "completed", outputUrl: String(uri) };
    if (prediction?.bytesBase64Encoded) return { status: "completed", outputUrl: `data:${prediction.mimeType ?? "image/png"};base64,${prediction.bytesBase64Encoded}` };
    throw new Error("Vertex Imagen returned no image output");
  }
  const operation = result?.name;
  if (!operation) throw new Error("Vertex Veo did not return an operation name");
  return { status: "processing", providerTaskId: String(operation) };
}

async function pollVertex(input: MediaInput, operation: string): Promise<MediaPollResult> {
  if (!input.serviceAccountJson) throw new Error("Vertex service-account JSON is required");
  const token = await vertexAccessToken(input.serviceAccountJson);
  const result = await providerJson(`https://www.googleapis.com/v1/${operation}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!result?.done) return { status: "processing", providerTaskId: operation };
  if (result.error) return { status: "failed", providerTaskId: operation, error: String(result.error.message ?? "Vertex operation failed") };
  const video = result?.response?.videos?.[0] ?? result?.response?.generatedVideos?.[0] ?? result?.response?.predictions?.[0];
  const uri = video?.gcsUri ?? video?.uri;
  if (uri) return { status: "completed", providerTaskId: operation, outputUrl: String(uri) };
  if (video?.bytesBase64Encoded) return { status: "completed", providerTaskId: operation, outputUrl: `data:${video.mimeType ?? "video/mp4"};base64,${video.bytesBase64Encoded}` };
  throw new Error("Vertex Veo completed without a video output");
}

async function startLuma(input: MediaInput): Promise<MediaPollResult> {
  if (!input.apiKey) throw new Error("Luma API key is required");
  const body: Record<string, unknown> = { prompt: input.prompt, model: input.model, aspect_ratio: ratio(input.format) };
  if (input.task === "video" && input.inputUrl) body.keyframes = { frame0: { type: "image", url: input.inputUrl } };
  const result = await providerJson("https://api.lumalabs.ai/dream-machine/v1/generations", {
    method: "POST",
    headers: jsonHeaders({ Authorization: `Bearer ${input.apiKey}` }),
    body: JSON.stringify(body),
  });
  const id = result?.id;
  if (!id) throw new Error("Luma did not return a generation id");
  return { status: "processing", providerTaskId: String(id) };
}

async function pollLuma(input: MediaInput, id: string): Promise<MediaPollResult> {
  if (!input.apiKey) throw new Error("Luma API key is required");
  const result = await providerJson(`https://api.lumalabs.ai/dream-machine/v1/generations/${encodeURIComponent(id)}`, {
    headers: jsonHeaders({ Authorization: `Bearer ${input.apiKey}` }),
  });
  const state = String(result?.state ?? "").toLowerCase();
  if (state === "completed") {
    const url = result?.assets?.video ?? result?.assets?.image;
    if (!url) throw new Error("Luma completed without an output URL");
    return { status: "completed", providerTaskId: id, outputUrl: String(url) };
  }
  if (["failed", "error"].includes(state)) return { status: "failed", providerTaskId: id, error: String(result?.failure_reason ?? "Luma generation failed") };
  return { status: "processing", providerTaskId: id };
}

export async function startMedia(input: MediaInput): Promise<MediaPollResult> {
  if (input.provider === "runway") return startRunway(input);
  if (input.provider === "vertex") return startVertex(input);
  if (input.provider === "luma") return startLuma(input);
  throw new Error(`${input.provider} does not have a media generation adapter`);
}

export async function pollMedia(input: MediaInput, providerTaskId: string): Promise<MediaPollResult> {
  if (input.provider === "runway") return pollRunway(input, providerTaskId);
  if (input.provider === "vertex") return pollVertex(input, providerTaskId);
  if (input.provider === "luma") return pollLuma(input, providerTaskId);
  throw new Error(`${input.provider} does not have a media generation adapter`);
}
