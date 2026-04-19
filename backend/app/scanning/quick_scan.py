import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.adapters.github import SEARCH_PATTERNS, GitHubAdapter
from app.models.models import Scan, SearchHit as SearchHitModel

logger = logging.getLogger(__name__)


def _redact_fragment(fragment: str, pattern: str) -> str:
    """Mask matched secret values in fragment, showing only first 4 chars."""
    idx = fragment.find(pattern)
    if idx == -1:
        return fragment
    # Find the token boundary after the pattern match
    start = idx
    end = start
    for i in range(start, len(fragment)):
        if fragment[i] in (" ", "\n", "\r", "\t", '"', "'", ",", ";"):
            break
        end = i + 1
    matched = fragment[start:end]
    if len(matched) > 4:
        redacted = matched[:4] + "█" * (len(matched) - 4)
    else:
        redacted = matched
    return fragment[:start] + redacted + fragment[end:]


async def run_quick_scan(
    scan_id: uuid.UUID,
    target: str,
    token: str | None,
    db: Session,
) -> None:
    """Run a quick scan using GitHub Search API and store hits."""
    adapter = GitHubAdapter(token=token)

    try:
        # Update scan status
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        scan.status = "running"
        db.commit()

        hits = await adapter.search_code(target, SEARCH_PATTERNS)

        for hit in hits:
            if hit.repo.is_private:
                continue

            redacted_fragment = _redact_fragment(hit.text_fragment, hit.matched_pattern)

            db_hit = SearchHitModel(
                id=uuid.uuid4(),
                scan_id=scan_id,
                repo_name=hit.repo.full_name,
                file_path=hit.file_path,
                matched_pattern=hit.matched_pattern,
                text_fragment=redacted_fragment,
                html_url=hit.html_url,
            )
            db.add(db_hit)

        scan.status = "completed"
        scan.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Quick scan %s completed with %d hits", scan_id, len(hits))

    except Exception as e:
        logger.error("Quick scan %s failed: %s", scan_id, e)
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        scan.status = "failed"
        db.commit()
        raise
    finally:
        await adapter.close()
