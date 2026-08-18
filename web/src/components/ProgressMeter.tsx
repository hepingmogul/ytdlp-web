import { formatBytes, statusLabel } from "../lib/format";

type Props = {
  percent: number;
  status: string;
  speed?: string | null;
  eta?: number | null;
  downloaded?: number;
  total?: number;
};

export function ProgressMeter({ percent, status, speed, eta, downloaded, total }: Props) {
  const width = Math.max(0, Math.min(100, percent));
  const tone =
    status === "failed"
      ? "bg-signal"
      : status === "done"
        ? "bg-ok"
        : status === "cancelled"
          ? "bg-mute"
          : "bg-amber";

  return (
    <div className="space-y-1">
      <div className="vu-track relative h-2 overflow-hidden rounded-sm bg-ink">
        <div className={`h-full ${tone} transition-[width] duration-300`} style={{ width: `${width}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-mute">
        <span>{statusLabel(status)}</span>
        <span>{width.toFixed(1)}%</span>
        {speed && <span>{speed}</span>}
        {eta != null && eta >= 0 && <span>ETA {eta}s</span>}
        {(downloaded || total) && (
          <span>
            {formatBytes(downloaded)} / {formatBytes(total)}
          </span>
        )}
      </div>
    </div>
  );
}
