from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.database import get_session_factory
from app.models.settings import UserSettings
from app.models.task import (
    TASK_CANCELLED,
    TASK_DONE,
    TASK_DOWNLOADING,
    TASK_FAILED,
    TASK_POSTPROCESSING,
    TASK_QUEUED,
    TERMINAL_STATUSES,
    Task,
)
from app.services import progress as runtime
from app.services.storage import apply_outputs, task_dir
from app.services.task_view import task_progress_payload
from app.services.ytdlp_service import YtdlpCancelled, download_task, explain_ytdlp_error

logger = logging.getLogger("luodai.worker")


async def recover_and_enqueue(settings: Settings) -> None:
    factory = get_session_factory()
    async with factory() as db:
        interrupted = await db.scalars(
            select(Task).where(Task.status.in_((TASK_DOWNLOADING, TASK_POSTPROCESSING)))
        )
        for task in interrupted:
            if task.mode == "playlist":
                continue
            task.status = TASK_QUEUED
            task.error_message = None
        await db.commit()

        pending = await db.scalars(
            select(Task.id).where(Task.status == TASK_QUEUED, Task.mode != "playlist")
        )
        queue = runtime.get_task_queue()
        for task_id in pending:
            await queue.put(task_id)


async def enqueue(task_id: str) -> None:
    await runtime.get_task_queue().put(task_id)


async def request_cancel(db: AsyncSession, task: Task) -> None:
    ids = [task.id]
    if task.mode == "playlist":
        children = await db.scalars(select(Task).where(Task.parent_id == task.id))
        ids.extend(child.id for child in children)

    now = datetime.now(timezone.utc)
    for task_id in ids:
        runtime.cancelled_ids.add(task_id)
        current = await db.get(Task, task_id)
        if current is None or current.status in TERMINAL_STATUSES:
            continue
        current.status = TASK_CANCELLED
        current.finished_at = now
        current.error_message = "任务已取消"
        await runtime.hub.publish(task_id, task_progress_payload(current))
    await db.commit()
    if task.mode == "playlist" or task.parent_id:
        parent_id = task.id if task.mode == "playlist" else task.parent_id
        if parent_id:
            await refresh_parent(db, parent_id)


async def worker_loop() -> None:
    queue = runtime.get_task_queue()
    logger.info("下载队列已启动")
    while True:
        task_id = await queue.get()
        asyncio.create_task(_run_logged(task_id), name=f"dl-{task_id[:8]}")


async def _run_logged(task_id: str) -> None:
    try:
        logger.info("开始处理任务 %s", task_id)
        await _guarded_run(task_id)
    except Exception:
        logger.exception("任务调度失败 %s", task_id)
        try:
            await _mark_failed(task_id, "任务调度失败，请查看服务端日志")
        except Exception:
            logger.exception("写入失败状态时出错 %s", task_id)


async def _guarded_run(task_id: str) -> None:
    factory = get_session_factory()
    async with factory() as db:
        task = await db.get(Task, task_id)
        if task is None or task.status in TERMINAL_STATUSES or task.mode == "playlist":
            return
        settings_row = await db.get(UserSettings, task.user_id)
        user_limit = settings_row.max_concurrent if settings_row else 1

    user_sem = runtime.get_user_semaphore(task.user_id, user_limit)
    async with user_sem:
        async with runtime.get_global_semaphore():
            await execute_download(task_id)


async def execute_download(task_id: str) -> None:
    from app.core.config import get_settings

    factory = get_session_factory()
    settings = get_settings()
    async with factory() as db:
        task = await db.get(Task, task_id)
        if task is None or task.status in TERMINAL_STATUSES:
            return
        if task_id in runtime.cancelled_ids:
            task.status = TASK_CANCELLED
            task.finished_at = datetime.now(timezone.utc)
            await db.commit()
            return

        user_settings = await db.get(UserSettings, task.user_id)
        cookies = user_settings.cookies_path if user_settings else None
        proxy = task.proxy or (user_settings.proxy if user_settings else None)
        outdir = task_dir(settings, task.user_id, task.id)
        task.status = TASK_DOWNLOADING
        task.started_at = datetime.now(timezone.utc)
        task.error_message = None
        await db.commit()
        await runtime.hub.publish(task.id, task_progress_payload(task))

        snapshot = {
            "id": task.id,
            "url": task.url,
            "mode": task.mode,
            "format_id": task.format_id,
            "audio_format": task.audio_format,
            "write_subs": task.write_subs,
            "write_auto_subs": task.write_auto_subs,
            "sub_langs": task.sub_langs,
        }

    loop = asyncio.get_running_loop()
    last_flush = 0.0
    pending_update: dict[str, Any] = {}

    def should_cancel() -> bool:
        return task_id in runtime.cancelled_ids

    def progress_hook(payload: dict[str, Any]) -> None:
        nonlocal last_flush, pending_update
        status = payload.get("status")
        update: dict[str, Any] = {}
        if status == "downloading":
            update = {
                "status": TASK_DOWNLOADING,
                **_progress_fields(payload),
            }
        elif status == "finished":
            update = {"status": TASK_POSTPROCESSING, "percent": 99.0, "speed": None}
        elif status == "started" and payload.get("postprocessor"):
            update = {"status": TASK_POSTPROCESSING}
        if not update:
            return
        pending_update = update
        now = time.monotonic()
        if now - last_flush < 0.3 and status == "downloading":
            return
        last_flush = now
        asyncio.run_coroutine_threadsafe(_flush_progress(task_id, dict(update)), loop)

    try:
        dummy = Task(
            id=snapshot["id"],
            user_id="",
            url=snapshot["url"],
            mode=snapshot["mode"],
            format_id=snapshot["format_id"],
            audio_format=snapshot["audio_format"],
            write_subs=snapshot["write_subs"],
            write_auto_subs=snapshot["write_auto_subs"],
            sub_langs=snapshot["sub_langs"],
        )
        await asyncio.to_thread(
            download_task,
            dummy,
            str(outdir),
            cookies=cookies,
            proxy=proxy,
            progress_hook=progress_hook,
            should_cancel=should_cancel,
        )
        if pending_update:
            await _flush_progress(task_id, pending_update)
        await _mark_done(settings, task_id, str(outdir))
    except YtdlpCancelled:
        await _mark_cancelled(task_id)
    except Exception as exc:  # noqa: BLE001 — 需要转成任务失败文案
        logger.exception("下载失败 %s", task_id)
        await _mark_failed(task_id, explain_ytdlp_error(exc))


