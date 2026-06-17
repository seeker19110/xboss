'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DollarSign, Users, Download, Save, Loader2,
  ChevronDown, ChevronRight, AlertTriangle, AlertCircle,
  Receipt, Plus, Trash2, X, Wallet, Printer,
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

type BillType = 'bill' | 'advance' | 'item';
type Bill = {
  id: number; responsible: string; type: BillType; period: string | null;
  amount: number; description: string | null; paidDate: string;
  progressSnapshot: number; note: string | null;
  createdBy: number | null; createdByName: string | null; createdAt: string;
};

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
function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function todayISO() { return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); }

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
  const [bills, setBills] = useState<Bill[]>([]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [dr, mr, br] = await Promise.all([
      fetch('/api/payments'), fetch('/api/auth/me'), fetch('/api/payments/bills'),
    ]);
    if (dr.status === 401) { window.location.href = '/login'; return; }
    const d: Data = await dr.json();
    setBills(br.ok ? (await br.json())?.bills ?? [] : []);
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

  async function addBill(input: {
    responsible: string; type: BillType; amount: number; paidDate: string;
    period: string | null; description: string | null;
    progressSnapshot: number; note: string | null;
  }) {
    const res = await fetch('/api/payments/bills', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => null);
      alert(e?.error ?? 'Không lưu được mục thanh toán');
      return false;
    }
    const { id } = await res.json();
    setBills(prev => [...prev, {
      id, responsible: input.responsible, type: input.type,
      period: input.period, amount: input.amount, description: input.description,
      paidDate: input.paidDate, progressSnapshot: input.progressSnapshot,
      note: input.note, createdBy: null, createdByName: null,
      createdAt: new Date().toISOString(),
    }]);
    return true;
  }

  async function deleteBill(id: number) {
    if (!confirm('Xoá bill thanh toán này?')) return;
    const res = await fetch(`/api/payments/bills/${id}`, { method: 'DELETE' });
    if (res.ok) setBills(prev => prev.filter(b => b.id !== id));
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

  // View theo người phụ trách: người → (hệ → các tầng).
  const NONE = '__none__';
  const byPerson = new Map<string, Map<string, FloorRow[]>>();
  for (const r of filtered) {
    const person = r.responsible?.trim() || NONE;
    let sheetsMap = byPerson.get(person);
    if (!sheetsMap) { sheetsMap = new Map(); byPerson.set(person, sheetsMap); }
    const list = sheetsMap.get(r.sheetType) ?? [];
    list.push(r); sheetsMap.set(r.sheetType, list);
  }
  // Sắp xếp: người có tên trước (A→Z), nhóm chưa phân công cuối cùng.
  const personEntries = [...byPerson.entries()].sort(([a], [b]) => {
    if (a === NONE) return 1;
    if (b === NONE) return -1;
    return a.localeCompare(b, 'vi');
  });

  // Phân nhóm tất cả dòng theo người phụ trách.
  const billsByPerson = new Map<string, Bill[]>();
  for (const b of bills) {
    const list = billsByPerson.get(b.responsible) ?? [];
    list.push(b); billsByPerson.set(b.responsible, list);
  }
  // KPI toàn dự án: chỉ tính type='bill' (tạm ứng & phát sinh là nội bộ từng đợt).
  const totalPaid = bills.filter(b => b.type === 'bill').reduce((s, b) => s + b.amount, 0);

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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <KpiCard label="Tổng giá trị HĐ" value={fmtVND(filteredContract)}
            sub={filteredContract > 0 ? fmtFull(filteredContract) : 'Chưa nhập đơn giá'} />
          <KpiCard label="Nghiệm thu được" value={fmtVND(filteredEarned)}
            accent="text-emerald-300"
            sub={filteredContract > 0 ? `${earnedPct.toFixed(1)}% giá trị HĐ` : undefined} />
          <KpiCard label="Đã thanh toán" value={fmtVND(totalPaid)}
            accent="text-sky-300"
            sub={data.totalEarned > 0 ? `${(totalPaid / data.totalEarned * 100).toFixed(1)}% nghiệm thu` : 'Toàn bộ kỳ'} />
          <KpiCard label="Chờ thanh toán" value={fmtVND(Math.max(data.totalEarned - totalPaid, 0))}
            accent="text-amber-300"
            sub="Nghiệm thu − đã TT" />
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
              <Users className="w-3.5 h-3.5 shrink-0" /> Người phụ trách
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

        {/* ══ VIEW: NGƯỜI PHỤ TRÁCH ══ */}
        {viewMode === 'subcon' && (
          <div className="space-y-3">
            {personEntries.map(([person, sheetsMap]) => {
              const allRows = [...sheetsMap.values()].flat();
              const pContract = allRows.reduce((s, r) => s + r.contractValue, 0);
              const pEarned   = allRows.reduce((s, r) => s + r.contractValue * r.progress, 0);
              const pPct = pContract > 0 ? pEarned / pContract * 100 : 0;
              const pAvg = allRows.length ? allRows.reduce((s, r) => s + r.progress, 0) / allRows.length : 0;
              const sheetList = [...sheetsMap.entries()];
              const isNone = person === NONE;
              const personBills = isNone ? [] : (billsByPerson.get(person) ?? []);
              // Chỉ tính bills thực để hiển thị đã TT trên header.
              const paid = personBills.filter(b => b.type === 'bill').reduce((s, b) => s + b.amount, 0);
              return (
                <div key={person} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {/* Header người phụ trách */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${isNone ? 'bg-zinc-800 text-zinc-500' : 'bg-emerald-900/60 text-emerald-300'}`}>
                      {isNone ? '?' : person.trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isNone ? 'text-zinc-500 italic' : 'text-white'}`}>
                        {isNone ? 'Chưa phân công' : person}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-zinc-500">{sheetList.length} hệ · TB {Math.round(pAvg * 100)}%</span>
                        <span className="text-[11px] text-zinc-500">HĐ: {fmtVND(pContract)}</span>
                        {pContract > 0 && <span className="text-[11px] text-emerald-500">Nghiệm thu: {fmtVND(pEarned)} ({pPct.toFixed(1)}%)</span>}
                        {paid > 0 && <span className="text-[11px] text-sky-400">Đã TT: {fmtVND(paid)}</span>}
                      </div>
                    </div>
                    {!isNone && (
                      <a href={`/payments/print?person=${encodeURIComponent(person)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 text-[11px] border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-lg transition"
                        title="In bảng kê thanh toán">
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">In</span>
                      </a>
                    )}
                  </div>
                  {/* Danh sách hệ người này phụ trách */}
                  <div className="divide-y divide-zinc-800/40">
                    {sheetList.map(([sheet, rows]) => (
                      <PersonSheetRow key={sheet} sheet={sheet} rows={rows}
                        canEdit={canEdit} edits={edits} onEdit={handleEdit}
                        savingResp={savingResp} onSaveResponsible={saveResponsible} />
                    ))}
                  </div>
                  {/* Bills thanh toán của người này */}
                  {!isNone && (
                    <BillsSection person={person} bills={personBills} earned={pEarned}
                      progress={pAvg} canEdit={canEdit}
                      onAdd={addBill} onDelete={deleteBill} />
                  )}
                </div>
              );
            })}
            {personEntries.length === 0 && (
              <div className="py-14 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Chưa có dữ liệu.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── BillsSection ─────────────────────────────────────────────────────────────────
// Thanh toán, tạm ứng và khoản phát sinh của một người phụ trách.

type AddInput = {
  responsible: string; type: BillType; amount: number; paidDate: string;
  period: string | null; description: string | null;
  progressSnapshot: number; note: string | null;
};

type ItemLine = { key: number; description: string; amount: string };
let _lineKey = 0;
function newLine(): ItemLine { return { key: ++_lineKey, description: '', amount: '' }; }

function emptyForm() {
  return { period: '', amount: '', description: '', note: '', paidDate: todayISO() };
}

function BillsSection({ person, bills, earned, progress, canEdit, onAdd, onDelete }: {
  person: string; bills: Bill[]; earned: number; progress: number;
  canEdit: boolean;
  onAdd: (input: AddInput) => Promise<boolean>;
  onDelete: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  // 'bill' | 'advance' | 'item' | null (null = đóng form)
  const [activeForm, setActiveForm] = useState<BillType | null>(null);
  const [f, setF] = useState(emptyForm());
  // Danh sách dòng phát sinh (chỉ dùng khi activeForm === 'item')
  const [itemLines, setItemLines] = useState<ItemLine[]>([newLine()]);
  const [busy, setBusy] = useState(false);

  const billRows    = bills.filter(b => b.type === 'bill');
  const advanceRows = bills.filter(b => b.type === 'advance');
  const itemRows    = bills.filter(b => b.type === 'item');

  const sumBills    = billRows.reduce((s, b) => s + b.amount, 0);
  const sumAdvance  = advanceRows.reduce((s, b) => s + b.amount, 0);
  // phát sinh: amount dương = tăng thêm, âm = khấu trừ (lưu tuyệt đối, dấu trong description)
  const sumItems    = itemRows.reduce((s, b) => s + b.amount, 0);
  // Thanh toán kỳ này = bill − tạm ứng ± phát sinh
  const netThisPeriod = sumBills - sumAdvance + sumItems;
  const remain = earned - sumBills;   // nghiệm thu còn chờ thanh toán

  function openForm(type: BillType) {
    const closing = activeForm === type;
    setActiveForm(closing ? null : type);
    setF(emptyForm());
    setItemLines([newLine()]);
    setOpen(true);
  }

  async function submit() {
    if (!activeForm) return;
    setBusy(true);
    if (activeForm === 'item') {
      // Submit từng dòng một; bỏ qua dòng trống hoàn toàn
      const valid = itemLines.filter(l => l.description.trim() || l.amount.trim());
      if (!valid.length) { alert('Nhập ít nhất một khoản phát sinh'); setBusy(false); return; }
      for (const l of valid) {
        const amt = parseFloat(l.amount.replace(/[^\d.]/g, '')) || 0;
        if (!l.description.trim()) { alert('Thiếu nội dung cho một khoản'); setBusy(false); return; }
        if (amt <= 0) { alert(`"${l.description}" chưa có giá trị hợp lệ`); setBusy(false); return; }
        const ok = await onAdd({
          responsible: person, type: 'item', amount: amt,
          paidDate: f.paidDate, period: f.period.trim() || null,
          description: l.description.trim(), progressSnapshot: progress, note: null,
        });
        if (!ok) { setBusy(false); return; }
      }
      setItemLines([newLine()]); setF(emptyForm()); setActiveForm(null);
    } else {
      const amt = parseFloat(f.amount.replace(/[^\d.]/g, '')) || 0;
      if (amt <= 0) { alert('Nhập số tiền hợp lệ'); setBusy(false); return; }
      const ok = await onAdd({
        responsible: person, type: activeForm, amount: amt,
        paidDate: f.paidDate, period: f.period.trim() || null,
        description: null, progressSnapshot: progress, note: f.note.trim() || null,
      });
      if (ok) { setF(emptyForm()); setActiveForm(null); }
    }
    setBusy(false);
  }

  const hasAny = bills.length > 0;

  // Nhãn + màu theo type
  const typeLabel: Record<BillType, string> = { bill: 'Thanh toán', advance: 'Tạm ứng', item: 'Phát sinh' };
  const typeColor: Record<BillType, string> = {
    bill: 'text-sky-300', advance: 'text-violet-300', item: 'text-amber-300',
  };
  const typeBadge: Record<BillType, string> = {
    bill: 'bg-sky-900/60 text-sky-300', advance: 'bg-violet-900/60 text-violet-300', item: 'bg-amber-900/50 text-amber-300',
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/40">

      {/* ── Tóm tắt + nút hành động ── */}
      <div className="px-4 py-2.5 space-y-2">
        {/* Hàng 1: toggle + số liệu */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition shrink-0">
            <Receipt className="w-3.5 h-3.5 text-sky-400" />
            Thanh toán
            {hasAny && <span className="text-zinc-600">({bills.length})</span>}
            {hasAny && (open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
          </button>
          {sumBills > 0 && <span className="text-[11px] text-sky-400 tabular-nums shrink-0">TT: {fmtVND(sumBills)}</span>}
          {sumAdvance > 0 && <span className="text-[11px] text-violet-400 tabular-nums shrink-0">TU: −{fmtVND(sumAdvance)}</span>}
          {sumItems !== 0 && <span className="text-[11px] text-amber-400 tabular-nums shrink-0">PS: {sumItems >= 0 ? '' : '−'}{fmtVND(Math.abs(sumItems))}</span>}
          {(sumBills > 0 || sumAdvance > 0 || sumItems !== 0) && (
            <span className="text-[11px] font-bold tabular-nums text-emerald-400 shrink-0">
              = {fmtVND(netThisPeriod)}
            </span>
          )}
          {earned > 0 && sumBills > 0 && (
            <span className={`text-[11px] shrink-0 ml-auto ${remain > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {remain > 0 ? `Còn chờ: ${fmtVND(remain)}` : 'Nghiệm thu đủ'}
            </span>
          )}
        </div>

        {/* Hàng 2: các nút thêm mới */}
        {canEdit && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['bill', 'advance', 'item'] as BillType[]).map(t => (
              <button key={t} onClick={() => openForm(t)}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition shrink-0 ${
                  activeForm === t
                    ? 'bg-zinc-700 border-zinc-500 text-white'
                    : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                }`}>
                {activeForm === t ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {typeLabel[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Form nhập ── */}
      {activeForm && canEdit && (
        <div className="px-4 pb-3 pt-0 border-t border-zinc-800/60">
          {/* Header kỳ + ngày — dùng chung cho mọi loại */}
          <div className="grid grid-cols-2 gap-2 pt-2 pb-2">
            <input type="text" value={f.period} onChange={e => setF(p => ({ ...p, period: e.target.value }))}
              placeholder="Kỳ / đợt (vd: Đợt 1)"
              className="text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none" />
            <input type="date" value={f.paidDate} onChange={e => setF(p => ({ ...p, paidDate: e.target.value }))}
              className="text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none" />
          </div>

          {/* Form bill / tạm ứng */}
          {activeForm !== 'item' && (
            <div className="space-y-2">
              <input type="text" inputMode="numeric" value={f.amount}
                onChange={e => setF(p => ({ ...p, amount: e.target.value }))}
                placeholder="Số tiền (đ)"
                className="w-full text-right text-sm bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none tabular-nums" />
              <input type="text" value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))}
                placeholder="Ghi chú (tuỳ chọn)"
                className="w-full text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none" />
            </div>
          )}

          {/* Form phát sinh — nhiều dòng */}
          {activeForm === 'item' && (
            <div className="space-y-1.5">
              {/* Header cột */}
              <div className="grid grid-cols-[1fr_130px_28px] gap-1.5 px-0.5">
                <span className="text-[10px] text-zinc-600 font-semibold">Nội dung</span>
                <span className="text-[10px] text-zinc-600 font-semibold text-right">Giá trị (đ)</span>
                <span />
              </div>
              {/* Các dòng */}
              {itemLines.map((line, idx) => (
                <div key={line.key} className="grid grid-cols-[1fr_130px_28px] gap-1.5 items-center">
                  <input
                    type="text"
                    value={line.description}
                    onChange={e => setItemLines(ls => ls.map(l => l.key === line.key ? { ...l, description: e.target.value } : l))}
                    placeholder={`Khoản ${idx + 1}`}
                    className="text-xs bg-zinc-800 border border-zinc-700 focus:border-amber-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none min-w-0"
                  />
                  <input
                    type="text" inputMode="numeric"
                    value={line.amount}
                    onChange={e => setItemLines(ls => ls.map(l => l.key === line.key ? { ...l, amount: e.target.value } : l))}
                    placeholder="0"
                    className="text-right text-xs bg-zinc-800 border border-zinc-700 focus:border-amber-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none tabular-nums min-w-0"
                  />
                  <button
                    onClick={() => setItemLines(ls => ls.length > 1 ? ls.filter(l => l.key !== line.key) : ls)}
                    className="flex items-center justify-center text-zinc-700 hover:text-red-400 transition h-7 w-7"
                    aria-label="Xoá dòng">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {/* Nút thêm dòng + tổng preview */}
              <div className="flex items-center justify-between pt-0.5">
                <button onClick={() => setItemLines(ls => [...ls, newLine()])}
                  className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition">
                  <Plus className="w-3.5 h-3.5" />
                  Thêm dòng
                </button>
                {itemLines.some(l => l.amount) && (
                  <span className="text-[11px] text-amber-300 tabular-nums font-semibold">
                    Tổng: {fmtVND(itemLines.reduce((s, l) => s + (parseFloat(l.amount.replace(/[^\d.]/g, '')) || 0), 0))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Footer: ghi nhận */}
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-[10px] text-zinc-600">Chốt NT: {Math.round(progress * 100)}%</span>
            <button onClick={submit} disabled={busy}
              className="flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
              Ghi nhận
            </button>
          </div>
        </div>
      )}

      {/* ── Danh sách gộp theo nhóm ── */}
      {open && hasAny && (
        <div className="border-t border-zinc-800/60">
          {([
            { type: 'bill' as BillType, rows: billRows, sum: sumBills },
            { type: 'advance' as BillType, rows: advanceRows, sum: sumAdvance },
            { type: 'item' as BillType, rows: itemRows, sum: sumItems },
          ]).filter(g => g.rows.length > 0).map(({ type, rows: gRows, sum }) => (
            <div key={type} className="border-t border-zinc-800/40 first:border-0">
              {/* Sub-header nhóm */}
              <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-900/40">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${typeBadge[type]}`}>
                  {typeLabel[type]}
                </span>
                <span className={`text-[11px] font-bold tabular-nums ml-auto ${typeColor[type]}`}>
                  {type === 'advance' ? '−' : ''}{fmtVND(Math.abs(sum))}
                </span>
              </div>
              {/* Các dòng */}
              <div className="divide-y divide-zinc-800/30">
                {gRows.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[10px] text-zinc-600 w-4 shrink-0 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {b.period && (
                          <span className="text-[10px] font-semibold bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">{b.period}</span>
                        )}
                        {b.description && (
                          <span className="text-xs text-zinc-300 truncate">{b.description}</span>
                        )}
                        <span className={`text-xs font-bold tabular-nums shrink-0 ${typeColor[type]}`}>
                          {type === 'advance' ? '−' : ''}{fmtFull(b.amount)}
                        </span>
                        <span className="text-[10px] text-zinc-600 shrink-0">{fmtDate(b.paidDate)}</span>
                        {b.progressSnapshot > 0 && (
                          <span className="text-[10px] text-zinc-700 shrink-0">@{Math.round(b.progressSnapshot * 100)}%</span>
                        )}
                      </div>
                      {b.note && <p className="text-[10px] text-zinc-600 truncate">{b.note}</p>}
                    </div>
                    {canEdit && (
                      <button onClick={() => onDelete(b.id)}
                        className="shrink-0 text-zinc-700 hover:text-red-400 transition" aria-label="Xoá">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Tổng kết kỳ */}
          {(sumBills > 0 || sumAdvance > 0 || sumItems !== 0) && (
            <div className="border-t border-zinc-700/60 px-4 py-2.5 bg-zinc-900/60">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs tabular-nums">
                <div className="flex items-center gap-3 flex-wrap text-zinc-500">
                  {sumBills > 0 && <span>TT: <span className="text-sky-300">{fmtVND(sumBills)}</span></span>}
                  {sumAdvance > 0 && <span>− TU: <span className="text-violet-300">{fmtVND(sumAdvance)}</span></span>}
                  {sumItems !== 0 && <span>{sumItems >= 0 ? '+ ' : '− '}PS: <span className="text-amber-300">{fmtVND(Math.abs(sumItems))}</span></span>}
                </div>
                <span className="font-bold text-emerald-300">= {fmtVND(netThisPeriod)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PersonSheetRow ───────────────────────────────────────────────────────────────
// Một hệ trong view "Người phụ trách": mở rộng để liệt kê & nhập giá trị từng tầng.

function PersonSheetRow({ sheet, rows, canEdit, edits, onEdit, savingResp, onSaveResponsible }: {
  sheet: string; rows: FloorRow[];
  canEdit: boolean; edits: Record<string, string>;
  onEdit: (row: FloorRow, val: string) => void;
  savingResp: number | null;
  onSaveResponsible: (sheetTypeId: number, value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const sContract = rows.reduce((s, r) => s + r.contractValue, 0);
  const sEarned   = rows.reduce((s, r) => s + r.contractValue * r.progress, 0);
  const sAvg = rows.length ? rows.reduce((s, r) => s + r.progress, 0) / rows.length : 0;
  const sDelayed = rows.reduce((s, r) => s + r.delayed, 0);
  const slug = rows[0]?.sheetSlug;
  const sheetTypeId = rows[0]?.sheetTypeId;
  const responsible = rows[0]?.responsible ?? '';

  // Tầng sắp xếp từ cao xuống thấp (RF → … → hầm).
  const floorRows = [...rows].sort((a, b) => sortFloor(b.floorLabel) - sortFloor(a.floorLabel));

  return (
    <div>
      <div className="px-4 py-3 hover:bg-zinc-800/20 transition">
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(o => !o)} className="shrink-0 text-zinc-500 hover:text-zinc-300 transition">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <a href={slug ? `/tracking/${slug}` : '#'}
            className="text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full shrink-0 transition">{sheet}</a>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div className={`h-1.5 rounded-full ${sAvg >= 1 ? 'bg-emerald-500' : sDelayed > 0 ? 'bg-red-500' : 'bg-sky-500'}`}
                style={{ width: `${Math.min(sAvg * 100, 100)}%` }} />
            </div>
            <span className="text-xs font-bold tabular-nums text-zinc-300 shrink-0 w-8 text-right">{Math.round(sAvg * 100)}%</span>
          </div>
          <span className="text-[11px] text-zinc-500 shrink-0 hidden sm:inline">{rows.length} tầng</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-[11px] text-zinc-500">HĐ: {fmtVND(sContract)}</span>
          {sEarned > 0 && <span className="text-[11px] text-emerald-400">Xong: {fmtVND(sEarned)}</span>}
          {sDelayed > 0 && <span className="text-[11px] text-red-400">{sDelayed} trễ</span>}
          {canEdit && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-zinc-600 shrink-0">Đổi phụ trách:</span>
              <input type="text" list="payment-people" key={responsible}
                defaultValue={responsible}
                onBlur={e => { if (sheetTypeId != null && e.target.value.trim() !== responsible) onSaveResponsible(sheetTypeId, e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Tên người phụ trách"
                className="w-40 text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1 text-zinc-200 focus:outline-none"
              />
              {savingResp === sheetTypeId && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />}
            </div>
          )}
        </div>
      </div>

      {/* Chi tiết từng tầng — nhập giá trị HĐ */}
      {open && (
        <div className="border-t border-zinc-800/60 bg-zinc-950/40 divide-y divide-zinc-800/40">
          {floorRows.map(r => {
            const key = editKey(r);
            const displayVal = edits[key] !== undefined ? edits[key] : (r.contractValue > 0 ? r.contractValue.toLocaleString('vi-VN') : '');
            const earned = r.contractValue * r.progress;
            const href = r.sheetSlug ? `/tracking/${r.sheetSlug}?floor=${encodeURIComponent(r.floorLabel)}` : '#';
            return (
              <div key={r.floorLabel} className="pl-10 pr-4 py-2.5">
                <div className="flex items-center gap-3">
                  <a href={href} className="text-xs font-bold text-zinc-300 hover:text-sky-300 shrink-0 w-12 transition">{r.floorLabel}</a>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${r.progress >= 1 ? 'bg-emerald-500' : r.delayed > 0 ? 'bg-red-500' : 'bg-sky-500'}`}
                        style={{ width: `${Math.min(r.progress * 100, 100)}%` }} />
                    </div>
                    <span className={`text-xs font-bold tabular-nums shrink-0 w-8 text-right ${r.progress >= 1 ? 'text-emerald-400' : r.delayed > 0 ? 'text-red-400' : 'text-zinc-300'}`}>
                      {Math.round(r.progress * 100)}%
                    </span>
                    {r.delayed > 0 && <span className="text-[10px] text-red-400 shrink-0">{r.delayed} trễ</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-zinc-600 shrink-0">Giá trị HĐ:</span>
                  {canEdit ? (
                    <input type="text" inputMode="numeric" value={displayVal}
                      onChange={e => onEdit(r, e.target.value)}
                      placeholder="Nhập giá trị (đ)"
                      className="flex-1 sm:max-w-[160px] text-right text-xs bg-zinc-800 border border-zinc-700 focus:border-sky-500 rounded px-2 py-1.5 text-zinc-200 focus:outline-none tabular-nums"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400 tabular-nums">{r.contractValue > 0 ? fmtFull(r.contractValue) : '—'}</span>
                  )}
                  {earned > 0 && <span className="text-xs text-emerald-300 tabular-nums ml-auto shrink-0">= {fmtVND(earned)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
