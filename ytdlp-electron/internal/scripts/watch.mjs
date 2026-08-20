#!/usr/bin/env node
/**
 * esbuild watch 模式 + Electron 自动重启
 * 开发环境下监视主进程代码变更并自动重新编译和重启 Electron
 */

import * as esbuild from 'esbuild';
import { spawn, execFileSync, execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { config } from 'dotenv';
import { copyShared } from './copy-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

// 加载 Electron 运行时环境（由 env:init 从 manifests 写入）
config({
  path: [
    path.resolve(rootDir, 'electron/.env'),
    path.resolve(rootDir, 'electron/.env.local'),
  ],
});

// Windows 下切换控制台代码页为 UTF-8，避免子进程中文乱码
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    // 忽略失败，不影响主流程
  }
}

/**
 * 收集指定目录下所有 .ts 文件（排除 .d.ts）
 */
function collectTsFiles(dir) {
  const files = [];
  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files;
}

/**
 * 路径别名 esbuild plugin
 * 在 bundle: false 模式下通过 onLoad 替换 import 路径
 */
const aliasPlugin = {
  name: 'alias',
  setup(build) {
    const aliasMap = {
      '~/': '',
    };

    build.onLoad({ filter: /\.ts$/ }, (args) => {
      const source = fs.readFileSync(args.path, 'utf8');
      const relativeImporter = path.relative(rootDir, args.path);
      const importerDir = path.dirname(relativeImporter);

      let modified = source;
      const importRegex = /(from\s+['"])(~\/[^'"]+)(['"])/g;

      modified = modified.replace(importRegex, (match, prefix, importPath, suffix) => {
        for (const [aliasPrefix, targetDir] of Object.entries(aliasMap)) {
          if (importPath.startsWith(aliasPrefix)) {
            const relativePath = importPath.slice(aliasPrefix.length);
            let targetFile = path.join(targetDir, relativePath);

            // 处理无扩展名的目录导入（如 ~/electron/utils → electron/utils/index.ts）
            if (!path.extname(targetFile)) {
              const tsPath = targetFile + '.ts';
              if (fs.existsSync(path.resolve(rootDir, tsPath))) {
                targetFile = tsPath;
              } else {
                const indexPath = path.join(targetFile, 'index.ts');
                if (fs.existsSync(path.resolve(rootDir, indexPath))) {
                  targetFile = indexPath;
                }
              }
            }

            // 将 .ts 扩展名改为 .js（输出文件为 .js）
            if (targetFile.endsWith('.ts')) {
              targetFile = targetFile.slice(0, -3) + '.js';
            }

            // 计算从当前文件到目标文件的相对路径
            let relativeToTarget = path.relative(importerDir, targetFile);
            relativeToTarget = relativeToTarget.replace(/\\/g, '/');

            // 确保以 ./ 开头
            if (!relativeToTarget.startsWith('.')) {
              relativeToTarget = './' + relativeToTarget;
            }

            return prefix + relativeToTarget + suffix;
          }
        }
        return match;
      });

      return { contents: modified, loader: 'ts' };
    });
  },
};

const entryPoints = collectTsFiles(path.resolve(rootDir, 'electron'));

let electronProcess = null;
let electronProcessId = 0; // 进程实例 ID，防止旧进程 close 回调误清新进程引用
let isFirstBuild = true;
let viteServerReady = false;
let rebuildTimer = null;
let isRebuilding = false;
let rebuildPluginTrigger = false; // 标记 onEnd 是否由全量 rebuild 触发
const pendingChanges = new Set(); // 收集变化的文件路径
const fileHashes = new Map(); // 绝对路径 → 内容哈希，用于过滤无内容变化的 FS 事件
const DEBOUNCE_DELAY = 3000; // 节流延迟 3 秒

/**
 * 规范化监视路径，避免 Windows 斜杠/大小写导致哈希缓存 miss
 */
function normalizeWatchPath(filePath) {
  return path.resolve(filePath);
}

/**
 * 计算文件内容哈希。Windows 上打开/关闭文件也会触发 fs.watch（属性、atime），
 * 必须以内容为准，mtime/size 不够可靠。
 */
function hashFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(buf).digest('hex');
  } catch {
    return null;
  }
}

