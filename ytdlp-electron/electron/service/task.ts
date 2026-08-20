/**
 * 下载任务 Service
 */

import fs from 'fs';
import { randomUUID } from 'crypto';
import { shell } from 'electron';
import { DEFAULT_FORMAT, TASK_MODE, TASK_STATUS, TERMINAL_STATUSES } from '~/electron/shared/constant';
import type { CreateTaskInput, DownloadTask } from '~/electron/shared/types';
import { coerceHttpUrl, looksLikeDouyin, normalizeDouyinVideo } from '~/electron/engine/sites/douyin';
import { assertHttpUrl } from '~/electron/engine/ytdlp';
import { enqueue, refreshParentStatus, requestCancel } from '~/electron/service/downloadQueue';
import { getSettingsSnapshot } from '~/electron/service/settings';
import {
  childStats,
  deleteTaskRow,
  getTaskRow,
  insertTask,
  listChildRows,
  listTaskRows,
  mapTask,
  patchTask,
} from '~/electron/service/taskStore';
import { errorResponse, getTaskDir, getTimestamp, successResponse } from '~/electron/utils';
import type { ServiceResponse } from '~/electron/types';

function requireTask(id: string) {
  const row = getTaskRow(id);
  if (!row) throw new Error('任务不存在');
  return row;
}

function withStats(row: NonNullable<ReturnType<typeof getTaskRow>>): DownloadTask {
  if (row.mode !== TASK_MODE.PLAYLIST) return mapTask(row);
  const stats = childStats([row.id]).get(row.id);
  return mapTask(row, { childCount: stats?.total ?? 0, doneCount: stats?.done ?? 0 });
}

