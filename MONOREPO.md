# Sub2API Monorepo

```
sub2api/
├── .env.example          # Unified env template (copy → .env at repo root)
├── apps/
│   ├── web/              # Next.js UI (primary)
│   └── api/              # Go API + AI gateway
├── deploy/               # Docker Compose
└── package.json          # Root dev orchestration
```

## Quick start (local dev)

```bash
# 1. Configure environment (never commit .env)
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, JWT_SECRET, etc.

# 2. Configure Go API (first time only)
copy deploy\config.example.yaml apps\api\config.yaml
# Set database.host=localhost, redis.host=localhost

# 3. Install and run
npm install
npm run dev
```

- **Web UI:** http://localhost:3000  
- **API:** http://localhost:8080  
- **Infra:** Postgres + Redis via Docker (`npm run dev:infra`)

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Infra (Docker) + Next.js + Go API |
| `npm run dev:apps` | Next.js + Go API only (native Postgres/Redis) |
| `npm run dev:web` | Next.js only |
| `npm run dev:api` | Go API only |
| `npm run dev:infra` | Postgres + Redis (uses root `.env`) |
| `npm run dev:docker` | Full stack in Docker (API + Web + DB) |
| `npm run build:web` | Production Next.js build |

## Environment variables

All secrets and deployment config live in **one root `.env`** (from `.env.example`).

- **Never commit `.env`**
- **Never put secrets in `NEXT_PUBLIC_*`** (Next.js exposes those to the browser)
- Server secrets (JWT, DB password, OAuth) belong in `.env` or `apps/api/config.yaml`
- `deploy/.env.example` is a pointer — use the root `.env.example`

## Docker production layout

| Service | Image / build | Port |
|---------|---------------|------|
| `sub2api` | Root `Dockerfile` (Go API only) | 8080 |
| `web` | `apps/web/Dockerfile` (Next standalone) | 3000 |

Use the UI at **`:3000`**; the API and gateway remain on **`:8080`**.

> The legacy Vue `frontend/` folder remains on the `main` branch for reference. This branch (`migration`) uses `apps/web` only.
