/**
 * Settings Controller - 应用设置
 */

import type { AppSettingsUpdate } from '~/electron/shared/types';
import { settingsService } from '~/electron/service/settings';

export class SettingsController {
  get() {
    return settingsService.get();
  }

  update(data: AppSettingsUpdate) {
    return settingsService.update(data || {});
  }

  chooseDownloadDir() {
    return settingsService.chooseDownloadDir();
  }

  checkBinaries() {
    return settingsService.checkBinaries();
  }

  importCookies() {
    return settingsService.importCookies();
  }

  clearCookies() {
    return settingsService.clearCookies();
  }
}

(SettingsController as any).toString = () => '[class SettingsController]';
