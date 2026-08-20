/**
 * 应用设置
 */

import fs from 'fs';
import { getDatabase } from '~/electron/db/sqlite';
import { DB, DEFAULT_FORMAT, DEFAULT_MAX_CONCURRENT } from '~/electron/shared/constant';
import { assertProxyUrl } from '~/electron/engine/ytdlp';
import {
  ensureDir,
  errorResponse,
  getCookiesFilePath,
  getDefaultDownloadDir,
  getTimestamp,
  successResponse,
} from '~/electron/utils';
import { checkBinaries } from '~/electron/engine/ytdlp';
import type { AppSettings, AppSettingsUpdate, BinaryCheckResult, ServiceResponse } from '~/electron/types';

const SETTINGS_ID = 1;

interface SettingsRow {
  id: number;
  download_dir: string;
  cookies_path: string | null;
  proxy: string | null;
  max_concurrent: number;
  default_format: string;
}

function mapSettings(row: SettingsRow): AppSettings {
  const cookiesPath = row.cookies_path;
  return {
    downloadDir: row.download_dir,
    cookiesPath,
    hasCookies: Boolean(cookiesPath && fs.existsSync(cookiesPath)),
    proxy: row.proxy,
    maxConcurrent: row.max_concurrent,
    defaultFormat: row.default_format,
  };
}

function ensureRow(): SettingsRow {
  const db = getDatabase();
  const existing = db.prepare(`SELECT * FROM ${DB.TABLE.APP_SETTINGS} WHERE id = ?`).get(SETTINGS_ID) as
    | SettingsRow
    | undefined;
  if (existing) {
    ensureDir(existing.download_dir);
    return existing;
  }

  const downloadDir = ensureDir(getDefaultDownloadDir());
  db.prepare(
    `INSERT INTO ${DB.TABLE.APP_SETTINGS}
      (id, download_dir, cookies_path, proxy, max_concurrent, default_format, updated_at)
     VALUES (?, ?, NULL, NULL, ?, ?, ?)`,
  ).run(SETTINGS_ID, downloadDir, DEFAULT_MAX_CONCURRENT, DEFAULT_FORMAT, getTimestamp());

  return db.prepare(`SELECT * FROM ${DB.TABLE.APP_SETTINGS} WHERE id = ?`).get(SETTINGS_ID) as SettingsRow;
}

export function getSettingsSnapshot(): AppSettings {
  return mapSettings(ensureRow());
}

export class SettingsService {
  get(): ServiceResponse<AppSettings> {
    try {
      return successResponse(getSettingsSnapshot());
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  update(input: AppSettingsUpdate): ServiceResponse<AppSettings> {
    try {
      const current = ensureRow();
      const downloadDir = input.downloadDir?.trim() || current.download_dir;
      if (!fs.existsSync(downloadDir)) {
        ensureDir(downloadDir);
      }
      const maxConcurrent = Math.min(3, Math.max(1, input.maxConcurrent ?? current.max_concurrent));
      const defaultFormat = input.defaultFormat?.trim() || current.default_format;
      const proxy =
        input.proxy === undefined ? current.proxy : assertProxyUrl(input.proxy);

      getDatabase()
        .prepare(
          `UPDATE ${DB.TABLE.APP_SETTINGS}
           SET download_dir = ?, proxy = ?, max_concurrent = ?, default_format = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(downloadDir, proxy, maxConcurrent, defaultFormat, getTimestamp(), SETTINGS_ID);

      return successResponse(getSettingsSnapshot());
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  async chooseDownloadDir(): Promise<ServiceResponse<AppSettings>> {
    try {
      const { dialog } = await import('electron');
      const { getMainWindow } = await import('~/electron/main/mainWindow');
      const win = getMainWindow();
      const options = {
        title: '选择下载目录',
        properties: ['openDirectory', 'createDirectory'] as Array<
          'openDirectory' | 'createDirectory'
        >,
        defaultPath: getSettingsSnapshot().downloadDir,
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) {
        return successResponse(getSettingsSnapshot());
      }
      return this.update({ downloadDir: result.filePaths[0] });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  checkBinaries(): ServiceResponse<BinaryCheckResult> {
    try {
      return successResponse(checkBinaries());
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  async importCookies(): Promise<ServiceResponse<AppSettings>> {
    try {
      const { dialog } = await import('electron');
      const { getMainWindow } = await import('~/electron/main/mainWindow');
      const win = getMainWindow();
      const options = {
        title: '选择 cookies.txt',
        filters: [{ name: 'cookies.txt', extensions: ['txt'] }],
        properties: ['openFile'] as Array<'openFile'>,
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) {
        return successResponse(getSettingsSnapshot());
      }
      const dest = getCookiesFilePath();
      fs.copyFileSync(result.filePaths[0], dest);
      getDatabase()
        .prepare(`UPDATE ${DB.TABLE.APP_SETTINGS} SET cookies_path = ?, updated_at = ? WHERE id = ?`)
        .run(dest, getTimestamp(), SETTINGS_ID);
      return successResponse(getSettingsSnapshot());
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  clearCookies(): ServiceResponse<AppSettings> {
    try {
      const current = ensureRow();
      if (current.cookies_path && fs.existsSync(current.cookies_path)) {
        fs.unlinkSync(current.cookies_path);
      }
      getDatabase()
        .prepare(`UPDATE ${DB.TABLE.APP_SETTINGS} SET cookies_path = NULL, updated_at = ? WHERE id = ?`)
        .run(getTimestamp(), SETTINGS_ID);
      return successResponse(getSettingsSnapshot());
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }
}

export const settingsService = new SettingsService();
