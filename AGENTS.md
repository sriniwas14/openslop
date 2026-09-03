# AGENTS.md — OpenSlop

> **For AI agents working in this repo.** Human docs: `README.md:1`. Stack: `Bun` + `Fastify` + `Drizzle/sqlite` + `Mastra` + `Vite/React`.

## 1. What This Is

OpenSlop is a persona → ideas → scripts → video engine for small teams shipping TikToks, Reels & UGC (`README.md:12`). Flow: `type (talkinghead|greenscreen|carousel) → duration (15|30|45s) → 5 persona-grounded ideas → generate → render`. No enterprise workflow.

## 2. Stack & Runtime

- **Runtime:** `Bun 1.x` + `Node 18+` + `ffmpeg` (`ffmpeg -version`) + `openssl` (`README.md:65`)
- **Backend:** `Fastify 5.12` + `better-auth 1.7` + `Drizzle ORM 0.45 (sqlite)` + `Mastra 1.62` + `AI SDK` + `Zod 4.4` (`backend/package.json:11`)
- **Frontend:** `Vite 8` + `React 19` + `shadcn` + `Tailwind 4` + `Geist` + `React Router 7` (`frontend/package.json:12`)
- **Media:** `Runway gen4.5/veo3.1/seedance2`, `Luma ray-2/flash`, `Vertex veo`, `sharp 0.35`, `ffmpeg` concat/last-frame (`README.md:41`)
- **Ports:** `:3000` backend (Fastify, Swagger at `/docs`), `:5173` frontend (Vite)

## 3. Repo Map

```
openslop/
├── AGENTS.md
├── README.md
├── package.json              # root: npm run dev parallels backend+frontend
├── branding/                 # logo.png, logo_banner.png
├── backend/
│   ├── src/
│   │   ├── app.ts:17         # Fastify factory, /media/files handler, worker start
│   │   ├── index.ts:6        # listen {port: env.PORT, host: env.HOST}
│   │   ├── env.ts:3          # zod: PORT/HOST/BETTER_AUTH_SECRET(min32)/BETTER_AUTH_URL
│   │   ├── lib/
│   │   │   ├── auth.ts       # better-auth instance
│   │   │   ├── db.ts         # drizzle sqlite client
│   │   │   ├── mastra.ts:6   # AI_PROVIDERS, DISCOVERY_ONLY, resolveModel, getAgent
│   │   │   └── image.ts      # sharp helpers
│   │   ├── db/schema.ts:1    # 7 tables (see §7)
│   │   ├── plugins/
│   │   │   ├── auth.ts:14    # requireSession, FastifyRequest.session augmentation
│   │   │   └── swagger.ts    # @fastify/swagger + swagger-ui at /docs
│   │   └── modules/
│   │       ├── company/      # routes + company.workflow.ts (fetch homepage→persona)
│   │       ├── content/      # routes, schemas (Zod), service
│   │       ├── media/        # routes, service, video.workflow, providers, media.worker
│   │       ├── ai/           # ai.routes.ts:693L — provider CRUD + preferences + model discovery
│   │       ├── influencer/   # influencer.routes.ts:252L
│   │       └── health/       # health.routes.ts:17L
│   ├── drizzle/              # migrations 0000_*..0006_*, _journal.json, drizzle.config.ts:3
│   ├── data/media/           # rendered mp4 + png (gitignored via backend/.gitignore:2)
│   ├── db.sqlite             # sqlite file (gitignored *.sqlite)
│   └── drizzle.config.ts:3   # dialect sqlite, schema ./src/db/schema.ts, out ./drizzle
└── frontend/
    ├── vite.config.ts:7      # plugins react+tailwind, proxy, alias @→./src
    ├── components.json       # shadcn config
    ├── .oxlintrc.json        # oxlint (react, typescript, rules-of-hooks:error)
    └── src/
        ├── main.tsx / App.tsx / index.css
        ├── pages/            # Dashboard, Content, Influencers, Trending, Settings, Onboarding, SignIn/Up
        ├── components/{ui,content,ai,influencer,layout}
        ├── services/{ai,companies,content,influencers,auth}.ts
        ├── lib/utils.ts:1    # cn() = twMerge(clsx())
        ├── layouts/ + context/
        └── assets/
```

## 4. Setup & Commands

