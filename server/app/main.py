from __future__ import annotations

import asyncio
import logging
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, parse, settings as settings_api, tasks
from app.core.config import get_settings
from app.core.database import create_tables, init_engine
from app.services import progress as runtime
from app.services.storage import ensure_data_dirs
from app.workers.downloader import recover_and_enqueue, worker_loop

logger = logging.getLogger("luodai")
WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    ensure_data_dirs(settings)
    init_engine(settings.database_url())
    await create_tables()
    runtime.task_queue = asyncio.Queue()
    runtime.global_semaphore = asyncio.Semaphore(max(1, settings.global_concurrency))
    await recover_and_enqueue(settings)
    worker = asyncio.create_task(worker_loop(), name="luodai-worker")
    logger.info("落带服务已启动，数据目录：%s", settings.resolved_data_dir())
    try:
        yield
    finally:
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="落带",
        description="基于 yt-dlp 的多用户网页下载器。仅用于下载你有权获取的内容。",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(auth.router, prefix="/api/auth")
    application.include_router(parse.router, prefix="/api/parse")
    application.include_router(tasks.router, prefix="/api/tasks")
    application.include_router(settings_api.router, prefix="/api/settings")
    application.include_router(admin.router, prefix="/api/admin")

    @application.get("/api/health")
    async def health() -> dict:
        yt_version = None
        try:
            import yt_dlp

            yt_version = getattr(yt_dlp.version, "__version__", None)
        except Exception:  # noqa: BLE001
            yt_version = None
        return {
            "ok": True,
            "ffmpeg": bool(shutil.which("ffmpeg")),
            "yt_dlp": yt_version,
        }

    if WEB_DIST.is_dir():
        application.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

        @application.get("/{full_path:path}")
        async def spa(full_path: str):
            candidate = WEB_DIST / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(WEB_DIST / "index.html")

    return application


app = create_app()
