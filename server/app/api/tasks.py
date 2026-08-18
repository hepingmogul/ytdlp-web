from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_user_sse
from app.core.ids import new_id
from app.core.rate_limit import limiter
from app.core.ssrf import UnsafeUrlError, assert_proxy_url, assert_public_http_url
from app.models.settings import UserSettings
from app.models.task import TASK_DONE, TASK_QUEUED, TERMINAL_STATUSES, Task
from app.models.user import User
from app.schemas.task import CreateTaskBody, TaskListOut, TaskOut
from app.services.progress import hub
from app.services.storage import (
    dir_size,
    parse_extra_files,
    quota_bytes,
    safe_join,
    task_dir,
    user_download_dir,
)
from app.services.task_view import task_progress_payload, task_to_out
from app.workers.downloader import enqueue, request_cancel

router = APIRouter(tags=["tasks"])


async def _owned(db: AsyncSession, user: User, task_id: str) -> Task:
    task = await db.get(Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


async def _child_stats(db: AsyncSession, parent_ids: list[str]) -> dict[str, tuple[int, int]]:
    if not parent_ids:
        return {}
    rows = (
        await db.execute(
            select(Task.parent_id, Task.status, func.count())
            .where(Task.parent_id.in_(parent_ids))
            .group_by(Task.parent_id, Task.status)
        )
    ).all()
    result: dict[str, tuple[int, int]] = {pid: (0, 0) for pid in parent_ids}
    for parent_id, status_name, count in rows:
        if parent_id is None:
            continue
        total, done = result.get(parent_id, (0, 0))
        total += count
        if status_name == TASK_DONE:
            done += count
        result[parent_id] = (total, done)
    return result


@router.get("", response_model=TaskListOut)
async def list_tasks(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_children: bool = Query(default=False),
) -> TaskListOut:
    stmt = select(Task).where(Task.user_id == user.id)
    if not include_children:
        stmt = stmt.where(Task.parent_id.is_(None))
    stmt = stmt.order_by(Task.created_at.desc())
    rows = (await db.scalars(stmt)).all()
    parent_ids = [row.id for row in rows if row.mode == "playlist"]
    stats = await _child_stats(db, parent_ids)
    items = []
    for row in rows:
        total, done = stats.get(row.id, (0, 0))
        items.append(task_to_out(row, child_count=total, done_count=done))
    return TaskListOut(items=items)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskOut:
    task = await _owned(db, user, task_id)
    stats = await _child_stats(db, [task.id] if task.mode == "playlist" else [])
    total, done = stats.get(task.id, (0, 0))
    return task_to_out(task, child_count=total, done_count=done)


@router.get("/{task_id}/children", response_model=TaskListOut)
async def list_children(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskListOut:
    await _owned(db, user, task_id)
    rows = (
        await db.scalars(
            select(Task)
            .where(Task.parent_id == task_id, Task.user_id == user.id)
            .order_by(Task.created_at.asc())
        )
    ).all()
    return TaskListOut(items=[task_to_out(row) for row in rows])


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    body: CreateTaskBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TaskOut:
    if not limiter.allow(f"task:{user.id}", settings.task_rate_per_min):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="创建任务过于频繁")

    try:
        assert_public_http_url(body.url)
        proxy = assert_proxy_url(body.proxy)
        if body.entries:
            for entry in body.entries:
                assert_public_http_url(entry.url)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    used = dir_size(user_download_dir(settings, user.id))
    if used >= quota_bytes(settings):
        raise HTTPException(status_code=400, detail="磁盘配额已满，请先删除旧任务")

    user_settings = await db.get(UserSettings, user.id)
    format_id = body.format_id or (user_settings.default_format if user_settings else None)
    langs = ",".join(item.strip() for item in body.sub_langs if item.strip()) or None
    mode = "audio" if body.audio_only else "video"

    if body.entries:
        parent = Task(
            id=new_id(),
            user_id=user.id,
            url=body.url,
            title=body.title or "播放列表",
            thumbnail=body.thumbnail,
            extractor=body.extractor,
            mode="playlist",
            format_id=format_id,
            audio_format=body.audio_format if body.audio_only else None,
            write_subs=body.write_subs,
            write_auto_subs=body.write_auto_subs,
            sub_langs=langs,
            proxy=proxy,
            status=TASK_QUEUED,
        )
        db.add(parent)
        children: list[Task] = []
        for entry in body.entries:
            child = Task(
                id=new_id(),
                user_id=user.id,
                parent_id=parent.id,
                url=entry.url,
                title=entry.title,
                thumbnail=entry.thumbnail,
                extractor=body.extractor,
                mode=mode,
                format_id=format_id,
                audio_format=body.audio_format if body.audio_only else None,
                write_subs=body.write_subs,
                write_auto_subs=body.write_auto_subs,
                sub_langs=langs,
                proxy=proxy,
                status=TASK_QUEUED,
            )
            db.add(child)
            children.append(child)
        await db.commit()
        for child in children:
            await enqueue(child.id)
        return task_to_out(parent, child_count=len(children), done_count=0)

    task = Task(
        id=new_id(),
        user_id=user.id,
        url=body.url,
        title=body.title,
        thumbnail=body.thumbnail,
        extractor=body.extractor,
        mode=mode,
        format_id=format_id,
        audio_format=body.audio_format if body.audio_only else None,
        write_subs=body.write_subs,
        write_auto_subs=body.write_auto_subs,
        sub_langs=langs,
        proxy=proxy,
        status=TASK_QUEUED,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    await enqueue(task.id)
    return task_to_out(task)


@router.post("/{task_id}/cancel", response_model=TaskOut)
async def cancel_task(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskOut:
    task = await _owned(db, user, task_id)
    if task.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=400, detail="任务已结束，无法取消")
    await request_cancel(db, task)
    await db.refresh(task)
    stats = await _child_stats(db, [task.id] if task.mode == "playlist" else [])
    total, done = stats.get(task.id, (0, 0))
    return task_to_out(task, child_count=total, done_count=done)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, bool]:
    task = await _owned(db, user, task_id)
    if task.status not in TERMINAL_STATUSES:
        await request_cancel(db, task)
        await db.refresh(task)

    children = (
        await db.scalars(select(Task).where(Task.parent_id == task.id, Task.user_id == user.id))
    ).all()
    targets = [task, *children]
    for item in targets:
        folder = task_dir(settings, user.id, item.id)
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)
        await db.delete(item)
    await db.commit()
    return {"ok": True}


