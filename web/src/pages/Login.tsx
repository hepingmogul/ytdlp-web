import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="接入" subtitle="用账号打开下载工作站">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="用户名" value={username} onChange={setUsername} autoComplete="username" />
        <Field
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-signal">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-amber py-2.5 font-medium text-ink disabled:opacity-60"
        >
          {pending ? "接通中…" : "登录"}
        </button>
      </form>
      <p className="mt-6 text-sm text-mute">
        还没有账号？{" "}
        <Link className="text-amber" to="/register">
          注册
        </Link>
        。第一个账号会自动成为管理员。
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-inset">
        <p className="font-display text-3xl font-bold">落带</p>
        <h1 className="mt-6 font-display text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-mute">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-line bg-ink px-3 py-2 text-paper outline-none ring-amber/40 focus:ring-2"
      />
    </label>
  );
}
