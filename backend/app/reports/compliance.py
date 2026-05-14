from sqlalchemy.orm import Session

from app.models.models import ComplianceMapping


def get_controls_for_secret_type(
    db: Session, secret_type: str
) -> list[ComplianceMapping]:
    """Return NIST/STIG controls for a secret_type, falling back to 'default'."""
    mappings = (
        db.query(ComplianceMapping)
        .filter(ComplianceMapping.secret_type == secret_type)
        .all()
    )
    if not mappings:
        mappings = (
            db.query(ComplianceMapping)
            .filter(ComplianceMapping.secret_type == "default")
            .all()
        )
    return mappings


def get_controls_for_secret_types(
    db: Session, secret_types: set[str]
) -> dict[str, list[ComplianceMapping]]:
    """Fetch controls for multiple secret types in two queries (batch + default fallback).

    Returns a mapping of secret_type -> list[ComplianceMapping]. Types with no
    specific mapping receive the 'default' controls.
    """
    all_types = secret_types | {"default"}
    rows = (
        db.query(ComplianceMapping)
        .filter(ComplianceMapping.secret_type.in_(all_types))
        .all()
    )

    by_type: dict[str, list[ComplianceMapping]] = {}
    for row in rows:
        by_type.setdefault(row.secret_type, []).append(row)

    default_controls = by_type.get("default", [])
    return {t: by_type.get(t, default_controls) for t in secret_types}
