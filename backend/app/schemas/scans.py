import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

# GitHub org/user: alphanumeric + hyphens, 1-39 chars, no leading/trailing hyphen
_GH_OWNER_RE = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$")
# GitHub repo name: alphanumeric, hyphens, underscores, dots, 1-100 chars
_GH_REPO_RE = re.compile(r"^[a-zA-Z0-9._-]{1,100}$")


class ScanCreate(BaseModel):
    platform: Literal["github"] = "github"
    target_type: Literal["org", "user", "repo"]
    target_name: str
    scan_type: Literal["quick", "deep"]
    token: str | None = None

    @field_validator("target_name")
    @classmethod
    def validate_target_name(cls, v: str, info: object) -> str:
        v = v.strip()
        if not v:
            raise ValueError("target_name must not be empty")
        # Access target_type from already-validated data
        values = info.data if hasattr(info, "data") else {}  # type: ignore[union-attr]
        target_type = values.get("target_type", "")
        if target_type == "repo":
            if "/" not in v:
                raise ValueError("repo target_name must be in 'owner/repo' format")
            owner, repo = v.split("/", 1)
            if not _GH_OWNER_RE.match(owner):
                raise ValueError(f"invalid GitHub owner: {owner}")
            if not _GH_REPO_RE.match(repo):
                raise ValueError(f"invalid GitHub repo name: {repo}")
        else:
            if not _GH_OWNER_RE.match(v):
                raise ValueError(f"invalid GitHub org/user name: {v}")
        return v


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


class ComplianceMappingResponse(BaseModel):
    framework: str
    control_id: str
    control_title: str
    description: str | None

    model_config = {"from_attributes": True}


class FindingDetailResponse(FindingResponse):
    compliance_controls: list[ComplianceMappingResponse] = []
