# Redact — Feature Roadmap

> Post-MVP features to extend Redact beyond the initial course deliverable.
> These features build on the existing architecture without requiring fundamental redesign.

---

## Table of Contents

1. [Scan Diff / Delta Reports](#1-scan-diff--delta-reports)
2. [SARIF & CSV Export](#2-sarif--csv-export)
3. [Webhook Notifications](#3-webhook-notifications)
4. [Multi-Platform Support (GitLab, Bitbucket)](#4-multi-platform-support-gitlab-bitbucket)
5. [Finding Age Tracking / SLA Dashboard](#5-finding-age-tracking--sla-dashboard)
6. [Secret Rotation Verification](#6-secret-rotation-verification)
7. [Bulk Org Scan with Parallel Workers](#7-bulk-org-scan-with-parallel-workers)

---

## 1. Scan Diff / Delta Reports

### Problem

When a team remediates findings and re-scans, there's no way to see what changed. Users must manually compare two full reports to determine which secrets were fixed and which are new.

### Solution

Add a scan comparison endpoint and UI that shows:
- **New findings** — present in the later scan but not the earlier one
- **Resolved findings** — present in the earlier scan but absent from the later one
- **Persistent findings** — present in both scans (still unresolved)

### Design

**Matching logic:** Findings are matched across scans using `dedup_hash` (SHA256 of `raw_secret_hash + file_path + repo_name`). This is already computed and stored — no new hashing needed.

**API:**

```
GET /scans/{scan_id}/diff?baseline={baseline_scan_id}
```

Response:
```json
{
  "baseline_scan_id": "uuid",
  "current_scan_id": "uuid",
  "summary": {
    "new": 3,
    "resolved": 7,
    "persistent": 12
  },
  "new_findings": [...],
  "resolved_findings": [...],
  "persistent_findings": [...]
}
```

**Constraints:**
- Both scans must target the same org/repo (validated server-side)
- Baseline scan must be in `completed` or `partial` status
- Response uses existing `FindingResponse` schema for each finding list

**Frontend:**

New `/dashboard/:id/diff` page accessible from the Dashboard. User selects a previous scan from a dropdown (filtered to same target). Results shown in a three-column layout with color-coded badges:
- 🟢 Resolved (green)
- 🔴 New (red)
- 🟡 Persistent (amber)

**Database changes:** None. The diff is computed at query time using existing `dedup_hash` values.

**Implementation estimate:** ~2 days (1 backend endpoint + 1 frontend page)

---

## 2. SARIF & CSV Export

### Problem

Security teams need to import findings into existing tooling. GitHub Code Scanning consumes SARIF. Compliance teams use spreadsheets. The current PDF/JSON exports don't integrate with these workflows.

### Solution

Add SARIF 2.1.0 and CSV export formats to the existing report endpoint.

**API:**

```
GET /scans/{id}/report?format=sarif
GET /scans/{id}/report?format=csv
```

### SARIF Output

[SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) is the OASIS standard for static analysis results. Structure:

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": {
      "driver": {
        "name": "Redact",
        "version": "1.0.0",
        "rules": [...]
      }
    },
    "results": [...]
  }]
}
```

Mapping:
| Redact field | SARIF field |
|---|---|
| `secret_type` | `rule.id` |
| `severity` | `result.level` (error/warning/note) |
| `file_path` | `physicalLocation.artifactLocation.uri` |
| `line_number` | `physicalLocation.region.startLine` |
| `repo_name` | `run.properties.repo` |
| `redacted_secret` | `result.message.text` |
| `commit_sha` | `versionControl.revisionId` |

### CSV Output

Flat export with one row per finding:

```
repo_name,secret_type,severity,verified,file_path,line_number,commit_sha,commit_date,commit_author,redacted_secret,first_seen,occurrence_count
```

- UTF-8 with BOM for Excel compatibility
- Secrets are always redacted (first 4 chars + mask)
- `Content-Disposition: attachment; filename="redact-scan-{id}.csv"`

### Frontend

Add "SARIF" and "CSV" buttons alongside existing "PDF" and "JSON" on the Report page. Same severity/repo filter params apply.

**Implementation estimate:** ~1.5 days (SARIF serializer + CSV writer + 2 buttons)

---

## 3. Webhook Notifications

### Problem

Teams want to be alerted when scans complete — especially when critical findings are detected — without polling the dashboard. Integration with Slack, Teams, PagerDuty, and generic HTTP endpoints is expected in security tooling.

### Solution

Add a webhook configuration system that fires HTTP POST requests on scan events.

### Design

**New model:**

```python
class WebhookConfig(Base):
    __tablename__ = "webhook_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String(64), nullable=False)
    name = Column(String(100), nullable=False)
    url = Column(Text, nullable=False)
    events = Column(JSON, nullable=False)  # ["scan_complete", "critical_finding"]
    headers = Column(JSON)  # custom headers (e.g., auth tokens) — encrypted at rest
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
```

**Supported events:**
| Event | Fires when |
|---|---|
| `scan_complete` | Any scan finishes (complete or partial) |
| `scan_failed` | A scan fails or times out |
| `critical_finding` | A finding with `severity='critical'` (verified secret) is discovered |
| `new_finding` | Any new finding is discovered (high volume — opt-in only) |

**Payload format (JSON):**

```json
{
  "event": "critical_finding",
  "timestamp": "2026-05-08T12:00:00Z",
  "scan_id": "uuid",
  "target": "acme-corp",
  "data": {
    "finding_id": "uuid",
    "secret_type": "AWS",
    "severity": "critical",
    "repo_name": "acme-corp/backend",
    "file_path": "config/prod.env",
    "verified": true,
    "redacted_secret": "AKIA████████████████"
  }
}
```

**Delivery:**
- Webhooks are dispatched as a Celery task (`task_send_webhook`) to avoid blocking scan progress
- Retry 3 times with exponential backoff (10s, 60s, 300s)
- Timeout: 10s per request
- Log delivery status (success/failure/retry) — never log the full payload (contains redacted secrets)

**Slack/Teams formatting:**
- Detect Slack webhook URLs (`hooks.slack.com`) and format payload as Slack Block Kit
- Detect Teams URLs (`webhook.office.com`) and format as Adaptive Card
- All other URLs receive the raw JSON payload

**API:**

```
POST   /webhooks          — create webhook config
GET    /webhooks          — list configs for session
PUT    /webhooks/{id}     — update config
DELETE /webhooks/{id}     — delete config
POST   /webhooks/{id}/test — send a test payload
```

**Security:**
- Webhook URLs are validated (must be HTTPS, no private/loopback IPs — SSRF prevention)
- Custom headers are stored encrypted (Fernet with `SESSION_SECRET_KEY`)
- Webhook configs are scoped to `session_id` — no cross-session access
- Payloads never contain full secrets — only `redacted_secret`

**Frontend:**

Settings panel accessible from the Dashboard nav. Form to add/edit webhooks with:
- Name, URL, event checkboxes, optional custom headers
- "Test" button that sends a sample payload
- Delivery log showing last 10 attempts with status codes

**Implementation estimate:** ~3 days (model + migration + Celery task + API endpoints + settings UI)

---

## 4. Multi-Platform Support (GitLab, Bitbucket)

### Problem

Not all organizations use GitHub. GitLab (self-hosted and .com) and Bitbucket Cloud are widely used, especially in enterprise. Redact currently only supports GitHub.

### Solution

Implement `GitLabAdapter` and `BitbucketAdapter` using the existing `PlatformAdapter` ABC. The adapter pattern was designed for this — no architectural changes needed.

### GitLab Adapter

**Authentication:** GitLab Personal Access Token with `read_api` scope.

**API mapping:**

| Operation | GitHub | GitLab |
|---|---|---|
| List repos | `GET /orgs/{org}/repos` | `GET /groups/{group}/projects` |
| Search code | `GET /search/code?q=...` | `GET /groups/{group}/search?scope=blobs` |
| Clone URL | `https://github.com/{repo}.git` | `https://gitlab.com/{project}.git` |
| Rate limits | 30 req/min (search) | 10 req/min (search, unauthenticated) |

**Key differences from GitHub:**
- GitLab groups are nested (subgroups) — adapter must recurse with `include_subgroups=true`
- GitLab search returns blob content directly (no separate file fetch needed)
- GitLab clone with token uses `https://oauth2:{token}@gitlab.com/...` — but per security rules, we use `git -c http.extraHeader` instead
- Self-hosted GitLab requires a configurable base URL

**Configuration:**
```python
class GitLabAdapter(PlatformAdapter):
    def __init__(self, token: str | None = None, base_url: str = "https://gitlab.com"):
        ...
```

### Bitbucket Adapter

**Authentication:** Bitbucket App Password with `repository:read` permission.

**API mapping:**

| Operation | GitHub | Bitbucket |
|---|---|---|
| List repos | `GET /orgs/{org}/repos` | `GET /repositories/{workspace}` |
| Search code | `GET /search/code?q=...` | `GET /workspaces/{workspace}/search/code` |
| Clone URL | `https://github.com/{repo}.git` | `https://bitbucket.org/{workspace}/{repo}.git` |
| Rate limits | 30 req/min (search) | 1000 req/hr (all endpoints) |

**Key differences:**
- Bitbucket uses "workspaces" instead of orgs
- Bitbucket code search is workspace-scoped (no global search)
- Pagination uses `next` URL field (not `Link` header)
- Auth uses Basic auth with app password — stored same as PAT in Redis session

### Frontend Changes

- Landing page scan form gets a "Platform" dropdown: GitHub (default), GitLab, Bitbucket
- Platform selection determines which adapter is used server-side
- Target label changes contextually: "Organization" (GitHub), "Group" (GitLab), "Workspace" (Bitbucket)
- Token input help text updates per platform

### Database Changes

The `scans.platform` column already exists (`String(20)`) — currently always "github". No migration needed.

### API Changes

`ScanCreate` schema already has a `platform` field. The backend route handler selects the adapter based on this field:

```python
adapters = {
    "github": GitHubAdapter,
    "gitlab": GitLabAdapter,
    "bitbucket": BitbucketAdapter,
}
```

**Implementation estimate:** ~4 days (2 adapters + tests + frontend dropdown + help text)

---

## 5. Finding Age Tracking / SLA Dashboard

### Problem

Security managers need to know not just what secrets are exposed, but how long they've been exposed. Compliance frameworks (NIST SI-4, DISA V-222962) require timely remediation. There's no way to track whether findings are being resolved within acceptable timeframes.

### Solution

Add SLA tracking to findings and a dedicated SLA dashboard view showing compliance with remediation timelines.

### Design

**SLA tiers (configurable):**

| Severity | Target Resolution Time |
|---|---|
| Critical (verified) | 24 hours |
| High | 7 days |
| Medium | 30 days |
| Low | 90 days |

**New model:**

```python
class SLAConfig(Base):
    __tablename__ = "sla_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), nullable=False)
    severity = Column(String(20), nullable=False)
    target_hours = Column(Integer, nullable=False)
```

**Finding age computation:**

Age is calculated from `first_seen` (already stored on findings). No new columns needed — the API computes age and SLA status at query time:

```python
age_hours = (now - finding.first_seen).total_seconds() / 3600
sla_target = sla_config[finding.severity].target_hours
sla_status = "breached" if age_hours > sla_target else "at_risk" if age_hours > sla_target * 0.8 else "ok"
```

**API:**

```
GET /scans/{id}/sla — SLA summary for a scan's findings
```

Response:
```json
{
  "total_findings": 22,
  "breached": 5,
  "at_risk": 3,
  "on_track": 14,
  "mean_age_hours": 168.5,
  "oldest_unresolved": {
    "finding_id": "uuid",
    "age_hours": 720,
    "severity": "critical",
    "repo_name": "acme-corp/payments"
  },
  "by_severity": {
    "critical": {"total": 2, "breached": 2, "at_risk": 0, "on_track": 0},
    "high": {"total": 8, "breached": 3, "at_risk": 2, "on_track": 3},
    ...
  }
}
```

**Frontend:**

New "SLA" tab on the Dashboard page showing:
- Donut chart: breached / at-risk / on-track
- Table of breached findings sorted by age (oldest first)
- Severity breakdown with progress bars showing % within SLA
- Configurable SLA targets in a settings panel

**Scan diff integration:** When using the diff feature (Feature 1), resolved findings get a `resolved_at` timestamp. This enables tracking actual resolution time vs. SLA target — "mean time to remediate" (MTTR) metric.

**Implementation estimate:** ~2.5 days (SLA config model + migration + API endpoint + dashboard tab)

---

## 6. Secret Rotation Verification

### Problem

After a secret is found, the critical next step is rotation. But teams often claim "we rotated it" without verification. There's no way to confirm the old secret is actually gone from the repository.

### Solution

Add a "verify rotation" workflow that re-scans a specific repo and checks whether a previously-found secret still appears.

### Design

**Workflow:**

1. User views a finding and clicks "Verify Rotation"
2. Backend triggers a targeted deep scan of just that repo
3. After scan completes, the system checks if the same `dedup_hash` appears in the new results
4. Finding is marked as `rotation_status = 'rotated'` or `rotation_status = 'still_present'`

**New columns on `findings`:**

```python
rotation_status = Column(String(20))  # null, "rotated", "still_present", "pending"
rotation_verified_at = Column(DateTime)
rotation_scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"))
```

**API:**

```
POST /findings/{id}/verify-rotation
```

This creates a new scan (type `rotation_check`) targeting only the finding's repo. The scan is lightweight — single repo, no search phase.

```
GET /findings/{id}
```

Response includes `rotation_status` and `rotation_verified_at` when set.

**Celery task:**

New task `task_rotation_check` that:
1. Clones the single repo
2. Runs TruffleHog
3. Checks if any result matches the original finding's `raw_secret_hash`
4. Updates the finding's `rotation_status`
5. Publishes SSE event: `{"event": "rotation_verified", "finding_id": "...", "status": "rotated"}`

**Frontend:**

- "Verify Rotation" button on Finding Detail page (only shown for findings with `severity` critical/high)
- Button shows spinner while `rotation_status = 'pending'`
- Result displayed as badge: ✅ Rotated / ❌ Still Present
- Timestamp of last verification shown

**Security:**
- Rotation check still respects all existing rules (public repos only unless `allow_private`, cleanup in finally, etc.)
- The `raw_secret_hash` is used for matching — the actual secret value is never stored or compared

**Implementation estimate:** ~2 days (new Celery task + migration + API endpoint + UI button)

---

## 7. Bulk Org Scan with Parallel Workers

### Problem

For large organizations (100+ repos), sequential scanning within a single Celery task is slow. A full org scan can take hours. Users want faster results for initial audits.

### Solution

Fan out deep scans across multiple Celery workers using `celery.group`, with a chord callback to aggregate results.

### Design

**Current architecture (sequential):**
```
task_deep_scan(org) → clone repo1, scan, clone repo2, scan, ... clone repoN, scan → complete
```

**New architecture (parallel):**
```
task_bulk_scan(org) → list repos → celery.group([
    task_scan_repo(scan_id, repo1),
    task_scan_repo(scan_id, repo2),
    ...
    task_scan_repo(scan_id, repoN),
]) | task_finalize_scan(scan_id) → complete
```

**New Celery tasks:**

```python
@app.task(name="redact.scan_repo")
def task_scan_repo(scan_id: str, repo: dict, session_id: str, timeout: int = 300) -> dict:
    """Scan a single repo. Returns summary dict."""
    ...

@app.task(name="redact.bulk_scan")
def task_bulk_scan(scan_id: str, target_name: str, target_type: str,
                   session_id: str, timeout: int = 300, allow_private: bool = False) -> None:
    """Fan out per-repo scan tasks in parallel."""
    ...

@app.task(name="redact.finalize_scan")
def task_finalize_scan(results: list, scan_id: str) -> None:
    """Chord callback — mark scan complete after all repos finish."""
    ...
```

**Concurrency control:**

The existing `MAX_CONCURRENT_SCANS=3` limits worker concurrency. For bulk scans:
- Use a dedicated Celery queue (`bulk_scan`) with its own concurrency setting
- Or use `celery.chord` with a rate limit on `task_scan_repo`: `rate_limit='3/m'`
- This prevents a single bulk scan from starving other users' scans

**Progress tracking:**

Each `task_scan_repo` publishes progress to the same `scan:{scan_id}` Redis channel. The SSE stream and frontend work unchanged — they already handle interleaved repo events.

The parent scan's `repos_scanned` counter is incremented atomically:
```python
db.query(Scan).filter(Scan.id == scan_id).update(
    {Scan.repos_scanned: Scan.repos_scanned + 1}
)
```

**Failure handling:**
- Individual repo failures don't fail the whole scan
- `task_scan_repo` catches exceptions and returns `{"status": "failed", "repo": repo_name, "error": str(e)}`
- `task_finalize_scan` aggregates results: if all repos failed → scan status "failed"; if some failed → "partial"; if all succeeded → "completed"
- Chord error callback marks the scan as failed if the group itself errors

**Frontend changes:**

Minimal. The existing ScanView already handles:
- Multiple `repo_started` / `repo_complete` events (they just arrive faster now)
- Progress bar based on `repos_scanned / repos_total`
- Findings appearing incrementally

Add a "Parallel scan" toggle on the Landing page (only shown for org-level scans). Default off for backward compatibility.

**API changes:**

Add `parallel: bool = False` to `ScanCreate` schema. When true, dispatches `task_bulk_scan` instead of `task_deep_scan`.

**Scaling considerations:**
- Each parallel task clones a repo to `/tmp/scans/{scan_id}/{repo_name}` — tmpfs must be sized appropriately
- With 3 concurrent workers and 100 repos, throughput increases ~3x vs sequential
- For very large orgs (500+ repos), consider batching into groups of 50 to avoid overwhelming the task queue

**Implementation estimate:** ~3 days (new tasks + chord wiring + concurrency controls + toggle UI)

---

## Priority & Sequencing

Recommended implementation order based on value and dependency:

| Priority | Feature | Depends On | Effort |
|---|---|---|---|
| 1 | Scan Diff / Delta Reports | Nothing | 2 days |
| 2 | SARIF & CSV Export | Nothing | 1.5 days |
| 3 | Webhook Notifications | Nothing | 3 days |
| 4 | Finding Age / SLA Dashboard | Scan Diff (for MTTR) | 2.5 days |
| 5 | Secret Rotation Verification | Nothing | 2 days |
| 6 | Bulk Org Scan (Parallel) | Nothing | 3 days |
| 7 | Multi-Platform (GitLab/Bitbucket) | Nothing | 4 days |

Features 1, 2, and 5 are independent and can be developed in parallel by different team members. Feature 4 benefits from Feature 1 being complete (resolved findings enable MTTR tracking).

**Total estimated effort:** ~18 developer-days

---

## Out of Scope (for now)

These were considered but deferred:
- **User accounts / RBAC** — Requires auth infrastructure; session model is sufficient for current use case
- **GitHub App / PR bot** — Requires public hosting, OAuth app registration, webhook receiver
- **AI remediation suggestions** — Requires LLM integration; manual remediation guides in Finding Detail are sufficient
- **Secret sprawl detection (cross-repo)** — Requires cross-scan correlation; `raw_secret_hash` enables this but the query is expensive at scale
