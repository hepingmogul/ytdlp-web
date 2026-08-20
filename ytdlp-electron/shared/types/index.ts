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
