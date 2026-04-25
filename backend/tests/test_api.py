import uuid
from unittest.mock import patch

from app.models.models import Finding


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@patch("app.main.store_token")
@patch("app.main.task_quick_scan")
def test_create_quick_scan(mock_task, mock_store, client):
    mock_task.delay = lambda *a, **kw: None
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "quick",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "queued"
    assert data["target_name"] == "test-org"
    assert data["scan_type"] == "quick"
    assert data["platform"] == "github"


@patch("app.main.store_token")
@patch("app.main.task_deep_scan")
def test_create_deep_scan(mock_task, mock_store, client):
    """Deep scan for org no longer calls GitHub API in route — just queues task."""
    called_args = {}

    def capture_delay(*args, **kwargs):
        called_args["args"] = args

    mock_task.delay = capture_delay
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "deep",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["scan_type"] == "deep"
    # Verify task receives (scan_id, target_name, target_type, session_id)
    args = called_args["args"]
    assert args[1] == "test-org"
    assert args[2] == "org"
    assert len(args[3]) == 64  # SHA256 session_id


@patch("app.main.store_token")
@patch("app.main.task_deep_scan")
def test_create_deep_scan_repo(mock_task, mock_store, client):
    """Deep scan for single repo passes target_type='repo'."""
    called_args = {}
    mock_task.delay = lambda *a, **kw: called_args.update(args=a)
    resp = client.post(
        "/scans",
        json={
            "target_type": "repo",
            "target_name": "owner/repo",
            "scan_type": "deep",
        },
    )
    assert resp.status_code == 201
    assert called_args["args"][2] == "repo"


@patch("app.main.store_token")
@patch("app.main.task_quick_scan")
def test_token_not_in_celery_args(mock_task, mock_store, client):
    """Token must never be serialized into Celery task arguments."""
    called_args = {}
    mock_task.delay = lambda *a, **kw: called_args.update(args=a)
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "quick",
            "token": "ghp_supersecrettoken123",
        },
    )
    assert resp.status_code == 201
    # Args should be (scan_id, target, session_id) — no token
    args = called_args["args"]
    for arg in args:
        assert "ghp_supersecrettoken123" not in str(arg)


@patch("app.main.store_token")
@patch("app.main.task_quick_scan")
def test_token_stored_in_session(mock_task, mock_store, client):
    """Token should be stored via store_token when provided."""
    mock_task.delay = lambda *a, **kw: None
    client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "quick",
            "token": "ghp_testtoken",
        },
    )
    mock_store.assert_called_once()
    _, token = mock_store.call_args[0]
    assert token == "ghp_testtoken"


@patch("app.main.store_token")
@patch("app.main.task_quick_scan")
def test_get_scan(mock_task, mock_store, client):
    mock_task.delay = lambda *a, **kw: None
    resp = client.post(
        "/scans",
        json={
            "target_type": "user",
            "target_name": "testuser",
            "scan_type": "quick",
        },
    )
    scan_id = resp.json()["id"]

    resp = client.get(f"/scans/{scan_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == scan_id


def test_get_scan_not_found(client):
    fake_id = str(uuid.uuid4())
    resp = client.get(f"/scans/{fake_id}")
    assert resp.status_code == 404


@patch("app.main.store_token")
@patch("app.main.task_quick_scan")
def test_get_findings_empty(mock_task, mock_store, client):
    mock_task.delay = lambda *a, **kw: None
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "quick",
        },
    )
    scan_id = resp.json()["id"]

    resp = client.get(f"/scans/{scan_id}/findings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["findings"] == []
    assert data["total"] == 0


@patch("app.main.store_token")
@patch("app.main.task_quick_scan")
def test_get_findings_with_data(mock_task, mock_store, client, db):
    mock_task.delay = lambda *a, **kw: None
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "quick",
        },
    )
    scan_id = resp.json()["id"]

    finding = Finding(
        id=uuid.uuid4(),
        scan_id=uuid.UUID(scan_id),
        dedup_hash="a" * 64,
        repo_name="test-org/repo1",
        secret_type="AWS",
        severity="critical",
        file_path="config.py",
        verified=True,
        redacted_secret="AKIA████████████",
        raw_secret_hash="b" * 64,
        occurrence_count=1,
    )
    db.add(finding)
    db.commit()

    resp = client.get(f"/scans/{scan_id}/findings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["findings"][0]["secret_type"] == "AWS"
    assert data["findings"][0]["severity"] == "critical"


# --- Input validation tests ---


def test_invalid_scan_type(client):
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "invalid",
        },
    )
    assert resp.status_code == 422


def test_invalid_target_type(client):
    resp = client.post(
        "/scans",
        json={
            "target_type": "invalid",
            "target_name": "test-org",
            "scan_type": "quick",
        },
    )
    assert resp.status_code == 422


def test_invalid_target_name_special_chars(client):
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test org; rm -rf /",
            "scan_type": "quick",
        },
    )
    assert resp.status_code == 422


def test_invalid_repo_format(client):
    resp = client.post(
        "/scans",
        json={
            "target_type": "repo",
            "target_name": "no-slash-here",
            "scan_type": "deep",
        },
    )
    assert resp.status_code == 422


def test_valid_repo_format(client):
    with patch("app.main.store_token"), patch("app.main.task_deep_scan") as mock_task:
        mock_task.delay = lambda *a, **kw: None
        resp = client.post(
            "/scans",
            json={
                "target_type": "repo",
                "target_name": "owner/my-repo.js",
                "scan_type": "deep",
            },
        )
        assert resp.status_code == 201


def test_empty_target_name(client):
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "   ",
            "scan_type": "quick",
        },
    )
    assert resp.status_code == 422
