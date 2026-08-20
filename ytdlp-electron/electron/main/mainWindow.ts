/**
 * 主窗口管理器
 * 负责创建和管理主窗口实例
 */

import { BrowserWindow } from 'electron';
import path from 'path';
import { electronConfig, isDev } from '~/electron/utils/env';
import { logger } from '~/electron/utils/logger';

let mainWindow: BrowserWindow | null = null;

export interface MainWindowOptions {
  onShow?: (window: BrowserWindow) => void;
  onClosed?: () => void;
}

/**
 * 创建主窗口
 */
export function createMainWindow(options?: MainWindowOptions): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: electronConfig.windowWidth,
    height: electronConfig.windowHeight,
    minWidth: 800,
    minHeight: 600,
    title: electronConfig.appTitle,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // 允许 preload 脚本加载本地模块
    },
    show: false, // 准备就绪后再显示，避免白屏
  });

  // 加载页面
  if (isDev()) {
    const frontendUrl = electronConfig.frontendUrl;
    logger.info(`加载 Vite 开发服务器: ${frontendUrl}`);
    mainWindow.loadURL(frontendUrl);
    // 根据环境变量决定是否打开开发者工具
    if (electronConfig.enableDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // 生产环境：加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../../frontend/index.html'));
  }

  // 准备就绪后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (mainWindow) {
      options?.onShow?.(mainWindow);
    }
  });

  // 窗口关闭时清理引用
  mainWindow.on('closed', () => {
    options?.onClosed?.();
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * 获取主窗口实例
 * @returns 主窗口实例，如果已关闭则返回 null
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
