from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PACKAGE_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LUODAI_", extra="ignore")

    data_dir: Path | None = None
    jwt_secret: str = "dev-change-me-please-use-env-32chars"
    jwt_expire_minutes: int = 120
    refresh_expire_days: int = 7
    global_concurrency: int = 2
    default_user_concurrency: int = 1
    disk_quota_gb: float = 10
    parse_rate_per_min: int = 20
    task_rate_per_min: int = 30
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    def resolved_data_dir(self) -> Path:
        if self.data_dir is not None:
            return Path(self.data_dir)
        return PACKAGE_ROOT / "data"

    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    def database_url(self) -> str:
        db_path = (self.resolved_data_dir() / "luodai.sqlite3").resolve()
        return f"sqlite+aiosqlite:///{db_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
