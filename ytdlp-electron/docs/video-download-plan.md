# ytdlp-electron 视频下载方案

> 状态：阶段 2 + 捆绑二进制已落地；抖音精选页走 Electron Chromium 适配器  
> 日期：2026-08-20  
> 依据：`ytdlp-web` 服务端（Python + yt-dlp）功能语义 + 本仓库 Electron 现有分层

**只用于下载你有权获取的内容。** 本方案不包含破解、绕过版权保护或未授权抓取。

---

## 1. 需求理解与目标

把当前 Electron 模板做成**本地桌面下载器**：用户粘贴视频/播放列表链接，解析元数据与格式，排队下载到本机目录，实时看进度，完成后可打开文件夹。

能力对齐上级仓库「落带」（`ytdlp-web`）的工作台，但**去掉多用户、邀请码、JWT、SSE、磁盘配额**——桌面端是单用户、本机落盘。

### 1.1 目标用户路径

1. 粘贴 URL → 解析（不立刻下载）
2. 选预设 / 具体 format_id / 仅音频 / 字幕
3. 创建任务入队
4. 列表里看进度、速度、ETA
5. 取消 / 失败重试 / 打开文件或所在目录

### 1.2 明确不做（首期）

- 账号体系、邀请码、管理员
- 服务端配额、SSRF 防内网（桌面端仍校验 `http(s)`，禁止 `file://`）
- 通用站点仍只支持导入 `cookies.txt`（抖音可用内置 Chromium 采集新鲜 Cookie）
- 自动更新 yt-dlp 二进制（可预留接口，二期再做）

---

## 2. 现状

### 2.1 本仓库（ytdlp-electron）

| 层 | 现状 |
| --- | --- |
| 主进程 | Controller → Service → SQLite（TypeORM + better-sqlite3） |
| IPC | `controller/{模块}/{方法}` + `ipcMain.handle`；preload 白名单 |
| 推送 | 仅有 `invoke` / 窗口控制，**没有**下载进度事件通道 |
| 前端 | Vue 3 + Tailwind，无路由；页面是笔记演示模板 |
| 打包 | electron-builder，当前未捆绑外部二进制 |
| 数据 | `data/app.db`（开发）/ `userData/data`（生产） |

可复用：`registerIpcHandlers`、`getMainWindow`、`successResponse` / `errorResponse`、`shared/` 类型同步。

模板里的 `note` / `category` / `loginState` **不是下载产品能力**，实施时从主界面拿掉，实体可暂留以免无关迁移。

### 2.2 上级仓库已验证的产品语义（应对齐）

`server/app/services/ytdlp_service.py` + `workers/downloader.py`：

- 解析：`skip_download` + `extract_flat=in_playlist`，输出 type / formats / presets / entries
- 预设：`bv*+ba/b`、`1080p`、`720p`、`bestaudio/best`
- 下载：视频合并 mp4；仅音频走 FFmpeg 抽轨；可选字幕
- 进度 hook：percent / speed / eta / bytes；`finished` → 后处理 99%
- 取消：协作式中断；播放列表父任务汇总子任务
- 依赖：系统 **ffmpeg**（合并、抽音频）
- Cookies / 代理

桌面端应用同一套任务状态机：

`queued` → `downloading` → `postprocessing` → `done` | `failed` | `cancelled`

---

## 3. 推荐方案：捆绑 yt-dlp 官方二进制 + 主进程子进程

### 3.1 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| **A. 官方独立二进制** | 主进程 `spawn(yt-dlp)`，stdout 解析进度；ffmpeg 同目录或 `--ffmpeg-location` | 无 Python 运行时；官方发布包；杀进程即可取消；打包路径清晰 | 需维护 win/mac/linux 二进制；解析 CLI 输出；安装包变大（约 80–150MB 含 ffmpeg） | **推荐** |
| B. Python sidecar | 把现有 `ytdlp_service.py` 做成子进程，JSON-RPC | 可直接复用 Web 解析/下载逻辑 | 要带 CPython 或要求用户装 Python；双语言排障；打包更重 | 不推荐 |
| C. npm 封装（yt-dlp-wrap 等） | Node 包装 CLI | 上手快 | 仍要二进制；API 受库版本绑死；进度/取消细节不好控 | 不作为核心依赖 |

