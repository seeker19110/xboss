'use client';
import { useState } from 'react';
import { LogIn } from 'lucide-react';

const DEMO = [
  { role: 'Admin', email: 'admin@xboss.vn', pw: 'admin123' },
  { role: 'PM', email: 'pm@xboss.vn', pw: 'pm123' },
  { role: 'Engineer', email: 'engineer@xboss.vn', pw: 'eng123' },
  { role: 'Sub-con', email: 'subcon@xboss.vn', pw: 'sub123' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('admin@xboss.vn');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) { window.location.href = '/'; }
    else { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Đăng nhập thất bại'); setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">🏗️ XBoss</h1>
          <p className="text-sm text-zinc-500">AVIO Tháp A — ACMV Tracking</p>
        </div>
        <form onSubmit={submit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="text-xs text-zinc-400">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600" />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Mật khẩu</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={busy} type="submit"
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 py-2.5 rounded-lg font-medium transition">
            <LogIn className="w-4 h-4" /> {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
        <div className="mt-4 text-xs text-zinc-500">
          <p className="mb-1">Tài khoản demo (bấm để điền):</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map(d => (
              <button key={d.email} onClick={() => { setEmail(d.email); setPassword(d.pw); }}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 hover:border-emerald-700">
                <span className="text-emerald-400">{d.role}</span><br />{d.email}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