@router.get("/{task_id}/events")
async def task_events(
    task_id: str,
    user: Annotated[User, Depends(get_current_user_sse)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    task = await _owned(db, user, task_id)
    queue = await hub.subscribe(task_id)

    async def generate():
        try:
            snapshot = task_progress_payload(task)
            yield f"event: snapshot\ndata: {json.dumps(snapshot, ensure_ascii=False)}\n\n"
            if task.status in TERMINAL_STATUSES:
                yield f"event: done\ndata: {json.dumps(snapshot, ensure_ascii=False)}\n\n"
                return
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield f"event: progress\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                if payload.get("status") in TERMINAL_STATUSES:
                    yield f"event: done\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    break
        finally:
            await hub.unsubscribe(task_id, queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{task_id}/file")
async def download_file(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    name: str | None = Query(default=None),
) -> FileResponse:
    task = await _owned(db, user, task_id)
    if task.status != TASK_DONE:
        raise HTTPException(status_code=400, detail="任务尚未完成")
    folder = task_dir(settings, user.id, task.id)
    try:
        if name:
            path = safe_join(folder, name)
        elif task.output_path:
            path = Path(task.output_path)
            if not path.is_file():
                raise FileNotFoundError(name or "")
        else:
            raise FileNotFoundError("")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="文件不存在") from exc
    return FileResponse(path, filename=path.name)


@router.get("/{task_id}/files")
async def list_files(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[str]]:
    task = await _owned(db, user, task_id)
    names = []
    if task.filename:
        names.append(task.filename)
    names.extend(parse_extra_files(task.extra_files))
    return {"files": names}
