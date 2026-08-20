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
  ensureDir(dbDir);
  return path.join(dbDir, DB.NAME);
}

/**
 * 确保目录存在
 */
export function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 默认下载根目录
 */
export function getDefaultDownloadDir(): string {
  return path.join(getDbDir(), 'downloads');
}

/**
 * 任务输出目录：<downloadDir>/<taskId>
 */
export function getTaskDir(downloadDir: string, taskId: string): string {
  return ensureDir(path.join(downloadDir, taskId));
}

/** cookies.txt 存放目录 */
export function getCookiesDir(): string {
  return ensureDir(path.join(getDbDir(), 'cookies'));
}

export function getCookiesFilePath(): string {
  return path.join(getCookiesDir(), 'cookies.txt');
}

/**
 * 捆绑二进制目录：仅使用项目内 / extraResources，不读系统 PATH
 * 未打包：<cwd>/resources/bin/<platform-arch>
 * 已打包：<resourcesPath>/bin/<platform-arch>（若无则回退 bin 根目录）
 */
export function getBundledBinDir(): string {
  const platformDir = `${process.platform}-${process.arch}`;
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'resources', 'bin', platformDir);
  }
  const nested = path.join(process.resourcesPath, 'bin', platformDir);
  if (fs.existsSync(nested)) {
    return nested;
  }
  return path.join(process.resourcesPath, 'bin');
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
