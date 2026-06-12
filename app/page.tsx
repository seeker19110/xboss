'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Upload, LayoutGrid, ChevronRight, FileDown, Printer, Plus, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { slugFromCode, toSlug } from '@/lib/sheets';
import AppHeader from '@/app/components/AppHeader';
import FloorHeatmap from '@/app/components/FloorHeatmap';
import ForecastCards from '@/app/components/ForecastCards';
import SCurveChart from '@/app/components/SCurveChart';
import { Modal } from '@/app/components/dialogs';
import { PageSkeleton } from '@/app/components/Skeleton';
import { DELAY_REASON_LABEL } from '@/lib/delay';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

type DelayedTask = {
  id: number; name: string; status: string;
  startDate: string; endDate: string;
  progressPercent: number; floorLabel: string; sheetType: string; sheetSlug: string | null;
  delayReason: string | null; delayNote: string | null;
};
type KPI = { sheetType: string; sheetSlug: string | null; total: number; avgProgress: number; delayed: number };
type SheetNav = { id: number; code: string; name: string; slug: string };
type Me = { id: number; name: string; email: string; role: string };

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
  const [sheets, setSheets] = useState<SheetNav[]>([]);
  const [newSheet, setNewSheet] = useState<{ name: string; slug: string; code: string; copyFromId: number | '' } | null>(null);
  const [newSheetErr, setNewSheetErr] = useState('');
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
      const sh = await fetch('/api/sheets').then(r => r.ok ? r.json() : null);
      setSheets(sh?.sheets ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton />;

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

  // Link tới sheet tracking + filter tầng — cùng logic với GlobalSearch.
  const trackingUrl = (t: DelayedTask) => {
    const slug = t.sheetSlug ?? slugFromCode(t.sheetType);
    return slug ? `/tracking/${slug}${t.floorLabel ? `?floor=${encodeURIComponent(t.floorLabel)}` : ''}` : null;
  };

  async function createSheet() {
    if (!newSheet?.name.trim()) return;
    const res = await fetch('/api/sheets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSheet.name.trim(), code: newSheet.code.trim() || undefined, slug: newSheet.slug.trim() || undefined, copyFromId: newSheet.copyFromId || undefined }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { setNewSheetErr(j?.error ?? 'Không tạo được trang'); return; }
    window.location.href = `/tracking/${j.sheet.slug}`;
  }

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
      <AppHeader title="🏗️ XBoss" subtitle={projectName ?? 'Quản lý tiến độ thi công MEP'}>
        {canImport && (
          <a href="/api/export/excel" className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition">
            <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Excel</span>
          </a>
        )}
        <a href="/report" className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition">
          <Printer className="w-4 h-4" /> <span className="hidden sm:inline">PDF</span>
        </a>
        {canImport && (
          <a href="/import" className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition">
            <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Import Excel</span>
          </a>
        )}
      </AppHeader>

      <main className="p-4 sm:p-6">

        {/* KPI Cards — cuộn ngang, không xuống hàng */}
        <div className="overflow-x-auto mb-4">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 w-40 shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-400 uppercase">Tổng trễ</span>
              </div>
              <p className="text-3xl font-bold text-red-300">{data?.totalDelayed ?? 0}</p>
            </div>
            {data?.kpi.map(k => {
              const slug = k.sheetSlug ?? slugFromCode(k.sheetType);
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
                ? <a key={k.sheetType} href={`/tracking/${slug}`} className="bg-zinc-900 border border-zinc-800 hover:border-emerald-700 rounded-xl p-4 w-40 shrink-0 transition">{inner}</a>
                : <div key={k.sheetType} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-40 shrink-0">{inner}</div>;
            })}
          </div>
        </div>

        {/* Nút thêm trang tracking — card lớn toàn chiều rộng */}
        {canImport && (
          <button onClick={() => { setNewSheetErr(''); setNewSheet({ name: '', slug: '', code: '', copyFromId: sheets[sheets.length - 1]?.id ?? '' }); }}
            className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-emerald-600 rounded-xl p-5 text-zinc-400 hover:text-emerald-400 transition mb-8">
            <Plus className="w-5 h-5" />
            <span className="text-sm font-medium">Thêm trang tracking</span>
          </button>
        )}

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
            <p className="text-xs text-zinc-400 mb-3">Gán lý do trên lưới tracking hoặc bảng dưới · bấm thanh để lọc bảng trễ theo lý do</p>
            <div className="space-y-1.5">
              {reasonCounts.map(r => (
                <button key={r.slug} onClick={() => setReasonFilter(f => f === r.slug ? '' : r.slug)}
                  className={`w-full flex items-center gap-2 group ${reasonFilter === r.slug ? 'opacity-100' : reasonFilter ? 'opacity-40' : ''}`}>
                  <span className="text-xs text-zinc-400 w-20 sm:w-28 text-right shrink-0 truncate" title={r.label}>{r.label}</span>
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
                  <span className="text-xs text-zinc-400 w-20 sm:w-28 text-right shrink-0">Chưa gán lý do</span>
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
              <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)} aria-label="Lọc theo sheet"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none">
                <option value="">Tất cả sheet</option>
                {data?.kpi.map(k => <option key={k.sheetType} value={k.sheetType}>{k.sheetType}</option>)}
              </select>
              <select value={floorFilter} onChange={e => setFloorFilter(e.target.value)} aria-label="Lọc theo tầng"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none">
                <option value="">Tất cả tầng</option>
                {floors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Lọc theo trạng thái"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none">
                <option value="">Tất cả trạng thái</option>
                {statuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[700px]">
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
                {delayed.map(t => {
                  const url = trackingUrl(t);
                  return (
                  <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/50">
                    <td className="p-3 font-medium">
                      {url ? (
                        <a href={url} title="Mở trên lưới tracking" className="hover:text-emerald-400 group">
                          {t.name} <ExternalLink className="w-3 h-3 inline text-zinc-600 group-hover:text-emerald-400" />
                        </a>
                      ) : t.name}
                    </td>
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
                        <select value={t.delayReason ?? ''} onChange={e => setReason(t.id, e.target.value)} aria-label="Nguyên nhân trễ"
                          className={`text-xs rounded px-1.5 py-1 outline-none border w-full max-w-[160px] ${t.delayReason
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
                  );
                })}
                {delayed.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-zinc-500">Không có công việc trễ. Hãy import file Excel nếu chưa có dữ liệu.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal tạo trang tracking mới */}
      {newSheet && (
        <Modal onClose={() => setNewSheet(null)}>
          <div className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-400" /> Thêm trang tracking</h3>
            <label className="block text-xs text-zinc-400 mb-1">Tên trang</label>
            <input autoFocus value={newSheet.name}
              onChange={e => setNewSheet(ns => ns && ({ ...ns, name: e.target.value, slug: toSlug(e.target.value), code: e.target.value }))}
              placeholder="VD: Ống nước cấp Zone 3"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600" />
            <label className="block text-xs text-zinc-400 mb-1">Mã sheet (hiển thị trên Dashboard/Excel)</label>
            <input value={newSheet.code}
              onChange={e => setNewSheet(ns => ns && ({ ...ns, code: e.target.value }))}
              placeholder="VD: ONC Z3"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600" />
            <label className="block text-xs text-zinc-400 mb-1">Đường dẫn</label>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm text-zinc-500">/tracking/</span>
              <input value={newSheet.slug}
                onChange={e => setNewSheet(ns => ns && ({ ...ns, slug: e.target.value }))}
                placeholder="ong-nuoc-cap-zone-3"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 font-mono" />
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">Chỉ dùng chữ thường a-z, số và gạch nối. Tự sinh từ tên, sửa được.</p>
            <label className="block text-xs text-zinc-400 mb-1">Sao chép cấu trúc từ</label>
            <select value={newSheet.copyFromId}
              onChange={e => setNewSheet(ns => ns && ({ ...ns, copyFromId: e.target.value ? Number(e.target.value) : '' }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-emerald-600">
              <option value="">— Trang trống —</option>
              {sheets.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
            <p className="text-[11px] text-zinc-500 mb-3">Copy nguyên nhóm, công việc và cột checkbox của trang nguồn — tiến độ reset về 0, BOQCODE không copy.</p>
            {newSheetErr && <p className="text-xs text-red-400 mb-2">{newSheetErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewSheet(null)} className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg">Huỷ</button>
              <button onClick={createSheet} disabled={!newSheet.name.trim()}
                className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg font-medium">Tạo trang</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
