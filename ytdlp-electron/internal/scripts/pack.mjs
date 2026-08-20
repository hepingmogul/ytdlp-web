#!/usr/bin/env node
/**
 * Electron 内部打包脚本
 * 支持构建 Windows (NSIS/portable) 和 Mac (DMG/zip) 安装包
 *
 * 用法:
 *   node internal/scripts/pack.mjs              # 当前平台
 *   node internal/scripts/pack.mjs --win        # Windows
 *   node internal/scripts/pack.mjs --mac        # macOS
 *   node internal/scripts/pack.mjs --linux      # Linux
 *   node internal/scripts/pack.mjs --win --x64  # 指定架构
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { copyShared } from './copy-shared.mjs';
import { ensureBinaries, hasBundledBinaries, packToBinKey } from './fetch-binaries.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    platform: null,
    arch: null,
    skipBuild: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--win':
      case '-w':
        config.platform = 'win';
        break;
      case '--mac':
      case '-m':
        config.platform = 'mac';
        break;
      case '--linux':
      case '-l':
        config.platform = 'linux';
        break;
      case '--x64':
        config.arch = 'x64';
        break;
      case '--arm64':
        config.arch = 'arm64';
        break;
      case '--skip-build':
        config.skipBuild = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  if (!config.platform) {
    const currentPlatform = process.platform;
    if (currentPlatform === 'win32') config.platform = 'win';
    else if (currentPlatform === 'darwin') config.platform = 'mac';
    else config.platform = 'linux';
  }

  return config;
}

function printHelp() {
  console.log(`
Electron 打包脚本

用法:
  node internal/scripts/pack.mjs [选项]

选项:
  --win, -w         构建 Windows 安装包
  --mac, -m         构建 macOS 安装包
  --linux, -l       构建 Linux 安装包
  --x64             指定 x64 架构
  --arm64           指定 arm64 架构
  --skip-build      跳过前端和主进程构建，直接打包
  --help, -h        显示帮助信息

示例:
  node internal/scripts/pack.mjs              # 当前平台打包
  node internal/scripts/pack.mjs --win       # Windows 打包
  node internal/scripts/pack.mjs --mac       # macOS 打包
  node internal/scripts/pack.mjs --win --x64 # Windows x64 打包
  `);
}

function runCommand(command, label) {
  console.log(`\n[${label}] Running: ${command}`);
  try {
    execSync(command, {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (error) {
    console.error(`[${label}] Failed: ${error.message}`);
    process.exit(1);
  }
}

function checkBuildArtifacts() {
  const distDir = path.resolve(rootDir, 'dist');
  const mainFile = path.resolve(distDir, 'electron/main/index.js');
  const preloadFile = path.resolve(distDir, 'electron/preload/index.js');
  const frontendFile = path.resolve(distDir, 'frontend/index.html');

  const missing = [];
  if (!fs.existsSync(mainFile)) missing.push('electron/main/index.js');
  if (!fs.existsSync(preloadFile)) missing.push('electron/preload/index.js');
  if (!fs.existsSync(frontendFile)) missing.push('frontend/index.html');

  if (missing.length > 0) {
    console.error(`[Pack] Missing build artifacts: ${missing.join(', ')}`);
    console.error('[Pack] Run "npm run build" first or remove --skip-build flag.');
    process.exit(1);
  }
}

function getElectronBuilderArgs(config) {
  const platformMap = {
    win: '--win',
    mac: '--mac',
    linux: '--linux',
  };

  let command = 'npx electron-builder';

  command += ` ${platformMap[config.platform]}`;

  if (config.arch) {
    command += ` --${config.arch}`;
  }

  command += ' --config electron-builder.yml';

  return command;
}

async function pack() {
  const config = parseArgs();

  copyShared();

  console.log(`\n========================================`);
  console.log(`  Electron Vite Desktop App - Packaging`);
  console.log(`  Platform: ${config.platform}${config.arch ? ` (${config.arch})` : ''}`);
  console.log(`========================================\n`);

  if (!config.skipBuild) {
    console.log('[Pack] Step 1: Building frontend...');
    runCommand('npx vite build --config frontend/vite.config.mjs', 'Build:Frontend');

    console.log('[Pack] Step 2: Building Electron main process...');
    runCommand('node internal/scripts/build.mjs', 'Build:Electron');
  } else {
    console.log('[Pack] Skipping build (--skip-build flag provided)');
    checkBuildArtifacts();
  }

  const binKey = packToBinKey(config.platform, config.arch);
  console.log(`[Pack] Step 3: 检查捆绑二进制 (${binKey})...`);
  if (!hasBundledBinaries(binKey)) {
    console.log('[Pack] 未找到捆绑的 yt-dlp/ffmpeg，开始下载...');
    await ensureBinaries(binKey, false);
  }

  console.log(`[Pack] Step 4: Packaging for ${config.platform}...`);
  const command = getElectronBuilderArgs(config);
  runCommand(command, 'Pack');

  console.log('\n========================================');
  console.log('  Packaging complete!');
  console.log(`  Output directory: ${path.resolve(rootDir, 'release')}`);
  console.log('========================================\n');
}

pack();
