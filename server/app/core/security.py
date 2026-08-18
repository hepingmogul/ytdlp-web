from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import Settings

password_hash = PasswordHash.recommended()
TokenType = Literal["access", "refresh"]


def hash_password(plain: str) -> str:
    return password_hash.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return password_hash.verify(plain, hashed)


def create_token(
    settings: Settings,
    subject: str,
    token_type: TokenType,
) -> str:
    now = datetime.now(timezone.utc)
    if token_type == "access":
        expire = now + timedelta(minutes=settings.jwt_expire_minutes)
    else:
        expire = now + timedelta(days=settings.refresh_expire_days)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "exp": expire,
        "iat": now,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(settings: Settings, token: str, expected: TokenType) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except InvalidTokenError as exc:
        raise ValueError("登录已失效，请重新登录") from exc
    if payload.get("type") != expected:
        raise ValueError("令牌类型不正确")
    subject = payload.get("sub")
    if not subject or not isinstance(subject, str):
        raise ValueError("令牌无效")
    return subject
