import asyncio
from typing import Any


class ProgressHub:
    """按任务向 SSE 订阅者广播进度。"""

    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, task_id: str) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subs.setdefault(task_id, set()).add(queue)
        return queue

    async def unsubscribe(self, task_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            listeners = self._subs.get(task_id)
            if not listeners:
                return
            listeners.discard(queue)
            if not listeners:
                self._subs.pop(task_id, None)

    async def publish(self, task_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            listeners = list(self._subs.get(task_id, ()))
        for queue in listeners:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                    queue.put_nowait(payload)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    continue


hub = ProgressHub()
cancelled_ids: set[str] = set()
user_semaphores: dict[str, asyncio.Semaphore] = {}
task_queue: asyncio.Queue[str] | None = None
global_semaphore: asyncio.Semaphore | None = None


def get_task_queue() -> asyncio.Queue[str]:
    if task_queue is None:
        raise RuntimeError("任务队列未启动")
    return task_queue


def get_global_semaphore() -> asyncio.Semaphore:
    if global_semaphore is None:
        raise RuntimeError("全局并发锁未启动")
    return global_semaphore


def get_user_semaphore(user_id: str, limit: int) -> asyncio.Semaphore:
    existing = user_semaphores.get(user_id)
    if existing is None:
        existing = asyncio.Semaphore(max(1, limit))
        user_semaphores[user_id] = existing
    return existing
