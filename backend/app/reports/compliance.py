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
