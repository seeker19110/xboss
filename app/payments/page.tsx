'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DollarSign, Users, Download, Save, Loader2,
  ChevronDown, ChevronRight, AlertTriangle, AlertCircle,
} from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import { PageSkeleton } from '@/app/components/Skeleton';

// ── Types ──────────────────────────────────────────────────────────────────────

type FloorRow = {
  sheetTypeId: number; sheetType: string; sheetSlug: string | null;
  responsible: string | null;
  floorLabel: string; progress: number; taskCount: number; delayed: number;
  contractValue: number;
};
type Data = { rows: FloorRow[]; totalContract: number; totalEarned: number };

// Edit key: `${sheetTypeId}__${floorLabel}`
type EditKey = string;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVND(n: number) {
  if (n === 0) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} tr`;
  return n.toLocaleString('vi-VN') + ' đ';
}
function fmtFull(n: number) { return n.toLocaleString('vi-VN') + ' đ'; }
function editKey(r: FloorRow) { return `${r.sheetTypeId}__${r.floorLabel}`; }

function sortFloor(f: string) {
  if (f === 'RF') return 9999;
  const n = parseInt(f);
  if (!isNaN(n)) return n;
  const m = f.match(/B(\d+)/i);
  return m ? -parseInt(m[1]) : 0;
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

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
  const [edits, setEdits] = useState<Record<EditKey, string>>({});
  const [saving, setSaving] = useState(false);
  const [sheetFilter, setSheetFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'floor' | 'subcon'>('floor');
  const [people, setPeople] = useState<string[]>([]);   // gợi ý người phụ trách
  const [savingResp, setSavingResp] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [dr, mr] = await Promise.all([fetch('/api/payments'), fetch('/api/auth/me')]);
    if (dr.status === 401) { window.location.href = '/login'; return; }
    const d: Data = await dr.json();
    const me = mr.ok ? (await mr.json())?.user : null;
    const editor = me?.role === 'admin' || me?.role === 'pm';
    setData(d);
    setCanEdit(editor);
    setLoading(false);
    // Gợi ý: tên người dùng (Admin/PM mới có quyền đọc) + tên đã nhập sẵn.
    if (editor) {
      const ur = await fetch('/api/users');
      const users: { name: string }[] = ur.ok ? (await ur.json())?.users ?? [] : [];
      const fromData = d.rows.map(r => r.responsible).filter(Boolean) as string[];
      setPeople([...new Set([...users.map(u => u.name), ...fromData])].sort());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveResponsible(sheetTypeId: number, value: string) {
    const responsible = value.trim();
    setSavingResp(sheetTypeId);
    await fetch(`/api/sheets/${sheetTypeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsible }),
    });
    setSavingResp(null);
    setData(prev => prev ? {
      ...prev,
      rows: prev.rows.map(r => r.sheetTypeId === sheetTypeId ? { ...r, responsible: responsible || null } : r),
    } : prev);
    if (responsible) setPeople(p => p.includes(responsible) ? p : [...p, responsible].sort());
  }

  async function saveEdits(pending: Record<EditKey, string>, rows: FloorRow[]) {
    const rowMap = new Map(rows.map(r => [editKey(r), r]));
    const updates = Object.entries(pending).map(([k, v]) => {
      const row = rowMap.get(k);
      if (!row) return null;
      const contractValue = parseFloat(v.replace(/[^\d.]/g, '')) || 0;
      return { sheetTypeId: row.sheetTypeId, floorLabel: row.floorLabel, contractValue };
    }).filter(Boolean) as { sheetTypeId: number; floorLabel: string; contractValue: number }[];
    if (!updates.length) return;
    setSaving(true);
    await fetch('/api/payments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);
    setData(prev => {
      if (!prev) return prev;
      const valMap = new Map(updates.map(u => [`${u.sheetTypeId}__${u.floorLabel}`, u.contractValue]));
      const rows = prev.rows.map(r => {
        const v = valMap.get(editKey(r));
        return v !== undefined ? { ...r, contractValue: v } : r;
      });
      return { rows, totalContract: rows.reduce((s, r) => s + r.contractValue, 0), totalEarned: rows.reduce((s, r) => s + r.contractValue * r.progress, 0) };
    });
    setEdits({});
  }

  function handleEdit(row: FloorRow, val: string) {
    const next = { ...edits, [editKey(row)]: val };
    setEdits(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => data && saveEdits(next, data.rows), 1500);
  }

  if (loading) return <PageSkeleton />;
  if (!data) return null;

  const sheets = [...new Map(data.rows.map(r => [r.sheetType, r.sheetSlug])).entries()]
    .map(([code, slug]) => ({ code, slug }));

  const filtered = sheetFilter === 'all' ? data.rows : data.rows.filter(r => r.sheetType === sheetFilter);

  const filteredContract = filtered.reduce((s, r) => s + r.contractValue, 0);
  const filteredEarned   = filtered.reduce((s, r) => s + r.contractValue * r.progress, 0);
  const earnedPct = filteredContract > 0 ? filteredEarned / filteredContract * 100 : 0;

  // Nhóm theo tầng (gom tất cả hệ lại)
  const byFloor = new Map<string, FloorRow[]>();
  for (const r of filtered) {
    const list = byFloor.get(r.floorLabel) ?? [];
    list.push(r); byFloor.set(r.floorLabel, list);
  }
  const floorEntries = [...byFloor.entries()]
    .sort(([a], [b]) => sortFloor(b) - sortFloor(a));

  // View theo hệ (tổng hợp)
  const bySheet = new Map<string, FloorRow[]>();
  for (const r of filtered) {
    const list = bySheet.get(r.sheetType) ?? [];
    list.push(r); bySheet.set(r.sheetType, list);
  }

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
          <button onClick={() => data && saveEdits(edits, data.rows)}
            className="flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition shrink-0">
            <Save className="w-3.5 h-3.5" /><span className="hidden sm:inline">Lưu ngay</span>
          </button>
        )}
        <a href="/api/export/excel?type=payments"
          className="flex items-center gap-1.5 text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1.5 rounded-lg transition shrink-0">
          <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Excel</span>
        </a>
      </AppHeader>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4">

        {/* Gợi ý người phụ trách (dùng chung cho mọi ô nhập) */}
        <datalist id="payment-people">
          {people.map(p => <option key={p} value={p} />)}
        </datalist>

        {/* KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <KpiCard label="Tổng giá trị HĐ" value={fmtVND(filteredContract)}
            sub={filteredContract > 0 ? fmtFull(filteredContract) : 'Chưa nhập đơn giá'} />
          <KpiCard label="Đã hoàn thành" value={fmtVND(filteredEarned)}
            accent="text-emerald-300"
            sub={filteredContract > 0 ? `${earnedPct.toFixed(1)}% giá trị HĐ` : undefined} />
          <KpiCard label="Còn lại" value={fmtVND(filteredContract - filteredEarned)} accent="text-amber-300" />
          <KpiCard label="Số tầng" value={byFloor.size.toString()}
            sub={`${filtered.filter(r => r.contractValue > 0).length} ô có giá trị`} />
        </div>

        {/* Thanh giải ngân */}
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

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0">
            <button onClick={() => setViewMode('floor')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'floor' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <DollarSign className="w-3.5 h-3.5 shrink-0" /> Theo tầng
            </button>
            <button onClick={() => setViewMode('subcon')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'subcon' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <Users className="w-3.5 h-3.5 shrink-0" /> Nhà thầu phụ
            </button>
          </div>
          <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-2 focus:outline-none flex-1 sm:flex-none min-w-0">
            <option value="all">Tất cả hệ</option>
            {sheets.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
          {canEdit && (
            <p className="text-[10px] text-zinc-600 hidden sm:block">
              Bấm vào ô giá trị để nhập, tự lưu sau 1.5s
            </p>
          )}
        </div>

        {/* ══ VIEW: THEO TẦNG ══ */}
        {viewMode === 'floor' && (
          <div className="space-y-2">
            {floorEntries.map(([floor, rows]) => (
              <FloorGroup key={floor} floor={floor} rows={rows}
                canEdit={canEdit} edits={edits} onEdit={handleEdit} />
            ))}
            {floorEntries.length === 0 && (
              <div className="py-14 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
                <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Chưa có dữ liệu tầng.</p>
              </div>
            )}
            {!canEdit && (
              <p className="text-xs text-zinc-600 text-center pt-1">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Chỉ Admin/PM được nhập giá trị hợp đồng.
              </p>
            )}
          </div>
        )}

        {/* ══ VIEW: THEO HỆ ══ */}
        {viewMode === 'subcon' && (
          <div className="space-y-3">
            {[...bySheet.entries()].map(([sheet, rows]) => {
              const sheetContract = rows.reduce((s, r) => s + r.contractValue, 0);
              const sheetEarned   = rows.reduce((s, r) => s + r.contractValue * r.progress, 0);
              const pct = sheetContract > 0 ? sheetEarned / sheetContract * 100 : 0;
              const avgProgress = rows.length ? rows.reduce((s, r) => s + r.progress, 0) / rows.length : 0;
              const slug = rows[0]?.sheetSlug;
              const sheetTypeId = rows[0]?.sheetTypeId;
              const responsible = rows[0]?.responsible ?? '';
              return (
                <div key={sheet} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                    <span className="text-xs font-bold bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full shrink-0">{sheet}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(avgProgress * 100, 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold tabular-nums text-zinc-200 shrink-0">{Math.round(avgProgress * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-zinc-500">HĐ: {fmtVND(sheetContract)}</span>
                        <span className="text-[11px] text-emerald-500">Xong: {fmtVND(sheetEarned)}</span>
                        {sheetContract > 0 && <span className="text-[11px] text-zinc-500">{pct.toFixed(1)}%</span>}
                      </div>
                    </div>
                    {slug && (
                      <a href={`/tracking/${slug}`} className="text-xs text-zinc-500 hover:text-zinc-200 shrink-0 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600 transition">
                        Tracking
                      </a>
                    )}
                  </div>
                  {/* Người phụ trách / nhà thầu phụ */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/40">
                    <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-[11px] text-zinc-500 shrink-0">Phụ trách:</span>
                    {canEdit ? (
                      <>
                        <input
                          type="text" list="payment-people"
                          defaultValue={responsible}
                          onBlur={e => { if (sheetTypeId != null && e.target.value.trim() !== responsible) saveResponsible(sheetTypeId, e.target.value); }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          placeholder="Chọn hoặc nhập tên nhà thầu phụ"
                          className="flex-1 sm:max-w-xs text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none"
                        />
                        {savingResp === sheetTypeId && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />}
                      </>
                    ) : (
                      <span className="text-xs text-zinc-300 truncate">{responsible || '—'}</span>
                    )}
                  </div>
                  <div className="divide-y divide-zinc-800/40">
                    {rows.sort((a, b) => sortFloor(b.floorLabel) - sortFloor(a.floorLabel)).map(r => {
                      const earned = r.contractValue * r.progress;
                      return (
                        <div key={r.floorLabel} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/30 transition">
                          <span className="text-sm font-bold text-zinc-300 w-12 shrink-0">{r.floorLabel}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-zinc-800 rounded-full h-1 overflow-hidden">
                                <div className={`h-1 rounded-full ${r.progress >= 1 ? 'bg-emerald-500' : r.delayed > 0 ? 'bg-red-500' : 'bg-sky-500'}`}
                                  style={{ width: `${Math.min(r.progress * 100, 100)}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-zinc-400 shrink-0 w-8 text-right">{Math.round(r.progress * 100)}%</span>
                            </div>
                          </div>
                          <span className="text-xs tabular-nums text-emerald-300 shrink-0 w-16 text-right">{earned > 0 ? fmtVND(earned) : '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ── FloorGroup ─────────────────────────────────────────────────────────────────

function FloorGroup({ floor, rows, canEdit, edits, onEdit }: {
  floor: string; rows: FloorRow[];
  canEdit: boolean; edits: Record<string, string>;
  onEdit: (row: FloorRow, val: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const totalContract = rows.reduce((s, r) => s + r.contractValue, 0);
  const totalEarned   = rows.reduce((s, r) => s + r.contractValue * r.progress, 0);
  const avgProgress   = rows.reduce((s, r) => s + r.progress, 0) / rows.length;
  const pct           = totalContract > 0 ? totalEarned / totalContract * 100 : 0;
  const hasDelayed    = rows.some(r => r.delayed > 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header tầng */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition text-left">
        <div className="flex items-center gap-2 w-14 sm:w-16 shrink-0">
          <span className="text-base font-bold text-zinc-100">{floor}</span>
          {hasDelayed && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full transition-all ${avgProgress >= 1 ? 'bg-emerald-500' : hasDelayed ? 'bg-red-500' : avgProgress >= 0.5 ? 'bg-sky-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(avgProgress * 100, 100)}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-zinc-200 w-8 text-right shrink-0">
              {Math.round(avgProgress * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-[11px] text-zinc-500">HĐ: {totalContract > 0 ? fmtVND(totalContract) : '—'}</span>
            {totalContract > 0 && <span className="text-[11px] text-emerald-500">Xong: {fmtVND(totalEarned)} ({pct.toFixed(1)}%)</span>}
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
      </button>

      {/* Chi tiết từng hệ */}
      {open && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/40">
          {rows.map(r => {
            const key = `${r.sheetTypeId}__${r.floorLabel}`;
            const displayVal = edits[key] !== undefined ? edits[key] : (r.contractValue > 0 ? r.contractValue.toLocaleString('vi-VN') : '');
            const earned = r.contractValue * r.progress;
            const href = r.sheetSlug ? `/tracking/${r.sheetSlug}?floor=${encodeURIComponent(floor)}` : '#';

            return (
              <div key={r.sheetType} className="px-4 py-3 hover:bg-zinc-800/20 transition">
                {/* Hàng 1: hệ + % tiến độ */}
                <div className="flex items-center gap-3">
                  <a href={href}
                    className="text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full shrink-0 transition">
                    {r.sheetType}
                  </a>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${r.progress >= 1 ? 'bg-emerald-500' : r.delayed > 0 ? 'bg-red-500' : 'bg-sky-500'}`}
                        style={{ width: `${Math.min(r.progress * 100, 100)}%` }} />
                    </div>
                    <span className={`text-xs font-bold tabular-nums shrink-0 w-8 text-right ${r.progress >= 1 ? 'text-emerald-400' : r.delayed > 0 ? 'text-red-400' : 'text-zinc-300'}`}>
                      {Math.round(r.progress * 100)}%
                    </span>
                    {r.delayed > 0 && (
                      <span className="text-[10px] text-red-400 shrink-0">{r.delayed} trễ</span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{r.taskCount} task</span>
                </div>

                {/* Hàng 2: giá trị HĐ input + giá trị hoàn thành */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-zinc-600 shrink-0">Giá trị HĐ:</span>
                  {canEdit ? (
                    <input
                      type="text" inputMode="numeric"
                      value={displayVal}
                      onChange={e => onEdit(r, e.target.value)}
                      placeholder="Nhập giá trị (đ)"
                      className="flex-1 sm:max-w-[160px] text-right text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none tabular-nums"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400 tabular-nums">
                      {r.contractValue > 0 ? fmtFull(r.contractValue) : '—'}
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
