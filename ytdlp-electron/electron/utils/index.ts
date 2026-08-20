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

function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

function looksLikeProjectRoot(dir: string): boolean {
  try {
    return (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'electron')) &&
      (fs.existsSync(path.join(dir, 'internal', 'scripts')) || fs.existsSync(path.join(dir, 'resources')))
    );
  } catch {
    return false;
  }
}

function walkForProjectRoot(start: string): string | null {
  let current = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    if (looksLikeProjectRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * 开发态项目根：ytdlp-electron（不依赖 process.cwd()）
 */
export function getDevProjectRoot(): string {
  const fromEnv = process.env.YTDLP_ELECTRON_ROOT?.trim();
  if (fromEnv && looksLikeProjectRoot(fromEnv)) return fromEnv;

  const fromDist = walkForProjectRoot(path.resolve(__dirname, '../../..'));
  if (fromDist) return fromDist;

  const fromCwd = walkForProjectRoot(process.cwd());
  if (fromCwd) return fromCwd;

  return path.resolve(__dirname, '../../..');
}

/**
 * 获取用户数据目录路径
 */
export function getUserDataPath(): string {
  return app.getPath('userData');
}

/**
 * 获取数据库 / 下载 / Cookie 等数据目录
 * 开发：<ytdlp-electron>/data ；生产：userData/data
 */
export function getDbDir(): string {
  if (isDevMode()) {
    return path.join(getDevProjectRoot(), 'data');
  }
  return path.join(getUserDataPath(), 'data');
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
    return path.join(getDevProjectRoot(), 'resources', 'bin', platformDir);
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
  if (isDevMode()) {
    return getDevProjectRoot();
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
