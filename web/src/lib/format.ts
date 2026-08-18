export function formatBytes(value?: number | null): string {
  if (value == null) return "—";
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(value?: number | null): string {
  if (!value && value !== 0) return "";
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: "排队",
    downloading: "下载中",
    postprocessing: "后处理",
    done: "完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return map[status] || status;
}

export function isActive(status: string): boolean {
  return status === "queued" || status === "downloading" || status === "postprocessing";
}
