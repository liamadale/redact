import hashlib
import os
import uuid
from datetime import datetime, timezone

from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.models import Finding, Scan, SearchHit as SearchHitModel
from app.reports.compliance import get_controls_for_secret_type
from app.schemas.scans import (
    ComplianceMappingResponse,
    FindingDetailResponse,
    FindingResponse,
    FindingsListResponse,
    ScanCreate,
    ScanListResponse,
    ScanResponse,
    ScanSummaryResponse,
)
from app.session import store_token
from app.worker import task_deep_scan, task_quick_scan

app = FastAPI(title="Redact", version="0.1.0")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/metrics")
async def get_metrics(db: Session = Depends(get_db)):
    from sqlalchemy import func as sa_func  # noqa: PLC0415

    scan_stats = db.query(
        sa_func.count(Scan.id).label("total_scans"),
        sa_func.coalesce(sa_func.sum(Scan.repos_scanned), 0).label("total_repos"),
    ).first()

    finding_stats = db.query(sa_func.count(Finding.id)).scalar() or 0

    avg_ttd_row = db.query(
        sa_func.avg(
            sa_func.extract("epoch", Finding.created_at) - sa_func.extract("epoch", Finding.commit_date)
        )
    ).filter(Finding.commit_date.isnot(None)).first()

    avg_ttd_seconds = avg_ttd_row[0] if avg_ttd_row and avg_ttd_row[0] else None

    return {
        "total_scans": scan_stats[0] if scan_stats else 0,
        "total_repos_scanned": scan_stats[1] if scan_stats else 0,
        "total_findings": finding_stats,
        "avg_time_to_detect_seconds": round(avg_ttd_seconds) if avg_ttd_seconds else None,
    }


@app.get("/scans", response_model=ScanListResponse)
async def list_scans(db: Session = Depends(get_db)):
    from sqlalchemy import case, func as sa_func  # noqa: PLC0415

    counts = (
        db.query(
            Finding.scan_id,
            sa_func.count().label("findings_total"),
            sa_func.sum(case((Finding.severity == "critical", 1), else_=0)).label("findings_critical"),
            sa_func.sum(case((Finding.severity == "high", 1), else_=0)).label("findings_high"),
        )
        .group_by(Finding.scan_id)
        .subquery()
    )

    rows = (
        db.query(Scan, counts.c.findings_total, counts.c.findings_critical, counts.c.findings_high)
        .outerjoin(counts, Scan.id == counts.c.scan_id)
        .order_by(Scan.created_at.desc())
        .all()
    )

    scans = []
    for scan, total, critical, high in rows:
        d = ScanSummaryResponse.model_validate(scan)
        d.findings_total = total or 0
        d.findings_critical = critical or 0
        d.findings_high = high or 0
        scans.append(d)

    return ScanListResponse(scans=scans)


@app.post("/scans", response_model=ScanResponse, status_code=201)
async def create_scan(body: ScanCreate, db: Session = Depends(get_db)):
    raw_session = str(uuid.uuid4())
    session_id = hashlib.sha256(raw_session.encode()).hexdigest()

    # Store token in Redis session — never pass through Celery
    token = body.token or os.environ.get("GITHUB_TOKEN")
    if token:
        store_token(session_id, token)

    scan = Scan(
        id=uuid.uuid4(),
        session_id=session_id,
        platform=body.platform,
        target_type=body.target_type,
        target_name=body.target_name,
        scan_type=body.scan_type,
        status="queued",
        repos_total=0,
        repos_scanned=0,
        started_at=datetime.now(timezone.utc),
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # Queue task — worker reads token from Redis session if needed
    if body.scan_type == "quick":
        task_quick_scan.delay(str(scan.id), body.target_name, session_id)
    else:
        task_deep_scan.delay(
            str(scan.id), body.target_name, body.target_type, session_id
        )

    return scan


@app.get("/scans/{scan_id}", response_model=ScanResponse)
async def get_scan(scan_id: uuid.UUID, db: Session = Depends(get_db)):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@app.get("/scans/{scan_id}/stream")
async def stream_scan(scan_id: uuid.UUID):
    import asyncio
    import json

    import redis.asyncio as aioredis

    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")

    async def event_generator():
        r = aioredis.from_url(redis_url)
        pubsub = r.pubsub()
        await pubsub.subscribe(f"scan:{scan_id}")
        try:
            while True:
                msg = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=30.0
                )
                if msg and msg["type"] == "message":
                    data = msg["data"]
                    if isinstance(data, bytes):
                        data = data.decode()
                    yield f"data: {data}\n\n"
                    parsed = json.loads(data)
                    if parsed.get("event") in ("complete", "failed"):
                        break
                else:
                    yield ": keepalive\n\n"
                await asyncio.sleep(0.1)
        finally:
            await pubsub.unsubscribe(f"scan:{scan_id}")
            await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/scans/{scan_id}/findings", response_model=FindingsListResponse)
async def get_findings(
    scan_id: uuid.UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    query = db.query(Finding).filter(Finding.scan_id == scan_id)
    total = query.count()
    findings = query.offset(offset).limit(limit).all()

    return FindingsListResponse(
        findings=[FindingResponse.model_validate(f) for f in findings],
        total=total,
    )


@app.get("/scans/{scan_id}/hits")
async def get_search_hits(
    scan_id: uuid.UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    query = db.query(SearchHitModel).filter(SearchHitModel.scan_id == scan_id)
    total = query.count()
    hits = query.offset(offset).limit(limit).all()

    return {
        "hits": [
            {
                "repo_name": h.repo_name,
                "file_path": h.file_path,
                "matched_pattern": h.matched_pattern,
                "text_fragment": h.text_fragment,
                "html_url": h.html_url,
            }
            for h in hits
        ],
        "total": total,
    }


@app.get("/scans/{scan_id}/findings/{finding_id}", response_model=FindingDetailResponse)
async def get_finding(
    scan_id: uuid.UUID,
    finding_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> FindingDetailResponse:
    finding = (
        db.query(Finding)
        .filter(Finding.scan_id == scan_id, Finding.id == finding_id)
        .first()
    )
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    controls = get_controls_for_secret_type(db, finding.secret_type)
    base = FindingResponse.model_validate(finding).model_dump()
    return FindingDetailResponse(
        compliance_controls=[ComplianceMappingResponse.model_validate(c) for c in controls],
        **base,
    )


@app.get("/scans/{scan_id}/report")
async def get_report(
    scan_id: uuid.UUID,
    format: Literal["pdf", "json"] = Query("pdf"),
    severity: list[str] | None = Query(None),
    repo: list[str] | None = Query(None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    query = db.query(Finding).filter(Finding.scan_id == scan_id)
    if severity:
        query = query.filter(Finding.severity.in_(severity))
    if repo:
        query = query.filter(Finding.repo_name.in_(repo))
    findings = query.order_by(Finding.severity, Finding.repo_name).all()

    if format == "json":
        import json

        payload = {
            "scan": ScanResponse.model_validate(scan).model_dump(mode="json"),
            "findings": [
                FindingResponse.model_validate(f).model_dump(mode="json")
                for f in findings
            ],
        }
        filename = f"redact-report-{scan.target_name}-{scan.id}.json"
        return StreamingResponse(
            iter([json.dumps(payload, indent=2)]),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    from app.reports.pdf import generate_pdf_report  # noqa: PLC0415

    pdf_bytes = generate_pdf_report(scan, findings, db)
    filename = f"redact-report-{scan.target_name}-{scan.id}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
