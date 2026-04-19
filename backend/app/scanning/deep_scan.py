import hashlib
import json
import logging
import shutil
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.models import Finding, Scan

logger = logging.getLogger(__name__)

SCAN_DIR = Path("/tmp/scans")
MAX_REPO_SIZE_MB = 500
DEFAULT_TIMEOUT = 300


def _run_trufflehog(
    repo_path: str, timeout: int = DEFAULT_TIMEOUT, on_finding=None
) -> tuple[list[dict], bool]:
    cmd = [
        "trufflehog",
        "git",
        f"file://{repo_path}",
        "--json",
        "--bare",
        "--no-update",
    ]

    findings = []
    timed_out = threading.Event()
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )

    def kill_on_timeout():
        timed_out.set()
        proc.kill()

    timer = threading.Timer(timeout, kill_on_timeout)
    timer.start()

    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                finding = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("Skipping non-JSON TruffleHog output: %s", line[:200])
                continue
            findings.append(finding)
            if on_finding:
                on_finding(finding)

        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    finally:
        timer.cancel()
        proc.stdout.close()
        stderr_output = proc.stderr.read() if proc.stderr else ""
        if stderr_output:
            logger.warning("TruffleHog stderr: %s", stderr_output[:500])
        if proc.stderr:
            proc.stderr.close()

    return findings, timed_out.is_set()


def _compute_dedup_hash(raw_secret: str, file_path: str, repo_name: str) -> str:
    secret_hash = hashlib.sha256(raw_secret.encode()).hexdigest()
    return hashlib.sha256(f"{secret_hash}:{file_path}:{repo_name}".encode()).hexdigest()


def _classify_severity(detector_type: str, verified: bool) -> str:
    if verified:
        return "critical"
    high_value = {
        "AWS",
        "Stripe",
        "PrivateKey",
        "RSA",
        "SSH",
        "PGP",
        "JDBC",
        "MongoDB",
        "PostgreSQL",
        "MySQL",
    }
    if any(h.lower() in detector_type.lower() for h in high_value):
        return "high"
    low_value = {"StripeTest", "Firebase", "GoogleMaps"}
    if any(lv.lower() in detector_type.lower() for lv in low_value):
        return "medium"
    return "medium"


def _redact_secret(raw: str) -> str:
    if len(raw) > 4:
        return raw[:4] + "█" * (len(raw) - 4)
    return raw


def _parse_finding(raw: dict, repo_name: str) -> dict:
    """Parse TruffleHog JSON output into our finding fields."""
    source_metadata = raw.get("SourceMetadata", {}).get("Data", {}).get("Git", {})
    raw_secret = raw.get("Raw", "")
    file_path = source_metadata.get("file", "")
    verified = raw.get("Verified", False)
    detector_type = raw.get("DetectorType", 0)
    detector_name = raw.get("DetectorName", str(detector_type))

    # Strip Raw/RawV2 from stored output
    sanitized_output = {k: v for k, v in raw.items() if k not in ("Raw", "RawV2")}

    return {
        "dedup_hash": _compute_dedup_hash(raw_secret, file_path, repo_name),
        "repo_name": repo_name,
        "secret_type": detector_name,
        "severity": _classify_severity(detector_name, verified),
        "file_path": file_path,
        "line_number": source_metadata.get("line"),
        "commit_sha": source_metadata.get("commit"),
        "commit_date": source_metadata.get("timestamp"),
        "commit_author": source_metadata.get("email"),
        "commit_message": source_metadata.get("message"),
        "verified": verified,
        "redacted_secret": _redact_secret(raw_secret),
        "raw_secret_hash": hashlib.sha256(raw_secret.encode()).hexdigest(),
        "raw_detector_output": sanitized_output,
    }


def _clone_repo(clone_url: str, dest: Path) -> None:
    subprocess.run(
        ["git", "clone", "--mirror", clone_url, str(dest)],
        check=True,
        capture_output=True,
        timeout=120,
    )


