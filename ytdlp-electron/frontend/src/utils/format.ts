/** 格式化字节 */
export function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** 格式化秒数为 mm:ss / hh:mm:ss */
export function formatDuration(seconds?: number | null): string {
  if (seconds == null || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 任务状态中文 */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: '排队中',
    downloading: '下载中',
    postprocessing: '后处理',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return map[status] || status;
}

export function isActiveStatus(status: string): boolean {
  return status === 'queued' || status === 'downloading' || status === 'postprocessing';
}
