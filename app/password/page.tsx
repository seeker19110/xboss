'use client';
import { useState } from 'react';
import { ArrowLeft, KeyRound } from 'lucide-react';

export default function PasswordPage() {
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) { setMsg({ ok: false, text: 'Xác nhận mật khẩu không khớp' }); return; }
    setBusy(true); setMsg(null);
    const res = await fetch('/api/auth/password', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: 'Đã đổi mật khẩu thành công' } : { ok: false, text: j.error ?? 'Lỗi không xác định' });
    if (res.ok) { setOld(''); setNew(''); setConfirm(''); }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <a href="/" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></a>
        <h1 className="text-lg font-bold flex items-center gap-2"><KeyRound className="w-5 h-5" /> Đổi mật khẩu</h1>
      </header>

      <main className="p-6 max-w-sm mx-auto">
        <form onSubmit={submit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <input type="password" placeholder="Mật khẩu hiện tại" value={oldPassword} onChange={e => setOld(e.target.value)} required
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
          <input type="password" placeholder="Mật khẩu mới (≥ 6 ký tự)" value={newPassword} onChange={e => setNew(e.target.value)} required minLength={6}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
          <input type="password" placeholder="Nhập lại mật khẩu mới" value={confirm} onChange={e => setConfirm(e.target.value)} required
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
          {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>}
          <button type="submit" disabled={busy}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 py-2.5 rounded-lg font-medium text-sm transition">
            {busy ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </button>
        </form>
      </main>
    </div>
  );
}
