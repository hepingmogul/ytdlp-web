import { useEffect, useState } from "react";
import { downloadTaskFile, getAccessToken, taskApi } from "../api/client";
import type { ProgressEvent, TaskItem } from "../api/types";
import { ProgressMeter } from "../components/ProgressMeter";
import { isActive, statusLabel } from "../lib/format";

export function TasksPage() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [open, setOpen] = useState<Record<string, TaskItem[]>>({});
  const [error, setError] = useState("");

  async function reload() {
    const data = await taskApi.list();
    setItems(data.items);
  }

  useEffect(() => {
    reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载失败");
    });
    const poll = window.setInterval(() => {
      reload().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const activeIds = items.filter((row) => isActive(row.status)).map((row) => row.id);
    if (activeIds.length === 0) return;
    const sources: EventSource[] = [];

    const apply = (raw: string) => {
      const payload = JSON.parse(raw) as ProgressEvent;
      setItems((prev) =>
        prev.map((row) =>
          row.id === payload.id
            ? {
                ...row,
                status: payload.status,
                percent: payload.percent,
                speed: payload.speed,
                eta: payload.eta,
                downloaded_bytes: payload.downloaded_bytes,
                total_bytes: payload.total_bytes,
                error_message: payload.error_message,
                filename: payload.filename,
                title: payload.title ?? row.title,
              }
            : row,
        ),
      );
    };

    for (const id of activeIds) {
      const source = new EventSource(`/api/tasks/${id}/events?token=${encodeURIComponent(token)}`);
      source.addEventListener("snapshot", (event) => apply((event as MessageEvent).data));
      source.addEventListener("progress", (event) => apply((event as MessageEvent).data));
      source.addEventListener("done", (event) => {
        apply((event as MessageEvent).data);
        source.close();
      });
      sources.push(source);
    }
    return () => {
      for (const source of sources) source.close();
    };
  }, [items.filter((item) => isActive(item.status)).map((item) => item.id).join("|")]);

  async function toggleChildren(id: string) {
    if (open[id]) {
      setOpen((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const data = await taskApi.children(id);
    setOpen((prev) => ({ ...prev, [id]: data.items }));
  }

  async function onCancel(id: string) {
    await taskApi.cancel(id);
    await reload();
  }

  async function onRemove(id: string) {
    if (!confirm("删除任务及其本地文件？")) return;
    await taskApi.remove(id);
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-amber">Tape deck</p>
          <h1 className="mt-1 font-display text-3xl">任务带</h1>
        </div>
        <button type="button" className="text-sm text-mute hover:text-paper" onClick={() => reload()}>
          刷新
        </button>
      </div>

      {error && <p className="text-sm text-signal">{error}</p>}

      {items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-mute">
          还没有任务。去工作台贴一条链接。
        </p>
      )}

      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              {item.thumbnail && (
                <img src={item.thumbnail} alt="" className="h-16 w-28 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{item.title || item.url}</h2>
                  <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-mute">
                    {item.mode}
                  </span>
                  <span className="font-mono text-[10px] text-mute">{statusLabel(item.status)}</span>
                </div>
                <p className="truncate font-mono text-xs text-mute">{item.url}</p>
                <ProgressMeter
                  percent={item.percent}
                  status={item.status}
                  speed={item.speed}
                  eta={item.eta}
                  downloaded={item.downloaded_bytes}
                  total={item.total_bytes}
                />
                {item.error_message && <p className="text-sm text-signal">{item.error_message}</p>}
                {item.mode === "playlist" && (
                  <p className="text-xs text-mute">
                    子任务 {item.done_count}/{item.child_count}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {item.status === "done" && item.filename && (
                  <button
                    type="button"
                    className="rounded bg-ok px-3 py-1.5 text-ink"
                    onClick={() => downloadTaskFile(item.id).catch((err: unknown) => alert(String(err)))}
                  >
                    下载文件
                  </button>
                )}
                {item.status === "done" &&
                  item.extra_files.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="rounded border border-line px-3 py-1.5"
                      onClick={() =>
                        downloadTaskFile(item.id, name).catch((err: unknown) => alert(String(err)))
                      }
                    >
                      {name}
                    </button>
                  ))}
                {isActive(item.status) && (
                  <button
                    type="button"
                    className="rounded border border-signal/50 px-3 py-1.5 text-signal"
                    onClick={() => onCancel(item.id)}
                  >
                    取消
                  </button>
                )}
                {item.mode === "playlist" && (
                  <button
                    type="button"
                    className="rounded border border-line px-3 py-1.5"
                    onClick={() => toggleChildren(item.id)}
                  >
                    {open[item.id] ? "收起子任务" : "查看子任务"}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded border border-line px-3 py-1.5 text-mute"
                  onClick={() => onRemove(item.id)}
                >
                  删除
                </button>
              </div>
            </div>
            {open[item.id] && (
              <ul className="mt-4 space-y-2 border-t border-line/70 pt-3">
                {open[item.id].map((child) => (
                  <li key={child.id} className="rounded-md bg-ink/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{child.title || child.url}</span>
                      {child.status === "done" && child.filename && (
                        <button
                          type="button"
                          className="shrink-0 text-amber"
                          onClick={() =>
                            downloadTaskFile(child.id).catch((err: unknown) => alert(String(err)))
                          }
                        >
                          下载
                        </button>
                      )}
                    </div>
                    <ProgressMeter percent={child.percent} status={child.status} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
