import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { copyShared } from '../internal/scripts/copy-shared.mjs';

copyShared();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: './',
  root: __dirname,
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/frontend'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  css: {
    devSourcemap: true,
  },
  // 环境变量配置：仅暴露 VITE_ 前缀的变量给前端
  envPrefix: 'VITE_',
  // 开发环境 env
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
});
