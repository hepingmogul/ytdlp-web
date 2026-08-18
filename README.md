# 落带

基于 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 的 B/S 视频下载工作站：网页解析链接、选择格式、排队下载，服务端落盘并按用户隔离。

**只用于下载你有权获取的内容。** 本项目不提供破解、绕过版权保护或未授权抓取的能力。

## 功能

- 多用户登录：首个注册用户为管理员，之后需邀请码
- 解析元数据与格式列表；播放列表勾选批量下载
- 实时进度（SSE）
- 仅音频 / 字幕
- 每用户 Cookies 与代理
- 任务、文件按用户隔离；磁盘配额

## 目录

```
ytdlp-web/
  server/     FastAPI + yt-dlp
  web/        React + Vite
  data/       数据库、cookies、下载文件（不入库）
```

## 环境

- Python 3.11+
- Node.js 20+ / pnpm
- 系统已安装 [ffmpeg](https://ffmpeg.org/) 并加入 `PATH`（合并音视频、抽音频需要）

Windows 可在 PowerShell 中检查：

```powershell
python --version
ffmpeg -version
```

## 启动（开发）

终端 1，服务端：

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

终端 2，前端：

```powershell
cd web
pnpm install
pnpm dev
```

浏览器打开 http://localhost:5173 。第一个注册的账号即管理员。

生产环境请设置环境变量 `LUODAI_JWT_SECRET`。

## 配置

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `LUODAI_JWT_SECRET` | JWT 密钥 | 开发用占位，务必改掉 |
| `LUODAI_DATA_DIR` | 数据目录 | 仓库根目录下的 `data` |
| `LUODAI_DISK_QUOTA_GB` | 每用户配额 | `10` |
| `LUODAI_GLOBAL_CONCURRENCY` | 全局同时下载数 | `2` |
| `LUODAI_CORS_ORIGINS` | 允许的前端源 | `http://localhost:5173,...` |

## Docker

```powershell
docker compose up --build
```

API 在 http://localhost:8000 。可先 `pnpm --dir web build`，再把 `web/dist` 交给 FastAPI 静态托管（存在 `web/dist` 时自动挂载）。

## 接口摘要

- `POST /api/auth/register` `login` `refresh` · `GET /api/auth/me`
- `POST /api/parse`
- `POST/GET /api/tasks` · `GET /api/tasks/{id}/events` · `GET /api/tasks/{id}/file`
- `GET/PUT /api/settings` · `POST/DELETE /api/settings/cookies`
- `POST/GET /api/admin/invites`
- `GET /api/health`（是否检测到 ffmpeg / yt-dlp）

Swagger：http://localhost:8000/docs

## 测试

```powershell
cd server
.\.venv\Scripts\Activate.ps1
pytest
```

## 使用边界

- 禁止对内网地址解析/下载（SSRF 防护）
- 任务与文件只对创建者可见
- Cookies 文件权限收紧，接口不回传原文
