/**
 * 主进程工具函数
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { IPCResponse } from '~/electron/shared/types';
import { DB } from '~/electron/shared/constant';

// 重新导出环境变量工具
export * from '~/electron/utils/env';

/**
 * 获取用户数据目录路径
 */
export function getUserDataPath(): string {
  return app.getPath('userData');
}

/**
 * 获取数据库目录路径
 */
export function getDbDir(): string {
  const isDevMode = process.env.NODE_ENV === 'development';

  if (isDevMode) {
    // 开发模式：项目根目录/data
    return path.join(process.cwd(), 'data');
  } else {
    // 生产模式：userData/data
    return path.join(getUserDataPath(), 'data');
  }
}

/**
 * 获取数据库文件完整路径
 */
export function getDbPath(): string {
  const dbDir = getDbDir();
  // 确保目录存在
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, DB.NAME);
}

/**
 * 获取应用根目录（区分开发和生产环境）
 */
export function getAppRoot(): string {
  if (process.env.NODE_ENV === 'development') {
    return process.cwd();
  }
  return path.dirname(app.getPath('exe'));
}

/**
 * 获取静态资源路径
 */
export function getAssetPath(...paths: string[]): string {
  return path.join(getAppRoot(), ...paths);
}

/**
 * 成功响应封装
 */
export function successResponse<T>(data: T): IPCResponse<T> {
  return { success: true, data };
}

/**
 * 错误响应封装
 */
export function errorResponse(message: string): IPCResponse<never> {
  return { success: false, error: message };
}

/**
 * 安全地解析 JSON
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * 生成时间戳字符串
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}
