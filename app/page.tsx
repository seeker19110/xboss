'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Upload, LayoutGrid, ChevronRight, FileDown, Printer, LogOut, Users, KeyRound, Package, CalendarRange, ClipboardList, CalendarClock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SHEET_SLUGS, slugFromCode } from '@/lib/sheets';
import NotificationBell from '@/app/components/NotificationBell';
import FloorHeatmap from '@/app/components/FloorHeatmap';
import ForecastCards from '@/app/components/ForecastCards';
import SCurveChart from '@/app/components/SCurveChart';
import { DELAY_REASON_LABEL } from '@/lib/delay';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

type DelayedTask = {
  id: number; name: string; status: string;
  startDate: string; endDate: string;
  progressPercent: number; floorLabel: string; sheetType: string;
  delayReason: string | null; delayNote: string | null;
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
  const [floorFilter, setFloorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState(''); // slug | '__none' (chưa gán) | ''
  const [me, setMe] = useState<Me | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/project').then(r => r.ok ? r.json() : null).then(j => setProjectName(j?.name ?? null));
  }, []);

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
  const floors = [...new Set((data?.delayedTasks ?? []).map(t => t.floorLabel).filter(Boolean))]
    .sort((a, b) => parseInt(a) - parseInt(b));
  const statuses = [...new Set((data?.delayedTasks ?? []).map(t => t.status).filter(Boolean))];
  const delayed = (data?.delayedTasks ?? []).filter(t =>
    (!sheetFilter || t.sheetType === sheetFilter)
    && (!floorFilter || t.floorLabel === floorFilter)
    && (!statusFilter || t.status === statusFilter)
    && (!reasonFilter || (reasonFilter === '__none' ? !t.delayReason : t.delayReason === reasonFilter)));

  // Pareto nguyên nhân trễ (trên toàn bộ task trễ, không theo filter bảng).
  const allDelayed = data?.delayedTasks ?? [];
  const reasonCounts = Object.keys(DELAY_REASON_LABEL)
    .map(slug => ({ slug, label: DELAY_REASON_LABEL[slug as keyof typeof DELAY_REASON_LABEL], count: allDelayed.filter(t => t.delayReason === slug).length }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const noReason = allDelayed.filter(t => !t.delayReason).length;
  const maxReason = Math.max(1, ...reasonCounts.map(r => r.count), noReason);

  async function setReason(taskId: number, reason: string) {
    const res = await fetch(`/api/tasks/${taskId}/delay-reason`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || null }),
    });
    if (!res.ok) return;
    setData(d => d && ({
      ...d, delayedTasks: d.delayedTasks.map(t => t.id === taskId ? { ...t, delayReason: reason || null } : t),
    }));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">🏗️ XBoss</h1>
          <p className="text-xs text-zinc-500">{projectName ?? 'Quản lý tiến độ thi công MEP'}</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
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
              {me.role === 'admin' && (
                <a href="/users" title="Quản lý người dùng" className="text-zinc-400 hover:text-emerald-400"><Users className="w-4 h-4" /></a>
              )}
              <a href="/password" title="Đổi mật khẩu" className="text-zinc-400 hover:text-amber-400"><KeyRound className="w-4 h-4" /></a>
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
          <a href="/my-tasks"
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm transition">
            <ClipboardList className="w-4 h-4 text-violet-400" /> Việc của tôi
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          </a>
          <a href="/materials"
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm transition">
            <Package className="w-4 h-4 text-sky-400" /> Vật tư
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          </a>
          <a href="/gantt"
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm transition">
            <CalendarRange className="w-4 h-4 text-amber-400" /> Gantt
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          </a>
          <a href="/lookahead"
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm transition">
            <CalendarClock className="w-4 h-4 text-rose-400" /> Kế hoạch 2 tuần
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          </a>
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

        {/* Heatmap tầng × sheet */}
        <FloorHeatmap />

        {/* Dự báo hoàn thành */}
        <ForecastCards />

        {/* S-curve kế hoạch vs thực tế */}
        <SCurveChart />

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

        {/* Pareto nguyên nhân trễ */}
        {allDelayed.length > 0 && (reasonCounts.length > 0 || noReason > 0) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
            <h2 className="font-semibold mb-1 text-sm text-zinc-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Nguyên nhân trễ (Pareto)
            </h2>
            <p className="text-xs text-zinc-600 mb-3">Gán lý do trên lưới tracking hoặc bảng dưới · bấm thanh để lọc bảng trễ theo lý do</p>
            <div className="space-y-1.5">
              {reasonCounts.map(r => (
                <button key={r.slug} onClick={() => setReasonFilter(f => f === r.slug ? '' : r.slug)}
                  className={`w-full flex items-center gap-2 group ${reasonFilter === r.slug ? 'opacity-100' : reasonFilter ? 'opacity-40' : ''}`}>
                  <span className="text-xs text-zinc-400 w-28 text-right shrink-0">{r.label}</span>
                  <span className="flex-1 bg-zinc-800/60 rounded h-5 overflow-hidden">
                    <span className="block h-full bg-amber-600/80 group-hover:bg-amber-500 rounded transition-all"
                      style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </span>
                  <span className="text-xs text-zinc-300 w-16 text-left shrink-0">{r.count} ({Math.round((r.count / allDelayed.length) * 100)}%)</span>
                </button>
              ))}
              {noReason > 0 && (
                <button onClick={() => setReasonFilter(f => f === '__none' ? '' : '__none')}
                  className={`w-full flex items-center gap-2 group ${reasonFilter === '__none' ? 'opacity-100' : reasonFilter ? 'opacity-40' : ''}`}>
                  <span className="text-xs text-zinc-500 w-28 text-right shrink-0">Chưa gán lý do</span>
                  <span className="flex-1 bg-zinc-800/60 rounded h-5 overflow-hidden">
                    <span className="block h-full bg-zinc-600 group-hover:bg-zinc-500 rounded transition-all"
                      style={{ width: `${(noReason / maxReason) * 100}%` }} />
                  </span>
                  <span className="text-xs text-zinc-500 w-16 text-left shrink-0">{noReason} ({Math.round((noReason / allDelayed.length) * 100)}%)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bảng trễ */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-4 border-b border-zinc-800 flex flex-wrap gap-3 justify-between items-center">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-400" /> Danh sách công việc đang trễ
            </h2>
            <div className="flex flex-wrap gap-2">
              <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none">
                <option value="">Tất cả sheet</option>
                {data?.kpi.map(k => <option key={k.sheetType} value={k.sheetType}>{k.sheetType}</option>)}
              </select>
              <select value={floorFilter} onChange={e => setFloorFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none">
                <option value="">Tất cả tầng</option>
                {floors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none">
                <option value="">Tất cả trạng thái</option>
                {statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
              </select>
            </div>
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
                  <th className="text-left p-3">NGUYÊN NHÂN</th>
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
                    <td className="p-3" title={t.delayNote ?? undefined}>
                      {me && me.role !== 'subcon' ? (
                        <select value={t.delayReason ?? ''} onChange={e => setReason(t.id, e.target.value)}
                          className={`text-xs rounded px-1.5 py-1 outline-none border max-w-[130px] ${t.delayReason
                            ? 'bg-amber-950/60 border-amber-900 text-amber-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
                          <option value="">— Chưa gán —</option>
                          {Object.entries(DELAY_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-zinc-400">{t.delayReason ? DELAY_REASON_LABEL[t.delayReason as keyof typeof DELAY_REASON_LABEL] : '—'}</span>
                      )}
                    </td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-red-950 text-red-400 rounded text-xs">{STATUS_LABEL[t.status] ?? 'Đang trễ'}</span></td>
                  </tr>
                ))}
                {delayed.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-zinc-500">Không có công việc trễ. Hãy import file Excel nếu chưa có dữ liệu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
