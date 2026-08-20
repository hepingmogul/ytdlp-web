/**
 * App Controller - 应用信息相关操作
 */

import type { ServiceResponse } from '~/electron/types';

export class AppController {
  async getVersion(): Promise<ServiceResponse<{ version: string; electronVersion: string; platform: string }>> {
    const { app } = await import('electron');
    return {
      success: true,
      data: {
        version: app.getVersion(),
        electronVersion: process.versions.electron || 'unknown',
        platform: process.platform,
      },
    };
  }

  getPlatform(): ServiceResponse<{ platform: string }> {
    return {
      success: true,
      data: { platform: process.platform },
    };
  }
}

(AppController as any).toString = () => '[class AppController]';
