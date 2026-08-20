/**
 * Parse Controller - 解析视频链接
 */

import { coerceHttpUrl } from '~/electron/engine/sites/douyin';
import { extractInfo } from '~/electron/engine/ytdlp';
import { getSettingsSnapshot } from '~/electron/service/settings';
import { errorResponse, successResponse } from '~/electron/utils';
import { logger } from '~/electron/utils/logger';

export class ParseController {
  async url(data: { url?: string }) {
    const started = Date.now();
    try {
      const url = coerceHttpUrl(data?.url || '');
      logger.info(`[Parse] 收到请求 raw=${JSON.stringify(data?.url || '')} coerced=${url}`);
      if (!url) {
        return errorResponse('请输入视频链接');
      }
      const settings = getSettingsSnapshot();
      logger.info(
        `[Parse] 设置 cookies=${settings.cookiesPath || '(无)'} proxy=${settings.proxy || '(无)'}`,
      );
      const result = await extractInfo(url, {
        cookies: settings.cookiesPath,
        proxy: settings.proxy,
      });
      logger.info(
        `[Parse] 成功 type=${result.type} extractor=${result.extractor} id=${result.id} title=${result.title} formats=${result.formats.length} 耗时=${Date.now() - started}ms`,
      );
      return successResponse(result);
    } catch (e: any) {
      logger.error(`[Parse] 失败 耗时=${Date.now() - started}ms: ${e?.message || e}`);
      return errorResponse(e.message);
    }
  }
}

(ParseController as any).toString = () => '[class ParseController]';
