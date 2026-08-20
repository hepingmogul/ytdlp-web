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
  },
} as const;

/** 分页默认值 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 50,
} as const;
