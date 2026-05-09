import os

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
SESSION_TTL = 7200  # 2 hours

_pool = redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)


def _get_redis() -> redis.Redis:
    return redis.Redis(connection_pool=_pool)


def store_token(session_id: str, token: str) -> None:
    """Store a GitHub PAT in Redis under session:{session_id} with TTL."""
    _get_redis().setex(f"session:{session_id}", SESSION_TTL, token)


def get_token(session_id: str) -> str | None:
    """Retrieve a GitHub PAT from Redis session. Returns None if expired/missing."""
    return _get_redis().get(f"session:{session_id}")
