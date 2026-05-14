import json
from unittest.mock import MagicMock, patch

import pytest
from datetime import datetime

from app.scanning.deep_scan import (
    _classify_severity,
    _compute_dedup_hash,
    _parse_finding,
    _parse_timestamp,
    _redact_secret,
    _run_trufflehog,
)

SAMPLE_TRUFFLEHOG_OUTPUT = {
    "SourceMetadata": {
        "Data": {
            "Git": {
                "file": "config/aws.py",
                "line": 23,
                "commit": "a1b2c3d4e5f6",
                "timestamp": "2026-01-15T10:00:00Z",
                "email": "dev@example.com",
                "message": "add config",
            }
        }
    },
    "DetectorType": 1,
    "DetectorName": "AWS",
    "Verified": True,
    "Raw": "AKIAIOSFODNN7EXAMPLE",
    "RawV2": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "ExtraData": {"account_id": "123456789012"},
}


def test_classify_severity_verified_is_critical():
    assert _classify_severity("AWS", verified=True) == "critical"


def test_classify_severity_high_value_unverified():
    assert _classify_severity("AWS", verified=False) == "high"
    assert _classify_severity("PrivateKey", verified=False) == "high"
    assert _classify_severity("SSH", verified=False) == "high"


def test_classify_severity_low_value():
    assert _classify_severity("Firebase", verified=False) == "medium"
    assert _classify_severity("GoogleMaps", verified=False) == "medium"


def test_classify_severity_generic():
    assert _classify_severity("GenericToken", verified=False) == "medium"


def test_redact_secret():
    assert _redact_secret("AKIAIOSFODNN7EXAMPLE") == "AKIA████████████████"
    assert _redact_secret("ab") == "ab"


def test_compute_dedup_hash_deterministic():
    h1 = _compute_dedup_hash("secret1", "file.py", "org/repo")
    h2 = _compute_dedup_hash("secret1", "file.py", "org/repo")
    assert h1 == h2
    assert len(h1) == 64


def test_compute_dedup_hash_different_inputs():
    h1 = _compute_dedup_hash("secret1", "file.py", "org/repo")
    h2 = _compute_dedup_hash("secret2", "file.py", "org/repo")
    h3 = _compute_dedup_hash("secret1", "other.py", "org/repo")
    assert h1 != h2
    assert h1 != h3


def test_parse_finding_strips_raw_fields():
    parsed = _parse_finding(SAMPLE_TRUFFLEHOG_OUTPUT, "org/repo")
    assert "Raw" not in parsed["raw_detector_output"]
    assert "RawV2" not in parsed["raw_detector_output"]
    assert "ExtraData" in parsed["raw_detector_output"]


def test_parse_finding_fields():
    parsed = _parse_finding(SAMPLE_TRUFFLEHOG_OUTPUT, "org/repo")
    assert parsed["repo_name"] == "org/repo"
    assert parsed["secret_type"] == "AWS"
    assert parsed["severity"] == "critical"
    assert parsed["file_path"] == "config/aws.py"
    assert parsed["commit_sha"] == "a1b2c3d4e5f6"
    assert parsed["verified"] is True
    assert parsed["redacted_secret"] == "AKIA████████████████"


