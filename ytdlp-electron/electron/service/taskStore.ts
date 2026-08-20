/**
 * 下载任务持久化（供 Service 与队列共用，避免循环依赖）
 */

import { getDatabase } from '~/electron/db/sqlite';
import { DB, TASK_STATUS } from '~/electron/shared/constant';
import { getTimestamp, safeJsonParse } from '~/electron/utils';
import type { CreateTaskInput, DownloadProgress, DownloadTask } from '~/electron/shared/types';

export interface TaskRow {
  id: string;
  parent_id: string | null;
  url: string;
  title: string | null;
  thumbnail: string | null;
  extractor: string | null;
  mode: string;
  format_id: string | null;
  audio_format: string | null;
  write_subs: number;
  write_auto_subs: number;
  sub_langs: string | null;
  proxy: string | null;
  status: string;
  percent: number;
  speed: string | null;
  eta: number | null;
  downloaded_bytes: number;
  total_bytes: number;
  error_message: string | null;
  output_path: string | null;
  filename: string | null;
  filesize: number | null;
  extra_files: string | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export function mapTask(row: TaskRow, extra?: { childCount?: number; doneCount?: number }): DownloadTask {
  return {
    id: row.id,
    parentId: row.parent_id,
    url: row.url,
    title: row.title,
    thumbnail: row.thumbnail,
    extractor: row.extractor,
    mode: row.mode,
    formatId: row.format_id,
    audioFormat: row.audio_format,
    writeSubs: Boolean(row.write_subs),
    writeAutoSubs: Boolean(row.write_auto_subs),
    subLangs: row.sub_langs,
    proxy: row.proxy,
    status: row.status,
    percent: row.percent ?? 0,
    speed: row.speed,
    eta: row.eta,
    downloadedBytes: Number(row.downloaded_bytes || 0),
    totalBytes: Number(row.total_bytes || 0),
    errorMessage: row.error_message,
    outputPath: row.output_path,
    filename: row.filename,
    filesize: row.filesize == null ? null : Number(row.filesize),
    extraFiles: safeJsonParse<string[]>(row.extra_files || '[]', []),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    childCount: extra?.childCount ?? 0,
    doneCount: extra?.doneCount ?? 0,
  };
}

export function toProgress(task: DownloadTask): DownloadProgress {
  return {
    id: task.id,
    parentId: task.parentId,
    status: task.status,
    percent: task.percent,
    speed: task.speed,
    eta: task.eta,
    downloadedBytes: task.downloadedBytes,
    totalBytes: task.totalBytes,
    errorMessage: task.errorMessage,
    filename: task.filename,
    title: task.title,
    childCount: task.childCount,
    doneCount: task.doneCount,
  };
}

export function getTaskRow(id: string): TaskRow | undefined {
  return getDatabase().prepare(`SELECT * FROM ${DB.TABLE.DOWNLOAD_TASKS} WHERE id = ?`).get(id) as
    | TaskRow
    | undefined;
}

export function listTaskRows(includeChildren = false): TaskRow[] {
  const sql = includeChildren
    ? `SELECT * FROM ${DB.TABLE.DOWNLOAD_TASKS} ORDER BY created_at DESC`
    : `SELECT * FROM ${DB.TABLE.DOWNLOAD_TASKS} WHERE parent_id IS NULL ORDER BY created_at DESC`;
  return getDatabase().prepare(sql).all() as TaskRow[];
}

export function listChildRows(parentId: string): TaskRow[] {
  return getDatabase()
    .prepare(`SELECT * FROM ${DB.TABLE.DOWNLOAD_TASKS} WHERE parent_id = ? ORDER BY created_at ASC`)
    .all(parentId) as TaskRow[];
}

export function childStats(parentIds: string[]): Map<string, { total: number; done: number }> {
  const result = new Map<string, { total: number; done: number }>();
  for (const id of parentIds) result.set(id, { total: 0, done: 0 });
  if (parentIds.length === 0) return result;
  const placeholders = parentIds.map(() => '?').join(',');
  const rows = getDatabase()
    .prepare(
      `SELECT parent_id, status, COUNT(*) as cnt
       FROM ${DB.TABLE.DOWNLOAD_TASKS}
       WHERE parent_id IN (${placeholders})
       GROUP BY parent_id, status`,
    )
    .all(...parentIds) as Array<{ parent_id: string; status: string; cnt: number }>;
  for (const row of rows) {
    const stats = result.get(row.parent_id) || { total: 0, done: 0 };
    stats.total += Number(row.cnt);
    if (row.status === TASK_STATUS.DONE) stats.done += Number(row.cnt);
    result.set(row.parent_id, stats);
  }
  return result;
}

export function insertTask(
  id: string,
  input: CreateTaskInput,
  extras: { mode: string; formatId: string; parentId?: string | null },
): TaskRow {
  const now = getTimestamp();
  const langs = input.subLangs?.map((item) => item.trim()).filter(Boolean).join(',') || null;
  getDatabase()
    .prepare(
      `INSERT INTO ${DB.TABLE.DOWNLOAD_TASKS} (
        id, parent_id, url, title, thumbnail, extractor, mode, format_id, audio_format,
        write_subs, write_auto_subs, sub_langs, proxy, status, percent, speed, eta,
        downloaded_bytes, total_bytes, error_message, output_path, filename, filesize, extra_files,
        created_at, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)`,
    )
    .run(
      id,
      extras.parentId || null,
      input.url,
      input.title || null,
      input.thumbnail || null,
      input.extractor || null,
      extras.mode,
      extras.formatId,
      input.audioOnly ? input.audioFormat || 'mp3' : null,
      input.writeSubs ? 1 : 0,
      input.writeAutoSubs ? 1 : 0,
      langs,
      input.proxy || null,
      TASK_STATUS.QUEUED,
      now,
    );
  const row = getTaskRow(id);
  if (!row) throw new Error('创建任务失败');
  return row;
}

export function patchTask(id: string, fields: Record<string, unknown>): TaskRow | undefined {
  const keys = Object.keys(fields);
  if (keys.length === 0) return getTaskRow(id);
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => fields[key]);
  getDatabase()
    .prepare(`UPDATE ${DB.TABLE.DOWNLOAD_TASKS} SET ${assignments} WHERE id = ?`)
    .run(...values, id);
  return getTaskRow(id);
}

export function deleteTaskRow(id: string): void {
  getDatabase().prepare(`DELETE FROM ${DB.TABLE.DOWNLOAD_TASKS} WHERE id = ?`).run(id);
}
