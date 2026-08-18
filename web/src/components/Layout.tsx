import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";

const links = [
  { to: "/", label: "工作台" },
  { to: "/tasks", label: "任务带" },
  { to: "/settings", label: "机柜" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line/70 bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-paper">落带</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-mute">
              ingest
            </span>
          </div>
          <nav className="flex gap-1 text-sm">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  [
                    "rounded-full px-3 py-1.5 transition",
                    isActive ? "bg-amber text-ink" : "text-mute hover:text-paper",
                  ].join(" ")
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-mute">
            <span className="font-mono">{user?.username}</span>
            {user?.role === "admin" && (
              <span className="rounded border border-amber/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber">
                admin
              </span>
            )}
            <button type="button" className="hover:text-paper" onClick={logout}>
              退出
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-line/60 px-4 py-4 text-center text-xs text-mute">
        仅用于下载你有权获取的内容。落带通过本机 yt-dlp 工作，不提供任何绕过版权保护的能力。
      </footer>
    </div>
  );
}
