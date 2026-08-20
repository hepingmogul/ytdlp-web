/**
 * 解析链接元数据（yt-dlp -J）
 */

import { FORMAT_PRESETS } from '~/electron/shared/constant';
import type { FormatItem, FormatPreset, ParseResult, PlaylistEntry } from '~/electron/shared/types';
import { requireYtdlp, locateFfmpeg } from '~/electron/engine/ytdlp/binaries';
import { assertHttpUrl, explainYtdlpError } from '~/electron/engine/ytdlp/errors';
import { runYtdlp } from '~/electron/engine/ytdlp/process';
import { logger } from '~/electron/utils/logger';

const PRESETS: FormatPreset[] = FORMAT_PRESETS.map((item) => ({ id: item.id, label: item.label }));

function slimFormat(raw: Record<string, unknown>): FormatItem | null {
  const formatId = raw.format_id;
  if (!formatId) return null;
  const protocol = String(raw.protocol || '').toLowerCase();
  if (protocol === 'mhtml' || String(formatId).startsWith('sb')) return null;
  const vcodec = raw.vcodec as string | undefined;
  const acodec = raw.acodec as string | undefined;
  const hasVideo = Boolean(vcodec && vcodec !== 'none');
  const hasAudio = Boolean(acodec && acodec !== 'none');
  if (!hasVideo && !hasAudio) return null;
  const height = raw.height as number | undefined;
  const width = raw.width as number | undefined;
  let resolution = (raw.resolution as string | undefined) || null;
  if (!resolution && width && height) {
    resolution = `${width}x${height}`;
  }
  return {
    formatId: String(formatId),
    ext: (raw.ext as string) || null,
    resolution,
    fps: typeof raw.fps === 'number' ? raw.fps : null,
    vcodec: vcodec === 'none' ? null : vcodec || null,
    acodec: acodec === 'none' ? null : acodec || null,
    filesize: (raw.filesize as number) || (raw.filesize_approx as number) || null,
    tbr: typeof raw.tbr === 'number' ? raw.tbr : null,
    note: (raw.format_note as string) || (raw.format as string) || null,
    hasVideo,
    hasAudio,
  };
}

function thumbnail(info: Record<string, unknown>): string | null {
  if (info.thumbnail) return String(info.thumbnail);
  const thumbs = info.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const last = thumbs[thumbs.length - 1] as Record<string, unknown>;
    if (last && last.url) return String(last.url);
  }
  return null;
}

function entryUrl(entry: Record<string, unknown>, extractor: string | null): string | null {
  for (const key of ['webpage_url', 'url', 'original_url']) {
    const value = entry[key];
    if (typeof value === 'string' && value.startsWith('http')) return value;
  }
  const videoId = entry.id;
  if (extractor && extractor.toLowerCase().includes('youtube') && videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return null;
}

function extractJsonObject(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('未能解析该链接');
  }
  return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
}

export function infoToParse(info: Record<string, unknown>): ParseResult {
  const kind = (info._type as string) || 'video';
  const extractor = (info.extractor as string) || null;
  if (kind === 'playlist' || info.entries) {
    const entries: PlaylistEntry[] = [];
    const rawEntries = Array.isArray(info.entries) ? info.entries : [];
    for (const raw of rawEntries) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const url = entryUrl(row, extractor);
      if (!url) continue;
      entries.push({
        id: row.id ? String(row.id) : null,
        title: (row.title as string) || null,
        url,
        duration: typeof row.duration === 'number' ? row.duration : null,
        thumbnail: thumbnail(row),
      });
    }
    return {
      type: 'playlist',
      id: info.id ? String(info.id) : null,
      title: (info.title as string) || null,
      extractor,
      thumbnail: thumbnail(info),
      uploader: (info.uploader as string) || (info.channel as string) || null,
      webpageUrl: (info.webpage_url as string) || null,
      formats: [],
      presets: PRESETS,
      entries,
    };
  }

  const formats: FormatItem[] = [];
  const rawFormats = Array.isArray(info.formats) ? info.formats : [];
  for (const raw of rawFormats) {
    if (!raw || typeof raw !== 'object') continue;
    const item = slimFormat(raw as Record<string, unknown>);
    if (item) formats.push(item);
  }

  return {
    type: 'video',
    id: info.id ? String(info.id) : null,
    title: (info.title as string) || null,
    extractor,
    thumbnail: thumbnail(info),
    duration: typeof info.duration === 'number' ? info.duration : null,
    uploader: (info.uploader as string) || (info.channel as string) || null,
    webpageUrl: (info.webpage_url as string) || null,
    formats,
    presets: PRESETS,
    entries: [],
  };
}

export async function extractInfoYtdlp(url: string, extra?: { cookies?: string | null; proxy?: string | null }): Promise<ParseResult> {
  assertHttpUrl(url);
  const started = Date.now();
  const bin = requireYtdlp();
  logger.info(`[yt-dlp] 开始解析 url=${url} cookies=${extra?.cookies || '(无)'} bin=${bin}`);
  const args = [
    '-J',
    '--flat-playlist',
    '--no-warnings',
    '--socket-timeout',
    '30',
    '--encoding',
    'utf-8',
  ];
  const ffmpeg = locateFfmpeg();
  if (ffmpeg) {
    args.push('--ffmpeg-location', ffmpeg);
  }
  if (extra?.cookies) {
    args.push('--cookies', extra.cookies);
  }
  if (extra?.proxy) {
    args.push('--proxy', extra.proxy);
  }
  args.push(url);

  try {
    const result = await runYtdlp(bin, { args });
    logger.info(
      `[yt-dlp] 结束 code=${result.code} stdout=${result.stdout.length}B stderr=${result.stderr.length}B 耗时=${Date.now() - started}ms`,
    );
    if (result.code !== 0) {
      const errText = (result.stderr || result.stdout || `yt-dlp 退出码 ${result.code}`).slice(0, 500);
      logger.warn(`[yt-dlp] 非零退出: ${errText}`);
      throw new Error(result.stderr || result.stdout || `yt-dlp 退出码 ${result.code}`);
    }
    const info = extractJsonObject(result.stdout);
    return infoToParse(info);
  } catch (err) {
    logger.warn(`[yt-dlp] 异常 耗时=${Date.now() - started}ms: ${err instanceof Error ? err.message : String(err)}`);
    throw new Error(explainYtdlpError(err));
  }
}
