import { extractDouyin, looksLikeDouyin } from '~/electron/engine/sites/douyin';
import { coerceHttpUrl } from '~/electron/engine/sites/douyin/url';
import { extractInfoYtdlp } from '~/electron/engine/ytdlp/parse';
import { assertHttpUrl } from '~/electron/engine/ytdlp/errors';
import type { ParseResult } from '~/electron/shared/types';
import { logger } from '~/electron/utils/logger';

export { checkBinaries, locateFfmpeg, locateYtdlp, requireFfmpeg, requireYtdlp } from '~/electron/engine/ytdlp/binaries';
export { extractInfoYtdlp } from '~/electron/engine/ytdlp/parse';
export { downloadJob, collectOutputs } from '~/electron/engine/ytdlp/download';
export { explainYtdlpError, YtdlpCancelled, assertHttpUrl, assertProxyUrl } from '~/electron/engine/ytdlp/errors';

export async function extractInfo(
  url: string,
  extra?: { cookies?: string | null; proxy?: string | null },
): Promise<ParseResult> {
  const coerced = coerceHttpUrl(url);
  assertHttpUrl(coerced);
  const douyin = looksLikeDouyin(url) || looksLikeDouyin(coerced);
  logger.info(`[Parse] 路由 ${douyin ? '抖音适配器' : 'yt-dlp'} url=${coerced}`);
  if (douyin) {
    return extractDouyin(coerced, extra);
  }
  return extractInfoYtdlp(coerced, extra);
}
