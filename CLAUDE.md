# Redact — AI Coding Guidelines

> This file is read at the start of every AI coding session. Keep it concise.
> See `implementation-plan.md` for full project details.

## Project Overview

Redact is a web-based git secrets auditor. It scans GitHub orgs/repos for leaked secrets using a two-phase approach (GitHub Search API triage → TruffleHog deep scan) and presents results in a React dashboard with NIST 800-53 / DISA STIG compliance-mapped PDF reports.

## Tech Stack

- **Backend:** Python 3.12, FastAPI, Celery + Redis, PostgreSQL, Alembic
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, Recharts
- **Scanner:** TruffleHog CLI (called as subprocess from Celery worker — never imported as a library)
- **Infra:** Docker Compose (6 services: frontend, backend, worker, beat, redis, db)

## Commands

```bash
# Start all services
docker compose up -d

# Backend tests
cd backend && pytest tests/ -v --tb=short

# Frontend tests
cd frontend && npm test -- --run

# Lint
cd backend && ruff check .
cd frontend && npm run lint

# Type check
cd frontend && npx tsc --noEmit

# DB migrations
cd backend && alembic upgrade head

# Format
cd backend && ruff format .
cd frontend && npm run format
```

## Pre-commit Checks

Always run `ruff check .` before committing Python changes. Fix all errors — no `noqa` unless the violation is unavoidable (e.g., Alembic `env.py` import ordering).

## Code Style

### Python (Backend)
- Use `ruff` for linting and formatting
- Type hints on all function signatures — no `Any` unless unavoidable
- Async functions for all FastAPI route handlers
- Use Pydantic models for request/response schemas
- SQLAlchemy ORM for DB access — no raw SQL strings
- Secrets are NEVER logged or stored in plaintext. Use `raw_secret_hash` (SHA256) for dedup. Display only first 4 chars + mask in UI/logs.

### TypeScript (Frontend)
- Strict TypeScript — no `any` types
- Functional components only, no class components
- TanStack Query for all API calls — no raw `fetch` in components
- Zustand for global state (scan status, SSE connection, filters)
- Tailwind for styling — no inline styles or CSS modules
- Tokyo Night color palette (see `tailwind.config.ts` theme)

### General
- No hardcoded secrets, API keys, or credentials anywhere — use environment variables via `.env`
- All user-facing text must redact secrets (first 4 chars + `████████`)
- Prefer early returns over nested conditionals
- Keep functions under 50 lines — extract helpers

## Architecture Rules

- TruffleHog is called via `subprocess.Popen` only — never import it as a Python library (AGPL license)
- GitHub PATs are stored in-memory (session) only — never persisted to the database
- All scans are scoped to `session_id` — no cross-session data leakage
- Celery workers publish scan progress to Redis pub/sub channels (`scan:{scan_id}`)
- FastAPI streams progress to frontend via SSE (`GET /scans/{id}/stream`)
- Platform adapters (`GitHubAdapter`, etc.) handle all API interaction — route handlers never call GitHub directly

## File Structure

```
redact/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + routes
│   │   ├── adapters/            # Platform adapters (github.py, etc.)
│   │   ├── scanner/             # TruffleHog wrapper, enrichment, dedup
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── reports/             # PDF generation (Jinja2 + WeasyPrint)
│   │   └── worker.py            # Celery tasks
│   ├── alembic/                 # DB migrations
│   ├── tests/
│   │   └── fixtures/            # Bare git repos with seeded secrets
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   ├── pages/               # Route pages (Landing, Dashboard, Finding, Report, Metrics)
│   │   ├── hooks/               # Custom hooks (useSSE, useScan, etc.)
│   │   ├── stores/              # Zustand stores
│   │   └── lib/                 # API client, utils, types
│   └── package.json
├── terraform/                   # AWS deployment configs (not deployed)
├── docker-compose.yml
├── .github/workflows/ci.yml
├── CLAUDE.md                    # This file
└── .env.example
```

## Testing

