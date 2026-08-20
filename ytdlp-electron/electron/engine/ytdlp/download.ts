/**
 * 执行单任务下载
 */

import fs from 'fs';
import path from 'path';
import type { ChildProcess } from 'child_process';
import { DEFAULT_FORMAT, TASK_MODE } from '~/electron/shared/constant';
import { requireFfmpeg, requireYtdlp } from '~/electron/engine/ytdlp/binaries';
import { assertHttpUrl, explainYtdlpError, YtdlpCancelled } from '~/electron/engine/ytdlp/errors';
import { parseProgressLine, type ProgressUpdate } from '~/electron/engine/ytdlp/progress';
import { runYtdlp } from '~/electron/engine/ytdlp/process';
import { logger } from '~/electron/utils/logger';

const SKIP_SUFFIXES = new Set(['.part', '.ytdl', '.temp', '.tmp']);
const MEDIA_SUFFIXES = new Set([
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4a',
  '.mp3',
  '.opus',
  '.ogg',
  '.flac',
  '.wav',
  '.aac',
]);

export interface DownloadJob {
  id: string;
  url: string;
  mode: string;
  title?: string | null;
  formatId?: string | null;
  audioFormat?: string | null;
  writeSubs?: boolean;
  writeAutoSubs?: boolean;
  subLangs?: string | null;
  proxy?: string | null;
  cookies?: string | null;
  outdir: string;
  extraHeaders?: Record<string, string>;
  /** 直链下载时不要再传 -f（CDN 没有 format 列表） */
  skipFormat?: boolean;
}

export interface DownloadOutputs {
  outputPath: string | null;
  filename: string | null;
  filesize: number | null;
  extraFiles: string[];
}

export interface DownloadHooks {
  onProgress: (update: ProgressUpdate) => void;
  shouldCancel: () => boolean;
  onSpawn?: (child: ChildProcess) => void;
}

export function collectOutputs(directory: string): DownloadOutputs {
  if (!fs.existsSync(directory)) {
    return { outputPath: null, filename: null, filesize: null, extraFiles: [] };
  }
  const files = fs
    .readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((full) => fs.statSync(full).isFile())
    .filter((full) => !SKIP_SUFFIXES.has(path.extname(full).toLowerCase()));

  if (files.length === 0) {
    return { outputPath: null, filename: null, filesize: null, extraFiles: [] };
  }

  const media = files.filter((full) => MEDIA_SUFFIXES.has(path.extname(full).toLowerCase()));
  const pool = media.length > 0 ? media : files;
  const primary = pool.reduce((best, cur) =>
    fs.statSync(cur).size > fs.statSync(best).size ? cur : best,
  );
  const extras = files.filter((full) => full !== primary).map((full) => path.basename(full));
  const stat = fs.statSync(primary);
  return {
    outputPath: primary,
    filename: path.basename(primary),
    filesize: stat.size,
    extraFiles: extras,
  };
}

function safeFileStem(title: string | null | undefined, fallback: string): string {
  const raw = (title || '').trim() || fallback;
  const cleaned = raw
    .replace(/[<>:"/\\|?*%\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

function buildArgs(job: DownloadJob): string[] {
  const outdir = job.outdir.replace(/\\/g, '/');
  const format = job.formatId || DEFAULT_FORMAT;
  // 直链 generic 提取器会把整段 CDN 查询串当 id，Windows 路径会超长
  const outTpl = job.skipFormat
    ? `${outdir}/${safeFileStem(job.title, job.id.slice(0, 8))}.%(ext)s`
    : `${outdir}/%(title).60B [%(id).40B].%(ext)s`;
  const args = [
    '--no-warnings',
    '--newline',
    '--progress',
    '--progress-template',
    'download:%(progress)j',
    '--windows-filenames',
    '--restrict-filenames',
    '--trim-filenames',
    '180',
    '--no-playlist',
    '--retries',
    '3',
    '--socket-timeout',
    '30',
    '--encoding',
    'utf-8',
    '-o',
    outTpl,
  ];
  if (!job.skipFormat) {
    args.push('-f', format);
  }

  args.push('--ffmpeg-location', requireFfmpeg());

  if (job.mode === TASK_MODE.AUDIO) {
    args.push('-x', '--audio-format', job.audioFormat || 'mp3', '--audio-quality', '192');
  } else {
    args.push('--merge-output-format', 'mp4');
  }

  if (job.writeSubs || job.writeAutoSubs) {
    const langs = (job.subLangs || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (job.writeSubs) args.push('--write-subs');
    if (job.writeAutoSubs) args.push('--write-auto-subs');
    args.push('--sub-langs', langs.length > 0 ? langs.join(',') : 'all');
    args.push('--sub-format', 'srt/best');
  }

  if (job.cookies) args.push('--cookies', job.cookies);
  if (job.proxy) args.push('--proxy', job.proxy);
  if (job.extraHeaders) {
    const referer = job.extraHeaders.Referer;
    const ua = job.extraHeaders['User-Agent'];
    if (referer) args.push('--referer', referer);
    if (ua) args.push('--user-agent', ua);
    for (const [name, value] of Object.entries(job.extraHeaders)) {
      if (!name || !value) continue;
      if (name === 'Referer' || name === 'User-Agent') continue;
      args.push('--add-header', `${name}: ${value}`);
    }
  }

  args.push(job.url);
  return args;
}

export async function downloadJob(job: DownloadJob, hooks: DownloadHooks): Promise<DownloadOutputs> {
  assertHttpUrl(job.url);
  const bin = requireYtdlp();
  const args = buildArgs(job);

  try {
    const result = await runYtdlp(bin, {
      args,
      onSpawn: hooks.onSpawn,
      shouldCancel: hooks.shouldCancel,
      onStdoutLine: (line) => {
        const update = parseProgressLine(line);
        if (update) hooks.onProgress(update);
      },
      onStderrLine: (line) => {
        const update = parseProgressLine(line);
        if (update) hooks.onProgress(update);
      },
    });
    if (hooks.shouldCancel()) {
      throw new YtdlpCancelled();
    }
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || `yt-dlp 退出码 ${result.code}`).trim();
      logger.warn(`[yt-dlp] 下载失败 code=${result.code} url=${job.url.slice(0, 160)} stderr=${detail.slice(0, 800)}`);
      throw new Error(detail);
    }
    return collectOutputs(job.outdir);
  } catch (err) {
    if (err instanceof YtdlpCancelled) throw err;
    throw new Error(explainYtdlpError(err));
  }
}
