# Redact

> *"What you should have done before committing."*

Web-based security auditing tool that scans GitHub organizations and repositories for accidentally committed secrets — API keys, tokens, passwords, private keys, and other credentials. Provides a dashboard with timeline visualization, compliance-mapped PDF reports (NIST 800-53, DISA STIG), and organization-wide scanning with per-repo drill-down.

## Architecture

```
Browser → Nginx → FastAPI Backend → Celery Worker (TruffleHog) → PostgreSQL
                                  → Redis (broker + SSE pub/sub)
```

**Two-phase scanning:**
1. **Quick Scan** — GitHub Search API triage for known secret patterns (fast, no clone)
2. **Deep Scan** — Full git history scan via TruffleHog (clone + `--all-branches`)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI |
| Scanner | TruffleHog (subprocess) |
| Task Queue | Celery + Redis |
| Database | PostgreSQL |
| PDF Reports | WeasyPrint + Jinja2 |
| Containers | Docker Compose |
| Reverse Proxy | Nginx |

## Project Structure

```
├── backend/          # FastAPI application
│   ├── app/
│   │   ├── adapters/     # Platform adapters (GitHub, future: GitLab)
│   │   ├── scanning/     # Scan orchestration + TruffleHog wrapper
│   │   ├── reports/      # PDF/compliance report generation
│   │   └── models/       # SQLAlchemy models
│   ├── tests/
│   └── alembic/          # Database migrations
├── frontend/         # React + Vite + Tailwind
├── worker/           # Celery worker (includes TruffleHog binary)
├── nginx/            # Reverse proxy config
├── terraform/        # IaC configs (AWS — not deployed)
├── docs/             # STRIDE threat model, cloud arch, write-ups
└── .github/workflows/  # CI/CD pipeline
```

## Quick Start

```bash
git clone https://github.com/liamadale/redact.git
cd redact
./setup.sh
```

The setup script checks prerequisites, creates your `.env`, builds all containers, and opens the dashboard at [http://localhost:3000](http://localhost:3000).

For a detailed walkthrough — including running your first scan, understanding findings, and generating compliance reports — see the **[Getting Started Guide](docs/getting-started.md)**.

## Environment Variables

See [`.env.example`](.env.example) for all configuration options. Key variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://redact:redact@db:5432/redact` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379/0` |
| `SESSION_SECRET_KEY` | Secret for session encryption | *(must be set)* |
| `MAX_CONCURRENT_SCANS` | Celery worker concurrency | `3` |
| `SCAN_TIMEOUT_SECONDS` | Per-repo scan timeout | `300` |
| `GITHUB_TOKEN` | Optional PAT for higher rate limits | *(none)* |

## CI/CD Pipeline

The GitHub Actions pipeline includes:

- **Test** — Backend (pytest) + Frontend (Vitest)
- **SAST** — Bandit + Semgrep
- **SCA** — pip-audit + npm audit
- **Secrets** — TruffleHog on our own repo
- **IaC** — Checkov on Terraform configs
- **Container** — Docker build + Trivy scan

## AI Disclosure

This project uses AI-assisted development tools (including Claude and GitHub Copilot) for code generation, documentation, and development workflows. All AI-generated output is reviewed and validated by the team before being committed. See [`CLAUDE.md`](CLAUDE.md) for AI coding guidelines.

## License

[MIT](LICENSE)
