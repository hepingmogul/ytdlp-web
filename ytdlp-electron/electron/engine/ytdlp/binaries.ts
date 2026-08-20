/**
 * 定位捆绑的 yt-dlp / ffmpeg（不使用系统 PATH）
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getBundledBinDir } from '~/electron/utils';
import type { BinaryCheckResult, BinaryInfo } from '~/electron/shared/types';

const YTDLP_NAMES = process.platform === 'win32' ? ['yt-dlp.exe', 'yt-dlp'] : ['yt-dlp'];
const FFMPEG_NAMES = process.platform === 'win32' ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg'];

const MISSING_HINT = '未找到捆绑二进制。请在项目根目录运行 npm run bin:fetch';

function findNamed(names: string[]): string | null {
  const dir = getBundledBinDir();
  for (const name of names) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
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
    throw new Error(`未找到捆绑的 yt-dlp。${MISSING_HINT}`);
  }
  return bin;
}

export function requireFfmpeg(): string {
  const bin = locateFfmpeg();
  if (!bin) {
    throw new Error(`未找到捆绑的 ffmpeg。${MISSING_HINT}`);
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
