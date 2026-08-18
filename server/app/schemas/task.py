from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class EntryItem(BaseModel):
    url: str
    title: str | None = None
    thumbnail: str | None = None


class CreateTaskBody(BaseModel):
    url: str
    title: str | None = None
    thumbnail: str | None = None
    extractor: str | None = None
    format_id: str | None = None
    audio_only: bool = False
    audio_format: Literal["mp3", "m4a", "opus"] = "mp3"
    write_subs: bool = False
    write_auto_subs: bool = False
    sub_langs: list[str] = Field(default_factory=list)
    proxy: str | None = None
    entries: list[EntryItem] | None = None


class TaskOut(BaseModel):
    id: str
    user_id: str
    parent_id: str | None
    url: str
    title: str | None
    thumbnail: str | None
    extractor: str | None
    mode: str
    format_id: str | None
    audio_format: str | None
    write_subs: bool
    write_auto_subs: bool
    sub_langs: list[str]
    status: str
    percent: float
    speed: str | None
    eta: int | None
    downloaded_bytes: int
    total_bytes: int
    error_message: str | None
    filename: str | None
    filesize: int | None
    extra_files: list[str]
    created_at: datetime | None
    started_at: datetime | None
    finished_at: datetime | None
    child_count: int = 0
    done_count: int = 0


class TaskListOut(BaseModel):
    items: list[TaskOut]
