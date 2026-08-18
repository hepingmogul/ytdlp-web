from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


engine: AsyncEngine | None = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None


def init_engine(database_url: str) -> async_sessionmaker[AsyncSession]:
    global engine, SessionLocal
    engine = create_async_engine(
        database_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    return SessionLocal


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """运行时取会话工厂，避免其它模块 `from ... import SessionLocal` 拿到启动前的 None。"""
    if SessionLocal is None:
        raise RuntimeError("数据库未初始化")
    return SessionLocal


async def create_tables() -> None:
    if engine is None:
        raise RuntimeError("数据库引擎未初始化")
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        yield session
