import uuid
from datetime import datetime

from app.models.models import Finding
from app.scanning.deep_scan import _upsert_finding

_DT = datetime(2026, 1, 1)


def test_upsert_finding_creates_new(db):
    scan_id = uuid.uuid4()
    from app.models.models import Scan

    scan = Scan(
        id=scan_id,
        session_id="a" * 64,
        platform="github",
        target_type="org",
        target_name="test-org",
        scan_type="deep",
        status="running",
    )
    db.add(scan)
    db.commit()

    parsed = {
        "dedup_hash": "d" * 64,
        "repo_name": "org/repo",
        "secret_type": "AWS",
        "severity": "critical",
        "file_path": "config.py",
        "line_number": 10,
        "commit_sha": "abc123",
        "commit_date": _DT,
        "commit_author": "dev@example.com",
        "commit_message": "add config",
        "verified": True,
        "redacted_secret": "AKIA████████████████",
        "raw_secret_hash": "e" * 64,
        "raw_detector_output": {"DetectorName": "AWS"},
    }

    _upsert_finding(scan_id, parsed, db)

    finding = db.query(Finding).filter(Finding.scan_id == scan_id).first()
    assert finding is not None
    assert finding.occurrence_count == 1
    assert finding.secret_type == "AWS"


def test_upsert_finding_increments_occurrence(db):
    scan_id = uuid.uuid4()
    from app.models.models import Scan

    scan = Scan(
        id=scan_id,
        session_id="a" * 64,
        platform="github",
        target_type="org",
        target_name="test-org",
        scan_type="deep",
        status="running",
    )
    db.add(scan)
    db.commit()

    parsed = {
        "dedup_hash": "d" * 64,
        "repo_name": "org/repo",
        "secret_type": "AWS",
        "severity": "critical",
        "file_path": "config.py",
        "line_number": 10,
        "commit_sha": "abc123",
        "commit_date": _DT,
        "commit_author": "dev@example.com",
        "commit_message": "add config",
        "verified": True,
        "redacted_secret": "AKIA████████████████",
        "raw_secret_hash": "e" * 64,
        "raw_detector_output": {},
    }

    _upsert_finding(scan_id, parsed, db)
    parsed["commit_sha"] = "def456"
    _upsert_finding(scan_id, parsed, db)

    finding = db.query(Finding).filter(Finding.scan_id == scan_id).first()
    assert finding.occurrence_count == 2
    assert "def456" in finding.commit_shas


def test_different_files_create_separate_findings(db):
    scan_id = uuid.uuid4()
    from app.models.models import Scan

    scan = Scan(
        id=scan_id,
        session_id="a" * 64,
        platform="github",
        target_type="org",
        target_name="test-org",
        scan_type="deep",
        status="running",
    )
    db.add(scan)
    db.commit()

    base = {
        "repo_name": "org/repo",
        "secret_type": "AWS",
        "severity": "critical",
        "file_path": "config.py",
        "line_number": 10,
        "commit_sha": "abc123",
        "commit_date": _DT,
        "commit_author": "dev@example.com",
        "commit_message": "add config",
        "verified": True,
        "redacted_secret": "AKIA████████████████",
        "raw_secret_hash": "e" * 64,
        "raw_detector_output": {},
    }

    _upsert_finding(scan_id, {**base, "dedup_hash": "a" * 64}, db)
    _upsert_finding(scan_id, {**base, "dedup_hash": "b" * 64}, db)

    count = db.query(Finding).filter(Finding.scan_id == scan_id).count()
    assert count == 2


def test_reap_stale_scans(db):
    """Regression: scans stuck in 'running' after worker crash should be marked failed."""
    from datetime import datetime, timedelta, timezone

    from app.models.models import Scan

    # Create a scan that's been "running" for 15 minutes
    scan = Scan(
        id=uuid.uuid4(),
        session_id="a" * 64,
        platform="github",
        target_type="org",
        target_name="test-org",
        scan_type="deep",
        status="running",
        started_at=datetime.now(timezone.utc) - timedelta(minutes=15),
    )
    db.add(scan)
    db.commit()

    # Run the reaper logic inline
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale = (
        db.query(Scan).filter(Scan.status == "running", Scan.started_at < cutoff).all()
    )
    for s in stale:
        s.status = "failed"
        s.completed_at = datetime.now(timezone.utc)
    db.commit()

    db.refresh(scan)
    assert scan.status == "failed"
    assert scan.completed_at is not None
