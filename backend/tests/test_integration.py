"""Integration test: runs a real deep scan against trufflesecurity/test_keys.

Requirements:
  - Network access (clones from GitHub)
  - TruffleHog binary installed and on PATH
  - Run with: pytest tests/test_integration.py -v -m integration
"""

import shutil
import uuid

import pytest

from app.models.models import Finding, Scan
from app.scanning.deep_scan import run_deep_scan

pytestmark = pytest.mark.integration


@pytest.fixture
def scan_record(db):
    scan = Scan(
        id=uuid.uuid4(),
        session_id="a" * 64,
        platform="github",
        target_type="repo",
        target_name="trufflesecurity/test_keys",
        scan_type="deep",
        status="queued",
    )
    db.add(scan)
    db.commit()
    return scan


@pytest.mark.skipif(
    not shutil.which("trufflehog"),
    reason="TruffleHog not installed",
)
def test_deep_scan_trufflesecurity_test_keys(scan_record, db):
    """Scan trufflesecurity/test_keys and verify findings are returned."""
    repos = [
        {
            "full_name": "trufflesecurity/test_keys",
            "clone_url": "https://github.com/trufflesecurity/test_keys.git",
        }
    ]

    run_deep_scan(scan_record.id, repos, db, timeout=120)

    db.refresh(scan_record)
    assert scan_record.status in ("completed", "partial")
    assert scan_record.repos_scanned == 1

    findings = db.query(Finding).filter(Finding.scan_id == scan_record.id).all()
    assert len(findings) > 0, "Expected findings from trufflesecurity/test_keys"

    # Verify finding fields are populated correctly
    for f in findings:
        assert f.secret_type, "secret_type should not be empty"
        assert f.severity in ("critical", "high", "medium", "low")
        assert f.redacted_secret, "redacted_secret should not be empty"
        assert f.raw_secret_hash, "raw_secret_hash should not be empty"
        assert len(f.raw_secret_hash) == 64  # SHA256 hex
        # Ensure raw secret is NOT stored
        assert "Raw" not in (f.raw_detector_output or {})
        assert "RawV2" not in (f.raw_detector_output or {})
