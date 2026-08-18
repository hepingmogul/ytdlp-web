import time
from collections import defaultdict


class RateLimiter:
    """进程内滑动窗口限流。"""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str, limit: int, window_sec: float = 60.0) -> bool:
        now = time.monotonic()
        bucket = [stamp for stamp in self._hits[key] if now - stamp < window_sec]
        if len(bucket) >= limit:
            self._hits[key] = bucket
            return False
        bucket.append(now)
        self._hits[key] = bucket
        return True


limiter = RateLimiter()
