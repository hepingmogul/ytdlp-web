import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { AuthShell, Field } from "./Login";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await register(username, password, invite);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="开户" subtitle="首个用户无需邀请码，之后由管理员发放">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="用户名" value={username} onChange={setUsername} autoComplete="username" />
        <Field
          label="密码（至少 8 位）"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <Field label="邀请码（首个账号可空）" value={invite} onChange={setInvite} />
        {error && <p className="text-sm text-signal">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-amber py-2.5 font-medium text-ink disabled:opacity-60"
        >
          {pending ? "开户中…" : "注册并进入"}
        </button>
      </form>
      <p className="mt-6 text-sm text-mute">
        已有账号？{" "}
        <Link className="text-amber" to="/login">
          登录
        </Link>
      </p>
    </AuthShell>
  );
}
