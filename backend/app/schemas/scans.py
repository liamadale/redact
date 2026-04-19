import uuid
from datetime import datetime

from pydantic import BaseModel


class ScanCreate(BaseModel):
    platform: str = "github"
    target_type: str  # 'org', 'user', 'repo'
    target_name: str
    scan_type: str  # 'quick', 'deep'
    token: str | None = None


class ScanResponse(BaseModel):
    id: uuid.UUID
    session_id: str
    platform: str
    target_type: str
    target_name: str
    scan_type: str
    status: str
    repos_total: int
    repos_scanned: int
    current_repo: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class FindingResponse(BaseModel):
    id: uuid.UUID
    scan_id: uuid.UUID
    repo_name: str
    secret_type: str
    severity: str
    file_path: str
    line_number: int | None
    commit_sha: str | None
    commit_date: datetime | None
    commit_author: str | None
    commit_message: str | None
    branch_status: str | None
    verified: bool | None
    redacted_secret: str | None
    occurrence_count: int
    first_seen: datetime | None
    last_seen: datetime | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class FindingsListResponse(BaseModel):
    findings: list[FindingResponse]
    total: int