- Backend: `pytest` with `TestClient` for API smoke tests, mocked `subprocess` for TruffleHog, fixture bare repos in `tests/fixtures/`
- Frontend: Vitest + React Testing Library for component rendering and data display
- Run single test files, not the full suite, during development for speed
- Always run the relevant tests after making changes — don't wait for CI

## Git Workflow

- Branch from `develop`, PR into `develop`, merge `develop` → `main` for releases
- Branch naming: `feature/{short-description}`, `fix/{short-description}`, `docs/{short-description}`
- CI must pass before merge — no force-pushing to `main` or `develop`
- Never commit `.env` files — only `.env.example`

### Commit Messages

Use **Conventional Commits** format. Every commit message must follow this structure:

```
<type>(<optional scope>): <short description>
```

Types:
- `feat:` — new feature or functionality
- `fix:` — bug fix
- `docs:` — documentation only
- `style:` — formatting, missing semicolons, etc. (no code change)
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `test:` — adding or updating tests
- `chore:` — build process, CI, dependencies, tooling
- `perf:` — performance improvement

Examples:
```
feat(scanner): add quick scan via GitHub Search API
fix(worker): handle TruffleHog timeout without losing partial results
docs: add STRIDE threat model document
chore(ci): add Trivy container scanning to pipeline
test(api): add smoke tests for scan endpoints
refactor(adapters): extract rate limit backoff into shared utility
```

Rules:
- Lowercase everything — no capital letters in type, scope, or description
- Imperative mood: `add`, `fix`, `update` — not `added`, `fixes`, `updated`
- No period at the end
- Keep the first line under 72 characters
- Add a body (separated by blank line) only if the "why" isn't obvious from the description

### AI Attribution

- IMPORTANT: Do NOT add "Co-authored-by", "Generated by", or any AI tool attribution to commit messages. Commits should look like they were written by the team member whose git config is active. No "🤖" emoji, no "AI-assisted", no tool names in commit messages or PR descriptions.

## Common Gotchas

- `alembic upgrade head` must be run after pulling if anyone changed the schema — the app won't start with stale migrations
- The worker container needs `git` installed (for cloning repos) — it's in the Dockerfile but easy to miss if rebuilding from scratch
- TruffleHog outputs one JSON object per line (JSONL), not a JSON array — parse line by line
- GitHub Search API rate limit is 30 req/min (authenticated) — the adapter handles backoff, don't add your own
- SSE connections drop silently — the frontend must fall back to polling `GET /scans/{id}` if EventSource errors
- `proc.stdout` iteration in the TruffleHog wrapper blocks until the process exits or is killed — timeout is enforced via `threading.Timer`, not `proc.wait()`

## Security Boundaries

- IMPORTANT: Never display, log, or store full secret values. Always redact.
- IMPORTANT: Redact scans **public repositories only**. The `GitHubAdapter` must check `repo.is_private` and reject private repos before any scan job is queued. Error: `"Private repositories are not supported."` This applies everywhere — org listings, manual repo entry, auto-PR — no exceptions.
- IMPORTANT: Never pass `--only-verified` to TruffleHog. It only filters output — it does not prevent live verification API calls, which TruffleHog makes by default for all supported detectors. Use TruffleHog's native `Verified` field in JSON output to set `verified=True` and `severity='critical'` on findings.
- IMPORTANT: `raw_detector_output` must have `Raw` and `RawV2` fields removed before INSERT — these contain the plaintext secret. Keep `ExtraData` (contains useful metadata like AWS account ID).
- IMPORTANT: Cloned repos must be deleted after scanning — use `finally` blocks. The worker startup hook and Celery Beat task clean up orphans.
- IMPORTANT: GitHub PATs are used for GitHub API calls (rate limits) only — never passed to `git clone` (public repos need no credentials) and never passed to Celery workers. In-memory FastAPI session only.
- IMPORTANT: `session_id` in the DB is stored as `SHA256(raw_session_token)` — never the raw token.

## When Compacting Context

When compacting, always preserve:
- The full list of modified files
- Any test commands that were run and their results
- The current task/feature being worked on
- Any errors or bugs being debugged
