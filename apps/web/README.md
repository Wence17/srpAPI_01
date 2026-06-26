# Sub2API Web (Next.js)

Next.js frontend for Sub2API. Part of the monorepo at the repository root.

## Structure

```
sub2api/
├── apps/
│   ├── web/     ← this app (Next.js UI)
│   └── api/     ← Go API + gateway
└── deploy/      ← Docker Compose
```

## How to run (recommended)

From the **repository root**:

```bash
npm install
npm run dev
```

This starts Postgres + Redis (Docker), the Go API on `:8080`, and Next.js on `:3000`.

### Run individually

```bash
npm run dev:infra    # Postgres + Redis only (Docker)
npm run dev:apps     # Next.js + Go API (needs DB/Redis running)
npm run dev:web      # Next.js only (set BACKEND_URL for remote API)
npm run dev:api      # Go API only (needs config.yaml + DB)
```

## First-time API setup
1. Copy `deploy/config.example.yaml` → `apps/api/config.yaml` and set DB/Redis 
to `localhost`.
<!-- Copy `deploy/config.example.yaml` → `apps/api/config.yaml` and set DB/Redis to `127.0.0.1`. -->
2. Or use Docker full stack: `npm run dev:docker`
3. If setup is needed, visit `/setup` and create the admin account.

## Environment

Set `BACKEND_URL` in `apps/web/.env.local` to override the API proxy target (default `http://localhost:8080`).

## Notes

- API requests proxy to Go via `next.config.mjs` rewrites (`/api`, `/v1`, `/setup` → `BACKEND_URL`).
- Production Docker runs the API (`:8080`) and Next.js (`:3000`) as separate services.
