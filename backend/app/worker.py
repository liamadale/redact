import json
import logging
import os
import shutil
import uuid

from celery import Celery
from celery.signals import worker_ready

from app.database import SessionLocal
from app.scanning.deep_scan import SCAN_DIR, run_deep_scan
from app.scanning.quick_scan import run_quick_scan

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

app = Celery("redact", broker=REDIS_URL, backend=REDIS_URL)
app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    worker_concurrency=int(os.environ.get("MAX_CONCURRENT_SCANS", "3")),
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@worker_ready.connect
def cleanup_orphaned_scans(**kwargs: object) -> None:
    """Purge leftover clone directories from previous crashes."""
    if SCAN_DIR.exists():
        shutil.rmtree(SCAN_DIR, ignore_errors=True)
        logger.info("Cleaned up orphaned scan directories")


def _publish_progress(scan_id: str, data: dict) -> None:
    """Publish scan progress to Redis pub/sub channel."""
    import redis

    r = redis.Redis.from_url(REDIS_URL)
    r.publish(f"scan:{scan_id}", json.dumps(data))
    r.close()


@app.task(name="redact.quick_scan")
def task_quick_scan(scan_id: str, target: str, session_id: str) -> None:
    """Run quick scan (GitHub Search API) as background task."""
    import asyncio

    from app.session import get_token

    token = get_token(session_id) or os.environ.get("GITHUB_TOKEN")
    db = SessionLocal()
    try:
        asyncio.run(run_quick_scan(uuid.UUID(scan_id), target, token, db))
        _publish_progress(scan_id, {"event": "complete", "scan_type": "quick"})
    except Exception as e:
        logger.error("Quick scan task failed: %s", e)
        _publish_progress(scan_id, {"event": "failed", "error": str(e)})
        raise
    finally:
        db.close()


@app.task(name="redact.deep_scan")
def task_deep_scan(
    scan_id: str, target_name: str, target_type: str, session_id: str,
    timeout: int = 300,
) -> None:
    """Run deep scan (clone + TruffleHog) as background task."""
    import asyncio

    from app.adapters.github import GitHubAdapter
    from app.session import get_token

    from app.models.models import Scan

    db = SessionLocal()
    try:
        # Mark running before repo listing so UI shows progress
        scan = db.query(Scan).filter(Scan.id == uuid.UUID(scan_id)).first()
        if scan:
            scan.status = "running"
            db.commit()

        # Build repo list — moved here from route handler
        if target_type == "repo":
            repos = [
                {
                    "full_name": target_name,
                    "clone_url": f"https://github.com/{target_name}.git",
                }
            ]
        else:
            token = get_token(session_id) or os.environ.get("GITHUB_TOKEN")
            adapter = GitHubAdapter(token=token)

            async def _list() -> list[dict]:
                try:
                    result = await adapter.list_repos(target_name)
                finally:
                    await adapter.close()
                return [
                    {"full_name": r.full_name, "clone_url": r.clone_url}
                    for r in result
                ]

            repos = asyncio.run(_list())

        if not repos:
            scan = db.query(Scan).filter(Scan.id == uuid.UUID(scan_id)).first()
            if scan:
                scan.status = "failed"
                db.commit()
            _publish_progress(scan_id, {"event": "failed", "error": "No public repos found"})
            return

        def on_progress(data: dict) -> None:
            _publish_progress(scan_id, data)

        run_deep_scan(
            uuid.UUID(scan_id),
            repos,
            db,
            timeout=timeout,
            on_progress=on_progress,
        )
        _publish_progress(scan_id, {"event": "complete", "scan_type": "deep"})
    except Exception as e:
        logger.error("Deep scan task failed: %s", e)
        _publish_progress(scan_id, {"event": "failed", "error": str(e)})
        raise
    finally:
        db.close()


@app.task(name="redact.cleanup_orphans")
def task_cleanup_orphans() -> None:
    """Periodic task to clean up orphaned scan directories older than 30 min."""
    import time

    if not SCAN_DIR.exists():
        return
    now = time.time()
    for child in SCAN_DIR.iterdir():
        if child.is_dir() and (now - child.stat().st_mtime) > 1800:
            shutil.rmtree(child, ignore_errors=True)
            logger.info("Cleaned orphaned scan dir: %s", child.name)


@app.task(name="redact.reap_stale_scans")
def task_reap_stale_scans() -> None:
    """Mark scans stuck in 'running' for over 10 minutes as failed."""
    from datetime import datetime, timedelta, timezone

    from app.models.models import Scan

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        stale = (
            db.query(Scan)
            .filter(Scan.status == "running", Scan.started_at < cutoff)
            .all()
        )
        for scan in stale:
            scan.status = "failed"
            scan.completed_at = datetime.now(timezone.utc)
            logger.warning("Reaped stale scan %s", scan.id)
        db.commit()
    finally:
        db.close()


# Celery Beat schedule for periodic tasks
app.conf.beat_schedule = {
    "cleanup-orphaned-scans": {
        "task": "redact.cleanup_orphans",
        "schedule": 900.0,
    },
    "reap-stale-scans": {
        "task": "redact.reap_stale_scans",
        "schedule": 300.0,
    },
}
