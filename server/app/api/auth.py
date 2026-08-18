from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.ids import new_id
from app.core.security import create_token, hash_password, verify_password
from app.models.invite import InviteCode
from app.models.settings import UserSettings
from app.models.user import User
from app.schemas.auth import LoginBody, RefreshBody, RegisterBody, TokenOut, UserOut

router = APIRouter(tags=["auth"])


def _tokens(settings: Settings, user: User) -> TokenOut:
    return TokenOut(
        access_token=create_token(settings, user.id, "access"),
        refresh_token=create_token(settings, user.id, "refresh"),
    )


@router.post("/register", response_model=TokenOut)
async def register(
    body: RegisterBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenOut:
    exists = await db.scalar(select(User).where(User.username == body.username))
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已被占用")

    total = await db.scalar(select(func.count()).select_from(User)) or 0
    role = "admin" if total == 0 else "user"
    invite: InviteCode | None = None
    if total > 0:
        code = (body.invite_code or "").strip()
        if not code:
            raise HTTPException(status_code=400, detail="请填写邀请码")
        invite = await db.scalar(select(InviteCode).where(InviteCode.code == code))
        if invite is None or invite.used_by is not None:
            raise HTTPException(status_code=400, detail="邀请码无效或已使用")

    user = User(
        id=new_id(),
        username=body.username,
        password_hash=hash_password(body.password),
        role=role,
    )
    db.add(user)
    db.add(
        UserSettings(
            user_id=user.id,
            max_concurrent=settings.default_user_concurrency,
        )
    )
    if invite is not None:
        invite.used_by = user.id
        invite.used_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return _tokens(settings, user)


@router.post("/login", response_model=TokenOut)
async def login(
    body: LoginBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenOut:
    user = await db.scalar(select(User).where(User.username == body.username.strip()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    return _tokens(settings, user)


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    body: RefreshBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenOut:
    from app.core.deps import get_user_by_token

    user = await get_user_by_token(body.refresh_token, db, settings, "refresh")
    return _tokens(settings, user)


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return UserOut(id=user.id, username=user.username, role=user.role)
