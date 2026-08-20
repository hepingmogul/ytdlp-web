/**
 * 抖音解析：规范化 URL → Chromium 采集 → 必要时回退 yt-dlp
 */

import { isDouyinCookiesFresh, pickCookiesPath } from '~/electron/engine/sites/douyin/cookies';
import { pickPlayUrl, type DouyinMapped, type DouyinPlayUrl } from '~/electron/engine/sites/douyin/map';
import { ensureDouyinCookies, harvestDouyin } from '~/electron/engine/sites/douyin/session';
import { chromeUserAgent, looksLikeDouyin, normalizeDouyinVideo } from '~/electron/engine/sites/douyin/url';
import { extractInfoYtdlp } from '~/electron/engine/ytdlp/parse';
import { logger } from '~/electron/utils/logger';
import type { ParseResult } from '~/electron/shared/types';

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  mapped: DouyinMapped;
  at: number;
}

const mappedCache = new Map<string, CacheEntry>();

function cacheMapped(id: string, mapped: DouyinMapped): void {
  mappedCache.set(id, { mapped, at: Date.now() });
}

function getCachedMapped(id: string): DouyinMapped | null {
  const hit = mappedCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS || hit.mapped.parse.id !== id) {
    mappedCache.delete(id);
    return null;
  }
  return hit.mapped;
}

function acceptMapped(id: string, mapped: DouyinMapped | null): DouyinMapped | null {
  if (!mapped) return null;
  if (mapped.parse.id !== id) {
    logger.warn(`[Douyin] 丢弃非目标视频 got=${mapped.parse.id} want=${id}`);
    return null;
  }
  return mapped;
}

