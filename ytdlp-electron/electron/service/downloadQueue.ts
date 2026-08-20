/**
 * 本地下载队列：并发控制、进度节流、崩溃恢复
 */

import { spawn, type ChildProcess } from 'child_process';
import { TASK_MODE, TASK_STATUS, TERMINAL_STATUSES } from '~/electron/shared/constant';
import { IPC_CHANNELS } from '~/electron/shared/ipcChannels';
import type { DownloadTask } from '~/electron/shared/types';
import { downloadJob, YtdlpCancelled } from '~/electron/engine/ytdlp';
import { getMainWindow } from '~/electron/main/mainWindow';
import { getSettingsSnapshot } from '~/electron/service/settings';
import {
  childStats,
  getTaskRow,
  listChildRows,
  listTaskRows,
  mapTask,
  patchTask,
  toProgress,
} from '~/electron/service/taskStore';
import { getTaskDir, getTimestamp } from '~/electron/utils';
import { logger } from '~/electron/utils/logger';
import type { ProgressUpdate } from '~/electron/engine/ytdlp/progress';

const cancelledIds = new Set<string>();
const running = new Map<string, ChildProcess>();
const pending: string[] = [];
let activeCount = 0;
let pumping = false;

function publish(task: DownloadTask): void {
  const win = getMainWindow();
  win?.webContents.send(IPC_CHANNELS.DOWNLOAD.PROGRESS, toProgress(task));
}

function persistAndPublish(id: string, fields: Record<string, unknown>): DownloadTask | null {
  const row = patchTask(id, fields);
  if (!row) return null;
  let extra: { childCount?: number; doneCount?: number } | undefined;
  if (row.mode === TASK_MODE.PLAYLIST) {
    const stats = childStats([id]).get(id);
    extra = { childCount: stats?.total ?? 0, doneCount: stats?.done ?? 0 };
  }
  const task = mapTask(row, extra);
  publish(task);
  if (row.parent_id) refreshParent(row.parent_id);
  return task;
}

export function refreshParentStatus(parentId: string): void {
  refreshParent(parentId);
}

function refreshParent(parentId: string): void {
  const children = listChildRows(parentId);
  if (children.length === 0) return;
  const total = children.length;
  const done = children.filter((item) => item.status === TASK_STATUS.DONE).length;
  const failed = children.filter((item) => item.status === TASK_STATUS.FAILED).length;
  const cancelled = children.filter((item) => item.status === TASK_STATUS.CANCELLED).length;
  const finished = done + failed + cancelled;
  const fields: Record<string, unknown> = {
    percent: Math.round((finished * 10000) / total) / 100,
    downloaded_bytes: done,
    total_bytes: total,
  };
  if (finished < total) {
    fields.status = TASK_STATUS.DOWNLOADING;
    fields.error_message = null;
    fields.finished_at = null;
  } else if (failed > 0) {
    fields.status = TASK_STATUS.FAILED;
    fields.error_message = `${failed} 个子任务失败`;
    fields.finished_at = getTimestamp();
  } else if (cancelled > 0 && done === 0) {
    fields.status = TASK_STATUS.CANCELLED;
    fields.error_message = '任务已取消';
    fields.finished_at = getTimestamp();
  } else {
    fields.status = TASK_STATUS.DONE;
    fields.error_message = cancelled > 0 ? `${cancelled} 个子任务已取消` : null;
    fields.finished_at = getTimestamp();
  }
  persistAndPublish(parentId, fields);
}

