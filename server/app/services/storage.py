import json
from pathlib import Path

from app.core.config import Settings
from app.models.task import Task


def ensure_data_dirs(settings: Settings) -> Path:
    root = settings.resolved_data_dir()
    (root / "downloads").mkdir(parents=True, exist_ok=True)
    (root / "cookies").mkdir(parents=True, exist_ok=True)
    return root


def user_download_dir(settings: Settings, user_id: str) -> Path:
    path = settings.resolved_data_dir() / "downloads" / user_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def task_dir(settings: Settings, user_id: str, task_id: str) -> Path:
    path = user_download_dir(settings, user_id) / task_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def cookies_file(settings: Settings, user_id: str) -> Path:
    folder = settings.resolved_data_dir() / "cookies" / user_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "cookies.txt"


def dir_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                continue
    return total


def quota_bytes(settings: Settings) -> int:
    return int(settings.disk_quota_gb * 1024 * 1024 * 1024)


SKIP_SUFFIXES = {".part", ".ytdl", ".temp", ".tmp"}
MEDIA_SUFFIXES = {
    ".mp4",
    ".mkv",
    ".webm",
    ".mov",
    ".avi",
    ".m4a",
    ".mp3",
    ".opus",
    ".ogg",
    ".flac",
    ".wav",
    ".aac",
}


def collect_outputs(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    files: list[Path] = []
    for item in directory.iterdir():
        if item.is_file() and item.suffix.lower() not in SKIP_SUFFIXES:
            files.append(item)
    return files


def pick_primary(files: list[Path]) -> Path | None:
    if not files:
        return None
    media = [item for item in files if item.suffix.lower() in MEDIA_SUFFIXES]
    pool = media or files
    return max(pool, key=lambda item: item.stat().st_size)


def apply_outputs(task: Task, directory: Path) -> None:
    files = collect_outputs(directory)
    primary = pick_primary(files)
    extras = [item.name for item in files if primary is None or item != primary]
    if primary is not None:
        task.output_path = str(primary)
        task.filename = primary.name
        task.filesize = primary.stat().st_size
    task.extra_files = json.dumps(extras, ensure_ascii=False) if extras else None


def parse_extra_files(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [str(item) for item in data]
    return []


def safe_join(directory: Path, name: str) -> Path:
    candidate = (directory / name).resolve()
    root = directory.resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("非法文件名")
    if not candidate.is_file():
        raise FileNotFoundError(name)
    return candidate
