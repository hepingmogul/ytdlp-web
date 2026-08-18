from pydantic import BaseModel, Field


class ParseBody(BaseModel):
    url: str = Field(min_length=4, max_length=4000)


class FormatOut(BaseModel):
    format_id: str
    ext: str | None = None
    resolution: str | None = None
    fps: float | None = None
    vcodec: str | None = None
    acodec: str | None = None
    filesize: int | None = None
    tbr: float | None = None
    note: str | None = None
    has_video: bool = False
    has_audio: bool = False


class PlaylistEntryOut(BaseModel):
    id: str | None = None
    title: str | None = None
    url: str
    duration: float | None = None
    thumbnail: str | None = None


class PresetOut(BaseModel):
    id: str
    label: str


class ParseOut(BaseModel):
    type: str
    id: str | None = None
    title: str | None = None
    extractor: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    uploader: str | None = None
    webpage_url: str | None = None
    formats: list[FormatOut] = Field(default_factory=list)
    presets: list[PresetOut] = Field(default_factory=list)
    entries: list[PlaylistEntryOut] = Field(default_factory=list)
