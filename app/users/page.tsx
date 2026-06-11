'use client';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, UserPlus, Trash2, KeyRound, Users } from 'lucide-react';

type User = { id: number; name: string; email: string; role: string; createdAt: string };
const ROLE_LABEL: Record<string, string> = { admin: 'Admin', pm: 'PM', engineer: 'Kỹ sư', subcon: 'Thầu phụ' };

export default function UsersPage() {
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'engineer' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/users').then(r => r.json()).then(j => setUsers(j.users ?? []));
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      setMe(j.user);
      if (j.user?.role !== 'admin') return;
      load();
    });
  }, [load]);

  function flash(msg: string) { setOkMsg(msg); setError(''); setTimeout(() => setOkMsg(''), 3000); }
  async function handle(res: Response, okText: string) {
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Lỗi không xác định'); return false; }
    flash(okText); load(); return true;
  }

  async function createUser() {
    setBusy(true); setError('');
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    if (await handle(res, `Đã tạo ${form.email}`)) setForm({ name: '', email: '', password: '', role: 'engineer' });
    setBusy(false);
  }

  async function changeRole(u: User, role: string) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
    });
    await handle(res, `Đã đổi vai trò ${u.email} → ${ROLE_LABEL[role]}`);
  }

  async function resetPassword(u: User) {
    const pw = window.prompt(`Mật khẩu mới cho ${u.email} (≥ 6 ký tự):`);
    if (!pw) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }),
    });
    await handle(res, `Đã đặt lại mật khẩu cho ${u.email}`);
  }

  async function removeUser(u: User) {
    if (!window.confirm(`Xoá người dùng ${u.email}?`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    await handle(res, `Đã xoá ${u.email}`);
  }

  if (me && me.role !== 'admin') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Chỉ Admin được truy cập trang này. <a href="/" className="text-emerald-400 hover:underline">← Về Dashboard</a></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <a href="/" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></a>
        <h1 className="text-lg font-bold flex items-center gap-2"><Users className="w-5 h-5" /> Quản lý người dùng</h1>
      </header>

      <main className="p-6 max-w-3xl mx-auto space-y-6">
        {error && <div className="rounded-lg border border-red-800 bg-red-950/40 text-red-300 px-4 py-2.5 text-sm">{error}</div>}
        {okMsg && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 text-emerald-300 px-4 py-2.5 text-sm">{okMsg}</div>}

        {/* Tạo user */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2 text-sm"><UserPlus className="w-4 h-4 text-emerald-400" /> Thêm người dùng</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input placeholder="Họ tên" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600" />
            <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600" />
            <input placeholder="Mật khẩu (≥6)" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600" />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none">
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={createUser} disabled={busy || !form.name || !form.email || !form.password}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg px-3 py-2 text-sm font-medium transition">
              {busy ? 'Đang tạo...' : 'Tạo'}
            </button>
          </div>
        </div>

        {/* Danh sách */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="text-left p-3">Họ tên</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Vai trò</th>
                <th className="text-right p-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40">
                  <td className="p-3 font-medium">{u.name}{me?.id === u.id && <span className="ml-2 text-[10px] text-emerald-400">(bạn)</span>}</td>
                  <td className="p-3 text-zinc-400">{u.email}</td>
                  <td className="p-3">
                    <select value={u.role} onChange={e => changeRole(u, e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs outline-none">
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => resetPassword(u)} title="Đặt lại mật khẩu"
                      className="text-zinc-400 hover:text-amber-400 p-1.5"><KeyRound className="w-4 h-4" /></button>
                    <button onClick={() => removeUser(u)} title="Xoá" disabled={me?.id === u.id}
                      className="text-zinc-400 hover:text-red-400 disabled:opacity-30 p-1.5"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-zinc-600">Không thể xoá / hạ cấp Admin cuối cùng. Người dùng tự đổi mật khẩu tại <a href="/password" className="text-emerald-400 hover:underline">/password</a>.</p>
      </main>
    </div>
  );
}
