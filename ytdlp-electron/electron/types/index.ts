/**
 * 主进程专用类型定义
 */

import type {
  Note,
  Category,
  LoginState,
  IPCResponse,
  NoteInput,
  NoteUpdateInput,
  CategoryInput,
  AppSettings,
  AppSettingsUpdate,
  BinaryCheckResult,
  CreateTaskInput,
  DownloadTask,
  ParseResult,
} from '~/electron/shared/types';

export type {
  Note,
  Category,
  LoginState,
  NoteInput,
  NoteUpdateInput,
  CategoryInput,
  AppSettings,
  AppSettingsUpdate,
  BinaryCheckResult,
  CreateTaskInput,
  DownloadTask,
  ParseResult,
};

export interface LoginStateInput {
  name: string;
  uid: string;
  sign: string;
  token?: string;
  refreshToken?: string;
}

// ==================== Service 返回类型 ====================

export type { IPCResponse };
export type ServiceResponse<T = unknown> = IPCResponse<T>;

export interface QueryResult<T> {
  data: T[];
  total: number;
}

// ==================== 窗口配置类型 ====================

export interface WindowConfig {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  title?: string;
  resizable?: boolean;
}
