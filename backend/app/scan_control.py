"""Scan control signals via Redis.

Workers check these signals between repos to pause/cancel scans.
"""

import os

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
_pool = redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)

_KEY_PREFIX = "scan:control:"


def _r() -> redis.Redis:
    return redis.Redis(connection_pool=_pool)


def send_signal(scan_id: str, signal: str) -> None:
    """Set a control signal for a scan. Signal is 'pause', 'resume', or 'cancel'."""
    _r().set(f"{_KEY_PREFIX}{scan_id}", signal, ex=3600)


def get_signal(scan_id: str) -> str | None:
    """Read the current control signal for a scan."""
    try:
        return _r().get(f"{_KEY_PREFIX}{scan_id}")
    except redis.ConnectionError:
        return None


def clear_signal(scan_id: str) -> None:
    """Remove the control signal for a scan."""
    _r().delete(f"{_KEY_PREFIX}{scan_id}")
