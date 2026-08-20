/**
 * 前端环境变量使用示例
 *
 * 注意：只有以 VITE_ 开头的变量才会暴露给前端
 */

// 当前前端环境标识
export const appEnv = import.meta.env.VITE_APP_ENV;

// 获取应用标题
export const appTitle = import.meta.env.VITE_APP_TITLE;

// 获取 API 基础 URL
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

// 是否启用分析
export const enableAnalytics = import.meta.env.VITE_ENABLE_ANALYTICS === 'true';

// 判断环境
export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;

/**
 * 使用示例：
 *
 * ```ts
 * import { appTitle, apiBaseUrl, isDev } from '~/frontend/utils/env';
 *
 * console.log('应用标题:', appTitle);
 * console.log('API地址:', apiBaseUrl);
 *
 * if (isDev) {
 *   console.log('开发环境');
 * }
 * ```
 */
