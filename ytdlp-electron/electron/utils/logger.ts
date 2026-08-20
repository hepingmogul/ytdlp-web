/**
 * 日志工具模块
 * 基于 electron-log 实现按天存放的日志功能
 * - 开发模式：日志存放在项目根目录 logs/
 * - 生产模式：日志存放在 userData/logs/
 */

import log from 'electron-log';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import dayjs from 'dayjs';
import { getDevProjectRoot } from '~/electron/utils';

/**
 * 获取日志目录路径
 * 开发：<ytdlp-electron>/logs ；生产：userData/logs
 */
function getLogDir(): string {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    return path.join(getDevProjectRoot(), 'logs');
  }
  return path.join(app.getPath('userData'), 'logs');
}

/**
 * 初始化日志系统
 */
export function initLogger(): void {
  const logDir = getLogDir();

  // 确保日志目录存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 设置日志文件路径（按天命名）
  const dateStr: string = dayjs().format('YYYY-MM-DD');
  const logFile = path.join(logDir, `${dateStr}.log`);

  // 配置 electron-log
  log.transports.file.resolvePathFn = () => logFile;
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
  log.transports.file.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

  // 控制台输出配置
  log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

  // 设置日志级别
  log.transports.file.level = 'debug';
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

  log.info(`Logger initialized - Project root: ${getDevProjectRoot()}`);
  log.info(`Logger initialized - Log directory: ${logDir}`);
  log.info(`Logger initialized - Log file: ${logFile}`);
}

/**
 * 获取日志实例
 */
export const logger = log;

// 导出便捷方法
export const info = log.info.bind(log);
export const warn = log.warn.bind(log);
export const error = log.error.bind(log);
export const debug = log.debug.bind(log);
export const verbose = log.verbose.bind(log);
