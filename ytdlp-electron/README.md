# Electron Vite Desktop App

现代化的 Electron + Vite + Vue 3 桌面应用开发模板。

## 项目简介

本项目是一个基于 Electron、Vite、Vue 3 和 TypeScript 构建的桌面应用基础模板。采用主进程分层架构（Controller → Service → DB），使用 `contextBridge` 实现安全的 IPC 通信，并集成了 better-sqlite3 数据库、TailwindCSS 原子化 CSS 工具，提供完整的开发热更新和生产构建流程。

## 技术栈

- **Electron** ^36 — 跨平台桌面应用框架
- **Vite** ^6 — 前端构建工具，支持 HMR 和快速冷启动
- **Vue 3** ^3.5 — 渐进式 JavaScript 框架，采用 Composition API
- **TypeScript** ^5 — 类型安全的 JavaScript 超集
- **esbuild** ^0.25 — 主进程打包工具，轻量快速
- **TailwindCSS** ^4 — 原子化 CSS 框架
- **better-sqlite3** ^12 — 高性能同步 SQLite 数据库

## 目录结构

```
electron-vite/
├── electron/                    # Electron 主进程
│   ├── main/                    # 主进程入口，窗口和生命周期管理
│   ├── preload/                 # Preload 脚本，暴露安全 API
│   ├── controller/              # IPC 请求路由和 Controller 基类
│   ├── service/                 # Service 层，数据库 CRUD 封装
│   ├── db/                      # 数据库连接管理和表结构初始化
│   ├── utils/                   # 工具函数（路径处理、响应封装）
│   └── types/                   # 主进程专用类型定义
├── frontend/                    # Vue 3 渲染进程（前端）
│   ├── components/              # Vue 组件
│   ├── composables/             # 组合式函数（useElectronAPI 等）
│   ├── types/                   # 前端专用类型定义
│   ├── App.vue                  # 根组件
│   ├── main.ts                  # 前端入口
│   ├── index.html               # HTML 模板
│   └── style.css                # TailwindCSS 入口样式
├── shared/                      # 主进程和渲染进程共享代码
│   ├── constant.ts              # IPC 通道名称常量
│   └── types/                   # 共享类型定义（实体、接口）
├── manifests/envs/              # 多环境模板（electron / frontend）
├── internal/scripts/            # 构建脚本
│   ├── build.mjs                # esbuild 生产构建
│   └── watch.mjs                # esbuild watch 模式 + Electron 重启
├── dist/                        # 构建输出根目录
│   ├── frontend/                # 渲染进程构建输出（Vite）
│   └── electron/                # 主进程构建输出（esbuild）
├── vite.config.mjs              # Vite 配置文件
├── tsconfig.json                # TypeScript 根配置
├── tsconfig.node.json           # Node 环境 TypeScript 配置
└── package.json                 # 项目配置和依赖
```

## 环境切换

多环境模板位于 `manifests/envs`，按主进程 / 前端拆分：

- `electron/.env.development|test|production`
- `frontend/.env.development|test|production`

运行 `npm run env:init -- <mode>` 会把对应模板写入运行时文件（已加入 `.gitignore`）：

- `electron/.env` — 主进程 / watch / build 读取
- `frontend/.env` — Vite 读取（仅 `VITE_` 前缀会进入渲染进程）

快捷命令：

```bash
npm run env:init:dev    # 开发
npm run env:init:test   # 测试
npm run env:init:prod   # 生产
```

`npm run dev` 会自动执行 `env:init:dev`；`npm run build` / `npm run pack` 会自动执行 `env:init:prod`。安装包不包含 `.env`，主进程走代码默认值，前端 `VITE_*` 已在构建期打入产物。

本地覆盖可在对应目录放 `.env.local`（不会被 `env:init` 覆盖）。

## 启动和构建

### 开发环境

```bash
# 启动开发服务器（并行运行 Vite + esbuild watch + Electron）
npm run dev
```

开发环境特性：
- **渲染进程 HMR**：修改 Vue 组件代码后，浏览器窗口热更新
- **主进程自动重启**：修改 `electron/` 目录代码后，esbuild 自动重新编译并重启 Electron
- **开发服务器**：Vite 在 `http://localhost:5173` 提供前端服务，Electron 通过该地址加载页面

### 生产构建

```bash
# 完整生产构建（前端 + 主进程）
npm run build

# 分别构建前端和主进程
npm run build:vite      # Vite 构建渲染进程到 dist/frontend/
npm run build:electron  # esbuild 构建主进程到 dist/electron/
```

### 运行生产包

```bash
# 使用 Electron 直接运行打包后的主进程
npm start
```

### 重建原生模块

```bash
# 重新编译 better-sqlite3 以匹配当前 Electron 的 Node.js ABI
npm run rebuild
```

## 已知问题和注意事项

### better-sqlite3 原生模块重建

better-sqlite3 是原生 C++ 模块，在不同 Electron 版本和 Node.js ABI 下可能需要重新编译。当遇到以下错误时，请运行重建命令：

```
Error: The module was compiled against a different Node.js version
```

解决方法：
```bash
npm run rebuild
```

### 生产环境资源路径

生产模式下，Electron 通过 `dist/frontend/index.html` 加载前端页面。开发模式下则通过 `http://localhost:5173` 加载。`electron/main/index.ts` 中已使用 `__dirname` 和条件判断处理此差异。

### contextIsolation 安全限制

本项目遵循 Electron 安全最佳实践，禁用了 `nodeIntegration`，启用了 `contextIsolation`。所有需要 Node.js API 的操作（如文件系统、数据库）必须通过 IPC 委托给主进程，渲染进程仅能通过 `window.electronAPI` 调用预定义的安全接口。

### TailwindCSS v4 配置

本项目使用 TailwindCSS v4，采用 CSS-first 配置方式。样式配置直接在 `frontend/style.css` 中通过 `@theme` 规则定义，不再需要 `tailwind.config.mjs` 文件。

### 开发环境 Windows 路径处理

在 Windows 环境下，esbuild 和 Vite 的脚本均使用 `fileURLToPath` 正确解析路径，确保跨平台兼容性。

## 许可证

MIT
