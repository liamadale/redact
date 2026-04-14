# Redact — Implementation Plan

> *"What you should have done before committing."*

**Course:** SEC460 — DevSecOps  
**Team Size:** 3  
**Timeline:** April 13 – June 19, 2026 (~9 weeks)  
**Presentation Window:** June 8–19, 2026  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Scanning Engine Design](#3-scanning-engine-design)
4. [Frontend & UI](#4-frontend--ui)
5. [Compliance Report Generation](#5-compliance-report-generation)
6. [DevSecOps Pipeline (Module Mapping)](#6-devsecops-pipeline-module-mapping)
7. [Responsible Disclosure Process](#7-responsible-disclosure-process)
8. [Demo Strategy](#8-demo-strategy)
9. [Sprint Plan & Milestones](#9-sprint-plan--milestones)
10. [Testing Strategy](#10-testing-strategy)
11. [Risk Register](#11-risk-register)
12. [References & Resources](#12-references--resources)

---

## 1. Project Overview

### What is Redact?

Redact is a web-based security auditing tool that scans GitHub organizations and repositories for accidentally committed secrets — API keys, tokens, passwords, private keys, and other credentials. It provides:

- A polished web dashboard with timeline visualization of when secrets were committed
- Organization-wide scanning with per-repo drill-down
- A combined quick-scan (GitHub Search API) + deep-scan (clone + TruffleHog) approach
- Compliance-mapped PDF reports framing findings against NIST 800-53 and DISA STIG controls
- Platform-agnostic architecture designed for GitHub first, extensible to GitLab/Bitbucket

### What Makes Redact Different from Existing Tools?

| Existing Tool | What It Does | What Redact Adds |
|---|---|---|
| TruffleHog | CLI scanner with verification | Web UI, timeline, org dashboard, compliance reports |
| GitLeaks | Fast CLI regex scanner | Same as above |
| GitGuardian | Commercial SaaS with dashboard | Free/open-source, self-hosted, compliance mapping |
| GitHub Secret Scanning | Built-in alerts for known formats | Cross-org view, historical timeline, STIG/NIST reports |

Redact wraps TruffleHog as the scanning backend and focuses effort on the presentation layer, compliance mapping, and user experience.

---

## 2. Architecture & Tech Stack

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User's Browser                       │
│                  React Frontend (Vite)                    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│                   Nginx Reverse Proxy                    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Python Backend (FastAPI)                     │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Scan Manager │  │ Report Engine │  │ Platform       │  │
│  │ (orchestrate │  │ (PDF gen,     │  │ Adapters       │  │
│  │  TruffleHog) │  │  compliance)  │  │ (GitHub first, │  │
│  └──────┬──────┘  └──────────────┘  │  GitLab later) │  │
│         │                            └────────────────┘  │
└─────────┼────────────────────────────────────────────────┘
          │ subprocess
┌─────────▼────────────────────────────────────────────────┐
│              TruffleHog CLI (binary)                      │
│         Called as subprocess, JSON output parsed          │
└──────────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────┐
│              PostgreSQL Database                          │
│  Scan results, user sessions, org/repo metadata          │
└──────────────────────────────────────────────────────────┘
```

### Tech Stack Decisions

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | You have React experience; Vite is fast; Tailwind for rapid UI |
| Backend | Python + FastAPI | Team knows Python; FastAPI is async, fast, auto-generates OpenAPI docs |
| Scanner | TruffleHog (CLI, subprocess) | Most mature scanner; 800+ detectors; live verification; called via subprocess to avoid AGPL copyleft |
| Database | PostgreSQL | Robust, free, handles JSON well for scan results |
| PDF Reports | WeasyPrint or ReportLab | Python-native PDF generation from HTML/CSS templates |
| Containerization | Docker Compose | Simple multi-container orchestration; no need for K8s at this scale |
| Reverse Proxy | Nginx | TLS termination, static file serving, rate limiting |
| Task Queue | Celery + Redis | Background scan jobs so the UI doesn't block |

### Docker Compose Services

```yaml
services:
  frontend:       # React app served by Nginx
  backend:        # FastAPI application
  worker:         # Celery worker for background scans (includes TruffleHog binary)
  redis:          # Message broker for Celery + SSE pub/sub
  db:             # PostgreSQL
```

> **Note:** TruffleHog is installed directly in the `worker` Docker image (multi-stage build: download the TruffleHog release binary in the build stage, copy into the runtime stage). No separate sidecar container — the worker calls `trufflehog` as a local subprocess. This is simpler than a shared-volume sidecar and avoids cross-container process coordination.

### Platform Adapter Pattern

To support GitHub now and GitLab/Bitbucket later, the backend uses an adapter interface with concrete type definitions:

```python
from dataclasses import dataclass
from abc import ABC, abstractmethod

@dataclass
class Repo:
    name: str
    full_name: str          # e.g., "acme-corp/backend-api"
    clone_url: str
    default_branch: str
    size_kb: int
    is_private: bool
    last_pushed_at: str     # ISO 8601

@dataclass
class SearchHit:
    repo: Repo
    file_path: str
    matched_pattern: str    # which pattern triggered the hit
    text_fragment: str      # surrounding code context (redacted)
    html_url: str           # link to file on GitHub

class PlatformAdapter(ABC):
    @abstractmethod
    async def list_repos(self, org: str) -> list[Repo]: ...

    @abstractmethod
    async def get_clone_url(self, repo: Repo) -> str: ...

    @abstractmethod
    async def search_code(self, org: str, patterns: list[str]) -> list[SearchHit]:
        """Run multiple pattern searches against an org.
        The adapter handles looping, rate limiting, and deduplication internally.
        Callers pass the full pattern list; the adapter queues and throttles."""
        ...

class GitHubAdapter(PlatformAdapter): ...
# class GitLabAdapter(PlatformAdapter): ...  # Future
# class BitbucketAdapter(PlatformAdapter): ...  # Future
```

### Authentication & Token Storage

Redact is a single-user, session-based tool — no user accounts or registration.

**GitHub PAT handling:**
- User pastes a GitHub Personal Access Token on the landing page
- Token is stored **in-memory only** in the FastAPI session (server-side, encrypted session cookie)
- Token is **never written to the database** or logged
- Token is passed to the `GitHubAdapter` per-request and to `git clone` via environment variable
- Session expires after 2 hours of inactivity; token is discarded
- If no token is provided, Redact falls back to unauthenticated requests (60 req/hr — barely usable, but functional for a single-repo scan)
- **Stretch — Auto-PR Remediation:** If the user opts in to automated PR creation (see Section 4), the PAT requires `public_repo` scope (or full `repo` for private repos). This elevated scope is only requested when the feature is enabled. Without it, Redact operates read-only

**Why no user accounts:**
- Avoids building auth infrastructure for a 9-week project
- Avoids storing sensitive tokens in the DB (which would be ironic for a secrets scanner)
- Single-user is sufficient for the demo and class use case

**Scan scoping:**
- All scans are tied to the session that initiated them via `session_id` on the `scans` table
- No cross-session data leakage — each session only sees its own scan results
- On session expiry, scan data persists in the DB (for report generation) but the token is gone

---

## 3. Scanning Engine Design

### Two-Phase Scanning Approach

#### Phase 1: Quick Scan (GitHub Search API Triage)

Fast, zero-storage scan that identifies repos with obvious secret patterns.

**How it works:**
1. User enters a GitHub org name or username
2. Backend hits `GET /search/code?q={pattern}+org:{orgname}` for each known pattern
3. Patterns searched: `AKIA`, `sk_live_`, `sk_test_`, `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN OPENSSH PRIVATE KEY-----`, `ghp_`, `gho_`, `glpat-`, `xoxb-`, `xoxp-`, common password assignment patterns
   - Pattern sources: [TruffleHog detector list](https://github.com/trufflesecurity/trufflehog/tree/main/pkg/detectors), [GitGuardian State of Secrets Sprawl 2026](https://www.gitguardian.com/state-of-secrets-sprawl-report-2025) (top leaked secret types), [GitHub Secret Scanning partner patterns](https://docs.github.com/en/code-security/secret-scanning/introduction/supported-secret-scanning-patterns)
4. Results displayed immediately in the UI as a "triage view"
5. User can then trigger a deep scan on specific repos

**Rate limit handling:**
- Authenticated requests: 30 requests/minute for Search API
- Queue searches with backoff
- Cache results for 1 hour

**Limitations (shown to user):**
- Only searches default branch (no history)
- No entropy analysis
- Only finds exact pattern matches

#### Phase 2: Deep Scan (Clone + TruffleHog)

Full git history scan with regex, entropy, and optional verification.

**How it works:**
1. User selects repos from Phase 1 results (or manually enters a repo)
2. Celery worker picks up the scan job
3. Worker clones repo: `git clone --bare {url} /tmp/scans/{job_id}/{repo_name}`
4. Worker runs: `trufflehog git file:///tmp/scans/{job_id}/{repo_name} --json --all-branches`
5. JSON output is parsed and stored in PostgreSQL
6. Cloned repo is deleted immediately after scan
7. Frontend receives results via SSE (Server-Sent Events)

**Celery → SSE Progress Bridge:**

The Celery worker and FastAPI run in separate processes. Progress updates flow through Redis pub/sub:

```
Celery Worker                Redis                    FastAPI                  Browser
     │                         │                         │                       │
     │── publish progress ────▶│                         │                       │
     │   (channel: scan:{id})  │── subscribe ───────────▶│                       │
     │                         │                         │── SSE stream ────────▶│
     │── publish finding ─────▶│                         │                       │
     │                         │── push to subscriber ──▶│── SSE event ────────▶│
     │── publish complete ────▶│                         │                       │
     │                         │── push to subscriber ──▶│── SSE close ────────▶│
```

- Celery worker publishes JSON messages to Redis channel `scan:{scan_id}` at each milestone (repo started, finding discovered, repo complete, scan complete)
- FastAPI endpoint `GET /scans/{id}/stream` subscribes to the Redis channel and yields SSE events
- Frontend uses `EventSource` API to consume the stream — no WebSocket complexity needed
- SSE is simpler than WebSocket for this one-directional flow (server → client only)
- If the SSE connection drops, the frontend falls back to polling `GET /scans/{id}` every 5 seconds

**TruffleHog invocation (incremental reading):**
```python
import subprocess
import json
import threading

def run_trufflehog(repo_path: str, verify: bool = False,
                   timeout: int = 300, on_finding=None) -> tuple[list[dict], bool]:
    cmd = [
        "trufflehog", "git",
        f"file://{repo_path}",
        "--json",
        "--all-branches",
    ]
    if verify:
        cmd.append("--only-verified")

    findings = []
    timed_out = False
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    # Kill the process after `timeout` seconds — this closes stdout,
    # which breaks the readline loop below and lets us collect partial results.
    def kill_on_timeout():
        nonlocal timed_out
        timed_out = True
        proc.kill()

    timer = threading.Timer(timeout, kill_on_timeout)
    timer.start()

    try:
        for line in proc.stdout:
            line = line.strip()
            if line:
                finding = json.loads(line)
                findings.append(finding)
                if on_finding:
                    on_finding(finding)  # publish to Redis / save to DB immediately

        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    finally:
        timer.cancel()
        proc.stdout.close()
        proc.stderr.close()

    # Caller uses timed_out to set scan.status = 'partial' vs 'completed'
    return findings, timed_out
```

**Safety controls:**
- Max repo size: 500MB (configurable, skip larger repos with warning)
- Max scan time: 5 minutes per repo (configurable timeout)
- Concurrent scans: max 3 at a time (Celery concurrency limit)
- Disk cleanup: `/tmp/scans/` purged after each scan
- Verification disabled by default for repos the user doesn't own

**Disk cleanup strategy:**
- Primary: `finally` block in the scan task deletes the clone directory after every scan (success or failure)
- Failsafe: Celery Beat periodic task runs every 15 minutes, purges any `/tmp/scans/` directories older than 30 minutes
- Startup: worker startup hook purges all orphaned `/tmp/scans/` directories from previous crashes
- This handles the case where a worker is killed mid-scan (OOM, container restart, etc.)

**Partial results on timeout:**
- TruffleHog streams JSON findings line-by-line to stdout as it scans
- The wrapper reads stdout incrementally (not just at process exit) and saves findings to the DB as they arrive
- If the 5-minute timeout fires, `subprocess` kills TruffleHog, but all findings discovered before the timeout are already persisted
- The scan status is set to `partial` (not `failed`) and the UI shows: "Scan timed out — showing N findings discovered before timeout"
- User can re-run with a longer timeout or scan specific branches instead of `--all-branches`

### Secret Classification

Each finding from TruffleHog is enriched with:

| Field | Source | Description |
|---|---|---|
| `secret_type` | TruffleHog detector name | e.g., "AWS", "Stripe", "GitHub Token" |
| `severity` | Derived from type + verification | Critical / High / Medium / Low |

### Severity Mapping

| Condition | Severity | Examples |
|---|---|---|
| Verified active by TruffleHog (`--only-verified`) | **Critical** | Any secret confirmed live via API call |
| Known high-value type, unverified | **High** | AWS keys (`AKIA`), Stripe live keys (`sk_live_`), private keys (RSA/SSH/PGP), database connection strings with passwords |
| Known low-value or test/dev type | **Medium** | Stripe test keys (`sk_test_`), generic API tokens, Firebase keys, Google Maps keys |
| Low-entropy generic pattern match | **Low** | Generic `password=` assignments, low-confidence regex matches |

Severity is assigned in the enrichment step after TruffleHog returns raw findings. The mapping is driven by TruffleHog's `DetectorType` field combined with the `Verified` boolean.

### Secret Classification (continued)

| Field | Source | Description |
|---|---|---|
| `location` | TruffleHog output | File path, line number, commit SHA |
| `timeline` | Git commit metadata | Author, date, commit message |
| `branch_status` | Git analysis | "Current branch" vs "History only" |
| `verified` | TruffleHog (if enabled) | Whether the secret is still active |
| `compliance_mapping` | Redact enrichment | NIST/STIG control IDs violated |

### Finding Deduplication

TruffleHog can return the same secret from dozens of commits (e.g., a key committed once and present in 50 subsequent commits). Redact deduplicates before storing:

**Dedup key:** `SHA256(SHA256(raw_secret) + file_path + repo_name)`

- The raw secret is hashed first (never stored in plaintext), then combined with file path and repo name
- This avoids the collision problem where two different secrets with the same first 4 characters (e.g., two Stripe keys both starting `sk_l`) would incorrectly deduplicate
- Same secret in same file across multiple commits → **1 finding** with an `occurrences` array
- Same secret in different files → **separate findings** (different exposure vectors)
- Same secret in different repos → **separate findings** (different blast radius)

```sql
-- Dedup columns are already in the base findings schema above.
-- The unique constraint (scan_id, dedup_hash) handles INSERT ... ON CONFLICT for upserts.
```

The UI shows the deduplicated count with an expandable "seen in N commits" detail.

### Database Schema (Core Tables)

```sql
-- Scan jobs
CREATE TABLE scans (
    id UUID PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,  -- ties scan to the session that initiated it
    platform VARCHAR(20) NOT NULL,    -- 'github', 'gitlab', 'bitbucket'
    target_type VARCHAR(20) NOT NULL, -- 'org', 'user', 'repo'
    target_name VARCHAR(255) NOT NULL,
    scan_type VARCHAR(20) NOT NULL,   -- 'quick', 'deep'
    status VARCHAR(20) NOT NULL,      -- 'queued', 'running', 'completed', 'partial', 'failed'
    repos_total INTEGER DEFAULT 0,    -- total repos to scan (for progress tracking)
    repos_scanned INTEGER DEFAULT 0,  -- repos completed so far (updated by worker)
    current_repo VARCHAR(255),        -- repo currently being scanned (for progress display)
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scans_session ON scans(session_id);

-- Individual findings (deduplicated)
CREATE TABLE findings (
    id UUID PRIMARY KEY,
    scan_id UUID REFERENCES scans(id),
    dedup_hash VARCHAR(64) NOT NULL,       -- SHA256(raw_secret_hash + file_path + repo_name)
    repo_name VARCHAR(255) NOT NULL,
    secret_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,         -- 'critical', 'high', 'medium', 'low'
    file_path TEXT NOT NULL,
    line_number INTEGER,
    commit_sha VARCHAR(40),                -- first/earliest commit where this secret appears
    commit_date TIMESTAMP,
    commit_author VARCHAR(255),
    commit_message TEXT,
    branch_status VARCHAR(20),             -- 'current', 'history_only'
    verified BOOLEAN,
    redacted_secret TEXT,                   -- first 4 chars + masked remainder
    raw_secret_hash VARCHAR(64) NOT NULL,  -- SHA256 of full secret (never store raw)
    occurrence_count INTEGER DEFAULT 1,    -- how many commits contain this secret
    first_seen TIMESTAMP,                  -- earliest commit date
    last_seen TIMESTAMP,                   -- latest commit date
    commit_shas JSONB,                     -- array of all commit SHAs where this appears
    raw_detector_output JSONB,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT uq_findings_dedup UNIQUE (scan_id, dedup_hash)
);

-- Compliance mappings (seeded at startup)
CREATE TABLE compliance_mappings (
    id SERIAL PRIMARY KEY,
    secret_type VARCHAR(100) NOT NULL,
    framework VARCHAR(50) NOT NULL,  -- 'NIST_800_53', 'DISA_STIG'
    control_id VARCHAR(50) NOT NULL,
    control_title TEXT NOT NULL,
    description TEXT
);
```

---

## 4. Frontend & UI

### Pages & Views

#### 1. Landing / New Scan Page
- Input field: GitHub org name, username, or repo URL
- Platform selector (GitHub selected by default, GitLab/Bitbucket grayed out with "Coming Soon")
- Optional: paste a GitHub Personal Access Token for authenticated scanning
- "Quick Scan" button (Search API triage)
- Disclaimer banner: "This tool is for authorized security auditing only"

#### 2. Quick Scan Results (Triage View)
- Card grid showing each repo with hit count
- Color-coded severity badges
- "Deep Scan" button per repo or "Deep Scan All" for the whole org
- Estimated time/size for deep scan

#### 3. Deep Scan Progress
- Real-time progress bar (WebSocket/SSE)
- Shows: current repo being scanned, repos completed, repos remaining
- Live feed of findings as they come in

#### 4. Dashboard (Main Results View)
- **Summary cards:** Total secrets found, repos affected, critical findings, verified active secrets
- **Timeline chart:** Secrets plotted on a timeline by commit date (x-axis = time, y-axis = count, color = severity)
- **Repo breakdown table:** Sortable by repo name, finding count, severity, last commit date
- **Secret type distribution:** Pie/donut chart showing AWS vs Stripe vs GitHub tokens vs generic etc.

#### 5. Finding Detail View
- Full details for a single finding
- Code snippet with the secret redacted (show first 4 chars + `****`)
- Git blame info: who committed it, when, what branch
- Branch status: still on current branch or buried in history
- Verification status (if enabled)
- Compliance mapping: which NIST/STIG controls this violates
- Remediation guidance: steps to rotate the secret

#### 6. Report Generation Page
- Select findings to include (all, by severity, by repo)
- Choose report format: PDF (compliance-style) or JSON (machine-readable)
- Preview before download
- Generate & download button

#### Stretch — Auto-PR Remediation Panel
- Available only when the scan target is an individual user account (not an org)
- Opt-in toggle: "Create PRs to remove discovered secrets" — off by default
- When enabled, prompts the user to confirm their PAT has `public_repo` (or `repo`) scope
- Shows a preview of each proposed PR (files changed, lines removed) before submission
- PR description auto-includes: rotation instructions, history cleanup guidance (BFG/git-filter-repo), and a warning that removing from HEAD does not remove from git history
- Status tracker showing PR created / merged / closed per finding

#### 7. Metrics Page (CALMS Measurement)
- Total scans run, total repos scanned, total secrets found (all-time)
- Average time-to-detect (commit date → scan date)
- Secret type breakdown over time
- Ties directly to the CALMS "Measurement" pillar in Module 1

### UI Design Notes
- Dark mode by default (Tokyo Night palette since you like it)
- Responsive but desktop-first (this is a security tool, not a mobile app)
- Use a component library like shadcn/ui or Radix for accessible components
- Charts: Recharts or Chart.js
- Table: TanStack Table for sorting/filtering

### State Management
- **TanStack Query** for all API data fetching (scans, findings, reports) — handles caching, refetching, and loading states
- **Zustand** for global UI state (current scan ID, SSE connection status, filter selections)
- SSE events from `EventSource` update the Zustand store directly; TanStack Query invalidates on scan completion
- No Redux — overkill for this project size

### Key UI/UX Decisions
- **Never display full secrets** — always redact to first 4 chars + mask
- **Scan history** — users can revisit past scans without re-running, within the same session. Scan history does not survive session expiry (2 hours). This is a deliberate trade-off: no user accounts means no persistent identity to re-link old scans to. For the demo, this is fine — scans are short-lived. If persistence is needed later, add a simple "scan token" (UUID returned at scan creation) that the user can bookmark to retrieve results without a session.
- **Export everything** — every view should have a "Download as JSON" option
- **Loading states** — scanning can take minutes; show meaningful progress, not just a spinner

---

## 5. Compliance Report Generation

### Concept

Each discovered secret is framed as a compliance violation against real security frameworks. The PDF report looks like a professional audit deliverable — not just a list of findings.

### Compliance Mappings

#### NIST 800-53 Controls (Secrets-Relevant)

| Control ID | Control Name | Triggered When |
|---|---|---|
| IA-5 | Authenticator Management | Any credential found in source code |
| IA-5(1) | Password-Based Authentication | Hardcoded passwords detected |
| SC-12 | Cryptographic Key Establishment & Management | Private keys found in repos |
| SC-28 | Protection of Information at Rest | Unencrypted secrets stored in plaintext |
| AC-2 | Account Management | Service account credentials exposed |
| AU-2 | Event Logging | No evidence of secret rotation/audit trail |
| CM-6 | Configuration Settings | Secrets in config files committed to VCS |

#### DISA STIG Application Security Findings

| STIG ID | Title | Triggered When |
|---|---|---|
| V-222642 | The application must not contain embedded authentication data | Any hardcoded credential |
| V-222551 | Enforce authorized access to corresponding private key | Private keys in public repos |
| V-222543 | Transmit only cryptographically-protected passwords | Plaintext passwords in code |
| V-222542 | Only store cryptographic representations of passwords | Plaintext password storage |
| V-222662 | Default passwords must be changed | Default/common passwords detected |

### PDF Report Structure

```
┌──────────────────────────────────────────────┐
│           REDACT SECURITY AUDIT REPORT        │
│                                                │
│  Target: github.com/acme-corp                  │
│  Date: 2026-06-10                              │
│  Scan Type: Deep Scan (Full History)           │
│  Classification: UNCLASSIFIED                  │
├──────────────────────────────────────────────┤
│  EXECUTIVE SUMMARY                             │
│  - 47 secrets found across 12 repositories     │
│  - 8 critical (verified active)                │
│  - 23 high, 11 medium, 5 low                  │
│  - 6 NIST 800-53 controls violated             │
│  - 4 DISA STIG findings triggered              │
├──────────────────────────────────────────────┤
│  COMPLIANCE SUMMARY TABLE                      │
│  Control ID | Status | Finding Count           │
│  IA-5       | FAIL   | 32                      │
│  SC-12      | FAIL   | 8                       │
│  ...                                           │
├──────────────────────────────────────────────┤
│  DETAILED FINDINGS                             │
│  Finding #1                                    │
│  - Type: AWS Access Key                        │
│  - Severity: CRITICAL                          │
│  - Repo: acme-corp/backend-api                 │
│  - File: src/config/aws.py:23                  │
│  - Commit: a1b2c3d (2025-03-15)               │
│  - Author: dev@acme.com                        │
│  - Branch Status: Current (main)               │
│  - Verified: ACTIVE                            │
│  - Controls Violated: IA-5, SC-12, CM-6        │
│  - Remediation: Rotate key in AWS IAM console, │
│    use environment variables or AWS Secrets Mgr │
│  ...                                           │
├──────────────────────────────────────────────┤
│  REMEDIATION ROADMAP                           │
│  Priority 1: Rotate all verified-active secrets│
│  Priority 2: Remove secrets from current branch│
│  Priority 3: Clean git history (BFG/filter-repo│
│  Priority 4: Implement pre-commit hooks        │
│  (Stretch) Auto-PR status: PRs created/pending │
│    for individual-user repos (if opted in)     │
├──────────────────────────────────────────────┤
│  APPENDIX: Methodology & Tool Versions         │
└──────────────────────────────────────────────┘
```

### Implementation

- HTML template rendered with Jinja2
- Converted to PDF with WeasyPrint
- Styled to look professional (logo, headers, page numbers, table of contents)
- JSON export option for machine consumption

---

## 6. DevSecOps Pipeline (Module Mapping)

This section maps every SEC460 module to a concrete deliverable in the Redact project.

### Module 0: Orientation & Setup
**Deliverable:** Repository setup + Docker development environment

- GitHub repo: `github.com/{team}/redact`
- `docker-compose.yml` with all services
- `README.md` with setup instructions
- `.env.example` with all required environment variables:
  ```
  # Database
  DATABASE_URL=postgresql://redact:redact@db:5432/redact

  # Redis (Celery broker + SSE pub/sub)
  REDIS_URL=redis://redis:6379/0

  # Session
  SESSION_SECRET_KEY=change-me-to-a-random-string

  # Scanning limits
  MAX_CONCURRENT_SCANS=3
  MAX_REPO_SIZE_MB=500
  SCAN_TIMEOUT_SECONDS=300

  # Optional: GitHub PAT for higher rate limits during development
  # GITHUB_TOKEN=
  ```
- Branch protection rules on `main` (require PR, require CI pass)

### Module 1: Intro to DevSecOps
**Deliverable:** Project charter document

- Shift-left justification: why scanning for secrets early prevents breaches
- CALMS framework applied to Redact:
  - **Culture:** Security-first mindset, responsible disclosure ethics
  - **Automation:** Automated scanning, CI/CD pipeline, automated reports
  - **Lean:** MVP-first approach, iterate based on feedback
  - **Measurement:** Metrics dashboard (secrets found, time to detect, repos scanned)
  - **Sharing:** Open-source project, knowledge sharing via presentation

### Module 2: Secure SDLC
**Deliverable:** STRIDE threat model document

Threat model for Redact itself:

| STRIDE Category | Threat | Mitigation |
|---|---|---|
| **Spoofing** | Attacker submits scan targeting private repos with stolen token | Token validation, rate limiting, audit logging |
| **Tampering** | Scan results modified in transit or at rest | HTTPS everywhere, DB access controls, signed reports |
| **Repudiation** | User denies initiating a scan of a third-party org | Audit log with timestamps, IP addresses, user identity |
| **Information Disclosure** | Redact itself leaks the secrets it finds | Redact secrets in UI (first 4 chars only), encrypt DB, purge cloned repos |
| **Denial of Service** | Attacker queues thousands of scans | Rate limiting, max concurrent scans, scan queue limits |
| **Elevation of Privilege** | Attacker gains admin access to Redact | Auth on all endpoints, principle of least privilege, no default passwords |

Also: OWASP Top 10 review of Redact's own code (input validation on org names, SQL injection prevention via ORM, XSS prevention in React, etc.)

### Module 3: IaC & Security
**Deliverable:** Terraform configuration + IaC scanning

Terraform config that *could* deploy Redact to AWS (not actually deployed due to no budget):

```
terraform/
├── main.tf              # VPC, subnets, security groups
├── ecs.tf               # ECS Fargate service for backend + frontend
├── rds.tf               # PostgreSQL RDS instance
├── elasticache.tf       # Redis for Celery broker
├── alb.tf               # Application Load Balancer
├── iam.tf               # IAM roles with least privilege
├── variables.tf
├── outputs.tf
└── terraform.tfvars.example
```

IaC scanning integrated into CI:
- **Checkov** or **tfsec** scanning Terraform files for misconfigurations
- Fails the pipeline if critical issues found (e.g., public S3 buckets, overly permissive security groups)

### Module 4: CI/CD Security
**Deliverable:** GitHub Actions pipeline with SAST + SCA

```yaml
# .github/workflows/ci.yml
name: Redact CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # Tests - Backend + Frontend
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Backend tests
        run: |
          cd backend
          pip install -r requirements.txt -r requirements-test.txt
          pytest tests/ -v --tb=short --junitxml=test-results.xml
      - name: Frontend tests
        run: |
          cd frontend
          npm ci
          npm test -- --run --reporter=verbose

  # SAST - Static Application Security Testing
  sast:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - name: Run Bandit (Python SAST)
        run: pip install bandit && bandit -r backend/ -f json -o bandit-report.json
      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/owasp-top-ten

  # SCA - Software Composition Analysis
  sca:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - name: Run pip-audit (Python dependencies)
        run: pip install pip-audit && pip-audit -r backend/requirements.txt
      - name: Run npm audit (Frontend dependencies)
        run: cd frontend && npm audit --audit-level=high

  # Secret scanning on our own codebase (eating our own dog food)
  secrets:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Run TruffleHog on our own repo
        run: |
          docker run --rm -v "$PWD:/repo" trufflesecurity/trufflehog:latest \
            git file:///repo --only-verified --fail

  # IaC scanning
  iac:
    runs-on: ubuntu-latest
    needs: [test]
    steps:
      - uses: actions/checkout@v4
      - name: Run Checkov on Terraform
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: terraform/

  # Container image build + scan
  container:
    runs-on: ubuntu-latest
    needs: [sast, sca, secrets, iac]  # test is transitively required via these jobs
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker images
        run: docker compose build
      - name: Run Trivy on images
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: redact-backend:latest
          severity: CRITICAL,HIGH
      - name: Run Snyk Container
        uses: snyk/actions/docker@master
        with:
          image: redact-backend:latest

  # Deploy (to local Docker Compose for demo)
  deploy:
    runs-on: ubuntu-latest
    needs: [container]
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy notification
        run: echo "Ready for deployment"
```

### Module 5: DAST
**Deliverable:** OWASP ZAP scan against Redact's own frontend

- Run ZAP baseline scan against the running Redact web app
- Integrate into CI as a post-deploy step (scan the Docker Compose deployment)
- Fix any findings (XSS, missing security headers, etc.)
- **Scope: unauthenticated surface only.** Since Redact is session-gated (scan results are only visible to the session that initiated them), ZAP will only see the landing page and static assets. This is intentional — the unauthenticated surface is the attack surface exposed to the internet. Authenticated pages (dashboard, findings, reports) are tested via backend integration tests, not DAST.

```yaml
  dast:
    runs-on: ubuntu-latest
    needs: [deploy]
    steps:
      - name: Start Redact
        run: docker compose up -d && sleep 30
      - name: Run OWASP ZAP Baseline
        uses: zaproxy/action-baseline@v0.9.0
        with:
          target: http://localhost:3000
          rules_file_name: .zap-rules.tsv
```

### Module 6: Container Security
**Deliverable:** Hardened Docker images + scanning

- Multi-stage Dockerfiles (build stage + slim runtime stage)
- Non-root user in all containers
- Read-only filesystem where possible
- Trivy + Snyk scanning in CI (already in pipeline above)
- `.dockerignore` to prevent secrets from leaking into images
- Pin base image versions (no `latest` tags)

Example hardened Dockerfile:
```dockerfile
# Backend (also used as base for worker)
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
RUN useradd -r -s /bin/false redact
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
USER redact
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Worker Dockerfile (extends backend, adds TruffleHog + git):
```dockerfile
# Worker — includes TruffleHog binary for scanning
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Download TruffleHog binary
FROM alpine:3.20 AS trufflehog
ARG TRUFFLEHOG_VERSION=3.82.0
RUN wget -qO- "https://github.com/trufflesecurity/trufflehog/releases/download/v${TRUFFLEHOG_VERSION}/trufflehog_${TRUFFLEHOG_VERSION}_linux_amd64.tar.gz" \
    | tar xz -C /usr/local/bin trufflehog

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN useradd -r -s /bin/false redact
WORKDIR /app
COPY --from=builder /install /usr/local
COPY --from=trufflehog /usr/local/bin/trufflehog /usr/local/bin/trufflehog
COPY . .
USER redact
CMD ["celery", "-A", "worker", "worker", "--loglevel=info", "--concurrency=3"]
```

### Module 7: Cloud Security
**Deliverable:** Cloud deployment architecture document (not deployed)

Document covering:
- AWS architecture diagram (VPC, private subnets for DB/Redis, public subnet for ALB)
- IAM roles with least privilege (ECS task role, RDS access, no wildcard permissions)
- Security groups (only ALB accepts inbound 443, backend only from ALB, DB only from backend)
- Encryption: RDS encryption at rest, TLS in transit, secrets in AWS Secrets Manager
- CSPM: AWS Config rules or Prowler scan results
- Cost estimate for running in AWS (ECS Fargate + RDS + ElastiCache)

### Module 8: Advanced Topics
**Deliverable:** Documentation on secrets management + SIEM integration

Write-up covering:
- **HashiCorp Vault:** How Redact *would* use Vault for its own secrets (GitHub tokens, DB credentials, API keys) instead of `.env` files. Include a Vault policy example.
- **SIEM Integration:** How Redact's scan results and audit logs *would* be shipped to an ELK stack. Include example Filebeat config and Kibana dashboard mockup.
- **Compliance:** How the NIST/STIG compliance reports tie into organizational audit processes.

### Module 9: Presentations
**Deliverable:** Live demo + slide deck

- Live demo scanning the team's seeded test org
- Show the full pipeline: push code → CI runs → scans pass → deploy → scan external org → view results → generate report

**Slide Deck Outline:**
1. **The Problem** — stats on secret sprawl, real-world breach examples (2 slides)
2. **What is Redact?** — one-liner, comparison table vs existing tools (1 slide)
3. **Architecture** — high-level diagram, tech stack, platform adapter pattern (2 slides)
4. **Two-Phase Scanning** — quick scan vs deep scan, TruffleHog integration (2 slides)
5. **Live Demo** — full scan-to-report flow (this is the bulk of the presentation)
6. **DevSecOps Practices Applied** — STRIDE threat model, CI/CD pipeline stages, container hardening, IaC scanning (3 slides)
7. **Compliance Mapping** — how findings map to NIST 800-53 / DISA STIG, sample PDF report (2 slides)
8. **Responsible Disclosure** — process, ethics, template (1 slide)
9. **Lessons Learned** — what worked, what was harder than expected, what we'd do differently (1 slide)
10. **Q&A**

---

## 7. Responsible Disclosure Process

If the team decides to scan repos they don't own (with professor approval), follow this process:

### Before Scanning
1. Get explicit written approval from the professor
2. Only scan public repositories
3. Never enable secret verification (`--only-verified`) on third-party repos
4. Document everything: what you scanned, when, what you found

### If You Find Real Secrets
1. **Do NOT test/use the secret** — this could violate the CFAA
2. **Do NOT publicly disclose the secret value** — ever
3. **Find the security contact:**
   - Check `/.well-known/security.txt` on their website (RFC 9116)
   - Look for a bug bounty program (HackerOne, Bugcrowd)
   - Check their GitHub repo for `SECURITY.md`
   - Last resort: `security@{domain}` or general contact form
4. **Write a disclosure report:**
   - Your identity and affiliation (SEC460 student at {university})
   - What you found (secret type, repo, file, commit — NOT the secret value)
   - How you found it (Redact tool, TruffleHog scanner)
   - Recommended remediation steps
   - Offer to help / answer questions
5. **Send via encrypted channel if possible** (GPG)
6. **Wait 90 days** before any public mention
7. **Document the entire process** — this is the CV gold

### Disclosure Report Template

```
Subject: [Responsible Disclosure] Exposed credentials in {org}/{repo}

Dear Security Team,

I am a cybersecurity student at {university} conducting authorized security
research as part of a DevSecOps course (SEC460). During a scan of publicly
accessible GitHub repositories, I identified exposed credentials in your
organization's codebase.

FINDING SUMMARY:
- Repository: {org}/{repo}
- File: {path}
- Commit: {sha} ({date})
- Secret Type: {type} (e.g., AWS Access Key)
- Branch Status: {current branch / history only}

I have NOT tested or used these credentials. The secret value has not been
shared with anyone.

RECOMMENDED ACTIONS:
1. Immediately rotate the affected credential
2. Remove the secret from the current branch
3. Consider cleaning git history using BFG Repo-Cleaner
4. Implement pre-commit secret scanning (e.g., TruffleHog, GitLeaks)

I am happy to provide additional details or assist with remediation.

Regards,
{name}
{university} — BAS Cybersecurity
{email}
```

### References
- OWASP Vulnerability Disclosure Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html
- RFC 9116 (security.txt): https://www.rfc-editor.org/rfc/rfc9116
- GitGuardian Responsible Disclosure Best Practices: https://blog.gitguardian.com/handle-responsible-disclosure/

---

## 8. Demo Strategy

### Test Environment Setup

Create a GitHub organization specifically for the demo (e.g., `redact-demo-org`) with 5-10 repos seeded with fake secrets:

| Repo Name | Seeded Secrets | Purpose |
|---|---|---|
| `demo-webapp` | AWS keys, Stripe key in config.js | Show common web app leaks |
| `demo-api` | GitHub token, JWT secret in .env committed | Show .env file mistakes |
| `demo-infra` | SSH private key, DB connection string | Show IaC credential leaks |
| `demo-mobile` | Firebase API key, Google Maps key | Show mobile app leaks |
| `demo-legacy` | Secrets in old commits, removed from HEAD | Show history-only findings |
| `demo-clean` | No secrets | Show that clean repos pass |

**Important:** Use obviously fake secrets that follow real patterns but aren't valid. For AWS keys, use the documented example format (`AKIAIOSFODNN7EXAMPLE`). For verification demo, you could create a real (but low-privilege, tightly scoped) AWS key that TruffleHog can verify as active.

> **⚠️ CRITICAL: If you create a real AWS key for the verification demo, it MUST be:**
> - Scoped to a zero-permission IAM user (TruffleHog only needs `sts:GetCallerIdentity` to verify)
> - Tracked as a task: "Rotate/delete demo AWS key" — assigned to a specific person
> - Rotated/deleted **immediately** after the presentation, same day
> - Never committed to any repo other than the demo org
> - This is exactly the kind of thing Redact is designed to catch — don't become your own case study

### Demo Script (10-15 minutes)

1. **Open Redact in browser** — show the landing page, explain the tool (1 min)
2. **Quick Scan** — enter `redact-demo-org`, show triage results populating in real-time (2 min)
3. **Deep Scan** — trigger deep scan on 2-3 repos, show progress (2 min)
4. **Dashboard** — walk through the timeline, severity breakdown, repo table (2 min)
5. **Finding Detail** — drill into a specific finding, show the compliance mapping (2 min)
6. **Generate Report** — generate and open the PDF, show the STIG/NIST compliance table (2 min)
7. **Show the pipeline** — quick tour of GitHub Actions: SAST, SCA, secret scanning, container scanning, DAST all passing (2 min)
8. **Wow factor** — if approved by professor, show a scan of a real public org with actual findings (redacted) (2 min)

### Backup Plan
If the live demo breaks (it always can), have:
- Pre-recorded video of the full demo flow
- Screenshots of every page in the slide deck
- Pre-generated PDF report to show

---

## 9. Sprint Plan & Milestones

### Team Responsibilities

| Area | Owner | Notes |
|---|---|---|
| Backend / Scanning Engine | TBD | FastAPI, TruffleHog integration, Celery workers, DB |
| Frontend / UI | TBD | React, dashboard, charts, report generation page |
| DevSecOps / CI / Docs | TBD | GitHub Actions, Terraform, STRIDE doc, cloud doc, Vault/SIEM write-up |

> Fill this in as a team. Each person should own one primary area but be able to help on others.

### Sprint 1: Foundation (Apr 14 – Apr 27)
- [ ] GitHub repo setup with branch protection
- [ ] Docker Compose with all services (even if mostly stubs)
- [ ] FastAPI backend skeleton with health check endpoint
- [ ] React frontend skeleton with routing
- [ ] PostgreSQL schema migration (Alembic)
  - Migration strategy: during development, use `alembic downgrade base && alembic upgrade head` (drop-and-recreate) since there's no production data to preserve. All team members run `alembic upgrade head` after pulling. Schema changes require a new migration file — no manual SQL.
- [ ] TruffleHog binary installed in worker container
- [ ] Basic CI pipeline (lint + test)

**Milestone:** `docker compose up` starts all services, frontend loads, backend responds to `/health`

### Sprint 2: Scanning Engine (Apr 28 – May 11)
- [ ] GitHub adapter: list repos for org/user
- [ ] Quick scan: Search API integration
- [ ] Deep scan: clone + TruffleHog subprocess
- [ ] Celery worker for background scan jobs
- [ ] Store findings in PostgreSQL
- [ ] Basic API endpoints: start scan, get scan status, get findings

**Milestone:** Can trigger a scan via API and get JSON results back

### Sprint 3: Frontend & Dashboard (May 12 – May 25)
- [ ] Landing page with scan input
- [ ] Quick scan results view
- [ ] Deep scan progress (WebSocket/SSE)
- [ ] Dashboard: summary cards, timeline chart, repo table
- [ ] Finding detail view with compliance mapping
- [ ] Dark mode / Tokyo Night styling

**Milestone:** Full scan-to-dashboard flow works in the browser

### Sprint 4: Reports, Polish & DevSecOps Docs (May 26 – Jun 7)
- [ ] PDF report generation (WeasyPrint + Jinja2 template)
- [ ] Compliance mapping engine (NIST + STIG)
- [ ] CI pipeline complete: SAST, SCA, secrets, IaC, container scan, DAST
- [ ] Terraform configs written + scanned
- [ ] STRIDE threat model document
- [ ] Cloud architecture document
- [ ] Vault/SIEM write-up
- [ ] Demo org seeded with test repos
- [ ] Presentation slides
- [ ] **Stretch:** Auto-PR remediation for individual-user repos (opt-in, requires elevated PAT scope)

**Milestone:** Everything works, demo rehearsed, all documents complete

### Sprint 5: Buffer & Presentation Prep (Jun 8 – Jun 19)
- [ ] Bug fixes and polish
- [ ] Demo rehearsal (at least 2 dry runs)
- [ ] Record backup demo video
- [ ] Final presentation

---

## 10. Testing Strategy

### Backend Tests (pytest)

| Test Area | Approach | Example |
|---|---|---|
| API endpoints | FastAPI `TestClient` smoke tests | `POST /scans` returns 201, `GET /scans/{id}` returns results |
| TruffleHog wrapper | Mock `subprocess.run`, test JSON parsing | Feed known TruffleHog JSON output, verify findings are parsed correctly |
| Platform adapters | Mock GitHub API responses with `respx` or `httpx` mock | Verify `list_repos` returns `Repo` objects, `search_code` handles rate limits |
| Deduplication | Unit test dedup logic with fixture data | Same secret in 50 commits → 1 finding with 50 occurrences |
| Compliance mapping | Unit test mapping engine | AWS key → IA-5, SC-12; private key → SC-12, V-222551 |

### Frontend Tests (Vitest)

| Test Area | Approach |
|---|---|
| Component rendering | Vitest + React Testing Library — verify key components render without crashing |
| Dashboard cards | Mock API response, verify stat cards show correct numbers |
| Secret redaction | Verify secrets are always masked in rendered output |

### Fixture Repos

To test the scanning engine without hitting GitHub or cloning real repos:
- Create bare git repos in `tests/fixtures/` with known seeded secrets
- TruffleHog runs against these local fixtures in CI
- Deterministic, fast, no network required

### Coverage Target

Not aiming for high coverage — this is a 9-week project. Target: key paths tested, no regressions on core scan flow. Smoke tests > exhaustive unit tests.

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GitHub API rate limiting blocks demo | Medium | High | Cache results, use authenticated requests, pre-run scans before demo |
| TruffleHog subprocess hangs on large repo | Medium | Medium | Timeout (5 min), max repo size limit, kill process on timeout |
| Team member availability drops | Medium | High | Modular architecture — each person can work independently |
| Live demo fails during presentation | High | High | Pre-recorded backup video, screenshots in slides, pre-generated report |
| AGPL concerns with TruffleHog | Low | Low | Called as subprocess only, not imported as library; project is academic |
| Professor doesn't approve scanning third-party repos | Medium | Low | Demo with seeded test org only — still impressive |
| Scope creep (too many features) | High | Medium | Strict MVP: quick scan + deep scan + dashboard + report. Everything else is stretch |
| Docker Compose issues on different OS | Low | Medium | Document setup, test on Windows (WSL2) + Mac + Linux |
| Auto-PR creates breaking changes or exposes secrets in PR diff | Low | High | Individual-user repos only (never orgs), require explicit opt-in, preview changes before submission, PR description warns that history still contains the secret |

---

## 12. References & Resources

### Tools
- TruffleHog: https://github.com/trufflesecurity/trufflehog
- GitLeaks: https://github.com/gitleaks/gitleaks
- OWASP ZAP: https://www.zaproxy.org/
- Trivy: https://github.com/aquasecurity/trivy
- Snyk: https://snyk.io/
- Checkov: https://www.checkov.io/
- Bandit (Python SAST): https://github.com/PyCQA/bandit
- Semgrep: https://semgrep.dev/
- WeasyPrint: https://weasyprint.org/

### Frameworks & Standards
- NIST 800-53 Rev 5: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- DISA STIG Application Security: https://stigviewer.com/stigs/application_security_and_development
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP Vulnerability Disclosure Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html
- RFC 9116 (security.txt): https://www.rfc-editor.org/rfc/rfc9116

### Libraries & Frameworks
- FastAPI: https://fastapi.tiangolo.com/
- React: https://react.dev/
- Vite: https://vitejs.dev/
- Tailwind CSS: https://tailwindcss.com/
- Celery: https://docs.celeryq.dev/
- Alembic (DB migrations): https://alembic.sqlalchemy.org/
- Recharts: https://recharts.org/
- shadcn/ui: https://ui.shadcn.com/

### Research
- GitGuardian State of Secrets Sprawl 2026: https://www.gitguardian.com/state-of-secrets-sprawl-report-2025
- GitHub Secret Scanning docs: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
- GitGuardian Responsible Disclosure: https://blog.gitguardian.com/handle-responsible-disclosure/
