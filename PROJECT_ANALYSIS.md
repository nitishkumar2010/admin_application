# PROJECT_ANALYSIS.md — HealthVault Admin

> A Senior-Architect / Codebase-Analyst review of the `healthvault-admin` Next.js application.
> Generated for engineering onboarding, architecture review, technical documentation, AI-agent comprehension, and future maintainability.

---

## 1. Executive Summary

**HealthVault Admin** is a small Next.js 16 (App Router) administrative dashboard for reviewing healthcare reports. An authenticated administrator views a list of patient reports pulled from a PostgreSQL database via Prisma, then approves or rejects each pending report through a confirmation modal.

| Aspect | Value |
| --- | --- |
| Framework | Next.js `16.0.3` (App Router, React 19, Server + Client components) |
| Language | TypeScript 5 (`strict: true`, target `ES2017`) |
| Styling | Tailwind CSS v4 (PostCSS pipeline, `@tailwindcss/postcss`) |
| Icons | `lucide-react` |
| ORM / DB | Prisma 6 → PostgreSQL 15 |
| Auth | Custom cookie flag (`isAdmin=true`), hardcoded `admin/admin` credentials |
| Secondary backend | A legacy/parallel Express.js service under [api/](api/) |
| Containerization | Multi-stage Dockerfile (prod) + Dockerfile.dev (hot reload) |
| Orchestration | Kubernetes manifests under [k8s/](k8s/) (MicroK8s target) |
| CI/CD | Azure DevOps pipeline: [azure-pipelines.yml](azure-pipelines.yml) → DockerHub → SSH → MicroK8s |
| Tests | **None present** |
| Lines of application code | ≈ 500 (very small surface area) |