async function tryYtdlp(
  url: string,
  extra?: { cookies?: string | null; proxy?: string | null },
): Promise<ParseResult | null> {
  const started = Date.now();
  logger.info(`[Douyin] 尝试 yt-dlp url=${url} cookies=${extra?.cookies || '(无)'}`);
  try {
    const result = await extractInfoYtdlp(url, extra);
    logger.info(`[Douyin] yt-dlp 成功 title=${result.title} 耗时=${Date.now() - started}ms`);
    return result;
  } catch (err) {
    logger.warn(`[Douyin] yt-dlp 解析失败 耗时=${Date.now() - started}ms: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function extractDouyin(
  input: string,
  extra?: { cookies?: string | null; proxy?: string | null },
): Promise<ParseResult> {
  const started = Date.now();
  logger.info(`[Douyin] extract 开始 input=${input}`);
  const { id, canonical } = await normalizeDouyinVideo(input);
  logger.info(`[Douyin] 步骤=规范化 id=${id} 耗时=${Date.now() - started}ms`);

  const cached = getCachedMapped(id);
  if (cached) {
    logger.info(`[Douyin] 命中内存缓存 id=${id} title=${cached.parse.title}`);
    return cached.parse;
  }

  const userCookies = extra?.cookies && extra.cookies.trim() ? extra.cookies : null;
  if (userCookies) {
    logger.info(`[Douyin] 步骤=用户 cookies.txt`);
    const fromUser = await tryYtdlp(canonical, { cookies: userCookies, proxy: extra?.proxy });
    if (fromUser) return fromUser;
  } else {
    logger.info('[Douyin] 无用户 cookies.txt，跳过该步');
  }

  const harvestedCookies = pickCookiesPath(null);
  if (harvestedCookies && harvestedCookies !== userCookies && isDouyinCookiesFresh(harvestedCookies)) {
    logger.info(`[Douyin] 步骤=缓存 Cookie ${harvestedCookies}`);
    const fromHarvest = await tryYtdlp(canonical, { cookies: harvestedCookies, proxy: extra?.proxy });
    if (fromHarvest) return fromHarvest;
  } else {
    logger.info(`[Douyin] 无新鲜采集 Cookie harvested=${harvestedCookies || '(无)'}`);
  }

  logger.info('[Douyin] 步骤=隐藏窗口采集');
  let harvest = await harvestDouyin({
    videoId: id,
    interactive: false,
    proxy: extra?.proxy,
  });
  harvest = { ...harvest, mapped: acceptMapped(id, harvest.mapped) };
  logger.info(
    `[Douyin] 隐藏窗口结束 mapped=${Boolean(harvest.mapped)} cookies=${harvest.cookiesPath || '(无)'} 耗时=${Date.now() - started}ms`,
  );
  if (harvest.mapped) {
    cacheMapped(id, harvest.mapped);
    return harvest.mapped.parse;
  }
  if (harvest.cookiesPath) {
    logger.info('[Douyin] 步骤=隐藏窗口 Cookie 再走 yt-dlp');
    const after = await tryYtdlp(canonical, { cookies: harvest.cookiesPath, proxy: extra?.proxy });
    if (after) return after;
  }

  logger.info('[Douyin] 步骤=可见验证窗口采集');
  harvest = await harvestDouyin({
    videoId: id,
    interactive: true,
    proxy: extra?.proxy,
  });
  harvest = { ...harvest, mapped: acceptMapped(id, harvest.mapped) };
  logger.info(
    `[Douyin] 可见窗口结束 mapped=${Boolean(harvest.mapped)} cookies=${harvest.cookiesPath || '(无)'} 耗时=${Date.now() - started}ms`,
  );
  if (harvest.mapped) {
    cacheMapped(id, harvest.mapped);
    return harvest.mapped.parse;
  }
  if (harvest.cookiesPath) {
    logger.info('[Douyin] 步骤=验证窗 Cookie 再走 yt-dlp');
    const after = await tryYtdlp(canonical, { cookies: harvest.cookiesPath, proxy: extra?.proxy });
    if (after) return after;
  }

  logger.error(`[Douyin] 全部步骤失败 总耗时=${Date.now() - started}ms`);
  throw new Error('抖音解析失败。若弹出验证窗口，请完成验证后重试；也可在设置中导入 cookies.txt。');
}

export async function prepareDouyinDownload(input: {
  url: string;
  formatId?: string | null;
  cookies?: string | null;
  proxy?: string | null;
}): Promise<{
  url: string;
  cookies: string | null;
  skipFormat: boolean;
  extraHeaders: Record<string, string>;
  formatId?: string | null;
}> {
  const { id, canonical } = await normalizeDouyinVideo(input.url);
  const extraHeaders = {
    Referer: 'https://www.douyin.com/',
    Origin: 'https://www.douyin.com',
    'User-Agent': chromeUserAgent(),
  };

  let mapped = getCachedMapped(id);
  const ensured = await ensureDouyinCookies({
    videoId: id,
    proxy: input.proxy,
    interactiveIfNeeded: true,
  });
  if (ensured.mapped) {
    const accepted = acceptMapped(id, ensured.mapped);
    if (accepted) {
      cacheMapped(id, accepted);
      mapped = accepted;
    }
  }

  const cookies = pickCookiesPath(input.cookies) || ensured.cookiesPath;

  logger.info(`[Douyin] 准备下载 id=${id} format=${input.formatId || '(默认)'} mapped=${Boolean(mapped)}`);
  const play = pickDirectPlay(mapped?.plays, input.formatId);
  if (play) {
    logger.info(`[Douyin] 使用直链 format=${play.formatId} height=${play.height} url=${play.url.slice(0, 120)}`);
    return {
      url: play.url,
      cookies,
      skipFormat: true,
      extraHeaders,
      formatId: null,
    };
  }

  // 缓存没有直链时再采集一次
  if (!mapped) {
    const harvest = await harvestDouyin({ videoId: id, interactive: false, proxy: input.proxy });
    const accepted = acceptMapped(id, harvest.mapped);
    if (accepted) {
      cacheMapped(id, accepted);
      const picked = pickDirectPlay(accepted.plays, input.formatId);
      if (picked) {
        logger.info(`[Douyin] 使用直链 format=${picked.formatId} height=${picked.height} url=${picked.url.slice(0, 120)}`);
        return {
          url: picked.url,
          cookies: pickCookiesPath(input.cookies) || harvest.cookiesPath,
          skipFormat: true,
          extraHeaders,
          formatId: null,
        };
      }
    }
  }

  return {
    url: canonical,
    cookies,
    skipFormat: false,
    extraHeaders,
    formatId: input.formatId?.startsWith('dy:') ? 'bv*+ba/b' : input.formatId,
  };
}

function pickDirectPlay(plays: DouyinPlayUrl[] | undefined, formatId?: string | null): DouyinPlayUrl | null {
  if (!plays || plays.length === 0) return null;
  try {
    return pickPlayUrl(plays, formatId);
  } catch {
    return null;
  }
}

export { looksLikeDouyin };
