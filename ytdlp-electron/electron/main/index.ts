/**
 * Electron 主进程入口
 * 窗口创建和生命周期管理
 */

import path from 'path';
import { config } from 'dotenv';
import { app, BrowserWindow } from 'electron';

// 从 electron/.env 加载主进程环境（打包后文件不存在则忽略）
const electronEnvDir = path.resolve(__dirname, '../../../electron');
config({
  path: [
    path.join(electronEnvDir, '.env'),
    path.join(electronEnvDir, '.env.local'),
  ],
});
import { initDatabase, closeDatabase } from '~/electron/db/sqlite';
import { registerIpcHandlers } from '~/electron/controller';
import { createMainWindow } from '~/electron/main/mainWindow';
import { initLogger, logger } from '~/electron/utils/logger';

// 初始化日志系统（必须在其他模块之前）
initLogger();

/**
 * 应用就绪
 */
app.whenReady().then(async () => {
  logger.info('[Main] App is ready');

  // 初始化数据库
  await initDatabase();

  // 注册 IPC 处理器
  registerIpcHandlers();

  // 创建主窗口
  createMainWindow();

  // macOS: 点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

/**
 * 所有窗口关闭时退出应用（Windows/Linux）
 * macOS 通常保持应用在后台运行直到用户主动退出
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 应用退出前清理资源
 */
app.on('will-quit', async () => {
  logger.info('[Main] App will quit, cleaning up...');
  await closeDatabase();
});

/**
 * 安全策略：阻止新窗口创建，强制在默认浏览器中打开外部链接
 */
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // 阻止在应用内打开外部链接
    if (url.startsWith('http:') || url.startsWith('https:')) {
      const { shell } = require('electron');
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

// 处理安全警告：禁用控制台安全警告（仅在开发环境）
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS =
  process.env.NODE_ENV === 'development' ? 'true' : 'false';