```bash
# 1. env — 32+ char secret required (backend/src/env.ts:6)
cp backend/.env.example backend/.env
# set: BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#      BETTER_AUTH_URL=http://localhost:3000
#      PORT=3000 HOST=0.0.0.0

# 2. install
bun install
# or: npm install && npm install --prefix backend --prefix frontend

# 3. dev
npm run dev                          # root — backend & frontend in parallel (package.json:5)
bun --cwd backend run dev            # Fastify :3000 — swagger http://localhost:3000/docs (backend/package.json:7)
bun --cwd frontend run dev           # Vite :5173 — app http://localhost:5173 (frontend/package.json:7)

# 4. build / checks
bun --cwd frontend run build         # tsc -b && vite build
bun --cwd frontend run lint          # oxlint (frontend/.oxlintrc.json)
npx --cwd backend tsc --noEmit       # backend has no lint script — use tsc
npx --cwd frontend tsc --noEmit
# before PR (README.md:188):
bun --cwd backend run lint 2>/dev/null || npx --cwd backend tsc --noEmit
bun --cwd frontend run lint 2>/dev/null || npx --cwd frontend tsc --noEmit

# 5. db
bunx --cwd backend drizzle-kit generate   # after schema change (drizzle.config.ts:3)
bun --cwd backend src/scripts/migrate.ts  # auth migrate (backend/package.json:9)
# existing DBs auto-migrate contents.duration on first GET /companies/:id/contents or render
```

`ffmpeg` required for chunked stitching: `brew install ffmpeg` / `sudo apt install ffmpeg`.

## 5. Architecture

```
Browser :5173 (Vite)  ──proxy /companies /contents /media /ai /health /api → :3000
Fastify :3000 (backend/src/app.ts:17) ── better-auth session ──
  ├─ Mastra: companyPersonaWorkflow (fetch homepage → LLM persona: audience/voice/pain/positioning)
  ├─ Content: POST /companies/:id/ideas → 5 ideas → POST /companies/:id/contents/generate → contents row {scripts, format, duration}
  └─ Media: POST /contents/:id/render → video.workflow chunkedRender N = duration/5
       ├─ chunk 0: text_to_video (prompt)
       ├─ chunks 1..N-1: image_to_video (promptImage = previous clip last-frame PNG data URI via ffmpeg)
       ├─ poll GET /v1/tasks/:id until done, download → data/media/<id>_part*.mp4
       ├─ ffmpeg last-frame extraction + ffmpeg concat → <id>_final_*.mp4
       └─ contents.mediaUrl = /media/files/<final>.mp4 → GET /media/files/:filename streams with Cache-Control 1y
SQLite: ai_config, ai_preferences, companies, contents, media_jobs, influencers, onboarding_progress
```

- **Duration:** `15s=3 clips, 30s=6, 45s=9`, each `5s` locked, `ratio 1280:720`/`720:1280` auto, default `15`, hidden for `carousel` (`README.md:29`).
- **Provider routing:** text tasks always use LLM provider, video render uses media provider — mix per task in `Settings → AI Providers` (`README.md:98`).
- **Vite proxy:** `frontend/vite.config.ts:10` proxies `/api /companies /influencers /contents /media /ai /health → http://localhost:3000`.

## 6. API (Swagger at http://localhost:3000/docs)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/companies/:companyId/ideas` | `requireSession` | `{kind?, count?}` → `{ideas: [{title, painPoint, hooks[3], angle}]}` |
| `POST` | `/companies/:companyId/contents/generate` | `requireSession` | `{idea, selectedHook, kind?, duration? (15|30|45)}` → 201 row |
| `GET` | `/companies/:companyId/contents` | `requireSession` | `?kind=&status=` |
| `GET` | `/contents/:id` | `requireSession` | single row |
| `PATCH` | `/contents/:id` | `requireSession` | partial; duration required for video |
| `POST` | `/contents/:id/render` | `requireSession` | blocks until N chunks + concat |
| `GET` | `/media/files/:filename` | — | streams `data/media/` mp4/png/webp, `Cache-Control: 1y` (`app.ts:34`) |
| `GET` | `/health` | — | liveness |
| `GET/POST/PATCH` | `/ai/configs`, `PUT /ai/preferences`, `GET /ai/models` | `requireSession` | provider CRUD + per-task routing |

## 7. Conventions

### Ponytail (project philosophy — `README.md:184`)
Shortest working diff wins. Ladder: does it need to exist? → already in codebase? → stdlib? → native platform? → installed dep? → one-liner? → minimal code. No speculative abstractions, no factory for one product, no config for a constant. Reuse before you write — re-implementing a helper a few files over is the most common slop. Mark deliberate shortcuts `// ponytail: <ceiling + upgrade path>`.

### Validation
`fastify-type-provider-zod` with `validatorCompiler`/`serializerCompiler` in `backend/src/app.ts:20`. Every route declares `schema: {body, params, querystring, response}` from `*.schemas.ts` (Zod). Custom `setErrorHandler` surfaces `err.validation` as `400 {error, validation}` with field detail (`app.ts:23` — `// ponytail: surface zod issues`).

