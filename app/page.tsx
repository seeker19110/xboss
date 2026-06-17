'use client';
import { useEffect, useState } from 'react';
import {
  AlertTriangle, Clock, Upload, ChevronRight,
  FileDown, Printer, Plus, ExternalLink, Trash2, TrendingDown,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { slugFromCode, toSlug } from '@/lib/sheets';
import AppHeader from '@/app/components/AppHeader';
import FloorHeatmap from '@/app/components/FloorHeatmap';
import ForecastCards from '@/app/components/ForecastCards';
import SpiCards from '@/app/components/SpiCards';
import BlockedPanel from '@/app/components/BlockedPanel';
import SCurveChart from '@/app/components/SCurveChart';
import { Modal } from '@/app/components/dialogs';
import { PageSkeleton } from '@/app/components/Skeleton';
import EditableText from '@/app/components/EditableText';
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
type KPI = { sheetId: number; sheetType: string; sheetSlug: string | null; total: number; avgProgress: number; delayed: number };
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
  const [reasonFilter, setReasonFilter] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [sheets, setSheets] = useState<SheetNav[]>([]);
  const [newSheet, setNewSheet] = useState<{ name: string; slug: string; code: string; copyFromId: number | '' } | null>(null);
  const [newSheetErr, setNewSheetErr] = useState('');
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/project').then(r => r.ok ? r.json() : null),
      fetch('/api/auth/me').then(r => { if (r.status === 401) window.location.href = '/login'; return r.ok ? r.json() : null; }),
      fetch('/api/dashboard').then(r => r.ok ? r.json() : null),
      fetch('/api/sheets').then(r => r.ok ? r.json() : null),
    ]).then(([proj, meData, dash, sh]) => {
      if (!meData) return;
      setProjectName(proj?.name ?? null);
      setMe(meData.user);
      setData(dash);
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

  const allDelayed = data?.delayedTasks ?? [];
  const reasonCounts = Object.keys(DELAY_REASON_LABEL)
    .map(slug => ({ slug, label: DELAY_REASON_LABEL[slug as keyof typeof DELAY_REASON_LABEL], count: allDelayed.filter(t => t.delayReason === slug).length }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const noReason = allDelayed.filter(t => !t.delayReason).length;
  const maxReason = Math.max(1, ...reasonCounts.map(r => r.count), noReason);

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

  async function deleteSheet(sheetId: number, sheetName: string) {
    if (!confirm(`Xoá trang "${sheetName}"?\n\nToàn bộ nhóm, công việc, tiến độ và vật tư của trang này sẽ bị xoá vĩnh viễn. Thao tác không thể hoàn tác.`)) return;
    const res = await fetch(`/api/sheets/${sheetId}`, { method: 'DELETE' });
    if (!res.ok) { alert((await res.json().catch(() => null))?.error ?? 'Xoá thất bại'); return; }
    window.location.reload();
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
          <a href="/api/export/excel"
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition">
            <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Excel</span>
          </a>
        )}
        <a href="/report"
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition">
          <Printer className="w-4 h-4" /> <span className="hidden sm:inline">PDF</span>
        </a>
        {canImport && (
          <a href="/import"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Import Excel</span>
          </a>
        )}
      </AppHeader>

      <main className="px-4 sm:px-6 py-6 space-y-6 max-w-screen-xl mx-auto">

        {/* ── KPI ── */}
        <section>
          {/* Tổng trễ — banner nổi bật */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Tổng quan tiến độ</h2>
            {canImport && (
              <button
                onClick={() => { setNewSheetErr(''); setNewSheet({ name: '', slug: '', code: '', copyFromId: sheets[sheets.length - 1]?.id ?? '' }); }}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-emerald-400 transition">
                <Plus className="w-3.5 h-3.5" /> Thêm trang
              </button>
            )}
          </div>

          {/* Banner trễ */}
          {(data?.totalDelayed ?? 0) > 0 && (
            <a href="#delayed-table" className="flex items-center gap-4 bg-red-950/60 border border-red-900/60 rounded-xl px-5 py-4 mb-4 hover:bg-red-950/80 transition">
              <div className="p-2.5 bg-red-900/50 rounded-lg shrink-0">
                <TrendingDown className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-red-400/80 uppercase tracking-wide font-medium mb-0.5">Tổng công việc đang trễ</p>
                <p className="text-4xl font-bold text-red-300 leading-none">{data?.totalDelayed ?? 0}</p>
              </div>
              <span className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-300 transition shrink-0">
                Xem chi tiết <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </a>
          )}

          {/* Grid sheet cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {data?.kpi.map(k => {
              const slug = k.sheetSlug ?? slugFromCode(k.sheetType);
              const pct = Math.round((k.avgProgress ?? 0) * 100);
              const hasDelay = k.delayed > 0;
              const cardContent = (
                <div className="flex flex-col h-full gap-3">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide leading-snug">{k.sheetType}</span>
                    {hasDelay && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-400 bg-red-950/70 px-1.5 py-0.5 rounded-full shrink-0 font-medium">
                        <AlertTriangle className="w-2.5 h-2.5" /> {k.delayed}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-3xl font-bold leading-none">{pct}%</p>
                    <p className="text-[11px] text-zinc-500 mt-1">{k.total} công việc</p>
                  </div>
                  <div className="mt-auto">
                    <div className="bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );

              const cardCls = `relative group/card bg-zinc-900 border rounded-xl p-4 flex flex-col transition min-h-[120px] ${
                slug ? 'hover:border-emerald-700/60 cursor-pointer border-zinc-800' : 'border-zinc-800'
              }`;

              return (
                <div key={k.sheetType} className="relative group/wrap">
                  {slug
                    ? <a href={`/tracking/${slug}`} className={cardCls}>{cardContent}</a>
                    : <div className={cardCls}>{cardContent}</div>
                  }
                  {canImport && (
                    <button
                      onClick={e => { e.preventDefault(); deleteSheet(k.sheetId, k.sheetType); }}
                      title="Xoá trang tracking"
                      className="absolute top-2 right-2 p-1 rounded-md bg-zinc-800/80 text-zinc-600 hover:bg-red-900/80 hover:text-red-400 opacity-0 group-hover/wrap:opacity-100 transition z-10">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Heatmap tầng × sheet ── */}
        <FloorHeatmap />

        {/* ── Việc bị chặn (phụ thuộc chưa thông) ── */}
        <BlockedPanel />

        {/* ── Chỉ số tiến độ (SPI) ── */}
        <SpiCards />

        {/* ── Dự báo hoàn thành ── */}
        <ForecastCards />

        {/* ── S-curve ── */}
        <SCurveChart />

        {/* ── Bar chart tiến độ ── */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-200 mb-4">
            <EditableText tkey="dashboard.chart.title">% Tiến độ trung bình theo Sheet</EditableText>
          </h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <XAxis dataKey="name" stroke="var(--color-zinc-600)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-zinc-600)" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  formatter={(v) => [`${v}%`, 'Tiến độ']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.delayed > 0 ? 'var(--color-amber-500)' : 'var(--color-emerald-500)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── Pareto nguyên nhân trễ ── */}
        {allDelayed.length > 0 && (reasonCounts.length > 0 || noReason > 0) && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-sm font-semibold text-zinc-200">
                <EditableText tkey="dashboard.pareto.title">Nguyên nhân trễ (Pareto)</EditableText>
              </h2>
            </div>
            <p className="text-xs text-zinc-500 mb-4">Bấm thanh để lọc bảng trễ theo lý do</p>
            <div className="space-y-2">
              {reasonCounts.map(r => (
                <button key={r.slug} onClick={() => setReasonFilter(f => f === r.slug ? '' : r.slug)}
                  className={`w-full flex items-center gap-3 group transition ${reasonFilter === r.slug ? 'opacity-100' : reasonFilter ? 'opacity-40' : ''}`}>
                  <span className="text-xs text-zinc-400 w-24 sm:w-32 text-right shrink-0 truncate" title={r.label}>{r.label}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div className="h-2 bg-amber-500/70 group-hover:bg-amber-400 rounded-full transition-all"
                      style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </div>
                  <span className="text-xs text-zinc-300 w-20 text-left shrink-0 tabular-nums">
                    {r.count} <span className="text-zinc-500">({Math.round((r.count / allDelayed.length) * 100)}%)</span>
                  </span>
                </button>
              ))}
              {noReason > 0 && (
                <button onClick={() => setReasonFilter(f => f === '__none' ? '' : '__none')}
                  className={`w-full flex items-center gap-3 group transition ${reasonFilter === '__none' ? 'opacity-100' : reasonFilter ? 'opacity-40' : ''}`}>
                  <span className="text-xs text-zinc-500 w-24 sm:w-32 text-right shrink-0">Chưa gán lý do</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div className="h-2 bg-zinc-600 group-hover:bg-zinc-500 rounded-full transition-all"
                      style={{ width: `${(noReason / maxReason) * 100}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 w-20 text-left shrink-0 tabular-nums">
                    {noReason} <span className="text-zinc-600">({Math.round((noReason / allDelayed.length) * 100)}%)</span>
                  </span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Bảng trễ ── */}
        <section id="delayed-table" className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {/* Header + filter */}
          <div className="px-5 py-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="flex items-center gap-2 font-semibold text-sm shrink-0">
              <Clock className="w-4 h-4 text-red-400" />
              <EditableText tkey="dashboard.delayed.title">Danh sách công việc đang trễ</EditableText>
              <span className="ml-1 text-xs font-normal text-zinc-500">({delayed.length})</span>
            </h2>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {[
                { value: sheetFilter, onChange: setSheetFilter, placeholder: 'Tất cả sheet', options: data?.kpi.map(k => ({ v: k.sheetType, l: k.sheetType })) ?? [] },
                { value: floorFilter, onChange: setFloorFilter, placeholder: 'Tất cả tầng', options: floors.map(f => ({ v: f, l: f })) },
                { value: statusFilter, onChange: setStatusFilter, placeholder: 'Tất cả trạng thái', options: statuses.map(s => ({ v: s, l: STATUS_LABEL[s] ?? s })) },
              ].map((sel, i) => (
                <select key={i} value={sel.value} onChange={e => sel.onChange(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-zinc-500 transition">
                  <option value="">{sel.placeholder}</option>
                  {sel.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              ))}
            </div>
          </div>

          {/* Bảng — cuộn ngang trên mobile */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-800/80">
                  <th className="text-left px-5 py-3">Công việc</th>
                  <th className="text-left px-4 py-3">Tầng</th>
                  <th className="text-left px-4 py-3">Hạn</th>
                  <th className="text-left px-4 py-3 w-32">Tiến độ</th>
                  <th className="text-left px-4 py-3">Sheet</th>
                  <th className="text-left px-4 py-3">Nguyên nhân</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {delayed.map(t => {
                  const url = trackingUrl(t);
                  const pct = Math.round((t.progressPercent ?? 0) * 100);
                  return (
                    <tr key={t.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-medium max-w-[220px]">
                        {url ? (
                          <a href={url} title="Mở trên lưới tracking"
                            className="flex items-center gap-1.5 hover:text-emerald-400 transition group">
                            <span className="truncate">{t.name}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-zinc-600 group-hover:text-emerald-400 transition" />
                          </a>
                        ) : <span className="truncate block">{t.name}</span>}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400 text-xs whitespace-nowrap">{t.floorLabel || '—'}</td>
                      <td className="px-4 py-3.5 text-red-400 text-xs whitespace-nowrap tabular-nums">{fmtDate(t.endDate)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="bg-zinc-800 rounded-full h-1.5 w-16 shrink-0 overflow-hidden">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-zinc-300">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 bg-zinc-800 rounded-md text-[11px] font-medium text-zinc-300">{t.sheetType}</span>
                      </td>
                      <td className="px-4 py-3.5" title={t.delayNote ?? undefined}>
                        {me && me.role !== 'subcon' ? (
                          <select value={t.delayReason ?? ''} onChange={e => setReason(t.id, e.target.value)}
                            aria-label="Nguyên nhân trễ"
                            className={`text-xs rounded-md px-2 py-1.5 outline-none border w-full max-w-[160px] transition ${
                              t.delayReason
                                ? 'bg-amber-950/50 border-amber-900/60 text-amber-300'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                            }`}>
                            <option value="">— Chưa gán —</option>
                            {Object.entries(DELAY_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-zinc-400">
                            {t.delayReason ? DELAY_REASON_LABEL[t.delayReason as keyof typeof DELAY_REASON_LABEL] : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {delayed.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-zinc-500 text-sm">
                      Không có công việc trễ.{' '}
                      {canImport && <a href="/import" className="text-emerald-400 hover:underline">Import file Excel</a>}
                      {!canImport && 'Hãy liên hệ Admin/PM để cập nhật dữ liệu.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      {/* Modal tạo trang tracking mới */}
      {newSheet && (
        <Modal onClose={() => setNewSheet(null)}>
          <div className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" /> Thêm trang tracking
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Tên trang</label>
                <input autoFocus value={newSheet.name}
                  onChange={e => setNewSheet(ns => ns && ({ ...ns, name: e.target.value, slug: toSlug(e.target.value), code: e.target.value }))}
                  placeholder="VD: Ống nước cấp Zone 3"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mã sheet</label>
                <input value={newSheet.code}
                  onChange={e => setNewSheet(ns => ns && ({ ...ns, code: e.target.value }))}
                  placeholder="VD: ONC Z3"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Đường dẫn</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-zinc-500 shrink-0">/tracking/</span>
                  <input value={newSheet.slug}
                    onChange={e => setNewSheet(ns => ns && ({ ...ns, slug: e.target.value }))}
                    placeholder="ong-nuoc-cap-zone-3"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 font-mono transition" />
                </div>
                <p className="text-[11px] text-zinc-600 mt-1">Chỉ dùng chữ thường a–z, số và gạch nối.</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Sao chép cấu trúc từ</label>
                <select value={newSheet.copyFromId}
                  onChange={e => setNewSheet(ns => ns && ({ ...ns, copyFromId: e.target.value ? Number(e.target.value) : '' }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition">
                  <option value="">— Trang trống —</option>
                  {sheets.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
                <p className="text-[11px] text-zinc-600 mt-1">Copy nhóm + công việc, tiến độ reset về 0.</p>
              </div>
            </div>
            {newSheetErr && <p className="text-xs text-red-400 mt-3">{newSheetErr}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setNewSheet(null)}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition">Huỷ</button>
              <button onClick={createSheet} disabled={!newSheet.name.trim()}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg font-semibold transition">
                Tạo trang
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
