/**
 * 业务常量
 * 主进程和渲染进程共享，避免魔法字符串
 */

/** 数据库相关 */
export const DB = {
  NAME: 'app.db',
  TABLE: {
    NOTES: 'notes',
    CATEGORIES: 'categories',
    DOWNLOAD_TASKS: 'download_tasks',
    APP_SETTINGS: 'app_settings',
  },
} as const;

/** 分页默认值 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 50,
} as const;

/** 下载任务状态 */
export const TASK_STATUS = {
  QUEUED: 'queued',
  DOWNLOADING: 'downloading',
  POSTPROCESSING: 'postprocessing',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const TERMINAL_STATUSES: readonly string[] = [
  TASK_STATUS.DONE,
  TASK_STATUS.FAILED,
  TASK_STATUS.CANCELLED,
];

export const TASK_MODE = {
  VIDEO: 'video',
  AUDIO: 'audio',
  PLAYLIST: 'playlist',
} as const;

/** yt-dlp 格式预设 */
export const FORMAT_PRESETS = [
  { id: 'bv*+ba/b', label: '最佳画质（自动合并）' },
  { id: 'bv*[height<=1080]+ba/b', label: '1080p 优先' },
  { id: 'bv*[height<=720]+ba/b', label: '720p 优先' },
  { id: 'bestaudio/best', label: '最佳音轨' },
] as const;

export const DEFAULT_FORMAT = 'bv*+ba/b';
export const DEFAULT_MAX_CONCURRENT = 2;