**Maturity verdict:** Early-stage / prototype. Functional end-to-end, but with significant security, configuration, and operational issues that must be addressed before production use. See [§13 Risks](#13-risks--security-issues) and [§14 Improvement Recommendations](#14-improvement-recommendations).

---

## 2. High-Level Architecture

### 2.1 Logical View

```
┌────────────────────────────────────────────────────────────┐
│                        Browser (SPA-like)                  │
│  /login (Client Component)   /admin (Client Component)     │
└────────────┬───────────────────────────┬───────────────────┘
             │ fetch() JSON              │ fetch() JSON
             ▼                           ▼
┌────────────────────────────────────────────────────────────┐
│                  Next.js App Router (Node)                 │
│                                                            │
│  middleware.ts ── gate /admin/* on cookie `isAdmin`        │
│                                                            │
│  /api/login      POST   → set isAdmin cookie               │
│  /api/logout     POST   → clear cookie + redirect          │
│  /api/health     GET    → liveness/readiness               │
│  /api/reports    GET    → Prisma findMany                  │
│  /api/reports/:id PATCH → Prisma update (status)           │
└────────────┬───────────────────────────────────────────────┘
             │ Prisma Client
             ▼
┌────────────────────────────────────────────────────────────┐
│                     PostgreSQL 15                          │
│            single table: `reports`                         │
└────────────────────────────────────────────────────────────┘

                        (sibling, not wired in by default)
┌────────────────────────────────────────────────────────────┐
│   Express service in /api  →  pg (raw SQL) → PostgreSQL    │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Runtime Topology (production)

```
Internet
   │
   ▼  (DNS: admin.healthvault.com)
NGINX Ingress  ──►  Service `admin` (ClusterIP:80)
                       │
                       ▼
                 Deployment `admin` (replicas: 3, HPA 2-10 @70% CPU)
                       │  envFrom: admin-config (ConfigMap) + postgres-secret
                       ▼
                 Azure Postgres Flexible Server (per k8s/admin-secret.yaml)
                 (NOTE: an in-cluster Postgres StatefulSet is also defined
                  but appears unused in this deploy path — see §13)
```

### 2.3 Request Lifecycle (Approve a Report)

1. User opens `/admin` → [middleware.ts](middleware.ts) inspects the `Cookie` header for `isAdmin=true`. If missing → 302 to `/login`.
2. Admin page mounts (`"use client"` in [app/admin/page.tsx](app/admin/page.tsx)) and on `useEffect` calls `GET /api/reports`.
3. The Route Handler [app/api/reports/route.ts](app/api/reports/route.ts) runs Prisma `findMany` and returns JSON.
4. User clicks **Approve** → modal opens → `confirmAction` posts `PATCH /api/reports/{id}` with `{ status: "approved" }`.
5. [app/api/reports/[id]/route.ts](app/api/reports/[id]/route.ts) validates the status enum, awaits `context.params`, and runs `prisma.reports.update`.
6. Client patches local React state in place (optimistic single-row update; modal closes).

---

## 3. Folder Structure

```
admin_application/
├── app/                              # Next.js App Router root
│   ├── layout.tsx                    # Root layout, Geist fonts, metadata
│   ├── page.tsx                      # `/` → server-side redirect to /login
│   ├── globals.css                   # Tailwind v4 entry, CSS vars, dark prefers
│   ├── login/page.tsx                # Client login form (POST /api/login)
│   ├── admin/page.tsx                # Client reports table + modal
│   └── api/                          # Route Handlers
│       ├── health/route.ts           # GET → { status: "ok" }
│       ├── login/route.ts            # POST → validate + setAdminCookie
│       ├── logout/route.ts           # POST → clearAdminCookie + redirect
│       └── reports/
│           ├── route.ts              # GET (list, new PrismaClient!)
│           └── [id]/route.ts         # PATCH (update status, singleton prisma)
│
├── lib/
│   ├── auth.ts                       # Hardcoded creds + cookie helpers
│   └── prisma.ts                     # Singleton PrismaClient (dev-safe)
│
├── prisma/
│   └── schema.prisma                 # `reports` model, postgres datasource
│
├── api/                              # ⚠ PARALLEL Express service
│   ├── package.json                  # express, pg, dotenv
│   ├── src/index.js                  # bootstraps Express on :4000
│   ├── src/db.js                     # `pg` Pool from env
│   ├── src/routes/reports.js         # GET / POST / PUT :id/status
│   └── Dockerfile.dev
│
├── k8s/                              # Kubernetes manifests (MicroK8s)
│   ├── namespace.yaml                # ns: nitishk21
│   ├── admin-deployment.yaml         # 3 replicas, probes, envFrom
│   ├── admin-service.yaml            # ClusterIP :80 → :3000
│   ├── admin-configmap.yaml          # NODE_ENV, NEXTAUTH_URL
│   ├── admin-secret.yaml             # ⚠ committed DATABASE_URL with creds
│   ├── admin-ingress.yaml            # nginx, admin.healthvault.com
│   ├── admin-hpa.yaml                # HPA 2-10 @ 70% CPU
│   ├── admin-lb.yaml                 # LoadBalancer (alt path)
│   ├── postgres-deployment.yaml      # StatefulSet (unused on Azure path)
│   ├── postgres-service.yaml         # missing namespace
│   ├── postgres-pvc.yaml             # 5Gi (StatefulSet uses its own 10Gi)
│   ├── prisma-migrate-job.yaml       # one-shot `prisma migrate deploy`
│   └── ingress-test.yaml             # leftover scratch
│
├── public/                           # Default Next.js SVGs (unused)
│
├── middleware.ts                     # /admin/* cookie gate
├── next.config.ts                    # empty config
├── prisma.config.ts                  # migrations path: prisma/migrations
├── tsconfig.json                     # strict TS, @/* path alias to repo root
├── eslint.config.mjs                 # flat config: next core-web-vitals + ts
├── postcss.config.mjs                # @tailwindcss/postcss
├── package.json                      # see §4 dependencies
├── package-lock.json
│
├── Dockerfile                        # multi-stage prod build
├── Dockerfile.dev                    # single-stage hot-reload
├── docker-compose.dev.yml            # admin only
├── docker-compose-devdb.yml          # admin + postgres
├── docker-compose.prod.yml           # admin + postgres (prod)
├── .dockerignore
├── .gitignore                        # ⚠ .env* ignored (good) but secrets in k8s/
├── azure-pipelines.yml               # build → push → scp k8s → ssh kubectl
└── README.md                         # ⚠ unmodified create-next-app template
```

---

## 4. Dependencies

### 4.1 Runtime (declared in [package.json](package.json))

| Package | Version | Actually used? | Notes |
| --- | --- | --- | --- |
| `next` | `16.0.3` | ✅ | App Router |
| `react`, `react-dom` | `19.2.0` | ✅ | |
| `@prisma/client` | `^6.16.0` | ✅ | imported in `lib/prisma.ts` and `app/api/reports/route.ts` |
| `prisma` | `^6.16.0` | ✅ | CLI (`prisma generate`, `migrate deploy`) |
| `lucide-react` | `^0.554.0` | ✅ | `Stethoscope`, `FileText`, `CheckCircle`, `XCircle`, `HeartPulse` |
| `bcryptjs` | `^3.0.3` | ❌ **Dead** | No hashing performed anywhere |
| `next-auth` | `^4.24.13` | ❌ **Dead** | Auth is custom cookie; NextAuth is never imported. `NEXTAUTH_URL` / `NEXTAUTH_SECRET` env vars exist only in Dockerfile / configmap as placeholders. |
| `axios` | `^1.13.2` | ❌ **Dead** | Frontend uses native `fetch` everywhere |
| `autoprefixer`, `postcss` | latest | ⚠ Indirect | Tailwind v4 uses `@tailwindcss/postcss`; these may be redundant |

### 4.2 Dev

`@tailwindcss/postcss`, `tailwindcss@^4.1.17`, `eslint@^9`, `eslint-config-next@16.0.3`, `typescript@^5`, type packages.

### 4.3 Sibling service ([api/package.json](api/package.json))

`express@^4.18.2`, `pg@^8.11.1`, `dotenv@^16.3.1`, `nodemon` (dev).
Note: imports `cors` in [api/src/index.js](api/src/index.js) but `cors` is **not declared** in `api/package.json` → broken `npm install` unless implicit.

---

## 5. Routing System

Next.js App Router. Two segments: `app/login` and `app/admin`. Routing is file-based.

| URL | File | Type | Purpose |
| --- | --- | --- | --- |
| `/` | [app/page.tsx](app/page.tsx) | Server Component | Calls `redirect("/login")` |
| `/login` | [app/login/page.tsx](app/login/page.tsx) | Client (`"use client"`) | Login form |
| `/admin` | [app/admin/page.tsx](app/admin/page.tsx) | Client | Reports table & modal — **protected** by middleware |
| `/api/health` | [app/api/health/route.ts](app/api/health/route.ts) | Route Handler (GET) | Returns `{ status: "ok" }` |
| `/api/login` | [app/api/login/route.ts](app/api/login/route.ts) | Route Handler (POST) | Validates creds, sets cookie |
| `/api/logout` | [app/api/logout/route.ts](app/api/logout/route.ts) | Route Handler (POST) | Clears cookie, **302** to `/login` |
| `/api/reports` | [app/api/reports/route.ts](app/api/reports/route.ts) | Route Handler (GET) | Lists reports |
| `/api/reports/[id]` | [app/api/reports/[id]/route.ts](app/api/reports/[id]/route.ts) | Route Handler (PATCH) | Updates report status |

### 5.1 Middleware

[middleware.ts](middleware.ts) matches `/admin/:path*` and redirects to `/login` if the request cookie header does not contain the substring `isAdmin=true`. This is a **string `.includes()` check**, not a parsed/validated cookie — it would match `not_isAdmin=true_lol` as well, and it gates only `/admin`, leaving `/api/reports*` completely unauthenticated. See [§13.1](#131-authentication--authorization).

---

## 6. State Management

There is **no global store** (no Redux, Zustand, Context, React Query, SWR, etc.).

State is local React `useState` inside the admin page ([app/admin/page.tsx:30-39](app/admin/page.tsx#L30-L39)):

- `reports: Report[]` — fetched list
- `loadingReports: boolean`
- `error: string | null`
- `modalOpen`, `selectedId`, `selectedAction`, `updating` — confirm-modal state

Data is fetched in a single `useEffect` with `cache: "no-store"`. On a successful PATCH the row is updated in place (optimistic-style, post-response):

```ts
setReports((prev) =>
  prev.map((r) => (r.id === selectedId ? { ...r, status: selectedAction } : r))
);
```

Errors fall back to an `alert()` and `console.error()`.

---

## 7. API Integration & Data Layer

### 7.1 Prisma Schema

[prisma/schema.prisma](prisma/schema.prisma) — single model:

```prisma
model reports {
  id           Int      @id @default(autoincrement())
  patient_name String
  report_type  String
  report_date  DateTime
  status       String   @default("pending")     // free-form string, not enum
  pdf_url      String?
  created_at   DateTime @default(now())
}
```

Observations:
- `status` is a `String` rather than an `enum` — invariants are enforced only at the route layer.
- `report_date` is a `DateTime`; the UI formats with `timeZone: "UTC"`.
- The `prisma/migrations/` directory referenced by [prisma.config.ts](prisma.config.ts) **does not exist in the repo** — schema is currently maintained outside Git history.

### 7.2 Prisma Client Usage

Two **inconsistent** instantiation patterns:

1. **Recommended pattern (used in [app/api/reports/[id]/route.ts](app/api/reports/[id]/route.ts))** — singleton from [lib/prisma.ts](lib/prisma.ts):
   ```ts
   const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
   export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["query", "error"] });
   if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
   ```
2. **Anti-pattern (used in [app/api/reports/route.ts:4](app/api/reports/route.ts#L4))** — `new PrismaClient()` is instantiated at module load each time the route is bundled, bypassing the singleton. In a long-running serverful environment this works but is divergent; in serverless it would exhaust connections.

### 7.3 Client → Server fetches

| Operation | Method | URL | Body |
| --- | --- | --- | --- |
| Login | POST | `/api/login` | `{ username, password }` (raw JSON, no `Content-Type` set) |
| Logout | POST | `/api/logout` | — |
| List reports | GET | `/api/reports` | `cache: "no-store"` |
| Update status | PATCH | `/api/reports/{id}` | `{ status }` |

No client-side typed API wrapper, no shared types between client and server beyond the locally-redeclared `Report` type in [app/admin/page.tsx:8-16](app/admin/page.tsx#L8-L16).

### 7.4 Parallel Express service (legacy?)

[api/src/routes/reports.js](api/src/routes/reports.js) re-implements the same endpoints using `pg`:

- `GET /api/reports` — `SELECT … ORDER BY id ASC`
- `POST /api/reports` — insert
- `PUT /api/reports/:id/status` — update

This service is **not** referenced by the Next.js app, the Docker Compose stacks, or the Kubernetes manifests, and its `cors` import is undeclared. It looks like a leftover from an earlier architecture and is a strong candidate for deletion — see [§14](#14-improvement-recommendations).

---

## 8. Authentication & Authorization Flow

### 8.1 The Flow

```
1. Browser POSTs { username, password } to /api/login (no Content-Type header)
2. lib/auth.ts::validateLogin compares to hardcoded ADMIN_USER="admin" / ADMIN_PASS="admin"
3. On match → lib/auth.ts::setAdminCookie() sets:
       isAdmin=true; HttpOnly; Path=/
   (no Secure, no SameSite, no Max-Age/Expires, no signature)
