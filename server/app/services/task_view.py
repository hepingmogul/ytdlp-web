from app.models.task import Task
from app.schemas.task import TaskOut
from app.services.storage import parse_extra_files


def task_to_out(task: Task, child_count: int = 0, done_count: int = 0) -> TaskOut:
    langs = [item for item in (task.sub_langs or "").split(",") if item]
    return TaskOut(
        id=task.id,
        user_id=task.user_id,
        parent_id=task.parent_id,
        url=task.url,
        title=task.title,
        thumbnail=task.thumbnail,
        extractor=task.extractor,
        mode=task.mode,
        format_id=task.format_id,
        audio_format=task.audio_format,
        write_subs=task.write_subs,
        write_auto_subs=task.write_auto_subs,
        sub_langs=langs,
        status=task.status,
        percent=task.percent or 0,
        speed=task.speed,
        eta=task.eta,
        downloaded_bytes=task.downloaded_bytes or 0,
        total_bytes=task.total_bytes or 0,
        error_message=task.error_message,
        filename=task.filename,
        filesize=task.filesize,
        extra_files=parse_extra_files(task.extra_files),
        created_at=task.created_at,
        started_at=task.started_at,
        finished_at=task.finished_at,
        child_count=child_count,
        done_count=done_count,
    )


def task_progress_payload(task: Task) -> dict:
    return {
        "id": task.id,
        "parent_id": task.parent_id,
        "status": task.status,
        "percent": task.percent or 0,
        "speed": task.speed,
        "eta": task.eta,
        "downloaded_bytes": task.downloaded_bytes or 0,
        "total_bytes": task.total_bytes or 0,
        "error_message": task.error_message,
        "filename": task.filename,
        "title": task.title,
    }
