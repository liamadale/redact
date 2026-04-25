from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.models.models import Finding, Scan
from app.reports.compliance import get_controls_for_secret_type

_TEMPLATES_DIR = Path(__file__).parent / "templates"


def generate_pdf_report(scan: Scan, findings: list[Finding], db: Session) -> bytes:
    """Render a compliance audit PDF for the given scan and findings."""
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template("report.html")

    enriched = []
    all_controls: dict[str, dict] = {}
    for f in findings:
        controls = get_controls_for_secret_type(db, f.secret_type)
        enriched.append({"finding": f, "controls": controls})
        for c in controls:
            key = f"{c.framework}:{c.control_id}"
            if key not in all_controls:
                all_controls[key] = {
                    "framework": c.framework,
                    "control_id": c.control_id,
                    "control_title": c.control_title,
                    "finding_count": 0,
                }
            all_controls[key]["finding_count"] += 1

    severity_counts = {
        s: sum(1 for f in findings if f.severity == s)
        for s in ("critical", "high", "medium", "low")
    }
    nist_controls = sorted(
        [v for v in all_controls.values() if v["framework"] == "NIST_800_53"],
        key=lambda c: c["control_id"],
    )
    stig_controls = sorted(
        [v for v in all_controls.values() if v["framework"] == "DISA_STIG"],
        key=lambda c: c["control_id"],
    )

    html_content = template.render(
        scan=scan,
        findings=enriched,
        nist_controls=nist_controls,
        stig_controls=stig_controls,
        severity_counts=severity_counts,
        total_findings=len(findings),
    )

    # Import here to avoid startup failure when WeasyPrint system libs are absent
    from weasyprint import HTML  # noqa: PLC0415

    return HTML(string=html_content).write_pdf()
