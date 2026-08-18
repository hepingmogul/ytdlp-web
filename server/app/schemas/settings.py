from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    proxy: str | None
    max_concurrent: int
    default_format: str
    has_cookies: bool
    disk_used_bytes: int
    disk_quota_bytes: int


class SettingsUpdate(BaseModel):
    proxy: str | None = None
    max_concurrent: int | None = Field(default=None, ge=1, le=3)
    default_format: str | None = Field(default=None, max_length=128)


class InviteOut(BaseModel):
    id: str
    code: str
    used_by: str | None
    created_at: str | None
    used_at: str | None