不采用在渲染进程调 yt-dlp：`contextIsolation` + 无 `nodeIntegration`，文件与进程必须走主进程。

### 3.2 引擎职责（薄封装，对齐 Web 版行为）

新增主进程模块 `electron/engine/ytdlp/`（不走 DB）：

```
YtdlpEngine
  locateBinaries()     解析 yt-dlp / ffmpeg 路径
  extractInfo(url)     等价 extract_info
  download(task)       等价 download_task
  cancel(taskId)       SIGTERM / taskkill 子进程
```

解析命令（示意）：

```text
yt-dlp -J --flat-playlist --no-warnings --socket-timeout 30 <url>
  [--cookies <file>] [--proxy <url>]
```

下载命令（示意）：

```text
yt-dlp <url>
  -f <format_id|preset>
  -o "<outdir>/%(title).80B [%(id)s].%(ext)s"
  --windows-filenames --restrict-filenames
  --merge-output-format mp4          # 视频模式
  -x --audio-format mp3 --audio-quality 192   # 仅音频
  --write-subs --write-auto-subs --sub-langs ... --sub-format srt/best
  --cookies --proxy
  --ffmpeg-location <dir>
  --newline --progress
  --progress-template "download:%(progress)j"
```

进度：解析 JSON 行（downloaded_bytes / total_bytes / speed / eta / status）。无法解析时回退 `--newline` 文本百分比。完成后扫描任务目录，选出主媒体文件（逻辑对齐 `storage.apply_outputs`）。

取消：记录 `ChildProcess`，置 `cancelled` 后 `kill()`；下载侧 `--continue` 便于重试。

错误文案对齐 `explain_ytdlp_error`：ffmpeg 缺失、需登录/cookie、私有、不可用。

---

## 4. 总体架构

```text
┌─────────────────────────────────────────────────────────┐
│  渲染进程 Vue                                           │
│  工作台 / 任务 / 设置                                   │
│  invoke(controller/...)  +  on(download:progress)       │
└──────────────────────────┬──────────────────────────────┘
                           │ preload 白名单
┌──────────────────────────▼──────────────────────────────┐
│  Controller                                              │
│  parse / task / settings / app                           │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  Service                                                 │
│  TaskService  持久化 + 入队                              │
│  SettingsService  目录/代理/cookies/并发                 │
│  DownloadQueue  并发信号量 + 崩溃恢复                    │
│  YtdlpEngine  spawn CLI                                  │
└─────────────┬──────────────────────────┬────────────────┘
              │ SQLite tasks/settings    │ 子进程
              ▼                          ▼
         app.db                    yt-dlp + ffmpeg
              │
              ▼
         下载目录 / 每任务子目录
```

队列行为（简化 Web worker，去掉 user 维度）：

- 全局并发默认 2，设置里可改 1–3
- 启动时把 `downloading` / `postprocessing` 且非 playlist 父任务改回 `queued` 再入队
- 进度节流 ≥ 300ms 写库 + 推前端
- playlist：父任务只汇总；子任务真正下载

---

## 5. 数据模型

### 5.1 `download_tasks`

字段对齐 Web `tasks`，去掉 `user_id`。主键用 UUID 字符串。

| 字段 | 说明 |
| --- | --- |
| id | UUID |
| parent_id | 播放列表父任务 |
| url / title / thumbnail / extractor | 元数据 |
| mode | `video` \| `audio` \| `playlist` |
| format_id / audio_format | 格式 |
| write_subs / write_auto_subs / sub_langs | 字幕 |
| proxy | 任务级代理（可空，回落设置） |
| status / percent / speed / eta | 进度 |
| downloaded_bytes / total_bytes | 字节 |
| error_message | 失败/取消原因 |
| output_path / filename / filesize / extra_files | 产物 |
| created_at / started_at / finished_at | 时间 |

