import json
from unittest.mock import MagicMock, patch

from app.scanning.deep_scan import (
    _classify_severity,
    _compute_dedup_hash,
    _parse_finding,
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