### Auth & Ownership
`requireSession` in `backend/src/plugins/auth.ts:14` via `better-auth` `auth.api.getSession` + `fromNodeHeaders`. All app routes use `{preHandler: requireSession}` except `GET /health` and `GET /media/files/:filename` (`app.ts:34`) and `/api/auth/*` (delegates to `auth.handler`). `FastifyRequest.session` augmented there. **No DB FKs** (`db/schema.ts:30` — `// ponytail: no DB-level FK — better-auth owns user`); ownership enforced in every query via `eq(table.userId, request.session.user.id)`. Company creation hijacks SSE (`hijack()`, `text/event-stream`) to stream `companyPersonaWorkflow` progress.

### Database
`drizzle.config.ts:3` — `dialect: sqlite`, `schema: ./src/db/schema.ts`, `out: ./drizzle`. 7 tables (`db/schema.ts:1`):
- `ai_config` (idx `idx_ai_config_user`), `company` (idx `idx_company_user_id`), `content` (idx `idx_content_user/company/kind/scheduled_at`, JSON `images`/`scripts` as text, `mediaUrl/format/duration/influencerId/scheduledAt`), `ai_preferences` (PK `user_id`, `video/image/text config+model`), `onboarding_progress` (PK `user_id`, JSON `data`), `media_job` (idx `user/status/content`), `influencer` (idx `user/company`). IDs `crypto.randomUUID()`, timestamps ISO text.

### AI Providers
`backend/src/lib/mastra.ts:6` — `AI_PROVIDERS = openai|anthropic|google|xai|openrouter|runway|vertex|fal|luma|ollama|custom`. `DISCOVERY_ONLY_PROVIDERS = runway|vertex|fal|luma` (`mastra.ts:22`) — `resolveModel` throws `model discovery only; media generation adapters are not enabled yet` if used for text (`mastra.ts:38`). Router providers map to `${provider}/${model}`, `ollama` via `ollama-ai-provider-v2`, `custom` via `createOpenAI` with `CUSTOM_LLM_*` env. Test via `GET /ai/models?provider=&task=video|text|image`. Per-user routing in `ai_preferences`.

### Media
`GET /media/files/:filename` in `backend/src/app.ts:34` — `// ponytail: no @fastify/static dep, plain fs stream`, regex `^[\w.-]+\.(mp4|png|jpg|jpeg|webp|mov|webm)$`, `fs.createReadStream`, `bodyLimit 15MB` (`app.ts:18`). Background `startMediaWorker()` polls every 10s (`app.ts:61`, `media/media.service.ts`). `data/media/` + `*.sqlite` gitignored.

### Frontend
Alias `@ → ./src` (`vite.config.ts:21`), proxy list (`vite.config.ts:10`), `lib/utils.ts:1` — `cn(...inputs) = twMerge(clsx(inputs))`. Services per domain in `src/services/`, `components.json` shadcn, Tailwind 4 + Geist.

### Env
`backend/src/env.ts:3` — `PORT (default 3000)`, `HOST (0.0.0.0)`, `BETTER_AUTH_SECRET (min 32)`, `BETTER_AUTH_URL (default http://localhost:3000)` — validated via `zod` on import.

## 8. Pitfalls (from `README.md:172`)

- `400 model discovery only` — set `runway`/`luma`/`vertex`/`fal` as text provider → switch text to `openai`/`anthropic`/`google`/`xai`/`openrouter`/`ollama`/`custom` in Settings.
- `400 duration required for video` — pick `15|30|45` in duration step (defaults to `15`, hidden for carousel).
- `404 /contents/:id/render` — restart Vite (proxy in `vite.config.ts` needs reload).
- `400 Validation of body failed` — usually `ratio`/`duration` mismatch per Runway model; check `providerJson error.details`, use `gen4.5`/`veo3.1`, ratio auto `1280:720`.
- `ffmpeg not installed` — `ffmpeg -version` must succeed locally and in container.
- Body limit is `15MB` (`app.ts:18`) — larger uploads fail.

## 9. PR Checklist

```bash
bun --cwd backend run lint 2>/dev/null || npx --cwd backend tsc --noEmit
bun --cwd frontend run lint 2>/dev/null || npx --cwd frontend tsc --noEmit
```

- Smallest diff that works; reuse existing helpers/utils before adding new ones.
- No new dependencies for what stdlib/a few lines can do.
- No unrequested abstractions (single-implementation interfaces, factories, configs for constants).
- Grep callers before fixing a shared function — fix at the shared root, not per-call-site.
- Keep `// ponytail:` comments where shortcuts have a known ceiling.

## 10. References

- Full docs: `README.md`
- Live API: `http://localhost:3000/docs` (Swagger via `@fastify/swagger`)
- License: `LICENSE` (MIT)
