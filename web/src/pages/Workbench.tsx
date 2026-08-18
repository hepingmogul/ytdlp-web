import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { parseApi, taskApi } from "../api/client";
import type { ParseResult } from "../api/types";
import { formatBytes, formatDuration } from "../lib/format";

export function WorkbenchPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<ParseResult | null>(null);
  const [formatId, setFormatId] = useState("bv*+ba/b");
  const [audioOnly, setAudioOnly] = useState(false);
  const [audioFormat, setAudioFormat] = useState<"mp3" | "m4a" | "opus">("mp3");
  const [writeSubs, setWriteSubs] = useState(false);
  const [writeAutoSubs, setWriteAutoSubs] = useState(false);
  const [subLangs, setSubLangs] = useState("zh-Hans,en");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedEntries = useMemo(() => {
    if (!info || info.type !== "playlist") return [];
    return info.entries.filter((entry) => selected[entry.url]);
  }, [info, selected]);

  async function onParse(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo(null);
    setParsing(true);
    try {
      const result = await parseApi.parse(url.trim());
      setInfo(result);
      if (result.presets[0]) setFormatId(result.presets[0].id);
      if (result.type === "playlist") {
        const next: Record<string, boolean> = {};
        for (const entry of result.entries) next[entry.url] = true;
        setSelected(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setParsing(false);
    }
  }

  async function onSubmit() {
    if (!info) return;
    setError("");
    setSubmitting(true);
    try {
      const langs = subLangs
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const body = {
        url: info.webpage_url || url.trim(),
        title: info.title,
        thumbnail: info.thumbnail,
        extractor: info.extractor,
        format_id: audioOnly ? "bestaudio/best" : formatId,
        audio_only: audioOnly,
        audio_format: audioFormat,
        write_subs: writeSubs,
        write_auto_subs: writeAutoSubs,
        sub_langs: langs,
        entries:
          info.type === "playlist"
            ? selectedEntries.map((entry) => ({
                url: entry.url,
                title: entry.title,
                thumbnail: entry.thumbnail,
              }))
            : undefined,
      };
      if (info.type === "playlist" && selectedEntries.length === 0) {
        throw new Error("请至少勾选一条节目");
      }
      await taskApi.create(body);
      navigate("/tasks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-amber">Signal in</p>
        <h1 className="mt-1 font-display text-3xl">把链接送进落带</h1>
      </div>

      <form
        onSubmit={onParse}
        className="rounded-2xl border border-line bg-panel p-4 shadow-inset md:p-5"
      >
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
          <span className={`led ${parsing ? "led-pulse text-amber" : "text-ok"}`} />
          {parsing ? "解析中" : "待命"}
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="粘贴视频或播放列表链接"
            className="min-w-0 flex-1 rounded-md border border-line bg-ink px-4 py-3 font-mono text-sm outline-none ring-amber/40 focus:ring-2"
          />
          <button
            type="submit"
            disabled={parsing || !url.trim()}
            className="rounded-md bg-amber px-6 py-3 font-medium text-ink disabled:opacity-60"
          >
            {parsing ? "读带中…" : "解析"}
          </button>
        </div>
        <p className="mt-3 text-xs text-mute">
          解析只取元数据，不会立刻下载。站点若需登录，先到「机柜」上传 cookies.txt。
        </p>
      </form>

      {error && (
        <div className="rounded-md border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-signal">
          {error}
        </div>
      )}

      {info && (
        <section className="space-y-5 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-col gap-4 md:flex-row">
            {info.thumbnail && (
              <img
                src={info.thumbnail}
                alt=""
                className="h-28 w-48 rounded-md object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase text-mute">
                {info.extractor} · {info.type === "playlist" ? "播放列表" : "单集"}
              </p>
              <h2 className="mt-1 font-display text-2xl leading-tight">{info.title || "未命名"}</h2>
              <p className="mt-2 text-sm text-mute">
                {info.uploader}
                {info.duration ? ` · ${formatDuration(info.duration)}` : ""}
                {info.type === "playlist" ? ` · ${info.entries.length} 条` : ""}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={audioOnly}
                onChange={(event) => setAudioOnly(event.target.checked)}
              />
              仅音频
            </label>
            {audioOnly && (
              <label className="flex items-center gap-2 text-sm">
                封装
                <select
                  value={audioFormat}
                  onChange={(event) => setAudioFormat(event.target.value as "mp3" | "m4a" | "opus")}
                  className="rounded border border-line bg-ink px-2 py-1"
                >
                  <option value="mp3">mp3</option>
                  <option value="m4a">m4a</option>
                  <option value="opus">opus</option>
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={writeSubs}
                onChange={(event) => setWriteSubs(event.target.checked)}
              />
              下载字幕
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={writeAutoSubs}
                onChange={(event) => setWriteAutoSubs(event.target.checked)}
              />
              包含自动字幕
            </label>
            {(writeSubs || writeAutoSubs) && (
              <label className="md:col-span-2 space-y-1 text-sm">
                <span className="text-mute">字幕语言（逗号分隔）</span>
                <input
                  value={subLangs}
                  onChange={(event) => setSubLangs(event.target.value)}
                  className="w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm"
                />
              </label>
            )}
          </div>

          {!audioOnly && (
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
                格式
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {info.presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setFormatId(preset.id)}
                    className={`rounded-full px-3 py-1 text-sm ${
                      formatId === preset.id ? "bg-amber text-ink" : "bg-raised text-paper"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {info.formats.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-md border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-raised font-mono text-mute">
                      <tr>
                        <th className="px-3 py-2">选用</th>
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">分辨率</th>
                        <th className="px-3 py-2">编码</th>
                        <th className="px-3 py-2">大小</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.formats.map((item) => (
                        <tr
                          key={item.format_id}
                          className="cursor-pointer border-t border-line/70 hover:bg-raised/60"
                          onClick={() => setFormatId(item.format_id)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              checked={formatId === item.format_id}
                              onChange={() => setFormatId(item.format_id)}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono">{item.format_id}</td>
                          <td className="px-3 py-2">
                            {item.resolution || item.note || "—"}
                            {item.ext ? ` · ${item.ext}` : ""}
                          </td>
                          <td className="px-3 py-2 text-mute">
                            {item.vcodec || "—"} / {item.acodec || "—"}
                          </td>
                          <td className="px-3 py-2">{formatBytes(item.filesize)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {info.type === "playlist" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
                  节目单 · 已选 {selectedEntries.length}/{info.entries.length}
                </p>
                <div className="space-x-3 text-sm">
                  <button
                    type="button"
                    className="text-amber"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      for (const entry of info.entries) next[entry.url] = true;
                      setSelected(next);
                    }}
                  >
                    全选
                  </button>
                  <button type="button" className="text-mute" onClick={() => setSelected({})}>
                    清空
                  </button>
                </div>
              </div>
              <ul className="max-h-80 space-y-1 overflow-auto rounded-md border border-line p-2">
                {info.entries.map((entry, index) => (
                  <li key={entry.url}>
                    <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-raised/70">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[entry.url])}
                        onChange={(event) =>
                          setSelected((prev) => ({ ...prev, [entry.url]: event.target.checked }))
                        }
                      />
                      <span className="w-8 font-mono text-xs text-mute">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{entry.title || entry.url}</span>
                      <span className="font-mono text-xs text-mute">
                        {formatDuration(entry.duration)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={onSubmit}
              className="rounded-md bg-ok px-6 py-2.5 font-medium text-ink disabled:opacity-60"
            >
              {submitting ? "送入队列…" : info.type === "playlist" ? "批量落带" : "开始落带"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