/**
 * 预填已有 .ts 文件的内容哈希，避免首次打开文件被当成“新增”
 */
function seedFileHashes(dir) {
  for (const file of collectTsFiles(dir)) {
    const key = normalizeWatchPath(file);
    const hash = hashFile(key);
    if (hash) fileHashes.set(key, hash);
  }
}

function isSharedFile(filePath) {
  const rel = path.relative(rootDir, filePath);
  return rel.startsWith('shared') || rel.startsWith('shared\\');
}

/**
 * 从候选路径中筛出真正内容变化的文件，并更新哈希缓存。
 * 删除/无法读取的文件不进入增量编译列表。
 */
function takeChangedFiles(candidates) {
  const changed = [];
  for (const file of candidates) {
    const key = normalizeWatchPath(file);
    let stat;
    try {
      if (!fs.existsSync(key)) {
        fileHashes.delete(key);
        continue;
      }
      stat = fs.statSync(key);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const next = hashFile(key);
    if (next === null) continue;
    const prev = fileHashes.get(key);
    if (next === prev) continue;
    fileHashes.set(key, next);
    changed.push(key);
  }
  return changed;
}

/**
 * esbuild rebuild 回调插件（仅在全量 rebuild 时触发后续逻辑）
 */
const rebuildPlugin = {
  name: 'rebuild',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.error('[Watch] Build failed:', result.errors);
        rebuildPluginTrigger = false;
        return;
      }
      // 只有由全量 rebuild 触发时才处理，单文件增量编译不走这里
      if (rebuildPluginTrigger) {
        rebuildPluginTrigger = false;
        handleWatchBuildComplete();
      }
    });
  },
};

/**
 * 杀死进程及其整个子进程树
 */
function killProcessTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  const pid = proc.pid;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // 进程可能已经退出，忽略
    }
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  }
}

/**
 * 启动或重启 Electron 进程
 */
function startElectron() {
  const myId = ++electronProcessId; // 记录当前 spawn 的实例 ID

  if (electronProcess) {
    console.log('[Watch] Restarting Electron...');
    killProcessTree(electronProcess);
    electronProcess = null;
  }

  console.log('[Watch] Starting Electron...');
  electronProcess = spawn(
    path.resolve(rootDir, 'node_modules/.bin/electron.cmd'),
    [path.resolve(rootDir, 'dist/electron/main/index.js')],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    }
  );

  if (process.platform !== 'win32' && electronProcess.unref) {
    electronProcess.unref();
  }

  electronProcess.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.log(`[Watch] Electron exited with code ${code}`);
    }
    if (myId === electronProcessId) {
      electronProcess = null;
    }
  });
}

/**
 * 构建完成后的统一处理：首次构建等待 Vite，后续构建重启 Electron
 */
function handleWatchBuildComplete() {
  if (isFirstBuild) {
    isFirstBuild = false;
    console.log('[Watch] Initial build complete. Waiting for Vite dev server...');

    const frontendUrl = process.env.ELECTRON_FRONTEND_URL || 'http://localhost:5173';
    const waitOn = spawn(
      path.resolve(rootDir, 'node_modules/.bin/wait-on.cmd'),
      [frontendUrl, '--timeout', '30000'],
      { stdio: 'inherit', shell: process.platform === 'win32' }
    );

    waitOn.on('close', (code) => {
      if (code === 0) {
        console.log('[Watch] Vite dev server is ready. Starting Electron...');
        viteServerReady = true;
        startElectron();
      } else {
        console.error('[Watch] Timeout waiting for Vite dev server.');
        process.exit(1);
      }
    });
  } else if (viteServerReady) {
    startElectron();
  }
}

/**
 * 增量编译单个 TypeScript 文件
 */
async function compileSingleFile(entryFile) {
  const rel = path.relative(rootDir, entryFile);
  await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: [rel],
    bundle: false,
    platform: 'node',
    target: 'node22',
    outdir: 'dist',
    outbase: '.',
    entryNames: '[dir]/[name]',
    format: 'cjs',
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"development"',
    },
    tsconfig: path.resolve(rootDir, 'tsconfig.json'),
    plugins: [aliasPlugin],
  });
}

/**
 * 节流 + 增量构建
 */
