from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.ssrf import UnsafeUrlError, assert_public_http_url
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.parse import ParseBody, ParseOut
from app.services.ytdlp_service import extract_info, explain_ytdlp_error

router = APIRouter(tags=["parse"])


@router.post("", response_model=ParseOut)
async def parse_url(
    body: ParseBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ParseOut:
    if not limiter.allow(f"parse:{user.id}", settings.parse_rate_per_min):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="解析过于频繁，请稍后再试")
    try:
        assert_public_http_url(body.url)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user_settings = await db.get(UserSettings, user.id)
    cookies = user_settings.cookies_path if user_settings else None
    proxy = user_settings.proxy if user_settings else None
    try:
        import asyncio

        return await asyncio.to_thread(extract_info, body.url, cookies=cookies, proxy=proxy)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=explain_ytdlp_error(exc)) from exc
