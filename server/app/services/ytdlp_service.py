from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.ssrf import UnsafeUrlError, assert_public_http_url
from app.models.task import Task
from app.schemas.parse import FormatOut, ParseOut, PlaylistEntryOut, PresetOut

PRESETS = [
    PresetOut(id="bv*+ba/b", label="最佳画质（自动合并）"),
    PresetOut(id="bv*[height<=1080]+ba/b", label="1080p 优先"),
    PresetOut(id="bv*[height<=720]+ba/b", label="720p 优先"),
    PresetOut(id="bestaudio/best", label="最佳音轨"),
]


class YtdlpCancelled(Exception):
    """用户取消下载。"""


def _common_opts(
    *,
    cookies: str | None,
    proxy: str | None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": False,
        "nocheckcertificate": False,
        "source_address": None,
        "socket_timeout": 30,
    }
    if cookies:
        opts["cookiefile"] = cookies
    if proxy:
        opts["proxy"] = proxy
    if extra:
        opts.update(extra)
    return opts


def slim_format(raw: dict[str, Any]) -> FormatOut | None:
    format_id = raw.get("format_id")
    if not format_id:
        return None
    protocol = (raw.get("protocol") or "").lower()
    if protocol in {"mhtml"} or str(format_id).startswith("sb"):
        return None
    vcodec = raw.get("vcodec")
    acodec = raw.get("acodec")
    has_video = bool(vcodec and vcodec != "none")
    has_audio = bool(acodec and acodec != "none")
    if not has_video and not has_audio:
        return None
    height = raw.get("height")
    width = raw.get("width")
    resolution = raw.get("resolution")
    if not resolution and width and height:
        resolution = f"{width}x{height}"
    note = raw.get("format_note") or raw.get("format")
    return FormatOut(
        format_id=str(format_id),
        ext=raw.get("ext"),
        resolution=resolution,
        fps=raw.get("fps"),
        vcodec=None if vcodec == "none" else vcodec,
        acodec=None if acodec == "none" else acodec,
        filesize=raw.get("filesize") or raw.get("filesize_approx"),
        tbr=raw.get("tbr"),
        note=note,
        has_video=has_video,
        has_audio=has_audio,
    )


def _thumbnail(info: dict[str, Any]) -> str | None:
    if info.get("thumbnail"):
        return str(info["thumbnail"])
    thumbs = info.get("thumbnails") or []
    if thumbs:
        last = thumbs[-1]
        if isinstance(last, dict) and last.get("url"):
            return str(last["url"])
    return None


def _entry_url(entry: dict[str, Any], extractor: str | None) -> str | None:
    for key in ("webpage_url", "url", "original_url"):
        value = entry.get(key)
        if value and isinstance(value, str) and value.startswith("http"):
            return value
    video_id = entry.get("id")
    if extractor and "youtube" in extractor.lower() and video_id:
        return f"https://www.youtube.com/watch?v={video_id}"
    return None


def info_to_parse(info: dict[str, Any]) -> ParseOut:
    kind = info.get("_type") or "video"
    if kind == "playlist" or info.get("entries"):
        extractor = info.get("extractor")
        entries: list[PlaylistEntryOut] = []
        for raw in info.get("entries") or []:
            if not isinstance(raw, dict):
                continue
            url = _entry_url(raw, extractor)
            if not url:
                continue
            entries.append(
                PlaylistEntryOut(
                    id=str(raw["id"]) if raw.get("id") else None,
                    title=raw.get("title"),
                    url=url,
                    duration=raw.get("duration"),
                    thumbnail=_thumbnail(raw),
                )
            )
        return ParseOut(
            type="playlist",
            id=str(info["id"]) if info.get("id") else None,
            title=info.get("title"),
            extractor=extractor,
            thumbnail=_thumbnail(info),
            uploader=info.get("uploader") or info.get("channel"),
            webpage_url=info.get("webpage_url"),
            presets=list(PRESETS),
            entries=entries,
        )

    formats: list[FormatOut] = []
    for raw in info.get("formats") or []:
        if not isinstance(raw, dict):
            continue
        item = slim_format(raw)
        if item:
            formats.append(item)
    return ParseOut(
        type="video",
        id=str(info["id"]) if info.get("id") else None,
        title=info.get("title"),
        extractor=info.get("extractor"),
        thumbnail=_thumbnail(info),
        duration=info.get("duration"),
        uploader=info.get("uploader") or info.get("channel"),
        webpage_url=info.get("webpage_url"),
        formats=formats,
        presets=list(PRESETS),
    )


