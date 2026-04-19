import uuid
from unittest.mock import AsyncMock, patch

from app.models.models import Finding


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@patch("app.main.task_quick_scan")
def test_create_quick_scan(mock_task, client):
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


@patch("app.adapters.github.GitHubAdapter")
@patch("app.main.task_deep_scan")
def test_create_deep_scan(mock_task, mock_adapter_cls, client):
    from app.adapters.base import Repo

    mock_task.delay = lambda *a, **kw: None
    mock_adapter = AsyncMock()
    mock_adapter.list_repos.return_value = [
        Repo(
            name="repo1",
            full_name="test-org/repo1",
            clone_url="https://github.com/test-org/repo1.git",
            default_branch="main",
            size_kb=100,
            is_private=False,
            last_pushed_at="2026-01-01T00:00:00Z",
        )
    ]
    mock_adapter_cls.return_value = mock_adapter

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


@patch("app.main.task_quick_scan")
def test_get_scan(mock_task, client):
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


@patch("app.main.task_quick_scan")
def test_get_findings_empty(mock_task, client):
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


@patch("app.main.task_quick_scan")
def test_get_findings_with_data(mock_task, client, db):
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

    # Insert a finding directly
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


def test_invalid_scan_type(client):
    resp = client.post(
        "/scans",
        json={
            "target_type": "org",
            "target_name": "test-org",
            "scan_type": "invalid",
        },
    )
    assert resp.status_code == 400
