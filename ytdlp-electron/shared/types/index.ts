/**
 * IPC 接口类型定义
 * 主进程和渲染进程共享的类型契约
 */

// ==================== 数据库实体类型 ====================

export interface Entity {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note extends Entity {
  title: string;
  content: string;
  category?: string;
}

export interface Category extends Entity {
  name: string;
  color?: string;
}

// ==================== 输入参数类型 (DTO) ====================

export interface NoteInput {
  title: string;
  content: string;
  category?: string;
}

export interface NoteUpdateInput {
  id: number;
  title?: string;
  content?: string;
  category?: string;
}

export interface CategoryInput {
  name: string;
  color?: string;
}

export interface LoginState extends Entity {
  name: string;
  uid: string;
  sign: string;
  token?: string;
  refreshToken?: string;
  /** 激活状态：0-未激活，1-已激活 */
  active: number;
  /** 删除标记：0-正常，1-已删除 */
  isDeleted: number;
  /** 删除时间 */
  deletedAt?: string;
}

// ==================== IPC 请求/响应类型 ====================

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface IPCPaginationParams {
  page?: number;
  pageSize?: number;
}

export interface IPCQueryParams {
  where?: Record<string, unknown>;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}

// ==================== 数据库操作类型 ====================

export type DBOperation = 'getAll' | 'getById' | 'create' | 'update' | 'delete' | 'query';

export interface DBQueryOptions {
  table: string;
  conditions?: Record<string, unknown>;
  orderBy?: string;
  limit?: number;
  offset?: number;
}

// ==================== 应用信息类型 ====================

export interface AppInfo {
  version: string;
  platform: string;
  electronVersion: string;
}

// ==================== 视频解析 / 下载 ====================

export interface FormatItem {
  formatId: string;
  ext?: string | null;
  resolution?: string | null;
  fps?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  filesize?: number | null;
  tbr?: number | null;
  note?: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface PlaylistEntry {
  id?: string | null;
  title?: string | null;
  url: string;
  duration?: number | null;
  thumbnail?: string | null;
}

export interface FormatPreset {
  id: string;
  label: string;
}

export interface ParseResult {
  type: 'video' | 'playlist';
  id?: string | null;
  title?: string | null;
  extractor?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  uploader?: string | null;
  webpageUrl?: string | null;
  formats: FormatItem[];
  presets: FormatPreset[];
  entries: PlaylistEntry[];
}

export interface CreateTaskEntry {
  url: string;
  title?: string | null;
  thumbnail?: string | null;
}

export interface CreateTaskInput {
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  extractor?: string | null;
  formatId?: string | null;
  audioOnly?: boolean;
  audioFormat?: 'mp3' | 'm4a' | 'opus';
  writeSubs?: boolean;
  writeAutoSubs?: boolean;
  subLangs?: string[];
  proxy?: string | null;
  entries?: CreateTaskEntry[];
}

export interface DownloadTask {
  id: string;
  parentId?: string | null;
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  extractor?: string | null;
  mode: string;
  formatId?: string | null;
  audioFormat?: string | null;
  writeSubs: boolean;
  writeAutoSubs: boolean;
  subLangs?: string | null;
  proxy?: string | null;
  status: string;
  percent: number;
  speed?: string | null;
  eta?: number | null;
  downloadedBytes: number;
  totalBytes: number;
  errorMessage?: string | null;
  outputPath?: string | null;
  filename?: string | null;
  filesize?: number | null;
  extraFiles: string[];
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  childCount: number;
  doneCount: number;
}

export interface DownloadProgress {
  id: string;
  parentId?: string | null;
  status: string;
  percent: number;
  speed?: string | null;
  eta?: number | null;
  downloadedBytes: number;
  totalBytes: number;
  errorMessage?: string | null;
  filename?: string | null;
  title?: string | null;
  childCount?: number;
  doneCount?: number;
}

export interface AppSettings {
  downloadDir: string;
  cookiesPath?: string | null;
  hasCookies: boolean;
  proxy?: string | null;
  maxConcurrent: number;
  defaultFormat: string;
}

export interface AppSettingsUpdate {
  downloadDir?: string;
  proxy?: string | null;
  maxConcurrent?: number;
  defaultFormat?: string;
}

export interface BinaryInfo {
  path: string | null;
  version: string | null;
}

export interface BinaryCheckResult {
  ytdlp: BinaryInfo;
  ffmpeg: BinaryInfo;
}