function debouncedRebuild(ctx) {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }

  rebuildTimer = setTimeout(async () => {
    rebuildTimer = null;
    if (isRebuilding) return;
    isRebuilding = true;

    try {
      const candidates = [...pendingChanges];
      pendingChanges.clear();
      const changedFiles = takeChangedFiles(candidates);

      if (changedFiles.length === 0) {
        // 打开/关闭、属性变更等：内容没变则不编译、不重启 Electron
        console.log('[Watch] 忽略：文件内容未变化');
        return;
      }

      const sharedChanged = changedFiles.filter((file) => isSharedFile(file));
      const electronChanged = changedFiles.filter((file) => !isSharedFile(file));

      if (sharedChanged.length > 0) {
        console.log(`[Watch] shared/ 内容变化 (${sharedChanged.length} file(s))，同步拷贝...`);
        copyShared();
      }

      if (electronChanged.length > 0) {
        console.log(`[Watch] Incremental build (${electronChanged.length} file(s))...`);
        for (const file of electronChanged) {
          const rel = path.relative(rootDir, file);
          console.log(`[Watch]   Compiling: ${rel}`);
          try {
            await compileSingleFile(file);
          } catch (err) {
            console.error(`[Watch]   Failed: ${rel}`, err.message);
          }
        }
        console.log('[Watch] Incremental build complete.');
        handleWatchBuildComplete();
      }
    } catch (err) {
      console.error('[Watch] Rebuild error:', err);
    } finally {
      isRebuilding = false;
    }
  }, DEBOUNCE_DELAY);
}

/**
 * 递归监听目录下 .ts 文件变化
 */
function watchFiles(dir, onChange) {
  const watchers = [];

  function watchDirRecursive(targetDir) {
    const watcher = fs.watch(targetDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(targetDir, filename);
      if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
        onChange(fullPath);
      }
    });
    watcher.on('error', (err) => {
      console.error(`[Watch] Watcher error for ${targetDir}:`, err);
    });
    watchers.push(watcher);
  }

  watchDirRecursive(dir);

  return {
    close() {
      watchers.forEach((w) => w.close());
    },
  };
}

async function watch() {
  copyShared();
  console.log('[Watch] Starting esbuild watch mode for Electron main process...');

  const ctx = await esbuild.context({
    absWorkingDir: rootDir,
    entryPoints: entryPoints.map((p) => path.relative(rootDir, p)),
    bundle: false,
    platform: 'node',
    target: 'node22',
    outdir: 'dist',
    outbase: '.',
    entryNames: '[dir]/[name]',
    format: 'cjs',
    sourcemap: true,
    define: {
      'process.env.NODE_ENV': '"development"',
    },
    tsconfig: path.resolve(rootDir, 'tsconfig.json'),
    plugins: [aliasPlugin, rebuildPlugin],
  });

  rebuildPluginTrigger = true;
  await ctx.rebuild();

  fs.writeFileSync(
    path.resolve(rootDir, 'dist/package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
  );

  const electronDir = path.resolve(rootDir, 'electron');
  const sharedDir = path.resolve(rootDir, 'shared');

  seedFileHashes(electronDir);
  seedFileHashes(sharedDir);

  const onFileChange = (file) => {
    const key = normalizeWatchPath(file);
    const next = hashFile(key);
    // 打开/关闭、atime/属性变更：内容与缓存一致则立刻忽略，不进入节流、不编译
    if (next !== null && next === fileHashes.get(key)) {
      return;
    }
    pendingChanges.add(key);
    debouncedRebuild(ctx);
  };

  const electronWatcher = watchFiles(electronDir, onFileChange);
  const sharedWatcher = watchFiles(sharedDir, onFileChange);

  console.log('[Watch] Watching for changes in electron/ and shared/ (3s debounce)...');

  process.on('exit', () => {
    electronWatcher.close();
    sharedWatcher.close();
    ctx.dispose();
    if (electronProcess) {
      killProcessTree(electronProcess);
    }
  });

  process.on('SIGINT', () => {
    console.log('\n[Watch] Shutting down...');
    electronWatcher.close();
    sharedWatcher.close();
    ctx.dispose();
    if (electronProcess) {
      killProcessTree(electronProcess);
    }
    process.exit(0);
  });
}

watch().catch((err) => {
  console.error('[Watch] Fatal error:', err);
  process.exit(1);
});
