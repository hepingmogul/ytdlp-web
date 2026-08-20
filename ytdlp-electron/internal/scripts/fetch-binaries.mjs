#!/usr/bin/env node
/**
 * 下载捆绑用的 yt-dlp / ffmpeg / ffprobe，写入 resources/bin/<platform-arch>/
 * 不依赖系统 PATH 中的命令。
 *
 * 用法:
 *   node internal/scripts/fetch-binaries.mjs              # 当前平台
 *   node internal/scripts/fetch-binaries.mjs --force      # 强制覆盖
 *   node internal/scripts/fetch-binaries.mjs --target win32-x64
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');
const binRoot = path.join(rootDir, 'resources', 'bin');

const YTDLP_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const FFMPEG_BASE = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest';
const FFMPEG_STATIC = 'https://github.com/eugeneware/ffmpeg-static/releases/latest/download';

/** @type {Record<string, { ytdlp: { url: string, name: string }, ffmpeg: { url: string, archive: 'zip' | 'tar.xz' | 'file', ffmpegName: string, ffprobeName: string, ffprobeUrl?: string } }>} */
const TARGETS = {
  'win32-x64': {
    ytdlp: { url: `${YTDLP_BASE}/yt-dlp.exe`, name: 'yt-dlp.exe' },
    ffmpeg: {
      url: `${FFMPEG_BASE}/ffmpeg-master-latest-win64-gpl.zip`,
      archive: 'zip',
      ffmpegName: 'ffmpeg.exe',
      ffprobeName: 'ffprobe.exe',
    },
  },
  'win32-arm64': {
    ytdlp: { url: `${YTDLP_BASE}/yt-dlp_arm64.exe`, name: 'yt-dlp.exe' },
    ffmpeg: {
      url: `${FFMPEG_BASE}/ffmpeg-master-latest-winarm64-gpl.zip`,
      archive: 'zip',
      ffmpegName: 'ffmpeg.exe',
      ffprobeName: 'ffprobe.exe',
    },
  },
  'linux-x64': {
    ytdlp: { url: `${YTDLP_BASE}/yt-dlp_linux`, name: 'yt-dlp' },
    ffmpeg: {
      url: `${FFMPEG_BASE}/ffmpeg-master-latest-linux64-gpl.tar.xz`,
      archive: 'tar.xz',
      ffmpegName: 'ffmpeg',
      ffprobeName: 'ffprobe',
    },
  },
  'linux-arm64': {
    ytdlp: { url: `${YTDLP_BASE}/yt-dlp_linux_aarch64`, name: 'yt-dlp' },
    ffmpeg: {
      url: `${FFMPEG_BASE}/ffmpeg-master-latest-linuxarm64-gpl.tar.xz`,
      archive: 'tar.xz',
      ffmpegName: 'ffmpeg',
      ffprobeName: 'ffprobe',
    },
  },
  'darwin-x64': {
    ytdlp: { url: `${YTDLP_BASE}/yt-dlp_macos`, name: 'yt-dlp' },
    ffmpeg: {
      url: `${FFMPEG_STATIC}/ffmpeg-darwin-x64`,
      archive: 'file',
      ffmpegName: 'ffmpeg',
      ffprobeName: 'ffprobe',
      ffprobeUrl: `${FFMPEG_STATIC}/ffprobe-darwin-x64`,
    },
  },
  'darwin-arm64': {
    ytdlp: { url: `${YTDLP_BASE}/yt-dlp_macos`, name: 'yt-dlp' },
    ffmpeg: {
      url: `${FFMPEG_STATIC}/ffmpeg-darwin-arm64`,
      archive: 'file',
      ffmpegName: 'ffmpeg',
      ffprobeName: 'ffprobe',
      ffprobeUrl: `${FFMPEG_STATIC}/ffprobe-darwin-arm64`,
    },
  },
};

export function currentBinKey() {
  return `${process.platform}-${process.arch}`;
}

