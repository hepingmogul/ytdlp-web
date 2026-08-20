/**
 * 环境变量工具模块
 * 提供类型安全的环境变量访问方法
 */

/**
 * 获取环境变量，如果不存在则返回默认值
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] ?? defaultValue;
}

/**
 * 获取布尔类型的环境变量
 */
export function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

/**
 * 获取数字类型的环境变量
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * 判断是否为开发环境
 */
export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * 判断是否为生产环境
 */
export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Electron 应用配置（窗口相关）
 */
export const electronConfig = {
  get appEnv() {
    return getEnv('ELECTRON_APP_ENV', getEnv('NODE_ENV', 'production'));
  },
  get appTitle() {
    return getEnv('ELECTRON_APP_TITLE', '落带');
  },
  get frontendUrl() {
    return getEnv('ELECTRON_FRONTEND_URL', 'http://localhost:5173');
  },
  get windowWidth() {
    return getEnvNumber('ELECTRON_WINDOW_WIDTH', 1200);
  },
  get windowHeight() {
    return getEnvNumber('ELECTRON_WINDOW_HEIGHT', 800);
  },
  get enableDevTools() {
    return getEnvBool('ELECTRON_ENABLE_DEV_TOOLS', false);
  },
};