### 5.2 `app_settings`（单行）

| 字段 | 默认 |
| --- | --- |
| download_dir | 开发：`项目/data/downloads`；生产：`userData/downloads`，可改 |
| cookies_path | 可空，指向用户选择的 `cookies.txt` 副本 |
| proxy | 可空 |
| max_concurrent | 2 |
| default_format | `bv*+ba/b` |

路径工具：`getDownloadRoot()`、`taskDir(taskId)`，开发/生产规则与现有 `getDbDir()` 一致。

---

## 6. IPC 契约

沿用 `controller/{file}/{method}`。共享类型放 `shared/types`，由 `copy-shared` 同步。

### 6.1 请求（invoke）

```text
controller/parse/url
  in:  { url: string }
  out: ParseResult          # 对齐 ParseOut

controller/task/create
  in:  CreateTaskInput      # url, title, format_id, audio_only, entries...
  out: DownloadTask

controller/task/list
  in:  { includeChildren?: boolean }
  out: { items: DownloadTask[] }

controller/task/get          { id }
controller/task/children     { id }
controller/task/cancel       { id }
controller/task/retry        { id }          # 终态失败/取消 → queued 再入队
controller/task/delete       { id }          # 取消进行中 + 删目录 + 删行
controller/task/openFolder   { id }          # shell.showItemInFolder / openPath
controller/task/revealFile   { id }

controller/settings/get
controller/settings/update
controller/settings/chooseDownloadDir    # dialog.showOpenDialog
controller/settings/importCookies        # 选文件并拷到 userData/cookies/cookies.txt
controller/settings/clearCookies
controller/settings/checkBinaries        # { ytdlp, ffmpeg, versions }
```

### 6.2 推送（send / on）

新增事件通道（**必须**加入 preload 白名单，不能只靠 invoke）：

```text
download:progress
  payload: {
    id, parentId?, status, percent, speed, eta,
    downloadedBytes, totalBytes, errorMessage?, filename?, title?
  }
```

主进程 `getMainWindow()?.webContents.send('download:progress', payload)`。  
前端 `electronAPI.on('download:progress', ...)` 更新列表；进入页面再 `task/list` 拉快照。

### 6.3 共享类型（草案）

与 Web `ParseOut` / `TaskOut` 对齐，Electron 侧用 camelCase：

- `ParseResult`：type, formats[], presets[], entries[]
- `DownloadTask`：含 childCount / doneCount
- `CreateTaskInput`：audioOnly, audioFormat `'mp3'|'m4a'|'opus'`, subLangs[], entries?

---

## 7. 二进制与打包

### 7.1 仓库布局

```text
resources/bin/
  win32-x64/yt-dlp.exe
  win32-x64/ffmpeg.exe
  darwin-arm64/...
  darwin-x64/...
  linux-x64/...
```

**不把二进制提交进 git。** 提供 `internal/scripts/fetch-binaries.mjs`：从 [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) 与 ffmpeg 官方/gyan 构建下载到 `resources/bin`。开发者首次 `npm run bin:fetch`。

查找顺序：

1. 设置里的自定义路径（预留）
2. 打包后 `process.resourcesPath/bin/`
3. 开发态 `resources/bin/<platform-arch>/`
4. 系统 `PATH`（仅开发兜底）

找不到则 `checkBinaries` / 创建任务时返回中文错误：「未找到 yt-dlp / ffmpeg」。

### 7.2 electron-builder

```yaml
asar: true
asarUnpack:
  - "**/*.exe"     # 若有解包需求；二进制走 extraResources 更干净
extraResources:
  - from: resources/bin/${platform}-${arch}
    to: bin
    filter: ["**/*"]
```

