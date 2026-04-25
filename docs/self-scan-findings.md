# Redact Self-Scan Findings

> Redact scanning its own repository — eating our own dog food.

## Date

2026-04-25

## Summary

A deep scan of `liamadale/redact` produced **6 critical findings**, all Postgres connection strings verified as live by TruffleHog.

## Findings

| # | File | Commit | Severity | Verified |
|---|---|---|---|---|
| 1 | `backend/app/database.py:7` | f24359b | Critical | ✅ Live |
| 2 | `backend/alembic/env.py:15` | f24359b | Critical | ✅ Live |
| 3 | `backend/alembic.ini:89` | f24359b | Critical | ✅ Live |
| 4 | `.env.example:2` | 2943f7d | Critical | ✅ Live |
| 5 | `README.md:76` | 2943f7d | Critical | ✅ Live |
| 6 | `docs/implementation-plan.md:612` | 81df56f | Critical | ✅ Live |

All six findings are the same credential: the default Docker Compose Postgres connection string `postgresql://redact:redact@db:5432/redact`.

## Analysis

These are **true positives** — TruffleHog correctly identified database credentials in source code and verified they are active (the Postgres container was running with these credentials at scan time).

However, the **risk is negligible**:

- The credentials are the default local Docker Compose dev database (`redact`/`redact`)
- They only work inside the Docker network (`db` hostname) — not reachable externally
- `.env.example`, `README.md`, and `implementation-plan.md` are documentation — they intentionally show the connection string as example config
- `database.py` and `alembic/env.py` use the value as a fallback default when the `DATABASE_URL` environment variable is not set
- No production deployment exists — this is a local-only dev tool

## Compliance Controls Triggered

- **NIST 800-53 IA-5** — Authenticator Management
- **NIST 800-53 CM-6** — Configuration Settings
- **NIST 800-53 AU-2** — Audit Events
- **DISA STIG V-222642** — Application must not contain embedded authentication data

## Remediation Assessment

| Finding | Recommended Action |
|---|---|
| `database.py`, `alembic/env.py` | Could remove hardcoded fallback and require `DATABASE_URL` env var. Low priority — only affects local dev. |
| `alembic.ini` | Could template the URL via env var. Low priority. |
| `.env.example` | Intentional — this is the example config file. No action needed. |
| `README.md`, `implementation-plan.md` | Documentation references. No action needed. |

## Takeaway

This is a useful demonstration that Redact works as intended — it found real credentials in its own codebase, verified them as live, and mapped them to the correct compliance controls. The fact that these are low-risk dev defaults doesn't change the fact that the tool correctly flagged them. In a production codebase, the same pattern (hardcoded DB credentials with a fallback default) would be a real vulnerability.
