from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

TASK_QUEUED = "queued"
TASK_DOWNLOADING = "downloading"
TASK_POSTPROCESSING = "postprocessing"
TASK_DONE = "done"
TASK_FAILED = "failed"
TASK_CANCELLED = "cancelled"
TERMINAL_STATUSES = {TASK_DONE, TASK_FAILED, TASK_CANCELLED}


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("tasks.id"), nullable=True, index=True
    )
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    thumbnail: Mapped[str | None] = mapped_column(Text, nullable=True)
    extractor: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mode: Mapped[str] = mapped_column(String(16), default="video")
    format_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    audio_format: Mapped[str | None] = mapped_column(String(16), nullable=True)
    write_subs: Mapped[bool] = mapped_column(default=False)
    write_auto_subs: Mapped[bool] = mapped_column(default=False)
    sub_langs: Mapped[str | None] = mapped_column(String(256), nullable=True)
    proxy: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default=TASK_QUEUED, index=True)
    percent: Mapped[float] = mapped_column(Float, default=0)
    speed: Mapped[str | None] = mapped_column(String(64), nullable=True)
    eta: Mapped[int | None] = mapped_column(Integer, nullable=True)
    downloaded_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    total_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    filesize: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    extra_files: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="tasks")
    parent = relationship("Task", remote_side=[id], uselist=False)
