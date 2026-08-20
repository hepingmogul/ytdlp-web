/**
 * Parse Controller - 解析视频链接
 */

import { extractInfo } from '~/electron/engine/ytdlp';
import { getSettingsSnapshot } from '~/electron/service/settings';
import { errorResponse, successResponse } from '~/electron/utils';

export class ParseController {
  async url(data: { url?: string }) {
    try {
      const url = data?.url?.trim();
      if (!url) {
        return errorResponse('请输入视频链接');
      }
      const settings = getSettingsSnapshot();
      const result = await extractInfo(url, {
        cookies: settings.cookiesPath,
        proxy: settings.proxy,
      });
      return successResponse(result);
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
}

(ParseController as any).toString = () => '[class ParseController]';