def _progress_fields(payload: dict[str, Any]) -> dict[str, Any]:
    total = payload.get("total_bytes") or payload.get("total_bytes_estimate") or 0
    downloaded = payload.get("downloaded_bytes") or 0
    fragments = payload.get("fragment_count") or 0
    fragment_index = payload.get("fragment_index") or 0
    percent = 0.0
    if total:
        percent = downloaded * 100.0 / total
    elif fragments:
        percent = fragment_index * 100.0 / fragments
    else:
        raw = str(payload.get("_percent_str") or "").replace("%", "").strip()
        raw = "".join(ch for ch in raw if ch.isdigit() or ch in ".-")
        try:
            percent = float(raw) if raw else 0.0
        except ValueError:
            percent = 0.0
    speed = payload.get("_speed_str")
    if isinstance(speed, str):
        speed = speed.strip() or None
    elif payload.get("speed"):
        bps = float(payload["speed"])
        speed = f"{bps / 1024:.1f}KiB/s" if bps < 1024 * 1024 else f"{bps / 1024 / 1024:.2f}MiB/s"
    else:
        speed = None
    eta = payload.get("eta")
    return {
        "percent": round(min(100.0, max(0.0, percent)), 2),
        "speed": speed,
        "eta": int(eta) if isinstance(eta, (int, float)) else None,
        "downloaded_bytes": int(downloaded),
        "total_bytes": int(total or 0),
    }


async def _flush_progress(task_id: str, update: dict[str, Any]) -> None:
    factory = get_session_factory()
    async with factory() as db:
        task = await db.get(Task, task_id)
        if task is None or task.status in TERMINAL_STATUSES:
            return
        for key, value in update.items():
            setattr(task, key, value)
        await db.commit()
        await runtime.hub.publish(task.id, task_progress_payload(task))
        if task.parent_id:
            await refresh_parent(db, task.parent_id)


async def _mark_done(settings: Settings, task_id: str, outdir: str) -> None:
    from pathlib import Path

    factory = get_session_factory()
    async with factory() as db:
        task = await db.get(Task, task_id)
        if task is None:
            return
        if task_id in runtime.cancelled_ids:
            task.status = TASK_CANCELLED
            task.finished_at = datetime.now(timezone.utc)
            task.error_message = "任务已取消"
        else:
            apply_outputs(task, Path(outdir))
            task.status = TASK_DONE
            task.percent = 100
            task.finished_at = datetime.now(timezone.utc)
            task.error_message = None
        await db.commit()
        await runtime.hub.publish(task.id, task_progress_payload(task))
        if task.parent_id:
            await refresh_parent(db, task.parent_id)


async def _mark_failed(task_id: str, message: str) -> None:
    factory = get_session_factory()
    async with factory() as db:
        task = await db.get(Task, task_id)
        if task is None:
            return
        task.status = TASK_FAILED
        task.error_message = message
        task.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await runtime.hub.publish(task.id, task_progress_payload(task))
        if task.parent_id:
            await refresh_parent(db, task.parent_id)


async def _mark_cancelled(task_id: str) -> None:
    factory = get_session_factory()
    async with factory() as db:
        task = await db.get(Task, task_id)
        if task is None:
            return
        task.status = TASK_CANCELLED
        task.error_message = "任务已取消"
        task.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await runtime.hub.publish(task.id, task_progress_payload(task))
        if task.parent_id:
            await refresh_parent(db, task.parent_id)


async def refresh_parent(db: AsyncSession, parent_id: str) -> None:
    parent = await db.get(Task, parent_id)
    if parent is None:
        return
    rows = (
        await db.execute(
            select(Task.status, func.count())
            .where(Task.parent_id == parent_id)
            .group_by(Task.status)
        )
    ).all()
    counts = {status: count for status, count in rows}
    total = sum(counts.values())
    if total == 0:
        return
    done = counts.get(TASK_DONE, 0)
    failed = counts.get(TASK_FAILED, 0)
    cancelled = counts.get(TASK_CANCELLED, 0)
    finished = done + failed + cancelled
    parent.percent = round(finished * 100.0 / total, 2)
    parent.downloaded_bytes = done
    parent.total_bytes = total
    if finished < total:
        parent.status = TASK_DOWNLOADING
    elif failed:
        parent.status = TASK_FAILED
        parent.error_message = f"{failed} 个子任务失败"
        parent.finished_at = datetime.now(timezone.utc)
    elif cancelled and done == 0:
        parent.status = TASK_CANCELLED
        parent.finished_at = datetime.now(timezone.utc)
    else:
        parent.status = TASK_DONE if cancelled == 0 else TASK_DONE
        if cancelled:
            parent.error_message = f"{cancelled} 个子任务已取消"
        parent.finished_at = datetime.now(timezone.utc)
    await db.commit()
    await runtime.hub.publish(parent.id, task_progress_payload(parent))
