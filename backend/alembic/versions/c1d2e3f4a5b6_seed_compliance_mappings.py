"""seed compliance mappings

Revision ID: c1d2e3f4a5b6
Revises: ae8b87b0760c
Create Date: 2026-04-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "ae8b87b0760c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_mappings_table = sa.table(
    "compliance_mappings",
    sa.column("secret_type", sa.String),
    sa.column("framework", sa.String),
    sa.column("control_id", sa.String),
    sa.column("control_title", sa.Text),
    sa.column("description", sa.Text),
)

_ROWS = [
    # ── AWS ──────────────────────────────────────────────────────────────────
    {
        "secret_type": "AWS",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "AWS access keys committed to source code expose cloud infrastructure credentials.",
    },
    {
        "secret_type": "AWS",
        "framework": "NIST_800_53",
        "control_id": "SC-12",
        "control_title": "Cryptographic Key Establishment and Management",
        "description": "AWS secret access keys must be protected and never stored in version control.",
    },
    {
        "secret_type": "AWS",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "AWS",
        "framework": "NIST_800_53",
        "control_id": "AC-2",
        "control_title": "Account Management",
        "description": "Service account credentials must be protected to prevent unauthorized cloud access.",
    },
    {
        "secret_type": "AWS",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "AWS access keys found in source code constitute embedded authentication data.",
    },
    # ── GitHub ───────────────────────────────────────────────────────────────
    {
        "secret_type": "GitHub",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "GitHub tokens committed to source code expose repository access credentials.",
    },
    {
        "secret_type": "GitHub",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "GitHub",
        "framework": "NIST_800_53",
        "control_id": "AC-2",
        "control_title": "Account Management",
        "description": "GitHub personal access tokens must be protected to prevent unauthorized repository access.",
    },
    {
        "secret_type": "GitHub",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "GitHub tokens found in source code constitute embedded authentication data.",
    },
    # ── Stripe ───────────────────────────────────────────────────────────────
    {
        "secret_type": "Stripe",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Stripe API keys committed to source code expose payment processing credentials.",
    },
    {
        "secret_type": "Stripe",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "Stripe",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "Stripe API keys found in source code constitute embedded authentication data.",
    },
    # ── RSAPrivateKey ─────────────────────────────────────────────────────────
    {
        "secret_type": "RSAPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "RSA private keys committed to source code expose cryptographic authentication credentials.",
    },
    {
        "secret_type": "RSAPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-12",
        "control_title": "Cryptographic Key Establishment and Management",
        "description": "Private cryptographic keys must be stored securely and never in version control.",
    },
    {
        "secret_type": "RSAPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-28",
        "control_title": "Protection of Information at Rest",
        "description": "Private keys stored in plaintext in version control violate data-at-rest protection requirements.",
    },
    {
        "secret_type": "RSAPrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "RSA private keys in source code constitute embedded authentication data.",
    },
    {
        "secret_type": "RSAPrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222551",
        "control_title": "Enforce authorized access to corresponding private key",
        "description": "Private keys must be protected with appropriate access controls and never stored in public repositories.",
    },
    # ── OpenSSHPrivateKey ─────────────────────────────────────────────────────
    {
        "secret_type": "OpenSSHPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "SSH private keys committed to source code expose cryptographic authentication credentials.",
    },
    {
        "secret_type": "OpenSSHPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-12",
        "control_title": "Cryptographic Key Establishment and Management",
        "description": "Private cryptographic keys must be stored securely and never in version control.",
    },
    {
        "secret_type": "OpenSSHPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-28",
        "control_title": "Protection of Information at Rest",
        "description": "Private keys stored in plaintext in version control violate data-at-rest protection requirements.",
    },
    {
        "secret_type": "OpenSSHPrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "SSH private keys in source code constitute embedded authentication data.",
    },
    {
        "secret_type": "OpenSSHPrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222551",
        "control_title": "Enforce authorized access to corresponding private key",
        "description": "Private keys must be protected with appropriate access controls and never stored in public repositories.",
    },
    # ── ECPrivateKey ──────────────────────────────────────────────────────────
    {
        "secret_type": "ECPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "EC private keys committed to source code expose cryptographic authentication credentials.",
    },
    {
        "secret_type": "ECPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-12",
        "control_title": "Cryptographic Key Establishment and Management",
        "description": "Private cryptographic keys must be stored securely and never in version control.",
    },
    {
        "secret_type": "ECPrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-28",
        "control_title": "Protection of Information at Rest",
        "description": "Private keys stored in plaintext in version control violate data-at-rest protection requirements.",
    },
    {
        "secret_type": "ECPrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "EC private keys in source code constitute embedded authentication data.",
    },
    {
        "secret_type": "ECPrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222551",
        "control_title": "Enforce authorized access to corresponding private key",
        "description": "Private keys must be protected with appropriate access controls and never stored in public repositories.",
    },
    # ── PrivateKey (generic) ──────────────────────────────────────────────────
    {
        "secret_type": "PrivateKey",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Private keys committed to source code expose cryptographic authentication credentials.",
    },
    {
        "secret_type": "PrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-12",
        "control_title": "Cryptographic Key Establishment and Management",
        "description": "Private cryptographic keys must be stored securely and never in version control.",
    },
    {
        "secret_type": "PrivateKey",
        "framework": "NIST_800_53",
        "control_id": "SC-28",
        "control_title": "Protection of Information at Rest",
        "description": "Private keys stored in plaintext in version control violate data-at-rest protection requirements.",
    },
    {
        "secret_type": "PrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "Private keys in source code constitute embedded authentication data.",
    },
    {
        "secret_type": "PrivateKey",
        "framework": "DISA_STIG",
        "control_id": "V-222551",
        "control_title": "Enforce authorized access to corresponding private key",
        "description": "Private keys must be protected with appropriate access controls and never stored in public repositories.",
    },
    # ── JDBC (database connection strings) ───────────────────────────────────
    {
        "secret_type": "JDBC",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Database connection strings with embedded credentials expose data store access.",
    },
    {
        "secret_type": "JDBC",
        "framework": "NIST_800_53",
        "control_id": "SC-28",
        "control_title": "Protection of Information at Rest",
        "description": "Database credentials stored in plaintext in version control violate data-at-rest protection.",
    },
    {
        "secret_type": "JDBC",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "JDBC",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "Database connection strings with passwords constitute embedded authentication data.",
    },
    {
        "secret_type": "JDBC",
        "framework": "DISA_STIG",
        "control_id": "V-222543",
        "control_title": "Transmit only cryptographically-protected passwords",
        "description": "Plaintext database passwords in source code fail to meet transmission protection requirements.",
    },
    # ── Password (hardcoded passwords) ────────────────────────────────────────
    {
        "secret_type": "Password",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Hardcoded passwords in source code violate authenticator management policy.",
    },
    {
        "secret_type": "Password",
        "framework": "NIST_800_53",
        "control_id": "IA-5(1)",
        "control_title": "Authenticator Management | Password-Based Authentication",
        "description": "Passwords must not be stored in plaintext or hardcoded into application source code.",
    },
    {
        "secret_type": "Password",
        "framework": "NIST_800_53",
        "control_id": "SC-28",
        "control_title": "Protection of Information at Rest",
        "description": "Plaintext passwords in version control violate data-at-rest protection requirements.",
    },
    {
        "secret_type": "Password",
        "framework": "DISA_STIG",
        "control_id": "V-222542",
        "control_title": "Only store cryptographic representations of passwords",
        "description": "Plaintext passwords found in source code must be replaced with hashed representations.",
    },
    {
        "secret_type": "Password",
        "framework": "DISA_STIG",
        "control_id": "V-222543",
        "control_title": "Transmit only cryptographically-protected passwords",
        "description": "Plaintext passwords in source code fail to meet transmission protection requirements.",
    },
    {
        "secret_type": "Password",
        "framework": "DISA_STIG",
        "control_id": "V-222662",
        "control_title": "Default passwords must be changed",
        "description": "Default or common passwords detected in source code must be replaced with strong, unique credentials.",
    },
    # ── GenericAPIKey ─────────────────────────────────────────────────────────
    {
        "secret_type": "GenericAPIKey",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "API keys committed to source code expose service authentication credentials.",
    },
    {
        "secret_type": "GenericAPIKey",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "GenericAPIKey",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "API keys found in source code constitute embedded authentication data.",
    },
    # ── Slack ─────────────────────────────────────────────────────────────────
    {
        "secret_type": "Slack",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Slack tokens committed to source code expose messaging platform credentials.",
    },
    {
        "secret_type": "Slack",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "Slack",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "Slack tokens found in source code constitute embedded authentication data.",
    },
    # ── Firebase ──────────────────────────────────────────────────────────────
    {
        "secret_type": "Firebase",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Firebase credentials committed to source code expose backend service access.",
    },
    {
        "secret_type": "Firebase",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "Firebase",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "Firebase credentials found in source code constitute embedded authentication data.",
    },
    # ── GoogleAPI ─────────────────────────────────────────────────────────────
    {
        "secret_type": "GoogleAPI",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Google API keys committed to source code expose Google service authentication.",
    },
    {
        "secret_type": "GoogleAPI",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "GoogleAPI",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "Google API keys found in source code constitute embedded authentication data.",
    },
    # ── default (catch-all for unmapped detector types) ───────────────────────
    {
        "secret_type": "default",
        "framework": "NIST_800_53",
        "control_id": "IA-5",
        "control_title": "Authenticator Management",
        "description": "Credentials committed to source code violate authenticator management policy.",
    },
    {
        "secret_type": "default",
        "framework": "NIST_800_53",
        "control_id": "CM-6",
        "control_title": "Configuration Settings",
        "description": "Credentials must not be hardcoded in configuration files committed to VCS.",
    },
    {
        "secret_type": "default",
        "framework": "DISA_STIG",
        "control_id": "V-222642",
        "control_title": "The application must not contain embedded authentication data",
        "description": "Credentials found in source code constitute embedded authentication data.",
    },
]


def upgrade() -> None:
    op.bulk_insert(_mappings_table, _ROWS)


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM compliance_mappings"))
