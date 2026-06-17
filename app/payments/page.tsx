'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DollarSign, TrendingUp, AlertCircle, Users, Download,
  Save, Loader2, ChevronDown, ChevronRight,
} from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import { PageSkeleton } from '@/app/components/Skeleton';

// ── Types ──────────────────────────────────────────────────────────────────────

type Row = {
  id: number; boqCode: string | null; code: string; name: string;
  sheetType: string; sheetSlug: string | null; floorLabel: string | null;
  progressPercent: number; unitPrice: number;
  assigneeId: number | null; assigneeName: string | null;
};
type Data = { rows: Row[]; totalContract: number; totalEarned: number };

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVND(n: number) {
  if (n === 0) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  return n.toLocaleString('vi-VN') + ' đ';
}
function fmtFull(n: number) {
  return n.toLocaleString('vi-VN') + ' đ';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 sm:px-4 py-3 sm:py-3.5">
      <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1 leading-tight">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${accent ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [sheetFilter, setSheetFilter] = useState('all');
  const [subconFilter, setSubconFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'tasks' | 'subcon'>('tasks');

  const load = useCallback(async () => {
    setLoading(true);
    const [dr, mr] = await Promise.all([
      fetch('/api/payments'),
      fetch('/api/auth/me'),
    ]);
    if (dr.status === 401) { window.location.href = '/login'; return; }
    const d: Data = await dr.json();
    const me = mr.ok ? (await mr.json())?.user : null;
    setData(d);
    setCanEdit(me?.role === 'admin' || me?.role === 'pm');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveEdits(updates: Record<number, string>) {
    const payload = Object.entries(updates)
      .map(([id, v]) => ({ id: +id, unitPrice: parseFloat(v.replace(/[^\d.]/g, '')) || 0 }))
      .filter(u => Number.isFinite(u.unitPrice));
    if (!payload.length) return;
    setSaving(true);
    await fetch('/api/payments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: payload }),
    });
    setSaving(false);
    setData(prev => {
      if (!prev) return prev;
      const map = Object.fromEntries(payload.map(u => [u.id, u.unitPrice]));
      const rows = prev.rows.map(r => map[r.id] !== undefined ? { ...r, unitPrice: map[r.id] } : r);
      const totalContract = rows.reduce((s, r) => s + r.unitPrice, 0);
      const totalEarned   = rows.reduce((s, r) => s + r.unitPrice * r.progressPercent, 0);
      return { rows, totalContract, totalEarned };
    });
    setEdits({});
  }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleUnitPriceChange(id: number, val: string) {
    const next = { ...edits, [id]: val };
    setEdits(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveEdits(next), 1500);
  }

  if (loading) return <PageSkeleton />;
  if (!data) return null;

  const rows = data.rows;
  const sheets = [...new Set(rows.map(r => r.sheetType))];
  const subcons = [...new Set(rows.filter(r => r.assigneeName).map(r => r.assigneeName!))]
    .sort((a, b) => a.localeCompare(b, 'vi'));

  const filtered = rows.filter(r => {
    if (sheetFilter !== 'all' && r.sheetType !== sheetFilter) return false;
    if (subconFilter !== 'all' && r.assigneeName !== subconFilter) return false;
    return true;
  });

  const filteredContract = filtered.reduce((s, r) => s + r.unitPrice, 0);
  const filteredEarned   = filtered.reduce((s, r) => s + r.unitPrice * r.progressPercent, 0);
  const earnedPct = filteredContract > 0 ? filteredEarned / filteredContract * 100 : 0;

  const bySheet = new Map<string, Row[]>();
  for (const r of filtered) {
    const list = bySheet.get(r.sheetType) ?? [];
    list.push(r); bySheet.set(r.sheetType, list);
  }

  const bySubcon = new Map<string, Row[]>();
  for (const r of filtered) {
    const key = r.assigneeName ?? '(Chưa phân công)';
    const list = bySubcon.get(key) ?? [];
    list.push(r); bySubcon.set(key, list);
  }
  const subconEntries = [...bySubcon.entries()].map(([name, items]) => ({
    name,
    contract: items.reduce((s, r) => s + r.unitPrice, 0),
    earned:   items.reduce((s, r) => s + r.unitPrice * r.progressPercent, 0),
    count:    items.length,
    done:     items.filter(r => r.progressPercent >= 1).length,
  })).sort((a, b) => b.earned - a.earned);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Thanh toán tiến độ">
        {saving && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400 shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline">Đang lưu...</span>
          </span>
        )}
        {canEdit && Object.keys(edits).length > 0 && !saving && (
          <button onClick={() => saveEdits(edits)}
            className="flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition shrink-0">
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lưu ngay</span>
          </button>
        )}
        <a href="/api/export/excel?type=payments"
          className="flex items-center gap-1.5 text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1.5 rounded-lg transition shrink-0">
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Excel</span>
        </a>
      </AppHeader>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5">

        {/* KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <KpiCard label="Tổng giá trị HĐ" value={fmtVND(filteredContract)}
            sub={filteredContract > 0 ? fmtFull(filteredContract) : undefined} />
          <KpiCard label="Đã hoàn thành" value={fmtVND(filteredEarned)}
            accent="text-emerald-300"
            sub={filteredContract > 0 ? `${earnedPct.toFixed(1)}% HĐ` : undefined} />
          <KpiCard label="Còn lại" value={fmtVND(filteredContract - filteredEarned)}
            accent="text-amber-300" />
          <KpiCard label="Số task" value={filtered.length.toString()}
            sub={`${filtered.filter(r => r.unitPrice > 0).length} có đơn giá`} />
        </div>

        {/* Thanh tiến độ giải ngân */}
        {filteredContract > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-400">Tiến độ giải ngân</span>
              <span className="text-sm font-bold tabular-nums text-emerald-300">{earnedPct.toFixed(1)}%</span>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(earnedPct, 100)}%` }} />
            </div>
          </div>
        )}

        {/* Filters + view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
            <button onClick={() => setViewMode('tasks')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'tasks' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <span>Theo task</span>
            </button>
            <button onClick={() => setViewMode('subcon')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'subcon' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Thầu phụ</span>
            </button>
          </div>

          <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-2 focus:outline-none min-w-0 flex-1 sm:flex-none">
            <option value="all">Tất cả hệ</option>
            {sheets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={subconFilter} onChange={e => setSubconFilter(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-2 focus:outline-none min-w-0 flex-1 sm:flex-none">
            <option value="all">Tất cả người TH</option>
            {subcons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* ══ VIEW: TASKS ══ */}
        {viewMode === 'tasks' && (
          <div className="space-y-3">
            {[...bySheet.entries()].map(([sheet, items]) => {
              const sheetContract = items.reduce((s, r) => s + r.unitPrice, 0);
              const sheetEarned   = items.reduce((s, r) => s + r.unitPrice * r.progressPercent, 0);
              const pct = sheetContract > 0 ? sheetEarned / sheetContract * 100 : 0;
              return (
                <SheetGroup key={sheet} sheet={sheet} items={items}
                  sheetContract={sheetContract} sheetEarned={sheetEarned} pct={pct}
                  canEdit={canEdit} edits={edits} onEdit={handleUnitPriceChange} />
              );
            })}
            {bySheet.size === 0 && (
              <div className="py-14 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
                <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Không có task nào khớp bộ lọc.</p>
              </div>
            )}
            {!canEdit && (
              <p className="text-xs text-zinc-600 text-center pt-1">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Chỉ Admin/PM được sửa đơn giá.
              </p>
            )}
          </div>
        )}

        {/* ══ VIEW: SUBCON ══ */}
        {viewMode === 'subcon' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
              <span>Người thực hiện</span>
              <span className="text-right hidden sm:block">Giá trị HĐ</span>
              <span className="text-right">Hoàn thành</span>
              <span className="text-right">%</span>
            </div>
            {subconEntries.map(sc => {
              const pct = sc.contract > 0 ? sc.earned / sc.contract * 100 : 0;
              return (
                <div key={sc.name} className="px-4 py-3 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition">
                  <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{sc.name}</p>
                      <p className="text-xs text-zinc-600">{sc.done}/{sc.count} hoàn thành</p>
                    </div>
                    <span className="text-xs text-right tabular-nums text-zinc-400 hidden sm:block">{fmtVND(sc.contract)}</span>
                    <span className="text-sm text-right tabular-nums font-semibold text-emerald-300 whitespace-nowrap">{fmtVND(sc.earned)}</span>
                    <span className={`text-xs font-bold tabular-nums text-right ${pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  {/* Progress bar nhỏ */}
                  {sc.contract > 0 && (
                    <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
            {subconEntries.length === 0 && (
              <div className="py-10 text-center text-zinc-600 text-sm">Không có dữ liệu</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── SheetGroup component ────────────────────────────────────────────────────────

function SheetGroup({ sheet, items, sheetContract, sheetEarned, pct, canEdit, edits, onEdit }: {
  sheet: string; items: Row[];
  sheetContract: number; sheetEarned: number; pct: number;
  canEdit: boolean; edits: Record<number, string>;
  onEdit: (id: number, val: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header nhóm hệ */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition text-left border-b border-zinc-800">
        <span className="text-xs font-bold bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full shrink-0">{sheet}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-xs tabular-nums text-zinc-300 shrink-0">{pct.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-[11px] text-zinc-500 whitespace-nowrap">HĐ: {sheetContract > 0 ? fmtVND(sheetContract) : '—'}</span>
            <span className="text-[11px] text-emerald-500 whitespace-nowrap">Xong: {sheetContract > 0 ? fmtVND(sheetEarned) : '—'}</span>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
      </button>

      {open && (
        <div className="divide-y divide-zinc-800/40">
          {items.map(r => {
            const earned = r.unitPrice * r.progressPercent;
            const pctTask = Math.round(r.progressPercent * 100);
            const displayPrice = edits[r.id] !== undefined ? edits[r.id] : (r.unitPrice > 0 ? r.unitPrice.toLocaleString('vi-VN') : '');
            return (
              <div key={r.id} className="px-4 py-2.5 hover:bg-zinc-800/30 transition">
                {/* Hàng 1: mã + tên + % (mobile & desktop) */}
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[11px] text-zinc-500 shrink-0 mt-0.5 w-20 truncate">{r.boqCode ?? r.code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200 leading-snug">{r.name}</p>
                    {(r.assigneeName || r.floorLabel) && (
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {r.floorLabel && <span>{r.floorLabel}</span>}
                        {r.floorLabel && r.assigneeName && <span> · </span>}
                        {r.assigneeName && <span>{r.assigneeName}</span>}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-bold tabular-nums shrink-0 ${r.progressPercent >= 1 ? 'text-emerald-400' : r.progressPercent > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                    {pctTask}%
                  </span>
                </div>

                {/* Hàng 2: đơn giá + giá trị hoàn thành */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-zinc-600 shrink-0">Đơn giá:</span>
                  {canEdit ? (
                    <input
                      type="text" inputMode="numeric"
                      value={displayPrice}
                      onChange={e => onEdit(r.id, e.target.value)}
                      placeholder="0"
                      className="flex-1 sm:max-w-[140px] text-right text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1 text-zinc-200 focus:outline-none tabular-nums"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400 tabular-nums">
                      {r.unitPrice > 0 ? r.unitPrice.toLocaleString('vi-VN') + ' đ' : '—'}
                    </span>
                  )}
                  {earned > 0 && (
                    <span className="text-xs text-emerald-300 tabular-nums ml-auto shrink-0">
                      = {fmtVND(earned)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
