/**
 * 抖音链接识别与规范化
 */

import { logger } from '~/electron/utils/logger';

const VIDEO_ID_RE = /^\d{5,32}$/;
const HOST_RE = /(?:^|\.)((?:ies)?douyin\.com)$/i;
const SHORT_HOST_RE = /(?:^|\.)v\.douyin\.com$/i;
const IN_TEXT_URL_RE = /https?:\/\/[^\s<>"']+/i;

export function chromeUserAgent(): string {
  const chrome = process.versions.chrome || '122.0.0.0';
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

/** 从粘贴文本中抽出第一条 http(s) 链接 */
export function coerceHttpUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  } catch {
    // 分享文案里夹着链接
  }
  const match = trimmed.match(IN_TEXT_URL_RE);
  if (match) return match[0].replace(/[),，。]+$/u, '');
  return trimmed;
}

export function looksLikeDouyin(input: string): boolean {
  return /(?:ies)?douyin\.com/i.test(input);
}

function hostnameOf(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return null;
  }
}

export function isDouyinHost(urlStr: string): boolean {
  const host = hostnameOf(urlStr);
  if (!host) return false;
  return HOST_RE.test(host) || SHORT_HOST_RE.test(host);
}

export function extractDouyinVideoId(urlStr: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }
  const modal = parsed.searchParams.get('modal_id') || parsed.searchParams.get('aweme_id');
  if (modal && VIDEO_ID_RE.test(modal)) return modal;

  const patterns = [
    /\/video\/(\d+)/,
    /\/note\/(\d+)/,
    /\/share\/video\/(\d+)/,
    /\/share\/note\/(\d+)/,
  ];
  for (const re of patterns) {
    const match = parsed.pathname.match(re);
    if (match && VIDEO_ID_RE.test(match[1])) return match[1];
  }
  return null;
}

export function canonicalDouyinVideoUrl(videoId: string): string {
  return `https://www.douyin.com/video/${videoId}`;
}

/** 精选页对部分作品有更完整的前端数据 */
export function jingxuanDouyinUrl(videoId: string): string {
  return `https://www.douyin.com/jingxuan?modal_id=${videoId}`;
}

function isShortDouyinHost(urlStr: string): boolean {
  const host = hostnameOf(urlStr);
  return Boolean(host && SHORT_HOST_RE.test(host));
}

/** 短链跟随跳转，得到带 video id 的页面 URL */
export async function resolveDouyinUrl(input: string): Promise<string> {
  const url = coerceHttpUrl(input);
  if (!isShortDouyinHost(url)) return url;

  const started = Date.now();
  logger.info(`[Douyin] 解析短链 ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': chromeUserAgent(),
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    const finalUrl = res.url && res.url.startsWith('http') ? res.url : url;
    logger.info(`[Douyin] 短链跳转完成 status=${res.status} -> ${finalUrl} 耗时=${Date.now() - started}ms`);
    return finalUrl;
  } catch (err) {
    logger.warn(`[Douyin] 短链跳转失败 耗时=${Date.now() - started}ms: ${err instanceof Error ? err.message : String(err)}`);
    return url;
  } finally {
    clearTimeout(timer);
  }
}

export async function normalizeDouyinVideo(input: string): Promise<{ id: string; resolved: string; canonical: string; jingxuan: string }> {
  logger.info(`[Douyin] 规范化输入 ${input}`);
  const resolved = await resolveDouyinUrl(input);
  const id = extractDouyinVideoId(resolved);
  if (!id) {
    logger.warn(`[Douyin] 未能抽出视频 ID resolved=${resolved}`);
    throw new Error('无法从该抖音链接解析视频 ID。请使用精选页、视频页或 v.douyin.com 短链。');
  }
  const result = {
    id,
    resolved,
    canonical: canonicalDouyinVideoUrl(id),
    jingxuan: jingxuanDouyinUrl(id),
  };
  logger.info(`[Douyin] 规范化完成 id=${result.id} canonical=${result.canonical}`);
  return result;
}
