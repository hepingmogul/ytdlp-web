from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    proxy: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cookies_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    max_concurrent: Mapped[int] = mapped_column(Integer, default=1)
    default_format: Mapped[str] = mapped_column(String(128), default="bv*+ba/b")

    user = relationship("User", back_populates="settings")
