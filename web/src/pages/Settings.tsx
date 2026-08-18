import { useEffect, useState, type FormEvent } from "react";
import { adminApi, settingsApi } from "../api/client";
import type { InviteItem, SettingsInfo } from "../api/types";
import { formatBytes } from "../lib/format";
import { useAuth } from "../store/auth";

export function SettingsPage() {
  const { user } = useAuth();
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [proxy, setProxy] = useState("");
  const [format, setFormat] = useState("bv*+ba/b");
  const [concurrent, setConcurrent] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invites, setInvites] = useState<InviteItem[]>([]);

  async function load() {
    const data = await settingsApi.get();
    setInfo(data);
    setProxy(data.proxy || "");
    setFormat(data.default_format);
    setConcurrent(data.max_concurrent);
    if (user?.role === "admin") {
      setInvites(await adminApi.invites());
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "加载失败"));
  }, [user?.role]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await settingsApi.update({
        proxy: proxy.trim() || null,
        default_format: format,
        max_concurrent: concurrent,
      });
      setInfo(data);
      setMessage("设置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function onCookies(file: File | null) {
    if (!file) return;
    setError("");
    try {
      await settingsApi.uploadCookies(file);
      await load();
      setMessage("cookies 已上传");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    }
  }

  async function onDeleteCookies() {
    await settingsApi.deleteCookies();
    await load();
    setMessage("cookies 已清除");
  }

  async function onInvite() {
    const created = await adminApi.createInvite();
    setInvites((prev) => [created, ...prev]);
  }

  const usedRatio = info ? Math.min(100, (info.disk_used_bytes / Math.max(info.disk_quota_bytes, 1)) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-amber">Rack</p>
        <h1 className="mt-1 font-display text-3xl">机柜</h1>
      </div>

      {error && <p className="text-sm text-signal">{error}</p>}
      {message && <p className="text-sm text-ok">{message}</p>}

      <form onSubmit={onSave} className="space-y-5 rounded-2xl border border-line bg-panel p-5">
        <label className="block space-y-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
            代理（http / socks5）
          </span>
          <input
            value={proxy}
            onChange={(event) => setProxy(event.target.value)}
            placeholder="http://127.0.0.1:7890"
            className="w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
            默认格式表达式
          </span>
          <input
            value={format}
            onChange={(event) => setFormat(event.target.value)}
            className="w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
            我的并发
          </span>
          <input
            type="number"
            min={1}
            max={3}
            value={concurrent}
            onChange={(event) => setConcurrent(Number(event.target.value))}
            className="w-32 rounded-md border border-line bg-ink px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-md bg-amber px-5 py-2 text-ink">
          保存
        </button>
      </form>

      <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Cookies</h2>
        <p className="text-sm text-mute">
          上传浏览器导出的 Netscape cookies.txt，用于需要登录的站点。文件只保存在本机数据目录，接口不会回读内容。
        </p>
        <p className="text-sm">{info?.has_cookies ? "已配置 cookies" : "尚未上传 cookies"}</p>
        <div className="flex flex-wrap gap-3">
          <label className="cursor-pointer rounded-md bg-raised px-4 py-2 text-sm">
            选择 cookies.txt
            <input
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(event) => onCookies(event.target.files?.[0] || null)}
            />
          </label>
          {info?.has_cookies && (
            <button type="button" className="text-sm text-signal" onClick={onDeleteCookies}>
              清除
            </button>
          )}
        </div>
      </section>

      {info && (
        <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <h2 className="font-display text-xl">磁盘配额</h2>
          <div className="h-2 overflow-hidden rounded-sm bg-ink">
            <div className="h-full bg-amber" style={{ width: `${usedRatio}%` }} />
          </div>
          <p className="font-mono text-sm text-mute">
            {formatBytes(info.disk_used_bytes)} / {formatBytes(info.disk_quota_bytes)}
          </p>
        </section>
      )}

      {user?.role === "admin" && (
        <section className="space-y-3 rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">邀请码</h2>
            <button type="button" className="rounded-md bg-ok px-4 py-1.5 text-sm text-ink" onClick={onInvite}>
              签发
            </button>
          </div>
          <ul className="space-y-2">
            {invites.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md bg-ink px-3 py-2 font-mono text-sm"
              >
                <span>{item.code}</span>
                <span className="text-mute">{item.used_by ? "已使用" : "未使用"}</span>
              </li>
            ))}
            {invites.length === 0 && <p className="text-sm text-mute">还没有邀请码。</p>}
          </ul>
        </section>
      )}
    </div>
  );
}
