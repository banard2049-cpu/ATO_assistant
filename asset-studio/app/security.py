from __future__ import annotations

import hashlib
import hmac
import time

from .config import STARTUP_SECRET


def make_token(ttl_seconds: int = 60 * 60 * 24 * 30) -> str:
    expires = str(int(time.time()) + ttl_seconds)
    signature = hmac.new(STARTUP_SECRET.encode(), expires.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{signature}"


def valid_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    expires, signature = token.split(".", 1)
    if not expires.isdigit() or int(expires) < time.time():
        return False
    expected = hmac.new(STARTUP_SECRET.encode(), expires.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)

