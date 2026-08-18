import secrets
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.ids import new_id
from app.models.invite import InviteCode
from app.models.user import User
from app.schemas.settings import InviteOut

router = APIRouter(tags=["admin"])


@router.post("/invites", response_model=InviteOut)
async def create_invite(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InviteOut:
    row = InviteCode(id=new_id(), code=secrets.token_urlsafe(8), created_by=admin.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return InviteOut(
        id=row.id,
        code=row.code,
        used_by=row.used_by,
        created_at=row.created_at.isoformat() if row.created_at else None,
        used_at=row.used_at.isoformat() if row.used_at else None,
    )


@router.get("/invites", response_model=list[InviteOut])
async def list_invites(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[InviteOut]:
    rows = (await db.scalars(select(InviteCode).order_by(InviteCode.created_at.desc()))).all()
    return [
        InviteOut(
            id=row.id,
            code=row.code,
            used_by=row.used_by,
            created_at=row.created_at.isoformat() if row.created_at else None,
            used_at=row.used_at.isoformat() if row.used_at else None,
        )
        for row in rows
    ]
