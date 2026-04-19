import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String(64), nullable=False)
    platform = Column(String(20), nullable=False)
    target_type = Column(String(20), nullable=False)
    target_name = Column(String(255), nullable=False)
    scan_type = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False)
    repos_total = Column(Integer, default=0)
    repos_scanned = Column(Integer, default=0)
    current_repo = Column(String(255))
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_scans_session", "session_id"),)


class Finding(Base):
    __tablename__ = "findings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"))
    dedup_hash = Column(String(64), nullable=False)
    repo_name = Column(String(255), nullable=False)
    secret_type = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)
    file_path = Column(Text, nullable=False)
    line_number = Column(Integer)
    commit_sha = Column(String(40))
    commit_date = Column(DateTime)
    commit_author = Column(String(255))
    commit_message = Column(Text)
    branch_status = Column(String(20))
    verified = Column(Boolean)
    redacted_secret = Column(Text)
    raw_secret_hash = Column(String(64), nullable=False)
    occurrence_count = Column(Integer, default=1)
    first_seen = Column(DateTime)
    last_seen = Column(DateTime)
    commit_shas = Column(JSON)
    raw_detector_output = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("scan_id", "dedup_hash", name="uq_findings_dedup"),
        Index("idx_findings_scan_id", "scan_id"),
    )


class SearchHit(Base):
    __tablename__ = "search_hits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"))
    repo_name = Column(String(255), nullable=False)
    file_path = Column(Text, nullable=False)
    matched_pattern = Column(String(100), nullable=False)
    text_fragment = Column(Text)
    html_url = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_search_hits_scan_id", "scan_id"),)


class ComplianceMapping(Base):
    __tablename__ = "compliance_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    secret_type = Column(String(100), nullable=False)
    framework = Column(String(50), nullable=False)
    control_id = Column(String(50), nullable=False)
    control_title = Column(Text, nullable=False)
    description = Column(Text)
