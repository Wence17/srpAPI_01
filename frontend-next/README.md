# Sub2API Next.js Scaffold

This folder contains a Next.js + TypeScript + Tailwind scaffold for the Sub2API frontend.

## What is included

- Next.js app router structure
- all frontend routes mapped from the existing Vue router
- route metadata and path placeholders
- a shared page shell for consistent layout
- `/admin` redirect support
- dynamic pages for `/legal/[documentId]` and `/custom/[id]`

## How to run

```bash
cd frontend-next
npm install
npm run dev
```

## Notes

This scaffold preserves all frontend route paths and page metadata, but it currently contains placeholder pages for migration. The next step is to port each UI component and store implementation from the original Vue frontend into React.
If you prefer manual setup:

# 1. Clone the repository
git clone https://github.com/Wei-Shaw/sub2api.git
cd sub2api/deploy

# 2. Copy environment configuration
cp .env.example .env

# 3. Edit configuration (generate secure passwords)
nano .env
Required configuration in .env:

# PostgreSQL password (REQUIRED)
POSTGRES_PASSWORD=your_secure_password_here

# JWT Secret (RECOMMENDED - keeps users logged in after restart)
JWT_SECRET=your_jwt_secret_here

# TOTP Encryption Key (RECOMMENDED - preserves 2FA after restart)
TOTP_ENCRYPTION_KEY=your_totp_key_here

# Optional: Admin account
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_admin_password

# Optional: Custom port
SERVER_PORT=8080
Generate secure secrets:

# Generate JWT_SECRET
openssl rand -hex 32

# Generate TOTP_ENCRYPTION_KEY
openssl rand -hex 32

# Generate POSTGRES_PASSWORD
openssl rand -hex 32
# 4. Create data directories (for local version)
mkdir -p data postgres_data redis_data

# 5. Start all services
# Option A: Local directory version (recommended - easy migration)
docker compose -f docker-compose.local.yml up -d

# Option B: Named volumes version (simple setup)
docker compose up -d

# 6. Check status
docker compose -f docker-compose.local.yml ps

# 7. View logs
docker compose -f docker-compose.local.yml logs -f sub2api