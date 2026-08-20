/**
 * 定位 yt-dlp / ffmpeg 可执行文件
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getBundledBinDir } from '~/electron/utils';
import type { BinaryCheckResult, BinaryInfo } from '~/electron/shared/types';

const YTDLP_NAMES = process.platform === 'win32' ? ['yt-dlp.exe', 'yt-dlp'] : ['yt-dlp'];
const FFMPEG_NAMES = process.platform === 'win32' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg'];

function findOnPath(command: string): string | null {
  try {
    const bin = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(bin, [command], { encoding: 'utf8', timeout: 8000 });
    const first = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return first || null;
  } catch {
    return null;
  }
}

function bundledDirs(): string[] {
  const platformDir = `${process.platform}-${process.arch}`;
  const bundled = getBundledBinDir();
  const dirs = [bundled, path.join(bundled, platformDir)];
  if (process.env.NODE_ENV !== 'development') {
    dirs.push(path.join(process.resourcesPath, 'bin', platformDir));
  } else {
    dirs.push(path.join(process.cwd(), 'resources', 'bin'));
  }
  return [...new Set(dirs)];
}

function findNamed(names: string[]): string | null {
  for (const dir of bundledDirs()) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  for (const name of names) {
    const fromPath = findOnPath(name);
    if (fromPath && fs.existsSync(fromPath)) {
      return fromPath;
    }
  }
  return null;
}

function readVersion(binPath: string | null, args: string[]): string | null {
  if (!binPath) return null;
  try {
    const out = execFileSync(binPath, args, {
      encoding: 'utf8',
      timeout: 12000,
      windowsHide: true,
    });
    const line = out.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
    return line || null;
  } catch {
    return null;
  }
}

export function locateYtdlp(): string | null {
  return findNamed(YTDLP_NAMES);
}

export function locateFfmpeg(): string | null {
  return findNamed(FFMPEG_NAMES);
}

export function requireYtdlp(): string {
  const bin = locateYtdlp();
  if (!bin) {
    throw new Error('未找到 yt-dlp。请安装并加入 PATH，或将二进制放到 resources/bin/<platform-arch>/');
  }
  return bin;
}

export function checkBinaries(): BinaryCheckResult {
  const ytdlpPath = locateYtdlp();
  const ffmpegPath = locateFfmpeg();
  const ytdlp: BinaryInfo = {
    path: ytdlpPath,
    version: readVersion(ytdlpPath, ['--version']),
  };
  const ffmpeg: BinaryInfo = {
    path: ffmpegPath,
    version: readVersion(ffmpegPath, ['-version']),
  };
  return { ytdlp, ffmpeg };
}
