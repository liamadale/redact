import hashlib
import os
import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.models import Finding, Scan, SearchHit as SearchHitModel
from app.schemas.scans import (
    FindingResponse,
    FindingsListResponse,
    ScanCreate,
    ScanResponse,
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
