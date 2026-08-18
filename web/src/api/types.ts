export type User = {
  id: string;
  username: string;
  role: "admin" | "user" | string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
};

export type FormatItem = {
  format_id: string;
  ext?: string | null;
  resolution?: string | null;
  fps?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  filesize?: number | null;
  tbr?: number | null;
  note?: string | null;
  has_video: boolean;
  has_audio: boolean;
};

export type PlaylistEntry = {
  id?: string | null;
  title?: string | null;
  url: string;
  duration?: number | null;
  thumbnail?: string | null;
};

export type ParseResult = {
  type: "video" | "playlist" | string;
  id?: string | null;
  title?: string | null;
  extractor?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  uploader?: string | null;
  webpage_url?: string | null;
  formats: FormatItem[];
  presets: { id: string; label: string }[];
  entries: PlaylistEntry[];
};

export type TaskItem = {
  id: string;
  parent_id: string | null;
  url: string;
  title: string | null;
  thumbnail: string | null;
  extractor: string | null;
  mode: string;
  format_id: string | null;
  status: string;
  percent: number;
  speed: string | null;
  eta: number | null;
  downloaded_bytes: number;
  total_bytes: number;
  error_message: string | null;
  filename: string | null;
  filesize: number | null;
  extra_files: string[];
  created_at: string | null;
  child_count: number;
  done_count: number;
};

export type SettingsInfo = {
  proxy: string | null;
  max_concurrent: number;
  default_format: string;
  has_cookies: boolean;
  disk_used_bytes: number;
  disk_quota_bytes: number;
};

export type InviteItem = {
  id: string;
  code: string;
  used_by: string | null;
  created_at: string | null;
  used_at: string | null;
};

export type ProgressEvent = {
  id: string;
  status: string;
  percent: number;
  speed: string | null;
  eta: number | null;
  downloaded_bytes: number;
  total_bytes: number;
  error_message: string | null;
  filename: string | null;
  title: string | null;
};