Windows 目标保持 nsis + portable。安装包体积增大需在 README 说明。

ffmpeg 许可（LGPL/GPL 构建选择）在发行说明里写清来源。

---

## 8. 前端

### 8.1 路由（新增 vue-router）

| 路径 | 页面 | 对应 Web |
| --- | --- | --- |
| `/` | 工作台：解析 + 选格式 + 创建 | Workbench |
| `/tasks` | 任务列表、进度、取消、打开目录 | Tasks |
| `/settings` | 下载目录、代理、cookies、并发、二进制检测 | Settings（去掉邀请码） |

布局：侧栏或顶栏三个入口，替换当前笔记演示。

### 8.2 工作台要点

- 解析中禁用按钮；失败展示引擎中文错误
- 预设 chips + 格式表（分辨率 / 编码 / 大小）
- 仅音频时隐藏视频格式表
- 播放列表：全选 / 清空 / 勾选条目后再创建
- 创建成功跳转任务页

### 8.3 任务页要点

- 非终态用 IPC 进度，不必 2s 轮询（可保留进入页面一次 list）
- 播放列表可展开 children
- 操作：取消、重试、打开文件夹、删除

交互保持现有 Tailwind 风格即可，不引入新 UI 库。

---

## 9. 涉及文件（实施时）

| 路径 | 改动 |
| --- | --- |
| `shared/types/index.ts` | Parse / Task / Settings 类型 |
| `shared/constant.ts` | 表名、任务状态、预设 |
| `electron/shared/ipcChannels.ts` | 新路由 + `download:progress` |
| `electron/db/schema/downloadTask.ts` | 新实体 |
| `electron/db/schema/appSettings.ts` | 新实体 |
| `electron/db/schema/index.ts` | 注册实体 |
| `electron/engine/ytdlp/*` | 二进制定位、参数、进度解析 |
| `electron/service/task.ts` | CRUD + 产物扫描 |
| `electron/service/settings.ts` | 设置与目录选择 |
| `electron/service/downloadQueue.ts` | 队列、恢复、推送 |
| `electron/controller/parse.ts` | 解析 |
| `electron/controller/task.ts` | 任务 |
| `electron/controller/settings.ts` | 设置 |
| `electron/utils/index.ts` | 下载目录路径 |
| `electron/main/index.ts` | 启动时恢复队列 |
| `electron-builder.yml` | extraResources |
| `internal/scripts/fetch-binaries.mjs` | 拉取二进制 |
| `package.json` | `bin:fetch` 脚本 |
| `frontend` | router、三页面、`useTaskAPI`、进度监听 |
| `README.md` | 产品说明、ffmpeg、cookies |

预计 **≥ 12 个文件**，分三阶段落地，避免一次大爆炸。

---

## 10. 分阶段实施

### 阶段 0 — 骨架（可独立验收）

- 实体 + IPC 空实现 + 路由三页壳
- `checkBinaries` 能报路径/版本
- 工作台可点「解析」走到主进程（可先 mock）

### 阶段 1 — MVP（建议第一批交付）

- 真实 `extractInfo`（单视频）
- 创建任务、队列、单任务下载、进度推送、取消
- 完成后打开文件夹
- 默认预设 `bv*+ba/b`，合并 mp4
- 设置：下载目录、二进制检测

**验收：** YouTube 公开视频能解析、下载、进度走动、完成后资源管理器定位到文件。

### 阶段 2 — 与 Web 工作台对齐

- 格式表 / 仅音频 / 字幕
- cookies.txt、代理
- 播放列表勾选 + 父任务汇总
- 失败重试、启动恢复中断任务

### 阶段 3 — 体验

- `bin:fetch` 与打包 extraResources
- 任务删除连带清文件
- yt-dlp 版本展示；（可选）检查 GitHub 新版本提示

确认本方案后，默认按 **阶段 1 → 2 → 3** 做，不一次铺开。

