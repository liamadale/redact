import os

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
SESSION_TTL = 7200  # 2 hours


def _get_redis() -> redis.Redis:
    return redis.Redis.from_url(REDIS_URL, decode_responses=True)


def store_token(session_id: str, token: str) -> None:
    """Store a GitHub PAT in Redis under session:{session_id} with TTL."""
    r = _get_redis()
    r.setex(f"session:{session_id}", SESSION_TTL, token)
    r.close()


def get_token(session_id: str) -> str | None:
    """Retrieve a GitHub PAT from Redis session. Returns None if expired/missing."""
    r = _get_redis()
    val = r.get(f"session:{session_id}")
    r.close()
    return val