export function packToBinKey(electronPlatform, arch) {
  const resolvedArch = arch || (electronPlatform === 'win' ? 'x64' : process.arch);
  if (electronPlatform === 'win') return `win32-${resolvedArch}`;
  if (electronPlatform === 'mac') return `darwin-${resolvedArch}`;
  return `linux-${resolvedArch}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { force: false, target: currentBinKey() };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--force') config.force = true;
    else if (args[i] === '--target') {
      config.target = args[i + 1];
      i += 1;
    }
  }
  return config;
}

async function downloadFile(url, dest) {
  console.log(`[bin] 下载 ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`下载失败 ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

function chmodExec(file) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(file, 0o755);
  } catch {
    // 忽略
  }
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function extractArchive(archivePath, type, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (type === 'zip') {
    execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'inherit' });
    return;
  }
  if (type === 'tar.xz') {
    execFileSync('tar', ['-xJf', archivePath, '-C', destDir], { stdio: 'inherit' });
  }
}

function pickBinary(extractedDir, baseName) {
  const files = walkFiles(extractedDir);
  const match = files.find((file) => path.basename(file).toLowerCase() === baseName.toLowerCase());
  return match || null;
}

export function binDirFor(target) {
  return path.join(binRoot, target);
}

export function hasBundledBinaries(target) {
  const spec = TARGETS[target];
  if (!spec) return false;
  const dir = binDirFor(target);
  const ytdlp = path.join(dir, spec.ytdlp.name);
  const ffmpeg = path.join(dir, spec.ffmpeg.ffmpegName);
  return fs.existsSync(ytdlp) && fs.existsSync(ffmpeg);
}

export async function ensureBinaries(target = currentBinKey(), force = false) {
  const spec = TARGETS[target];
  if (!spec) {
    throw new Error(`不支持的目标平台: ${target}。可选: ${Object.keys(TARGETS).join(', ')}`);
  }
  const destDir = binDirFor(target);
  fs.mkdirSync(destDir, { recursive: true });
  const ytdlpDest = path.join(destDir, spec.ytdlp.name);
  const ffmpegDest = path.join(destDir, spec.ffmpeg.ffmpegName);
  const ffprobeDest = path.join(destDir, spec.ffmpeg.ffprobeName);

  if (!force && fs.existsSync(ytdlpDest) && fs.existsSync(ffmpegDest)) {
    console.log(`[bin] 已存在 ${target} 捆绑二进制，跳过（需要更新请加 --force）`);
    return destDir;
  }

  await downloadFile(spec.ytdlp.url, ytdlpDest);
  chmodExec(ytdlpDest);

  if (spec.ffmpeg.archive === 'file') {
    await downloadFile(spec.ffmpeg.url, ffmpegDest);
    chmodExec(ffmpegDest);
    if (spec.ffmpeg.ffprobeUrl) {
      await downloadFile(spec.ffmpeg.ffprobeUrl, ffprobeDest);
      chmodExec(ffprobeDest);
    }
  } else {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'luodai-bin-'));
    const archiveName = spec.ffmpeg.archive === 'zip' ? 'ffmpeg.zip' : 'ffmpeg.tar.xz';
    const archivePath = path.join(tmpRoot, archiveName);
    try {
      await downloadFile(spec.ffmpeg.url, archivePath);
      const extracted = path.join(tmpRoot, 'extracted');
      extractArchive(archivePath, spec.ffmpeg.archive, extracted);
      const ffmpegSrc = pickBinary(extracted, spec.ffmpeg.ffmpegName);
      const ffprobeSrc = pickBinary(extracted, spec.ffmpeg.ffprobeName);
      if (!ffmpegSrc) throw new Error(`压缩包中未找到 ${spec.ffmpeg.ffmpegName}`);
      fs.copyFileSync(ffmpegSrc, ffmpegDest);
      chmodExec(ffmpegDest);
      if (ffprobeSrc) {
        fs.copyFileSync(ffprobeSrc, ffprobeDest);
        chmodExec(ffprobeDest);
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  console.log(`[bin] 已写入 ${destDir}`);
  return destDir;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const config = parseArgs();
  ensureBinaries(config.target, config.force).catch((err) => {
    console.error(`[bin] ${err.message}`);
    process.exit(1);
  });
}