def extract_info(url: str, *, cookies: str | None, proxy: str | None) -> ParseOut:
    import yt_dlp

    assert_public_http_url(url)
    opts = _common_opts(
        cookies=cookies,
        proxy=proxy,
        extra={
            "skip_download": True,
            "extract_flat": "in_playlist",
            "noplaylist": False,
        },
    )
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info:
            raise RuntimeError("未能解析该链接")
        clean = ydl.sanitize_info(info)
    return info_to_parse(clean)


def build_download_opts(
    task: Task,
    outdir: str,
    *,
    cookies: str | None,
    proxy: str | None,
    progress_hook: Callable[[dict[str, Any]], None],
    should_cancel: Callable[[], bool],
) -> dict[str, Any]:
    def hooked(payload: dict[str, Any]) -> None:
        if should_cancel():
            raise YtdlpCancelled("任务已取消")
        progress_hook(payload)

    opts = _common_opts(
        cookies=cookies,
        proxy=proxy,
        extra={
            "outtmpl": f"{outdir}/%(title).80B [%(id)s].%(ext)s",
            "restrictfilenames": True,
            "windowsfilenames": True,
            "progress_hooks": [hooked],
            "postprocessor_hooks": [hooked],
            "ignoreerrors": False,
            "overwrites": True,
            "continuedl": True,
        },
    )

    if task.mode == "audio":
        opts["format"] = task.format_id or "bestaudio/best"
        codec = task.audio_format or "mp3"
        opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": codec,
                "preferredquality": "192",
            }
        ]
    else:
        opts["format"] = task.format_id or "bv*+ba/b"
        opts["merge_output_format"] = "mp4"

    if task.write_subs or task.write_auto_subs:
        langs = [item for item in (task.sub_langs or "").split(",") if item] or ["all"]
        opts["writesubtitles"] = task.write_subs
        opts["writeautomaticsub"] = task.write_auto_subs
        opts["subtitleslangs"] = langs
        opts["subtitlesformat"] = "srt/best"

    return opts


def download_task(
    task: Task,
    outdir: str,
    *,
    cookies: str | None,
    proxy: str | None,
    progress_hook: Callable[[dict[str, Any]], None],
    should_cancel: Callable[[], bool],
) -> None:
    import yt_dlp

    assert_public_http_url(task.url)
    opts = build_download_opts(
        task,
        outdir,
        cookies=cookies,
        proxy=proxy,
        progress_hook=progress_hook,
        should_cancel=should_cancel,
    )
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([task.url])


def explain_ytdlp_error(exc: BaseException) -> str:
    text = str(exc) or exc.__class__.__name__
    lowered = text.lower()
    if "ffmpeg" in lowered:
        return "未找到 ffmpeg，无法合并音视频或抽取音频。请安装 ffmpeg 并加入 PATH。"
    if "sign in" in lowered or "login" in lowered or "cookie" in lowered:
        return "该内容需要登录。请在设置中上传 cookies.txt 后重试。"
    if "private" in lowered:
        return "视频为私有或无权访问。"
    if "unavailable" in lowered or "not available" in lowered:
        return "视频不可用或已被删除。"
    if isinstance(exc, UnsafeUrlError):
        return str(exc)
    if isinstance(exc, YtdlpCancelled):
        return "任务已取消"
    if len(text) > 400:
        return text[:400] + "…"
    return text
