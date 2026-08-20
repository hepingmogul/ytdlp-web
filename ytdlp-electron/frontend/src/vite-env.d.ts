/**
 * Vite 环境类型扩展
 */

/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

/**
 * 前端环境变量类型（以 VITE_ 开头）
 * 这些变量会通过 import.meta.env 暴露给浏览器端
 */
interface ImportMetaEnv {
  readonly NODE_ENV: 'development' | 'production';
  readonly DEV: boolean;
  readonly PROD: boolean;
  // 自定义 VITE_ 环境变量
  readonly VITE_APP_ENV: string;
  readonly VITE_APP_TITLE: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ENABLE_ANALYTICS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