def run_deep_scan(
    scan_id: uuid.UUID,
    repos: list[dict],
    db: Session,
    timeout: int = DEFAULT_TIMEOUT,
    on_progress=None,
) -> None:
    """Run deep scan on a list of repos. Each repo dict has 'full_name' and 'clone_url'."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    scan.status = "running"
    scan.repos_total = len(repos)
    db.commit()

    scan_dir = SCAN_DIR / str(scan_id)
    scan_dir.mkdir(parents=True, exist_ok=True)

    any_timeout = False

    try:
        for i, repo in enumerate(repos):
            repo_name = repo["full_name"]
            clone_url = repo["clone_url"]
            repo_dir = scan_dir / repo_name.replace("/", "_")

            scan.current_repo = repo_name
            db.commit()

            if on_progress:
                on_progress({"event": "repo_started", "repo": repo_name})

            try:
                _clone_repo(clone_url, repo_dir)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
                logger.error("Failed to clone %s: %s", repo_name, e)
                continue

            def on_finding(raw_finding):
                parsed = _parse_finding(raw_finding, repo_name)
                _upsert_finding(scan_id, parsed, db)
                if on_progress:
                    on_progress(
                        {
                            "event": "finding",
                            "repo": repo_name,
                            "type": parsed["secret_type"],
                        }
                    )

            findings, did_timeout = _run_trufflehog(
                str(repo_dir), timeout=timeout, on_finding=on_finding
            )
            if did_timeout:
                any_timeout = True
                logger.warning("TruffleHog timed out on %s", repo_name)

            # Cleanup clone immediately
            shutil.rmtree(repo_dir, ignore_errors=True)

            scan.repos_scanned = i + 1
            db.commit()

            if on_progress:
                on_progress({"event": "repo_complete", "repo": repo_name})

        scan.status = "partial" if any_timeout else "completed"
        scan.completed_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:
        logger.error("Deep scan %s failed: %s", scan_id, e)
        scan.status = "failed"
        db.commit()
        raise
    finally:
        shutil.rmtree(scan_dir, ignore_errors=True)
        scan.current_repo = None
        db.commit()


def _upsert_finding(scan_id: uuid.UUID, parsed: dict, db: Session) -> None:
    existing = (
        db.query(Finding)
        .filter(Finding.scan_id == scan_id, Finding.dedup_hash == parsed["dedup_hash"])
        .first()
    )
    if existing:
        existing.occurrence_count += 1
        if parsed.get("commit_sha"):
            shas = list(existing.commit_shas or [])
            shas.append(parsed["commit_sha"])
            existing.commit_shas = shas
        if parsed.get("commit_date"):
            if not existing.first_seen or parsed["commit_date"] < existing.first_seen:
                existing.first_seen = parsed["commit_date"]
            if not existing.last_seen or parsed["commit_date"] > existing.last_seen:
                existing.last_seen = parsed["commit_date"]
    else:
        finding = Finding(
            id=uuid.uuid4(),
            scan_id=scan_id,
            dedup_hash=parsed["dedup_hash"],
            repo_name=parsed["repo_name"],
            secret_type=parsed["secret_type"],
            severity=parsed["severity"],
            file_path=parsed["file_path"],
            line_number=parsed.get("line_number"),
            commit_sha=parsed.get("commit_sha"),
            commit_date=parsed.get("commit_date"),
            commit_author=parsed.get("commit_author"),
            commit_message=parsed.get("commit_message"),
            verified=parsed["verified"],
            redacted_secret=parsed["redacted_secret"],
            raw_secret_hash=parsed["raw_secret_hash"],
            occurrence_count=1,
            first_seen=parsed.get("commit_date"),
            last_seen=parsed.get("commit_date"),
            commit_shas=[parsed["commit_sha"]] if parsed.get("commit_sha") else [],
            raw_detector_output=parsed.get("raw_detector_output"),
        )
        db.add(finding)
    db.commit()
