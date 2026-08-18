from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.ssrf import UnsafeUrlError, assert_proxy_url
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services.storage import cookies_file, dir_size, quota_bytes, user_download_dir

router = APIRouter(tags=["settings"])


async def _ensure_settings(db: AsyncSession, user_id: str) -> UserSettings:
    row = await db.get(UserSettings, user_id)
    if row is None:
        row = UserSettings(user_id=user_id)
        db.add(row)
        await db.flush()
    return row


@router.get("", response_model=SettingsOut)
async def get_my_settings(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SettingsOut:
    row = await _ensure_settings(db, user.id)
    used = dir_size(user_download_dir(settings, user.id))
    return SettingsOut(
        proxy=row.proxy,
        max_concurrent=row.max_concurrent,
        default_format=row.default_format,
        has_cookies=bool(row.cookies_path),
        disk_used_bytes=used,
        disk_quota_bytes=quota_bytes(settings),
    )


@router.put("", response_model=SettingsOut)
async def update_settings(
    body: SettingsUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SettingsOut:
    row = await _ensure_settings(db, user.id)
    if "proxy" in body.model_fields_set:
        try:
            row.proxy = assert_proxy_url(body.proxy)
        except UnsafeUrlError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.max_concurrent is not None:
        row.max_concurrent = body.max_concurrent
    if body.default_format is not None:
        row.default_format = body.default_format.strip() or "bv*+ba/b"
    await db.commit()
    return await get_my_settings(user, db, settings)


@router.post("/cookies")
async def upload_cookies(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    file: UploadFile = File(...),
) -> dict[str, bool]:
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="cookies 文件不能超过 2MB")
    text = raw.decode("utf-8", errors="replace")
    if "# Netscape HTTP Cookie File" not in text and "\t" not in text:
        raise HTTPException(status_code=400, detail="请上传 Netscape 格式的 cookies.txt")
    path = cookies_file(settings, user.id)
    path.write_text(text, encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    row = await _ensure_settings(db, user.id)
    row.cookies_path = str(path)
    await db.commit()
    return {"has_cookies": True}


@router.delete("/cookies")
async def delete_cookies(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, bool]:
    row = await _ensure_settings(db, user.id)
    path = cookies_file(settings, user.id)
    if path.exists():
        path.unlink()
    row.cookies_path = None
    await db.commit()
    return {"has_cookies": False}
