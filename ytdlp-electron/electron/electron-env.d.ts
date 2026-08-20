/**
 * Electron 环境类型扩展
 */

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production';
    DEBUG: string;
    // Electron 主进程环境变量（以 ELECTRON_ 开头）
    readonly ELECTRON_APP_ENV: string;
    readonly ELECTRON_FRONTEND_URL: string;
    readonly ELECTRON_APP_TITLE: string;
    readonly ELECTRON_WINDOW_WIDTH: string;
    readonly ELECTRON_WINDOW_HEIGHT: string;
    readonly ELECTRON_ENABLE_DEV_TOOLS: string;
  }
}

/**
 * 扩展 Electron 的上下文隔离类型
 */
declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      send: (channel: string, ...args: unknown[]) => void
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
    }
  }
}

export {};