export class TaskService {
  list(includeChildren = false): ServiceResponse<{ items: DownloadTask[] }> {
    try {
      const rows = listTaskRows(includeChildren);
      const parentIds = rows.filter((row) => row.mode === TASK_MODE.PLAYLIST).map((row) => row.id);
      const stats = childStats(parentIds);
      const items = rows.map((row) => {
        const extra = stats.get(row.id);
        return extra ? mapTask(row, { childCount: extra.total, doneCount: extra.done }) : mapTask(row);
      });
      return successResponse({ items });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  get(id: string): ServiceResponse<DownloadTask> {
    try {
      return successResponse(withStats(requireTask(id)));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  children(id: string): ServiceResponse<{ items: DownloadTask[] }> {
    try {
      requireTask(id);
      const items = listChildRows(id).map((row) => mapTask(row));
      return successResponse({ items });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  async create(input: CreateTaskInput): Promise<ServiceResponse<DownloadTask>> {
    try {
      const url = coerceHttpUrl(input.url);
      assertHttpUrl(url);
      if (looksLikeDouyin(url)) {
        const normalized = await normalizeDouyinVideo(url);
        input = { ...input, url: normalized.canonical };
      } else {
        input = { ...input, url };
      }
      const settings = getSettingsSnapshot();
      const formatId = input.audioOnly
        ? 'bestaudio/best'
        : input.formatId || settings.defaultFormat || DEFAULT_FORMAT;
      const mode = input.audioOnly ? TASK_MODE.AUDIO : TASK_MODE.VIDEO;
      const entries = input.entries?.filter((item) => item.url?.trim()) || [];

      if (entries.length > 0) {
        for (const entry of entries) assertHttpUrl(entry.url);
        const parentId = randomUUID();
        const parent = insertTask(
          parentId,
          { ...input, url: input.url.trim(), title: input.title || '播放列表' },
          { mode: TASK_MODE.PLAYLIST, formatId },
        );
        for (const entry of entries) {
          const child = insertTask(
            randomUUID(),
            {
              ...input,
              url: entry.url.trim(),
              title: entry.title,
              thumbnail: entry.thumbnail,
              entries: undefined,
            },
            { mode, formatId, parentId },
          );
          enqueue(child.id);
        }
        return successResponse(mapTask(parent, { childCount: entries.length, doneCount: 0 }));
      }

      const row = insertTask(randomUUID(), { ...input, url: input.url.trim() }, { mode, formatId });
      enqueue(row.id);
      return successResponse(mapTask(row));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  cancel(id: string): ServiceResponse<DownloadTask> {
    try {
      const row = requireTask(id);
      if (TERMINAL_STATUSES.includes(row.status) && row.mode !== TASK_MODE.PLAYLIST) {
        throw new Error('任务已结束，无法取消');
      }
      requestCancel(id);
      const now = getTimestamp();
      const targets = row.mode === TASK_MODE.PLAYLIST ? listChildRows(id) : [row];
      for (const item of targets) {
        if (TERMINAL_STATUSES.includes(item.status)) continue;
        patchTask(item.id, {
          status: TASK_STATUS.CANCELLED,
          error_message: '任务已取消',
          finished_at: now,
          speed: null,
        });
      }
      if (row.mode === TASK_MODE.PLAYLIST) {
        refreshParentStatus(id);
      } else if (row.parent_id) {
        refreshParentStatus(row.parent_id);
      }
      return successResponse(withStats(requireTask(id)));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  retry(id: string): ServiceResponse<DownloadTask> {
    try {
      const row = requireTask(id);
      if (row.mode === TASK_MODE.PLAYLIST) {
        const children = listChildRows(id).filter(
          (item) => item.status === TASK_STATUS.FAILED || item.status === TASK_STATUS.CANCELLED,
        );
        if (children.length === 0) {
          throw new Error('没有可重试的子任务');
        }
        for (const child of children) {
          patchTask(child.id, {
            status: TASK_STATUS.QUEUED,
            percent: 0,
            speed: null,
            eta: null,
            error_message: null,
            finished_at: null,
            started_at: null,
          });
          enqueue(child.id);
        }
        refreshParentStatus(id);
        return successResponse(withStats(requireTask(id)));
      }
      if (row.status !== TASK_STATUS.FAILED && row.status !== TASK_STATUS.CANCELLED) {
        throw new Error('仅失败或已取消的任务可重试');
      }
      const updated =
        patchTask(id, {
          status: TASK_STATUS.QUEUED,
          percent: 0,
          speed: null,
          eta: null,
          error_message: null,
          finished_at: null,
          started_at: null,
        }) || row;
      enqueue(id);
      return successResponse(mapTask(updated));
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  delete(id: string): ServiceResponse<{ deleted: boolean }> {
    try {
      const row = requireTask(id);
      const children = listChildRows(id);
      if (!TERMINAL_STATUSES.includes(row.status) || children.some((item) => !TERMINAL_STATUSES.includes(item.status))) {
        requestCancel(id);
      }
      const settings = getSettingsSnapshot();
      const targets = [row, ...children];
      for (const item of targets) {
        const dir = getTaskDir(settings.downloadDir, item.id);
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
        deleteTaskRow(item.id);
      }
      return successResponse({ deleted: true });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  async openFolder(id: string): Promise<ServiceResponse<{ opened: boolean }>> {
    try {
      const row = requireTask(id);
      const settings = getSettingsSnapshot();
      if (row.output_path && fs.existsSync(row.output_path)) {
        shell.showItemInFolder(row.output_path);
        return successResponse({ opened: true });
      }
      if (row.mode === TASK_MODE.PLAYLIST) {
        const err = await shell.openPath(settings.downloadDir);
        if (err) throw new Error(err);
        return successResponse({ opened: true });
      }
      const dir = getTaskDir(settings.downloadDir, id);
      const err = await shell.openPath(dir);
      if (err) throw new Error(err);
      return successResponse({ opened: true });
    } catch (e: any) {
      return errorResponse(e.message);
    }
  }

  async revealFile(id: string): Promise<ServiceResponse<{ opened: boolean }>> {
    return this.openFolder(id);
  }
}

export const taskService = new TaskService();
