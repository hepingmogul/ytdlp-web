/**
 * 前端专用类型定义
 */

import type {
  Note,
  Category,
  IPCResponse,
  AppInfo,
  NoteInput,
  NoteUpdateInput,
  CategoryInput,
  ParseResult,
  DownloadTask,
  DownloadProgress,
  CreateTaskInput,
  AppSettings,
  AppSettingsUpdate,
  BinaryCheckResult,
} from '../shared/types';

export type {
  Note,
  Category,
  IPCResponse,
  AppInfo,
  NoteInput,
  NoteUpdateInput,
  CategoryInput,
  ParseResult,
  DownloadTask,
  DownloadProgress,
  CreateTaskInput,
  AppSettings,
  AppSettingsUpdate,
  BinaryCheckResult,
};

// ==================== 组件 Props 类型 ====================

export interface HeaderProps {
  title: string;
  showBack?: boolean;
}

// ==================== UI 状态类型 ====================

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}
