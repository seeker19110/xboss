"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { UserPlus, Trash2, KeyRound, Users, LogOut } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { appConfirm, appPrompt } from "@/app/components/dialogs";
import { fetchMe } from "@/app/lib/me";
import { ROLE_LABELS } from "@/lib/nen/roles";

type User = { id: number; name: string; email: string; role: string; createdAt: string };
const ROLE_LABEL: Record<string, string> = ROLE_LABELS;

export default function UsersPage() {
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "engineer" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((j) => setUsers(j.users ?? []));
  }, []);

  useEffect(() => {
    fetchMe().then((user) => {
      if (!user) return;
      setMe(user);
      if (user.role !== "admin") return;
      load();
    });
  }, [load]);

  function flash(msg: string) {
    setOkMsg(msg);
    setError("");
    setTimeout(() => setOkMsg(""), 3000);
  }
  async function handle(res: Response, okText: string) {
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error ?? "Lỗi không xác định");
      return false;
    }
    flash(okText);
    load();
    return true;
  }

  async function createUser() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (await handle(res, `Đã tạo ${form.email}`))
        setForm({ name: "", email: "", password: "", role: "engineer" });
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: User, role: string) {
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await handle(res, `Đã đổi vai trò ${u.email} → ${ROLE_LABEL[role]}`);
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  async function resetPassword(u: User) {
    const pw = await appPrompt(`Mật khẩu mới cho ${u.email} (≥ 6 ký tự)`);
    if (!pw) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      await handle(res, `Đã đặt lại mật khẩu cho ${u.email}`);
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  async function revokeSessions(u: User) {
    if (
      !(await appConfirm(
        `Thu hồi mọi phiên đăng nhập của ${u.email}? Người dùng sẽ bị đăng xuất trên mọi thiết bị và phải đăng nhập lại.`,
        { danger: true, confirmLabel: "Thu hồi" },
      ))
    )
      return;
    try {
      const res = await fetch(`/api/users/${u.id}/revoke-sessions`, { method: "POST" });
      await handle(res, `Đã thu hồi phiên đăng nhập của ${u.email}`);
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  async function removeUser(u: User) {
    if (!(await appConfirm(`Xoá người dùng ${u.email}?`, { danger: true, confirmLabel: "Xoá" })))
      return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      await handle(res, `Đã xoá ${u.email}`);
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  }

  if (me && me.role !== "admin") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">
          Chỉ Admin được truy cập trang này.{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            ← Về Dashboard
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        back
        title={
          <>
            <Users className="w-5 h-5 text-emerald-400" /> Quản lý người dùng
          </>
        }
      />

      <main className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950 text-red-200 px-4 py-2.5 text-xs sm:text-sm">
            {error}
          </div>
        )}
        {okMsg && (
          <div className="rounded-xl border border-emerald-800 bg-emerald-950 text-emerald-200 px-4 py-2.5 text-xs sm:text-sm">
            {okMsg}
          </div>
        )}

        {/* Tạo user */}
        <div className="bento-card p-5 space-y-4">
          <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-400" /> Thêm người dùng mới
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            <input
              placeholder="Họ tên"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-emerald-500 transition"
            />
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-emerald-500 transition"
            />
            <input
              placeholder="Mật khẩu (≥6)"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-emerald-500 transition"
            />
            <select
              aria-label="Vai trò tài khoản mới"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 outline-none focus:border-emerald-500 transition"
            >
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              onClick={createUser}
              disabled={busy || !form.name || !form.email || !form.password}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition shadow-sm h-10 md:h-auto"
            >
              {busy ? "Đang tạo..." : "Thêm mới"}
            </button>
          </div>
        </div>

        {/* Danh sách */}
        <div className="bento-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-zinc-400 border-b border-zinc-800">
                <th className="text-left p-3.5">Họ tên</th>
                <th className="text-left p-3.5">Email</th>
                <th className="text-left p-3.5">Vai trò</th>
                <th className="text-right p-3.5">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="p-3.5 font-medium text-zinc-200">
                    {u.name}
                    {me?.id === u.id && (
                      <span className="ml-2 text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
                        (bạn)
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-zinc-400 font-mono text-xs">{u.email}</td>
                  <td className="p-3.5">
                    <select
                      aria-label={`Vai trò của ${u.name}`}
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-emerald-500 transition"
                    >
                      {Object.entries(ROLE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => resetPassword(u)}
                        title="Đặt lại mật khẩu"
                        className="text-zinc-400 hover:text-amber-400 transition p-1.5"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => revokeSessions(u)}
                        title="Đăng xuất khỏi mọi thiết bị"
                        className="text-zinc-400 hover:text-amber-400 transition p-1.5"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                      {me?.id !== u.id && (
                        <button
                          onClick={() => removeUser(u)}
                          title="Xoá người dùng"
                          className="text-zinc-400 hover:text-rose-400 transition p-1.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-400">
          Không thể xoá / hạ cấp Admin cuối cùng. Người dùng tự đổi mật khẩu tại{" "}
          <a href="/password" className="text-emerald-400 underline">
            /password
          </a>
          .
        </p>
      </main>
    </div>
  );
}
