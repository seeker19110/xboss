'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Upload, LayoutGrid, ChevronRight, FileDown, Printer, LogOut } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SHEET_SLUGS, slugFromCode } from '@/lib/sheets';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

type DelayedTask = {
  id: number; name: string; status: string;
  startDate: string; endDate: string;
  progressPercent: number; floorLabel: string; sheetType: string;
};
type KPI = { sheetType: string; total: number; avgProgress: number; delayed: number };
type Me = { id: number; name: string; email: string; role: string };

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', pm: 'PM', engineer: 'Kỹ sư', subcon: 'Thầu phụ' };

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('vi-VN');
}

export default function Dashboard() {
  const [data, setData] = useState<{ delayedTasks: DelayedTask[]; kpi: KPI[]; totalDelayed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetFilter, setSheetFilter] = useState('');
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      setMe(j.user);
      const d = await fetch('/api/dashboard').then(r => r.json());
      setData(d);
    }).finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Đang tải...</div>;

  const canImport = me?.role === 'admin' || me?.role === 'pm';

  const chartData = (data?.kpi ?? []).map(k => ({
    name: k.sheetType, value: Math.round((k.avgProgress ?? 0) * 100), delayed: k.delayed,
  }));
  const delayed = (data?.delayedTasks ?? []).filter(t => !sheetFilter || t.sheetType === sheetFilter);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">🏗️ XBoss</h1>
          <p className="text-xs text-zinc-500">AVIO Tháp A — ACMV Tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {canImport && (
            <a href="/api/export/excel" className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition">
              <FileDown className="w-4 h-4" /> Excel
            </a>
          )}
          <a href="/report" className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition">
            <Printer className="w-4 h-4" /> PDF
          </a>
          {canImport && (
            <a href="/import" className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition">
              <Upload className="w-4 h-4" /> Import Excel
            </a>
          )}
          {me && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-zinc-800">
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">{me.name}</p>
                <p className="text-xs text-emerald-400 leading-tight">{ROLE_LABEL[me.role] ?? me.role}</p>
              </div>
              <button onClick={logout} title="Đăng xuất" className="text-zinc-400 hover:text-red-400"><LogOut className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </header>

      <main className="p-6">
        {/* Nav vào các sheet tracking */}
        <div className="flex flex-wrap gap-2 mb-6">
          {SHEET_SLUGS.map(s => (
            <a key={s.slug} href={`/tracking/${s.slug}`}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm transition">
              <LayoutGrid className="w-4 h-4 text-emerald-400" /> {s.code}
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
            </a>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 uppercase">Tổng trễ</span>
            </div>
            <p className="text-3xl font-bold text-red-300">{data?.totalDelayed ?? 0}</p>
          </div>
          {data?.kpi.map(k => {
            const slug = slugFromCode(k.sheetType);
            const inner = (
              <>
                <p className="text-xs text-zinc-400 uppercase mb-1 truncate">{k.sheetType}</p>
                <p className="text-2xl font-bold">{Math.round((k.avgProgress ?? 0) * 100)}%</p>
                <p className="text-xs text-zinc-500 mt-1">{k.delayed} trễ / {k.total}</p>
                <div className="mt-2 bg-zinc-800 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(k.avgProgress ?? 0) * 100}%` }} />
                </div>
              </>
            );
            return slug
              ? <a key={k.sheetType} href={`/tracking/${slug}`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 transition">{inner}</a>
              : <div key={k.sheetType} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">{inner}</div>;
          })}
        </div>

        {/* Bar chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
          <h2 className="font-semibold mb-4 text-sm text-zinc-300">% Tiến độ trung bình theo Sheet</h2>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#fff' }} formatter={(v) => [`${v}%`, 'Tiến độ']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.delayed > 0 ? '#f59e0b' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bảng trễ */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800 flex flex-wrap gap-3 justify-between items-center">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-400" /> Danh sách công việc đang trễ
            </h2>
            <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none">
              <option value="">Tất cả sheet</option>
              {data?.kpi.map(k => <option key={k.sheetType} value={k.sheetType}>{k.sheetType}</option>)}
            </select>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">CHI TIẾT</th>
                  <th className="text-left p-3">TẦNG</th>
                  <th className="text-left p-3">KẾT THÚC</th>
                  <th className="text-left p-3">% TIẾN ĐỘ</th>
                  <th className="text-left p-3">SHEET</th>
                  <th className="text-left p-3">TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody>
                {delayed.map(t => (
                  <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/50">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3 text-zinc-400">{t.floorLabel || '—'}</td>
                    <td className="p-3 text-red-400">{fmtDate(t.endDate)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-zinc-800 rounded-full h-1.5 w-16"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(t.progressPercent ?? 0) * 100}%` }} /></div>
                        <span>{Math.round((t.progressPercent ?? 0) * 100)}%</span>
                      </div>
                    </td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-zinc-800 rounded text-xs">{t.sheetType}</span></td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-red-950 text-red-400 rounded text-xs">{STATUS_LABEL[t.status] ?? 'Đang trễ'}</span></td>
                  </tr>
                ))}
                {delayed.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-zinc-500">Không có công việc trễ. Hãy import file Excel nếu chưa có dữ liệu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
