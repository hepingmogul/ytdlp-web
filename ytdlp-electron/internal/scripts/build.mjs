#!/usr/bin/env node
/**
 * 内部 esbuild 生产构建脚本
 * 编译 Electron 主进程到 dist/，保持原有目录结构
 */

import * as esbuild from 'esbuild';
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

async function build() {
  copyShared();
  console.log('[Build] Starting Electron main process build...');

  const entryPoints = collectTsFiles(path.resolve(rootDir, 'electron'));

  try {
    await esbuild.build({
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
      minify: false,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      tsconfig: path.resolve(rootDir, 'tsconfig.json'),
      plugins: [aliasPlugin],
    });

    // 创建 package.json 标记 dist 目录为 CommonJS
    fs.writeFileSync(
      path.resolve(rootDir, 'dist/package.json'),
      JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
    );

    console.log('[Build] Electron main process build complete!');
    console.log('[Build] Output: dist/');
  } catch (error) {
    console.error('[Build] Build failed:', error);
    process.exit(1);
  }
}

build();