def test_run_trufflehog_no_only_verified():
    """Assert --only-verified is never passed to TruffleHog."""
    with patch("app.scanning.deep_scan.subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        mock_proc.stdout.__iter__ = lambda self: iter([])
        mock_proc.stderr.read.return_value = ""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        _run_trufflehog("/tmp/fake-repo")

        cmd = mock_popen.call_args[0][0]
        assert "--only-verified" not in cmd


def test_run_trufflehog_parses_jsonl():
    """Feed JSONL output and verify findings are collected."""
    line = json.dumps(SAMPLE_TRUFFLEHOG_OUTPUT)

    with patch("app.scanning.deep_scan.subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        mock_proc.stdout.__iter__ = lambda self: iter([line + "\n"])
        mock_proc.stderr.read.return_value = ""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        findings, timed_out = _run_trufflehog("/tmp/fake-repo")

        assert not timed_out
        assert len(findings) == 1
        assert findings[0]["DetectorName"] == "AWS"


def test_run_trufflehog_includes_no_update_flag():
    """Regression: TruffleHog auto-updater fails on read-only FS and exits without scanning."""
    with patch("app.scanning.deep_scan.subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        mock_proc.stdout.__iter__ = lambda self: iter([])
        mock_proc.stderr.read.return_value = ""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        _run_trufflehog("/tmp/fake-repo")

        cmd = mock_popen.call_args[0][0]
        assert "--no-update" in cmd


def test_parse_timestamp_z_suffix():
    """TruffleHog emits 'Z' suffix — must parse to naive UTC datetime."""
    dt = _parse_timestamp("2026-01-15T10:00:00Z")
    assert isinstance(dt, datetime)
    assert dt.tzinfo is None  # naive UTC — matches DateTime column reads from DB
    assert dt.year == 2026
    assert dt.hour == 10


def test_parse_timestamp_offset():
    dt = _parse_timestamp("2026-01-15T10:00:00+00:00")
    assert isinstance(dt, datetime)
    assert dt.tzinfo is None


def test_parse_timestamp_none():
    assert _parse_timestamp(None) is None


def test_parse_finding_commit_date_is_datetime():
    """Regression: commit_date must be a datetime, not a raw string.

    _upsert_finding compares commit_date against existing.first_seen (a datetime
    read from PostgreSQL). If commit_date is a string this raises TypeError.
    """
    parsed = _parse_finding(SAMPLE_TRUFFLEHOG_OUTPUT, "org/repo")
    assert isinstance(parsed["commit_date"], datetime)
    assert parsed["commit_date"].tzinfo is None  # naive UTC


def test_run_trufflehog_uses_bare_flag():
    """Regression: --all-branches doesn't exist in TruffleHog 3.82; use --bare for mirror clones."""
    with patch("app.scanning.deep_scan.subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        mock_proc.stdout.__iter__ = lambda self: iter([])
        mock_proc.stderr.read.return_value = ""
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        _run_trufflehog("/tmp/fake-repo")

        cmd = mock_popen.call_args[0][0]
        assert "--bare" in cmd
        assert "--all-branches" not in cmd


def test_run_deep_scan_missing_scan_raises():
    """Fix 1.2: run_deep_scan must raise ValueError when scan row is missing."""
    import uuid
    from unittest.mock import MagicMock

    from app.scanning.deep_scan import run_deep_scan

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(ValueError, match="not found"):
        run_deep_scan(uuid.uuid4(), [], db)


def test_run_deep_scan_finally_does_not_mask_original_exception():
    """Fix 1.7: a DB error in the finally block must not replace the original exception."""
    import uuid
    from unittest.mock import MagicMock

    from app.scanning.deep_scan import run_deep_scan

    original_error = RuntimeError("original scan failure")

    scan = MagicMock()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = scan

    commit_calls = []

    def commit_side_effect():
        commit_calls.append(len(commit_calls))
        # First two commits (repos_total, status=failed) succeed;
        # third commit (in finally block) raises to test masking fix.
        if len(commit_calls) >= 3:
            raise RuntimeError("db commit in finally failed")

    db.commit.side_effect = commit_side_effect

    # Repos with len() but iteration raises the original error
    class ErrorRepos:
        def __len__(self):
            return 1

        def __iter__(self):
            raise original_error

    with pytest.raises(RuntimeError, match="original scan failure"):
        run_deep_scan(uuid.uuid4(), ErrorRepos(), db)


def test_clone_repo_uses_basic_auth_not_bearer():
    """Regression: GitHub git HTTP transport requires Basic auth, not Bearer.

    Classic PATs (ghp_*) must be sent as:
      Authorization: Basic base64("x-access-token:{token}")
    Using 'Bearer {token}' causes HTTP 401 → git exit code 128.
    """
    import base64
    from pathlib import Path

    from app.scanning.deep_scan import _clone_repo

    with patch("app.scanning.deep_scan.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0)

        _clone_repo(
            "https://github.com/org/repo.git",
            Path("/tmp/test-dest"),
            token="ghp_testtoken123",
        )

        cmd = mock_run.call_args[0][0]
        header_arg = cmd[2]  # the http.extraHeader=... value

        assert "Bearer" not in header_arg
        assert "Authorization: Basic " in header_arg

        # Verify the base64 payload decodes to x-access-token:{token}
        b64_value = header_arg.split("Basic ")[1]
        decoded = base64.b64decode(b64_value).decode()
        assert decoded == "x-access-token:ghp_testtoken123"