4. Browser hard-navigates to /admin
5. middleware.ts grants access if the request cookie string contains "isAdmin=true"
6. Logout posts /api/logout → cookie deleted → 302 /login
```

### 8.2 Implementation files

- [lib/auth.ts](lib/auth.ts) — `validateLogin`, `setAdminCookie`, `isAdmin`, `clearAdminCookie` (uses Next.js `cookies()` API).
- [middleware.ts](middleware.ts) — only protects `/admin/*`. **API routes are unprotected.**

### 8.3 Authorization model

There is no role model. The only principal is the singleton admin. The `isAdmin()` helper in `lib/auth.ts` is exported but **never called** anywhere in the codebase.

### 8.4 Critical issues (summary — see §13)

- Hardcoded plaintext credentials in source.
- Cookie has no integrity (any client can forge `isAdmin=true`).
- No CSRF token, no `SameSite`, no `Secure`.
- API routes do not check authentication — anyone can `curl PATCH /api/reports/<id>` directly.
- `bcryptjs` and `next-auth` are installed but unused → the "right" path was set up and abandoned.

---

## 9. Reusable Components, Hooks, Utilities

The codebase currently has **no shared component library**. Each page is a single self-contained file.

- **UI**: Login form and reports table are written inline with Tailwind utility classes. No `components/` directory.
- **Hooks**: Only React built-ins (`useState`, `useEffect`).
- **Utilities**:
  - [lib/auth.ts](lib/auth.ts) — auth helpers (4 functions).
  - [lib/prisma.ts](lib/prisma.ts) — Prisma singleton.
  - `formatDate` is defined locally inside [app/admin/page.tsx:18-27](app/admin/page.tsx#L18-L27) rather than being shared.

**Opportunity:** extract `<DataTable>`, `<ConfirmModal>`, `<PageShell>`, `<StatusPill>`, `formatDate`, and a typed `apiClient` as the surface grows.

---

## 10. Styling System

- **Tailwind CSS v4** via the new `@tailwindcss/postcss` plugin ([postcss.config.mjs](postcss.config.mjs)).
- Global stylesheet [app/globals.css](app/globals.css) declares CSS variables, theme tokens (`@theme inline`), and a `prefers-color-scheme: dark` block — but the actual page UIs use hardcoded light gradients (`from-blue-50 to-blue-100`), so dark mode is effectively unused.
- Fonts: Geist Sans + Geist Mono via `next/font/google` ([app/layout.tsx](app/layout.tsx)), exposed as `--font-geist-sans` / `--font-geist-mono`. But `globals.css` overrides `body { font-family: Arial, Helvetica, sans-serif }` — so **Geist is loaded but not rendered**.
- Icons: `lucide-react`.

---

## 11. Environment Configuration

### 11.1 Variables consumed by the app

| Variable | Where read | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Prisma datasource ([prisma/schema.prisma:3](prisma/schema.prisma#L3)) | Postgres connection string |
| `NODE_ENV` | [lib/prisma.ts:13](lib/prisma.ts#L13) | Toggles Prisma global cache |
| `NEXTAUTH_SECRET` | Set in [Dockerfile:18](Dockerfile#L18) to `"dummy-secret"` | **Unused at runtime** (NextAuth is not active) |
| `NEXTAUTH_URL` | Set via [k8s/admin-configmap.yaml](k8s/admin-configmap.yaml) | **Unused at runtime** |
| `CHOKIDAR_USEPOLLING` | Docker dev | Hot-reload polling inside containers |

### 11.2 Variables consumed by the Express sidecar

`POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `PORT` ([api/src/db.js](api/src/db.js), [api/src/index.js](api/src/index.js)).

### 11.3 Where they come from

- **Local dev**: `.env` file (gitignored). [docker-compose-devdb.yml](docker-compose-devdb.yml) consumes it via `env_file: .env`.
- **Container build**: build-time defaults in [Dockerfile:18-19](Dockerfile#L18-L19).
- **Kubernetes**: `envFrom` references `admin-config` (ConfigMap) + `postgres-secret` (Secret) in [k8s/admin-deployment.yaml](k8s/admin-deployment.yaml).
- **Pipeline**: variable groups `docker-secrets` and `vm-ssh-secrets` in [azure-pipelines.yml](azure-pipelines.yml).

### 11.4 Missing/inconsistent

- `prisma-migrate-job.yaml` references a Secret called `admin-secrets`, but only `postgres-secret` exists. The migration Job will fail until renamed.
- `admin-config` ConfigMap sets `NEXTAUTH_URL: http://localhost:3000` — wrong for production behind `admin.healthvault.com`.
- There is no `.env.example` to onboard a new developer.

---

## 12. Build, Deploy & Operations

### 12.1 NPM scripts ([package.json](package.json))

```bash
npm run dev      # next dev -p 3000
npm run build    # next build
npm run start    # next start -H 0.0.0.0 -p 3000
npm run lint     # eslint
```

No `test`, no `format`, no `typecheck`, no `prisma:*` aliases.

### 12.2 Docker

- **Prod** [Dockerfile](Dockerfile) — multi-stage (`builder` → `runner`), runs `prisma generate` and `next build`. ⚠ `NEXTAUTH_SECRET="dummy-secret"` is baked in at build time but it would also still ship in the final layer if any code consumed it.
- **Dev** [Dockerfile.dev](Dockerfile.dev) — single stage, `npm run dev` + chokidar polling.
- **Compose stacks**:
  - [docker-compose.dev.yml](docker-compose.dev.yml) — admin only, mounts local source.
  - [docker-compose-devdb.yml](docker-compose-devdb.yml) — admin + Postgres 15 with named volume.
  - [docker-compose.prod.yml](docker-compose.prod.yml) — production-like, uses prod `Dockerfile`.

### 12.3 Kubernetes (MicroK8s)

Manifests target namespace `nitishk21`:

- **Deployment** ([k8s/admin-deployment.yaml](k8s/admin-deployment.yaml)) — image `nitishk21/my-app:latest`, 3 replicas, `imagePullPolicy: Always`, readiness/liveness probes against `/api/health`, requests `250m/256Mi`, limits `500m/512Mi`.
- **HPA** ([k8s/admin-hpa.yaml](k8s/admin-hpa.yaml)) — 2–10 replicas at 70% CPU.
- **Service** ([k8s/admin-service.yaml](k8s/admin-service.yaml)) — ClusterIP `:80 → :3000`.
- **Ingress** ([k8s/admin-ingress.yaml](k8s/admin-ingress.yaml)) — `nginx` class, host `admin.healthvault.com`, no TLS.
- **LB** ([k8s/admin-lb.yaml](k8s/admin-lb.yaml)) — `LoadBalancer` Service, **alternative path; coexisting with Ingress can confuse routing**.
- **Database secrets** ([k8s/admin-secret.yaml](k8s/admin-secret.yaml)) — committed in plain text, see [§13.3](#133-committed-secrets).
- **Postgres in cluster** ([k8s/postgres-deployment.yaml](k8s/postgres-deployment.yaml)) — StatefulSet with its own `volumeClaimTemplates` (10Gi). The standalone [k8s/postgres-pvc.yaml](k8s/postgres-pvc.yaml) (5Gi) is unused. [k8s/postgres-service.yaml](k8s/postgres-service.yaml) is missing `namespace`.
- **Migrate Job** ([k8s/prisma-migrate-job.yaml](k8s/prisma-migrate-job.yaml)) — runs `npx prisma migrate deploy`, but no `prisma/migrations/` directory exists in the repo.
- **Stray** [k8s/ingress-test.yaml](k8s/ingress-test.yaml) — leftover; references a non-existent `nginx` Service.

### 12.4 Azure DevOps Pipeline ([azure-pipelines.yml](azure-pipelines.yml))

Triggered on `main`/`master`. Steps:

1. Checkout code.
2. `docker build -t $(DOCKER_USER)/healthvault-admin:$(Build.BuildId) .`
3. Docker Hub login (variable group `docker-secrets`).
4. `docker push` the new tag.
5. Decode base64-encoded SSH key, add VM to `known_hosts`.
6. `scp -r k8s/` to the VM.
7. SSH to VM and `microk8s kubectl set image deployment/admin admin=$(IMAGE_NAME):$(IMAGE_TAG) -n nitishk21`, then wait for rollout.

**Misalignment**: The pipeline pushes `$(DOCKER_USER)/healthvault-admin:<buildId>`, but the Deployment manifest pins `nitishk21/my-app:latest`. Rollouts happen only because `kubectl set image` rewrites that on the cluster — the manifest in Git no longer matches what's running. There is also no rollback step, no smoke test after rollout, no manifest `apply`, and `pr: none` disables PR validation.

---

## 13. Risks & Security Issues

### 13.1 Authentication & Authorization

| # | Issue | Severity | Location |
| --- | --- | --- | --- |
| A1 | Hardcoded credentials `admin` / `admin` | **Critical** | [lib/auth.ts:3-4](lib/auth.ts#L3-L4) |
| A2 | Cookie has no signature/HMAC — trivially forged | **Critical** | [lib/auth.ts:11-15](lib/auth.ts#L11-L15) |
| A3 | Cookie missing `Secure`, `SameSite`, `Max-Age`/`Expires` | High | [lib/auth.ts:11-15](lib/auth.ts#L11-L15) |
| A4 | API routes (`/api/reports*`) are not gated by middleware → anyone can list/patch reports | **Critical** | [middleware.ts:17](middleware.ts#L17) — matcher only `/admin/:path*` |
| A5 | Middleware uses `cookie.includes("isAdmin=true")` (substring match, not parsed) | Medium | [middleware.ts:5](middleware.ts#L5) |
| A6 | No CSRF protection on POST/PATCH endpoints | High | All route handlers |
| A7 | No rate limiting / lockout on `/api/login` | High | [app/api/login/route.ts](app/api/login/route.ts) |
| A8 | `bcryptjs` + `next-auth` declared but unused — dead/abandoned hardening path | Low | [package.json:18,21](package.json#L18) |

### 13.2 Data Layer

| # | Issue | Severity | Location |
| --- | --- | --- | --- |
| D1 | Two divergent Prisma instantiation patterns | Medium | [app/api/reports/route.ts:4](app/api/reports/route.ts#L4) vs [lib/prisma.ts](lib/prisma.ts) |
| D2 | `prisma/migrations/` directory is missing — schema history is not in Git | High | [prisma.config.ts:5](prisma.config.ts#L5) |
| D3 | `status` modeled as `String` rather than Postgres enum | Low | [prisma/schema.prisma:15](prisma/schema.prisma#L15) |
| D4 | Prisma client logs `query` in production-style code paths (verbose, potentially PII-leaking) | Medium | [lib/prisma.ts:10](lib/prisma.ts#L10) |
| D5 | No input validation library (Zod/Valibot) — body shape trusted | Medium | All route handlers |

### 13.3 Committed Secrets

- [k8s/admin-secret.yaml](k8s/admin-secret.yaml) commits a real-looking Azure Postgres DSN with username `pgadmin` and password `Password!` in plain text inside the Git history. **Treat as compromised: rotate immediately**, then move secrets out of Git (sealed-secrets, External Secrets Operator, Azure Key Vault CSI driver, or `kubectl create secret` outside the repo).

### 13.4 Operational

| # | Issue | Severity |
| --- | --- | --- |
| O1 | No automated tests (unit, integration, e2e) | **Critical** |
| O2 | Pipeline does not run `npm run lint` or `tsc --noEmit` | High |
| O3 | Pipeline mutates cluster directly with `kubectl set image` rather than applying manifests; Git is no longer the source of truth | High |
| O4 | No structured logging, tracing, or metrics; only `console.error` | Medium |
| O5 | Ingress has no TLS configured | High |
| O6 | `pr: none` disables Azure PR validation | Medium |
| O7 | Multiple stale manifests: `ingress-test.yaml`, `admin-lb.yaml`, commented blocks in `admin-service.yaml` and `postgres-deployment.yaml` | Low |
| O8 | `postgres-service.yaml` missing `namespace: nitishk21` | Medium |
| O9 | README is the unchanged create-next-app template | Low |
| O10 | The parallel `/api` Express service is dead code and confuses ownership | Medium |

### 13.5 Frontend Code Quality

- `e: any` in [app/login/page.tsx:10](app/login/page.tsx#L10) — drop `strict` benefits.
- `alert("Invalid username or password")` — UX placeholder.
- POST `/api/login` omits `Content-Type: application/json` — works today because Next parses `req.json()` regardless, but is non-standard.
- No accessibility audit (no `aria-*`, modal lacks focus trap and `role="dialog"`).
- No loading skeleton beyond a single text row.
- No localization scaffold; some strings are visibly placeholder, e.g. "mark this report as test approved" in [app/admin/page.tsx:263](app/admin/page.tsx#L263).

---

## 14. Improvement Recommendations

Ordered by ROI. Treat **Tier 1** as blockers before production.

### Tier 1 — Must do before production

1. **Replace authentication.** Either:
   - Adopt the already-installed `next-auth` (Credentials provider + JWT/Database sessions, `NEXTAUTH_SECRET` set in K8s Secret), **or**
   - Sign your own session cookie with HMAC + rotating secret, store the user in DB, hash passwords with `bcryptjs`.
2. **Authenticate API routes.** Extend middleware matcher to include `/api/reports/:path*` (everything except `/api/health` and `/api/login`), or wrap each handler with a `requireAdmin()` helper.
3. **Rotate the leaked Postgres credentials** and remove [k8s/admin-secret.yaml](k8s/admin-secret.yaml) from Git history. Adopt sealed-secrets / External Secrets / Azure Key Vault CSI.
4. **Add cookie hardening:** `SameSite=Lax` (or `Strict`), `Secure`, an explicit `Max-Age`, and an HMAC signature.
5. **Commit Prisma migrations.** Run `npx prisma migrate dev --name init` and commit `prisma/migrations/`. Without this, `prisma migrate deploy` in the K8s Job has nothing to apply.
6. **Add TLS** to the Ingress (cert-manager + Let's Encrypt).

### Tier 2 — Hardening

7. **Input validation** with `zod`. Define one schema per route and a thin `parse(req)` helper.
8. **Consolidate Prisma client usage** — make every route handler import `prisma` from `@/lib/prisma`.
9. **Pipeline gates** — `npm ci && npm run lint && tsc --noEmit && npm test` before `docker build`. Re-enable PR validation (`pr:` blocks).
10. **GitOps the deploy** — replace `kubectl set image` with `kubectl apply -k k8s/` (Kustomize overlays) or Argo CD, and stamp `image:` tags through Kustomize, not the cluster.
11. **Add structured logging** (`pino`) and a request-id middleware; remove the `log: ["query"]` Prisma flag in production.
12. **Add CSRF protection** on POST/PATCH (double-submit cookie or origin check).
13. **Add rate limiting** on `/api/login` (Redis token bucket or `@upstash/ratelimit`).

### Tier 3 — Quality & DX

14. **Tests:** Vitest + Playwright. Start with `lib/auth`, the two `/api/reports` handlers, and a login → approve happy path.
15. **Extract shared UI** (`components/DataTable`, `ConfirmModal`, `StatusPill`, `PageShell`); move `formatDate` to `lib/format.ts`.
16. **Shared types** in `lib/types.ts` (or generate from Prisma) — drop the duplicate `Report` declaration in the admin page.
17. **Delete dead deps**: `axios`, and remove the unused `/api` Express service (or document it).
18. **Repo hygiene**: delete `k8s/ingress-test.yaml`, decide between Ingress and `admin-lb.yaml`, normalize all manifests to namespace `nitishk21`, drop commented-out alternatives.
19. **Replace `alert()` and `console.error`** with a toast/notification component.
20. **Accessibility pass** — modal `role="dialog"` + `aria-modal`, focus trap, `aria-labelledby`, keyboard close (`Esc`).
21. **Replace** `Arial, Helvetica` in `globals.css` with `var(--font-geist-sans)` to actually use the loaded font.
22. **Write a real [README.md](README.md)**: prerequisites, env file, `docker compose up`, `prisma migrate dev`, default creds (until replaced), deploy flow.
23. **Add `.env.example`** with `DATABASE_URL`, `NEXTAUTH_SECRET`, etc.

---

## 15. Coding Patterns Observed

- **Server vs Client split**: Pages that need browser APIs / state are `"use client"`; the root redirect is a server component using `redirect()` from `next/navigation`.
- **Route Handlers** (`app/api/**/route.ts`) for backend logic, returning `NextResponse.json(...)`.
- **Dynamic route param** is correctly `await`-ed: `const { id } = await context.params` ([app/api/reports/[id]/route.ts:11](app/api/reports/[id]/route.ts#L11)) — matches Next 15+ async params API.
- **`cache: "no-store"`** in the client fetch to bypass Next's default fetch caching.
- **Path alias** `@/* → ./*` is used (e.g. `@/lib/auth`, `@/lib/prisma`).
- **Tailwind utility-only** styling, no `@apply` or component CSS.
- **Defensive parsing**: the admin page asserts `Array.isArray(data)` before `.map()` to avoid a runtime crash on a malformed API response.

### Anti-patterns

- `e: any` event types.
- Inline `alert()` for error UX.
- Per-route `new PrismaClient()` (see D1).
- Duplicated types between client and server.
- Mixed inline conditional styling (`${cond ? 'opacity-40 cursor-not-allowed bg-green-200' : 'bg-green-500 hover:bg-green-600 text-white'}`) that should be extracted.

---

## 16. Developer Onboarding Guide

### 16.1 Prerequisites

- **Node.js ≥ 20.9.0** (`engines` in [package.json](package.json)).
- **Docker** + **Docker Compose** (for the Postgres devdb).
- **(Optional)** MicroK8s/kubectl + an SSH key if you need to touch deployment.

### 16.2 First-time setup

```bash
git clone <repo>
cd admin_application

# 1. Install dependencies
npm install

# 2. Create .env (no .env.example exists yet — copy this minimal template)
cat > .env <<'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthvault
EOF

# 3. Start Postgres (the docker-compose-devdb.yml also starts the app — pick one)
docker compose -f docker-compose-devdb.yml up -d db

# 4. Generate Prisma client and create the schema
#    NOTE: prisma/migrations/ does not exist yet — see Tier 1 #5.
npx prisma generate
npx prisma db push          # for first run, until migrations are committed

# 5. Run the dev server
npm run dev
```

Visit http://localhost:3000 → redirected to `/login` → use **`admin` / `admin`** (until auth is replaced).

### 16.3 Running everything in Docker

```bash
docker compose -f docker-compose-devdb.yml up --build
```

### 16.4 Common tasks

| Task | Command |
| --- | --- |
| Lint | `npm run lint` |
| Type-check | `npx tsc --noEmit` (not in `package.json` yet) |
| Open Prisma Studio | `npx prisma studio` |
| Reset DB | `npx prisma migrate reset` |
| Production build (locally) | `npm run build && npm start` |
| Build prod image | `docker build -t healthvault-admin:local .` |

### 16.5 Mental model for new contributors

- This is a **thin Next.js dashboard** over a single Postgres table.
- All UI lives in two pages: `app/login/page.tsx` and `app/admin/page.tsx`.
- All server logic lives in `app/api/**/route.ts` plus `lib/`.
- If you're touching auth, **read [§8](#8-authentication--authorization-flow) and [§13.1](#131-authentication--authorization) first** — there is a known-broken model in place and replacement work is needed.
- The `api/` directory (Express) is **not** part of the running app today. Confirm with the team before extending it.
- The K8s manifests target a specific MicroK8s VM under namespace `nitishk21`. Use the dev compose for daily work.

### 16.6 Suggested first PRs (good ways to learn the codebase)

1. Add a `.env.example` and update README to describe local setup.
2. Move the duplicated `Report` type into `lib/types.ts`.
3. Switch [app/api/reports/route.ts](app/api/reports/route.ts) to import the singleton `prisma` from `@/lib/prisma`.
4. Add a Zod schema for the PATCH body and reuse it on the client.
5. Add a `typecheck` npm script: `"typecheck": "tsc --noEmit"`.

---

## 17. Quick Reference — File Map

| Concern | Read these files |
| --- | --- |
| Routing & pages | [app/layout.tsx](app/layout.tsx), [app/page.tsx](app/page.tsx), [app/login/page.tsx](app/login/page.tsx), [app/admin/page.tsx](app/admin/page.tsx) |
| API | [app/api/health/route.ts](app/api/health/route.ts), [app/api/login/route.ts](app/api/login/route.ts), [app/api/logout/route.ts](app/api/logout/route.ts), [app/api/reports/route.ts](app/api/reports/route.ts), [app/api/reports/[id]/route.ts](app/api/reports/[id]/route.ts) |
| Auth | [lib/auth.ts](lib/auth.ts), [middleware.ts](middleware.ts) |
| Data | [lib/prisma.ts](lib/prisma.ts), [prisma/schema.prisma](prisma/schema.prisma), [prisma.config.ts](prisma.config.ts) |
| Build config | [next.config.ts](next.config.ts), [tsconfig.json](tsconfig.json), [eslint.config.mjs](eslint.config.mjs), [postcss.config.mjs](postcss.config.mjs), [app/globals.css](app/globals.css) |
| Container | [Dockerfile](Dockerfile), [Dockerfile.dev](Dockerfile.dev), [docker-compose.dev.yml](docker-compose.dev.yml), [docker-compose-devdb.yml](docker-compose-devdb.yml), [docker-compose.prod.yml](docker-compose.prod.yml) |
| Kubernetes | [k8s/](k8s/) |
| CI/CD | [azure-pipelines.yml](azure-pipelines.yml) |
| Legacy/parallel | [api/](api/) |

---

## 18. Open Questions for the Team

1. Is the [api/](api/) Express service still owned by anyone, or is it safe to delete?
2. Is the deployment target the **in-cluster Postgres StatefulSet** ([k8s/postgres-deployment.yaml](k8s/postgres-deployment.yaml)) or the **Azure Postgres Flexible Server** referenced by [k8s/admin-secret.yaml](k8s/admin-secret.yaml)?
3. Is `next-auth` planned (deps installed, env vars wired) but not finished — should we complete that migration?
4. Should the Ingress or the LoadBalancer Service be the canonical entry point? Only one should exist.
5. Who currently owns the MicroK8s VM and the DockerHub `nitishk21` account?
6. Are `prisma/migrations/` files held outside Git, or has the schema only ever been applied via `db push` / manual SQL?
