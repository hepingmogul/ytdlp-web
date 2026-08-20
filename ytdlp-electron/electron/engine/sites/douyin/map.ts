/**
 * 把抖音 aweme JSON 收成 ParseResult / 直链格式
 */

import { FORMAT_PRESETS } from '~/electron/shared/constant';
import type { FormatItem, FormatPreset, ParseResult } from '~/electron/shared/types';
import { canonicalDouyinVideoUrl } from '~/electron/engine/sites/douyin/url';

const PRESETS: FormatPreset[] = FORMAT_PRESETS.map((item) => ({ id: item.id, label: item.label }));

export interface DouyinPlayUrl {
  formatId: string;
  url: string;
  height: number | null;
  width: number | null;
  filesize: number | null;
  note: string | null;
}

export interface DouyinMapped {
  parse: ParseResult;
  plays: DouyinPlayUrl[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function isRestrictedCdn(url: string): boolean {
  return /web-prime|playwm/i.test(url);
}

function firstUrl(addr: unknown): string | null {
  const rec = asRecord(addr);
  if (!rec) return null;
  const list = rec.url_list;
  if (Array.isArray(list)) {
    const http = list.filter((item): item is string => typeof item === 'string' && item.startsWith('http'));
    const open = http.find((item) => !isRestrictedCdn(item));
    return open || http[0] || null;
  }
  if (typeof rec.uri === 'string' && rec.uri.startsWith('http')) return rec.uri;
  return null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function walkFind(
  node: unknown,
  pred: (rec: Record<string, unknown>) => boolean,
  depth = 0,
  seen: Set<object> = new Set(),
): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 14) return null;
  if (seen.has(node)) return null;
  seen.add(node);
  const rec = node as Record<string, unknown>;
  if (!Array.isArray(node) && pred(rec)) return rec;
  const values = Array.isArray(node) ? node : Object.values(rec);
  for (const value of values) {
    const hit = walkFind(value, pred, depth + 1, seen);
    if (hit) return hit;
  }
  return null;
}

export function findAwemeDetail(root: unknown, videoId?: string): Record<string, unknown> | null {
  const matchId = (rec: Record<string, unknown>) => {
    const id = rec.aweme_id != null ? String(rec.aweme_id) : rec.group_id != null ? String(rec.group_id) : '';
    if (videoId && id && id !== videoId) return false;
    return Boolean(rec.video || rec.aweme_id);
  };

  const direct = asRecord(root);
  if (direct) {
    const nested = asRecord(direct.aweme_detail);
    if (nested && matchId(nested)) return nested;
    if (matchId(direct) && direct.video) return direct;
    if (Array.isArray(direct.aweme_list)) {
      for (const row of direct.aweme_list) {
        const rec = asRecord(row);
        if (rec && matchId(rec)) return rec;
      }
    }
    if (Array.isArray(direct.item_list)) {
      for (const row of direct.item_list) {
        const rec = asRecord(row);
        if (rec && matchId(rec)) return rec;
      }
    }
  }

  return walkFind(root, (rec) => Boolean(rec.aweme_id && rec.video) && matchId(rec));
}

function collectPlays(video: Record<string, unknown>): DouyinPlayUrl[] {
  const plays: DouyinPlayUrl[] = [];
  const seen = new Set<string>();

  const push = (addr: unknown, formatId: string, note: string | null) => {
    const rec = asRecord(addr);
    const url = firstUrl(addr);
    if (!rec || !url || seen.has(url)) return;
    seen.add(url);
    plays.push({
      formatId,
      url,
      height: num(rec.height),
      width: num(rec.width),
      filesize: num(rec.data_size),
      note,
    });
  };

  const bitRate = video.bit_rate;
  if (Array.isArray(bitRate)) {
    bitRate.forEach((item, index) => {
      const rec = asRecord(item);
      if (!rec) return;
      const gear = rec.gear_name != null ? String(rec.gear_name) : `br${index}`;
      const height = num(rec.height) || num(asRecord(rec.play_addr)?.height);
      const note = height ? `${height}p` : gear;
      push(rec.play_addr, `dy:${gear}`, note);
    });
  }

  push(video.play_addr, 'dy:play', '默认');
  push(video.play_addr_h264, 'dy:h264', 'h264');
  push(video.download_addr, 'dy:download', '下载地址');

  return dedupePlays(plays);
}

function playResolutionKey(play: DouyinPlayUrl): string | null {
  if (play.height) return `${play.height}p`;
  if (play.width && play.height) return `${play.width}x${play.height}`;
  return null;
}

/** 仅按分辨率去重（优先更大体积） */
function dedupePlays(plays: DouyinPlayUrl[]): DouyinPlayUrl[] {
  const best = new Map<string, DouyinPlayUrl>();
  const order: string[] = [];
  const noRes: DouyinPlayUrl[] = [];
  for (const play of plays) {
    const key = playResolutionKey(play);
    if (!key) {
      noRes.push(play);
      continue;
    }
    const prev = best.get(key);
    if (!prev) {
      best.set(key, play);
      order.push(key);
      continue;
    }
    if ((play.filesize || 0) > (prev.filesize || 0)) best.set(key, play);
  }
  return [...order.map((key) => best.get(key)!), ...noRes];
}

function thumbnailFrom(detail: Record<string, unknown>, video: Record<string, unknown>): string | null {
  for (const candidate of [video.origin_cover, video.cover, video.dynamic_cover, detail.cover]) {
    const url = firstUrl(candidate);
    if (url) return url;
  }
  return null;
}

export function mapAwemeToParse(detail: Record<string, unknown>, videoId: string): DouyinMapped | null {
  const video = asRecord(detail.video);
  if (!video) return null;
  const plays = collectPlays(video);
  if (plays.length === 0) return null;

  const author = asRecord(detail.author);
  const durationMs = num(video.duration) || num(detail.duration);
  const duration = durationMs != null ? Math.round(durationMs > 10000 ? durationMs / 1000 : durationMs) : null;
  const id = detail.aweme_id != null ? String(detail.aweme_id) : videoId;
  const webpageUrl = canonicalDouyinVideoUrl(id);

  const formats: FormatItem[] = plays.map((play) => ({
    formatId: play.formatId,
    ext: 'mp4',
    resolution: play.width && play.height ? `${play.width}x${play.height}` : play.height ? `${play.height}p` : null,
    fps: null,
    vcodec: 'h264',
    acodec: 'aac',
    filesize: play.filesize,
    tbr: null,
    note: play.note,
    hasVideo: true,
    hasAudio: true,
  }));

  const parse: ParseResult = {
    type: 'video',
    id,
    title: (typeof detail.desc === 'string' && detail.desc.trim()) || `抖音视频 ${id}`,
    extractor: 'Douyin',
    thumbnail: thumbnailFrom(detail, video),
    duration,
    uploader: typeof author?.nickname === 'string' ? author.nickname : null,
    webpageUrl,
    formats,
    presets: PRESETS,
    entries: [],
  };

  return { parse, plays };
}

export function decodeMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const attempts = [trimmed];
  try {
    attempts.push(decodeURIComponent(trimmed));
  } catch {
    // 不是 URL 编码
  }
  for (const item of attempts) {
    const start = item.indexOf('{');
    const end = item.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      return JSON.parse(item.slice(start, end + 1));
    } catch {
      // 下一种
    }
  }
  return null;
}

export function mapFromUnknown(payload: unknown, videoId: string): DouyinMapped | null {
  // 精选 feed 里有大量其它 aweme，禁止回退成「任意一条」
  const detail = findAwemeDetail(payload, videoId);
  if (!detail) return null;
  const mapped = mapAwemeToParse(detail, videoId);
  if (mapped && mapped.parse.id !== videoId) return null;
  return mapped;
}

export function pickPlayUrl(plays: DouyinPlayUrl[], formatId?: string | null): DouyinPlayUrl {
  if (!plays.length) {
    throw new Error('未找到可下载的抖音视频地址');
  }
  if (formatId && formatId.startsWith('dy:')) {
    const exact = plays.find((item) => item.formatId === formatId);
    if (exact) return exact;
  }
  const heightLimit = formatId?.includes('height<=720')
    ? 720
    : formatId?.includes('height<=1080')
      ? 1080
      : null;
  const ranked = [...plays].sort((a, b) => (b.height || 0) - (a.height || 0));
  if (heightLimit) {
    const capped = ranked.find((item) => (item.height || 0) > 0 && (item.height || Infinity) <= heightLimit);
    if (capped) return capped;
  }
  return ranked[0];
}
