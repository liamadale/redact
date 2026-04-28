# Getting Started with Redact

This guide walks you through setting up a local Redact instance and running your first secrets scan.

## Prerequisites

| Tool | Minimum Version | Install |
|---|---|---|
| Docker | 20.10+ | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| Docker Compose | v2+ (bundled with Docker Desktop) | Included with Docker Desktop |
| Git | 2.x | [git-scm.com](https://git-scm.com/) |

Verify your setup:

```bash
docker --version
docker compose version
git --version
```

### Hardware

- ~4 GB free RAM (PostgreSQL, Redis, backend, worker, and frontend all run simultaneously)
- ~3 GB disk for container images on first build

### Ports

Redact binds to these local ports:

| Port | Service |
|---|---|
| 80 | Nginx (reverse proxy) |
| 3000 | Frontend (React dev) |
| 8000 | Backend API (FastAPI) |
| 5432 | PostgreSQL |
| 6379 | Redis |

Make sure none of these are in use before starting.

## Setup

### Option A: Automated (recommended)

```bash
git clone https://github.com/liamadale/redact.git
cd redact
./setup.sh
```

The script checks prerequisites, creates your `.env`, builds all containers, and waits for the backend to become healthy. When it finishes you'll see the dashboard URL.

### Option B: Manual

```bash
# Clone
git clone https://github.com/liamadale/redact.git
cd redact

# Create environment file
cp .env.example .env
# Generate a random session secret (or set your own)
sed -i "s/change-me-to-a-random-string/$(openssl rand -hex 32)/" .env

# Build and start
docker compose up -d --build
```

The backend container automatically waits for PostgreSQL and runs database migrations on startup — no manual migration step needed.

### Verify

```bash
# Backend health check
curl http://localhost:8000/health
# → {"status":"ok"}

# Open the dashboard
open http://localhost:3000    # macOS
xdg-open http://localhost:3000  # Linux
```

## Your First Scan

### 1. Open the dashboard

Navigate to [http://localhost:3000](http://localhost:3000). You'll see the landing page with a scan form.

### 2. Choose a target

- **Org / User** — scans all public repos under a GitHub organization or user account (e.g., `trufflesecurity`)
- **Repo** — scans a single public repo in `owner/repo` format (e.g., `trufflesecurity/test_keys`)

> **Note:** Redact only scans public repositories. Private repos are rejected before any scan is queued.

### 3. Choose a scan type

| Type | What it does | Speed |
|---|---|---|
| **Quick Scan** | Uses the GitHub Search API to find files matching known secret patterns. No clone required. | Fast (seconds) |
| **Deep Scan** | Clones the repo and runs TruffleHog across the full git history, all branches. Detects secrets that were committed and later removed. | Slower (depends on repo size) |

For your first scan, try a **Quick Scan** on `trufflesecurity` — it's the TruffleHog maintainer's org and has test repos with intentionally seeded secrets.

### 4. Monitor progress

After clicking **Run**, you're taken to the scan view. Progress updates stream in real-time via SSE:

- **Queued** → scan is waiting for a worker
- **Running** → repos are being scanned (progress bar shows repos completed)
- **Completed** → all repos processed

### 5. Review findings

Once complete, findings are listed with:

- **Severity** — critical (verified secrets), high, medium, low
- **Secret type** — AWS key, GitHub token, private key, etc.
- **File path and commit** — where the secret was found
- **Redacted preview** — first 4 characters + masked remainder

Click any finding to see its detail page, including NIST 800-53 and DISA STIG compliance mappings.

### 6. Generate a report

From the scan view, click **Report** to access:

- **PDF report** — compliance-mapped findings with NIST/STIG controls, suitable for auditors
- **JSON export** — machine-readable findings for integration with other tools

Reports can be filtered by severity and repository.

## GitHub Token (Optional)

Without a token, GitHub API rate limits are low (10 requests/min unauthenticated). For org scans with many repos, add a personal access token:

1. Create a token at [github.com/settings/tokens](https://github.com/settings/tokens) — no scopes needed (public repo access only)
2. Add it to your `.env`:
   ```
   GITHUB_TOKEN=ghp_your_token_here
   ```
3. Restart the backend: `docker compose restart backend`

The token is used for GitHub API calls only (repo listing, search). It is never passed to `git clone`, never stored in the database, and never sent to Celery workers.

## Configuration

All settings are in `.env`. Key options:

| Variable | Default | Description |
|---|---|---|
| `MAX_CONCURRENT_SCANS` | `3` | Number of repos scanned in parallel |
| `MAX_REPO_SIZE_MB` | `500` | Skip repos larger than this |
| `SCAN_TIMEOUT_SECONDS` | `300` | Per-repo timeout for deep scans |

See [`.env.example`](../.env.example) for the full list.

## Common Commands

```bash
# View logs (all services)
docker compose logs -f

# View logs for a specific service
docker compose logs -f worker

# Stop all services
docker compose down

# Stop and remove all data (database, volumes)
docker compose down -v

# Rebuild after code changes
docker compose up -d --build
```

## Troubleshooting

### "Port X is already in use"

Another process is using one of the required ports. Find it:

```bash
lsof -i :8000   # replace with the conflicting port
```

Stop the conflicting process, or change the port mapping in `docker-compose.yml`.

### Backend never becomes healthy

Check the backend logs:

```bash
docker compose logs backend
```

Common causes:
- **PostgreSQL not ready** — the backend entrypoint retries automatically, but if the DB container failed to start, check `docker compose logs db`
- **Migration error** — if the schema is out of date, the backend runs `alembic upgrade head` on startup. Check for migration conflicts in the logs.

### Scan stuck in "queued"

The worker may not be running:

```bash
docker compose logs worker
```

If the worker crashed, restart it: `docker compose restart worker`

### "Private repositories are not supported"

Redact only scans public repositories. If you entered a private repo or an org that has no public repos, you'll see this error. This is by design.

### Deep scan is slow

Deep scans clone the full git history. Large repos with long histories take longer. You can:
- Reduce `SCAN_TIMEOUT_SECONDS` to skip repos that take too long
- Use Quick Scan first to triage, then Deep Scan specific repos

### Container build fails

First build downloads base images and installs dependencies (~3 GB). Ensure you have enough disk space and a stable internet connection. If a build fails partway:

```bash
docker compose build --no-cache
```