---

## 11. 风险、兼容、回滚

| 风险 | 处理 |
| --- | --- |
| 站点风控 / 需登录 | cookies + 明确错误文案；不内置破解 |
| 无 ffmpeg | 检测失败时禁止「需合并」的预设，提示安装或捆绑 |
| 进度解析偶发失败 | 节流写库；解析失败不把任务标失败，仅 percent 卡住到 finished |
| 取消杀不掉 Windows 子进程 | `taskkill /pid /t`；仍失败则标 cancelled 并丢弃 hook |
| 二进制体积 | extraResources 按平台只带当前 arch；CI 再拉 |
| TypeORM `synchronize: true` | 开发可接受；新表自动建。上线后若有用户数据再改迁移 |
| 模板笔记代码 | 界面替换；旧表可留，不阻塞 |
| 合法使用 | README / 关于页声明，与 ytdlp-web 一致 |

回滚：功能在新模块，不改 DB 驱动。去掉 IPC 路由与页面即可回到模板；`download_tasks` 表可空留。

---

## 12. 验证方式

无浏览器 MCP 时，用 Electron 窗口 + 主进程日志验证。

1. `npm run bin:fetch`（或 PATH 已有 yt-dlp/ffmpeg）后 `npm run dev`
2. 设置页：二进制版本非空；可改下载目录
3. 公开短视频 URL：解析出标题、格式列表
4. 开始下载：任务 `queued` → `downloading`，进度条与速度更新
5. 完成后：文件在任务目录，扩展名合理（mp4 或所选音频）
6. 下载中取消：状态 `cancelled`，无僵尸 yt-dlp 进程
7. 仅音频：得到 mp3/m4a/opus
8. 无效 URL / 需登录视频：中文错误，不崩溃
9. 重启应用：中断任务回到队列并继续（阶段 2）
10. `npm run pack:win`：安装包内 `resources/bin` 存在且便携版能下载（阶段 3）
11. 抖音 `jingxuan?modal_id=` / `/video/<id>` / `v.douyin.com` 短链：能解析标题并下载（可能短暂打开验证窗）

---

## 13. 待确认

请拍板后再改代码：

1. **阶段范围：** 第一批是否只做阶段 1（单视频 + 进度 + 目录），播放列表/字幕/cookies 放第二批？
2. **二进制策略：** 开发允许 PATH 兜底；正式包是否必须内置 yt-dlp + ffmpeg？
3. **默认下载目录：** 维持 `data/downloads`（开发）与 `userData/downloads`（生产），还是默认「用户下载」文件夹？
4. **模板代码：** 笔记/分类演示从 UI 移除即可，还是连实体/IPC 一并删？
5. **产品名：** 沿用「落带」，还是新名字（影响窗口标题与安装包 `productName`）？

回复例如：「同意，按阶段 1 做；二进制开发走 PATH、打包内置；目录用 userData；UI 去掉笔记；名字叫落带」即可开始实施。

---

## 14. 抖音适配（已落地）

捆绑 yt-dlp 不认 `https://www.douyin.com/jingxuan?modal_id=`，标准 `/video/<id>` 也会因缺少新鲜 Cookie 失败。精选页 HTTP 响应是 JS 挑战页，嵌入 Python 同样过不了，除非再带一套浏览器。

做法：

1. 规范化：`modal_id`、`/video/`、`/note/`、`v.douyin.com` 短链 → 视频 ID
2. 隐藏 `BrowserWindow`（`persist:douyin`）加载精选页，CDP 拦截 `aweme` JSON 或读 `RENDER_DATA`，并导出 Netscape Cookie
3. 失败则弹出可见窗口让用户过验证
4. 下载优先用采集到的直链交给 yt-dlp（带 Referer + Cookie）；否则 canonical URL + Cookie

模块：`electron/engine/sites/douyin/`。不嵌入 Python。首期仅单视频，不含主页/合集/图集。