async function runOne(taskId: string): Promise<void> {
  const row = getTaskRow(taskId);
  if (!row || TERMINAL_STATUSES.includes(row.status) || row.mode === TASK_MODE.PLAYLIST) {
    return;
  }
  if (cancelledIds.has(taskId)) {
    persistAndPublish(taskId, {
      status: TASK_STATUS.CANCELLED,
      error_message: '任务已取消',
      finished_at: getTimestamp(),
    });
    return;
  }

  const settings = getSettingsSnapshot();
  const outdir = getTaskDir(settings.downloadDir, taskId);
  persistAndPublish(taskId, {
    status: TASK_STATUS.DOWNLOADING,
    started_at: getTimestamp(),
    error_message: null,
    percent: 0,
  });

  let lastFlush = 0;
  const onProgress = (update: ProgressUpdate) => {
    const now = Date.now();
    const status = update.status === 'postprocessing' ? TASK_STATUS.POSTPROCESSING : TASK_STATUS.DOWNLOADING;
    if (now - lastFlush < 300 && status === TASK_STATUS.DOWNLOADING) return;
    lastFlush = now;
    const fields: Record<string, unknown> = { status };
    if (update.percent != null) fields.percent = update.percent;
    if (update.speed !== undefined) fields.speed = update.speed;
    if (update.eta !== undefined) fields.eta = update.eta;
    if (update.downloadedBytes != null) fields.downloaded_bytes = update.downloadedBytes;
    if (update.totalBytes != null) fields.total_bytes = update.totalBytes;
    persistAndPublish(taskId, fields);
  };

  try {
    const outputs = await downloadJob(
      {
        id: taskId,
        url: row.url,
        mode: row.mode,
        formatId: row.format_id,
        audioFormat: row.audio_format,
        writeSubs: Boolean(row.write_subs),
        writeAutoSubs: Boolean(row.write_auto_subs),
        subLangs: row.sub_langs,
        proxy: row.proxy || settings.proxy,
        cookies: settings.cookiesPath,
        outdir,
      },
      {
        onProgress,
        shouldCancel: () => cancelledIds.has(taskId),
        onSpawn: (child) => {
          running.set(taskId, child);
        },
      },
    );

    running.delete(taskId);
    if (cancelledIds.has(taskId)) {
      persistAndPublish(taskId, {
        status: TASK_STATUS.CANCELLED,
        error_message: '任务已取消',
        finished_at: getTimestamp(),
        speed: null,
      });
      return;
    }

    persistAndPublish(taskId, {
      status: TASK_STATUS.DONE,
      percent: 100,
      speed: null,
      eta: 0,
      error_message: null,
      output_path: outputs.outputPath,
      filename: outputs.filename,
      filesize: outputs.filesize,
      extra_files: outputs.extraFiles.length > 0 ? JSON.stringify(outputs.extraFiles) : null,
      finished_at: getTimestamp(),
    });
  } catch (err) {
    running.delete(taskId);
    if (err instanceof YtdlpCancelled || cancelledIds.has(taskId)) {
      persistAndPublish(taskId, {
        status: TASK_STATUS.CANCELLED,
        error_message: '任务已取消',
        finished_at: getTimestamp(),
        speed: null,
      });
      return;
    }
    const message = err instanceof Error ? err.message : '下载失败';
    logger.error(`[Queue] 任务失败 ${taskId}: ${message}`);
    persistAndPublish(taskId, {
      status: TASK_STATUS.FAILED,
      error_message: message,
      finished_at: getTimestamp(),
      speed: null,
    });
  }
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (pending.length > 0) {
      const limit = getSettingsSnapshot().maxConcurrent;
      if (activeCount >= limit) break;
      const id = pending.shift();
      if (!id) break;
      activeCount += 1;
      void runOne(id)
        .catch((err) => {
          logger.error('[Queue] runOne 未捕获错误', err);
        })
        .finally(() => {
          activeCount -= 1;
          running.delete(id);
          void pump();
        });
    }
  } finally {
    pumping = false;
  }
}

export function enqueue(taskId: string): void {
  cancelledIds.delete(taskId);
  if (!pending.includes(taskId)) pending.push(taskId);
  void pump();
}

function killProcess(taskId: string): void {
  const idx = pending.indexOf(taskId);
  if (idx >= 0) pending.splice(idx, 1);
  const child = running.get(taskId);
  if (child?.pid && process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    child?.kill('SIGTERM');
  }
}

export function requestCancel(taskId: string): void {
  const row = getTaskRow(taskId);
  const ids = [taskId];
  if (row?.mode === TASK_MODE.PLAYLIST) {
    ids.push(...listChildRows(taskId).map((item) => item.id));
  }
  for (const id of ids) {
    cancelledIds.add(id);
    killProcess(id);
  }
}

export function recoverAndStartQueue(): void {
  const interrupted = listTaskRows(true).filter(
    (row) =>
      (row.status === TASK_STATUS.DOWNLOADING || row.status === TASK_STATUS.POSTPROCESSING) &&
      row.mode !== TASK_MODE.PLAYLIST,
  );
  for (const row of interrupted) {
    patchTask(row.id, {
      status: TASK_STATUS.QUEUED,
      error_message: null,
      speed: null,
    });
  }
  const queued = listTaskRows(true).filter(
    (row) => row.status === TASK_STATUS.QUEUED && row.mode !== TASK_MODE.PLAYLIST,
  );
  for (const row of queued) {
    enqueue(row.id);
  }
  logger.info(`[Queue] 已恢复 ${queued.length} 个排队任务`);
}
