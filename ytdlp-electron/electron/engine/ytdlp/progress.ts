/**
 * 解析 yt-dlp 进度行
 */

export interface ProgressUpdate {
  status?: 'downloading' | 'postprocessing';
  percent?: number;
  speed?: string | null;
  eta?: number | null;
  downloadedBytes?: number;
  totalBytes?: number;
}

function parsePercent(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(100, Math.max(0, raw));
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace('%', '').trim();
    const num = Number.parseFloat(cleaned);
    if (Number.isFinite(num)) return Math.min(100, Math.max(0, num));
  }
  return null;
}

function formatSpeed(bps: unknown, fallback?: string): string | null {
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
  if (typeof bps !== 'number' || !Number.isFinite(bps) || bps <= 0) return null;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)}KiB/s`;
  return `${(bps / 1024 / 1024).toFixed(2)}MiB/s`;
}

function fromProgressObject(obj: Record<string, unknown>): ProgressUpdate | null {
  const status = obj.status as string | undefined;
  if (status === 'finished' || obj.postprocessor) {
    return { status: 'postprocessing', percent: 99, speed: null };
  }
  if (status && status !== 'downloading') return null;

  const total = (obj.total_bytes as number) || (obj.total_bytes_estimate as number) || 0;
  const downloaded = (obj.downloaded_bytes as number) || 0;
  const fragments = (obj.fragment_count as number) || 0;
  const fragmentIndex = (obj.fragment_index as number) || 0;
  let percent = 0;
  if (total) percent = (downloaded * 100) / total;
  else if (fragments) percent = (fragmentIndex * 100) / fragments;
  else {
    const parsed = parsePercent(obj._percent_str) ?? parsePercent(obj.percentage);
    percent = parsed ?? 0;
  }

  const etaRaw = obj.eta;
  const eta = typeof etaRaw === 'number' ? Math.round(etaRaw) : null;

  return {
    status: 'downloading',
    percent: Math.round(Math.min(100, Math.max(0, percent)) * 100) / 100,
    speed: formatSpeed(obj.speed, obj._speed_str as string | undefined),
    eta,
    downloadedBytes: Math.round(downloaded),
    totalBytes: Math.round(total || 0),
  };
}

const CLASSIC_RE = /\[download\]\s+([\d.]+)%.*?at\s+(\S+)(?:.*?ETA\s+(\S+))?/i;

function parseEtaToken(token?: string): number | null {
  if (!token || token === 'Unknown') return null;
  const parts = token.split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function parseProgressLine(line: string): ProgressUpdate | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (
    trimmed.includes('[Merger]') ||
    trimmed.includes('[ExtractAudio]') ||
    trimmed.includes('[Fixup') ||
    trimmed.includes('Post-process')
  ) {
    return { status: 'postprocessing', percent: 99, speed: null };
  }

  const jsonPrefix = trimmed.startsWith('download:') ? trimmed.slice('download:'.length) : trimmed;
  if (jsonPrefix.startsWith('{')) {
    try {
      const obj = JSON.parse(jsonPrefix) as Record<string, unknown>;
      return fromProgressObject(obj);
    } catch {
      // 回退文本解析
    }
  }

  const classic = CLASSIC_RE.exec(trimmed);
  if (classic) {
    return {
      status: 'downloading',
      percent: Number.parseFloat(classic[1]),
      speed: classic[2] === 'Unknown' ? null : classic[2],
      eta: parseEtaToken(classic[3]),
    };
  }

  return null;
}
