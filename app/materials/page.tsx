'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Package, Plus, Trash2, AlertTriangle, History, X,
  ChevronUp, ChevronDown, Copy, EyeOff, Eye, ClipboardCopy, Pencil, Check, FileUp, Search,
  Building2, ShoppingCart, ClipboardList, BarChart2, ArrowDownToLine,
} from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import { Modal, appConfirm, appPrompt } from '@/app/components/dialogs';
import SuppliersTab from './_components/SuppliersTab';
import PurchaseRequestsTab from './_components/PurchaseRequestsTab';
import PurchaseOrdersTab from './_components/PurchaseOrdersTab';
import ReportsTab from './_components/ReportsTab';
import OrderContent from '@/app/order/OrderContent';

type Material = {
  id: number; sheetTypeId: number | null; boqCode: string | null;
  name: string; unit: string | null;
  qtyBoq: number; qtyPlanned: number; qtyUsed: number;
  qtyStock: number; minStockLevel: number;
  status: string; note: string | null; sheetCode: string | null;
};
type Sheet = { id: number; code: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  dat_hang: 'Đã đặt hàng', ve_kho: 'Về kho', da_dung: 'Đã dùng',
};
const STATUS_CLS: Record<string, string> = {
  dat_hang: 'bg-amber-950 text-amber-300',
  ve_kho: 'bg-blue-950 text-blue-300',
  da_dung: 'bg-emerald-950 text-emerald-300',
};

const DVT_OPTIONS = ['Cái', 'Mét', 'm2', 'Ống'];

type ColKey = 'boqCode' | 'stt' | 'name' | 'unit' | 'sheet' | 'qtyBoq' | 'qtyPlanned' | 'diff' | 'status' | 'note';

const DEFAULT_LABELS: Record<ColKey, string> = {
  boqCode:    'Mã BOQ',
  stt:        'STT',
  name:       'Vật tư',
  unit:       'ĐVT',
  sheet:      'Hệ',
  qtyBoq:     'Định mức BOQ',
  qtyPlanned: 'Định mức Tháp A',
  diff:       'Chênh lệch ĐM',
  status:     'Trạng thái',
  note:       'Ghi chú',
};

const ALL_COL_KEYS: ColKey[] = ['boqCode', 'stt', 'name', 'unit', 'qtyBoq', 'qtyPlanned', 'diff', 'status', 'note'];

export default function MaterialsPage() {
  const [activeTab, setActiveTab] = useState<'materials' | 'suppliers' | 'requests' | 'orders' | 'reports' | 'order_form'>('materials');
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetFilter, setSheetFilter] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const [error, setError] = useState('');
  const [historyMat, setHistoryMat] = useState<Material | null>(null);

  const [search, setSearch] = useState('');
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set());
  const [colMenu, setColMenu] = useState<ColKey | null>(null);
  const [colLabels, setColLabels] = useState<Record<ColKey, string>>({ ...DEFAULT_LABELS });
  const [editingLabel, setEditingLabel] = useState<ColKey | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [boqEditMat, setBoqEditMat] = useState<Material | null>(null);
  const [boqDraft, setBoqDraft] = useState('');
  const [issueMat, setIssueMat] = useState<Material | null>(null);
  const [issueQty, setIssueQty] = useState('');
  const [issueNote, setIssueNote] = useState('');
  const colMenuRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    const q = sheetFilter ? `?sheetTypeId=${sheetFilter}` : '';
    fetch(`/api/materials${q}`)
      .then(r => r.json().catch(() => ({ materials: [] })))
      .then(j => setMaterials(j.materials ?? []))
      .catch(() => setMaterials([]));
  }, [sheetFilter]);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      const role = j.user?.role;
      setRole(role ?? '');
      setUserId(j.user?.id ?? null);
      setCanEdit(role === 'admin' || role === 'pm' || role === 'engineer');
      setCanDelete(role === 'admin' || role === 'pm');
      setCanAdmin(role === 'admin' || role === 'pm');
    });
    fetch('/api/sheets').then(r => r.json()).then(j => setSheets(j.sheets ?? []));
    fetch('/api/materials/columns')
      .then(r => r.json().catch(() => ({})))
      .then(j => {
        if (j.labels && typeof j.labels === 'object') {
          setColLabels(prev => ({ ...prev, ...j.labels }));
        }
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  // Đóng menu cột khi click ngoài
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenu(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus input khi bắt đầu sửa tên cột
  useEffect(() => {
    if (editingLabel && labelInputRef.current) labelInputRef.current.focus();
  }, [editingLabel]);

  async function api(path: string, init: RequestInit, okFn?: () => void) {
    setError('');
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Lỗi không xác định'); return; }
    okFn?.(); load();
  }

  const patch = (id: number, body: object) =>
    api(`/api/materials/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

  const remove = async (m: Material) => {
    if (await appConfirm(`Xoá vật tư "${m.name}"?`, { danger: true, confirmLabel: 'Xoá' }))
      api(`/api/materials/${m.id}`, { method: 'DELETE' });
  };

  const copyRow = (m: Material) => {
    const sheetTypeId = m.sheetTypeId;
    if (!sheetTypeId) { setError('Vật tư không có hệ — không thể nhân đôi'); return; }
    api('/api/materials', {
      method: 'POST',
      body: JSON.stringify({
        name: `${m.name} (copy)`, sheetTypeId, boqCode: '',
        unit: m.unit, qtyBoq: m.qtyBoq, qtyPlanned: m.qtyPlanned, note: m.note, afterId: m.id,
      }),
    });
  };

  const moveMaterial = (m: Material, direction: 'up' | 'down') =>
    api(`/api/materials/${m.id}/move`, { method: 'PATCH', body: JSON.stringify({ direction }) });

  const insertAfter = async (m: Material) => {
    const sheetTypeId = m.sheetTypeId ?? (sheetFilter ? Number(sheetFilter) : undefined);
    if (!sheetTypeId) { setError('Chọn hệ trước khi chèn hàng'); return; }
    const name = await appPrompt('Tên vật tư mới');
    if (!name?.trim()) return;
    api('/api/materials', { method: 'POST', body: JSON.stringify({ name: name.trim(), sheetTypeId, afterId: m.id }) });
  };

  const closeBoqModal = useCallback(() => setBoqEditMat(null), []);

  function editBoq(m: Material) {
    setBoqDraft(m.boqCode ?? '');
    setBoqEditMat(m);
  }

  function submitBoq() {
    if (!boqEditMat) return;
    patch(boqEditMat.id, { boqCode: boqDraft.toUpperCase() });
    setBoqEditMat(null);
  }

  function toggleCol(key: ColKey) {
    setHiddenCols(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function copyColToClipboard(key: ColKey) {
    const values = materials.map((m, i) => {
      switch (key) {
        case 'stt': return String(i + 1);
        case 'boqCode': return m.boqCode ?? '';
        case 'name': return m.name;
        case 'unit': return m.unit ?? '';
        case 'sheet': return m.sheetCode ?? '';
        case 'qtyBoq': return String(m.qtyBoq ?? 0);
        case 'qtyPlanned': return String(m.qtyPlanned);
        case 'diff': return String((m.qtyBoq ?? 0) - (m.qtyPlanned ?? 0));
        case 'status': return m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned ? 'Vượt ĐM' : 'Trong ĐM';
        case 'note': return m.note ?? '';
        default: return '';
      }
    });
    navigator.clipboard.writeText(values.join('\n')).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); });
    setColMenu(null);
  }

  function startEditLabel(key: ColKey) {
    setEditingLabel(key);
    setLabelDraft(colLabels[key]);
    setColMenu(null);
  }

  async function saveLabel(key: ColKey) {
    const label = labelDraft.trim() || DEFAULT_LABELS[key];
    const next = { ...colLabels, [key]: label };
    setColLabels(next);
    setEditingLabel(null);
    await fetch('/api/materials/columns', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: next }),
    });
  }

  function resetLabel(key: ColKey) {
    const next = { ...colLabels, [key]: DEFAULT_LABELS[key] };
    setColLabels(next);
    fetch('/api/materials/columns', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: next }),
    });
    setColMenu(null);
  }

  const visibleCols = ALL_COL_KEYS.filter(k => !hiddenCols.has(k));

  const q = search.trim().toLowerCase();
  const filtered = q
    ? materials.filter(m =>
        (m.boqCode ?? '').toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.sheetCode ?? '').toLowerCase().includes(q) ||
        (m.unit ?? '').toLowerCase().includes(q)
      )
    : materials;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader back title={<><Package className="w-5 h-5 text-emerald-400" /> Quản lý vật tư</>}>
        <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)} aria-label="Lọc theo hệ"
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả hệ</option>
          {sheets.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        {hiddenCols.size > 0 && (
          <button onClick={() => setHiddenCols(new Set())} title="Hiện lại tất cả cột"
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-2 py-1.5">
            <Eye className="w-3.5 h-3.5" /> Hiện {hiddenCols.size} cột
          </button>
        )}
      </AppHeader>

      <main className="p-6 max-w-7xl mx-auto space-y-4">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-zinc-800 pb-0 overflow-x-auto">
          {[
            { key: 'materials' as const, icon: <Package className="w-3.5 h-3.5" />, label: 'Định Mức BOQ' },
            { key: 'order_form' as const, icon: <ClipboardList className="w-3.5 h-3.5" />, label: 'Đơn đặt hàng' },
            { key: 'suppliers' as const, icon: <Building2 className="w-3.5 h-3.5" />, label: 'Nhà cung cấp' },
            { key: 'requests' as const, icon: <ShoppingCart className="w-3.5 h-3.5" />, label: 'Yêu cầu mua' },
            { key: 'orders' as const, icon: <ClipboardList className="w-3.5 h-3.5" />, label: 'Quản lý đơn hàng' },
            { key: 'reports' as const, icon: <BarChart2 className="w-3.5 h-3.5" />, label: 'Báo cáo kho' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Nội dung các tab phụ */}
        {activeTab === 'order_form' && (
          <div className="-mx-6 -mb-6">
            <OrderContent isEmbed />
          </div>
        )}
        {activeTab === 'suppliers' && <SuppliersTab role={role} />}
        {activeTab === 'requests' && <PurchaseRequestsTab role={role} userId={userId} materials={materials} />}
        {activeTab === 'orders' && <PurchaseOrdersTab role={role} materials={materials} />}
        <ReportsTab active={activeTab === 'reports'} />

        {activeTab === 'materials' && <>
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 text-red-300 px-4 py-2.5 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {(() => {
          const over = materials.filter(m => m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned);
          return over.length > 0 && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 text-red-300 px-4 py-2.5 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><b>{over.length}</b> vật tư vượt định mức: {over.slice(0, 5).map(m => m.name).join(', ')}{over.length > 5 ? '…' : ''}</span>
            </div>
          );
        })()}

        {(() => {
          const low = materials.filter(m => m.minStockLevel > 0 && (m.qtyStock ?? 0) < m.minStockLevel);
          return low.length > 0 && (
            <div className="rounded-lg border border-amber-800 bg-amber-950/40 text-amber-300 px-4 py-2.5 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><b>{low.length}</b> vật tư tồn kho dưới mức tối thiểu: {low.slice(0, 4).map(m => m.name).join(', ')}{low.length > 4 ? '…' : ''}</span>
              <a href="/materials/reports" className="ml-auto underline text-amber-400 hover:text-amber-200 shrink-0">Xem báo cáo</a>
            </div>
          );
        })()}

        {/* Thanh tìm kiếm + hành động */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm theo Mã BOQ, tên vật tư, hệ, ĐVT..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-zinc-600 placeholder:text-zinc-600"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <a href="/order"
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl px-4 py-2.5 text-sm font-medium transition shrink-0">
            <Plus className="w-4 h-4" /> Đặt hàng
          </a>
          {canEdit && (
            <a href="/materials/import"
              className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-xl px-4 py-2.5 text-sm font-medium transition shrink-0">
              <FileUp className="w-4 h-4" /> Import Excel
            </a>
          )}
        </div>

        {/* Badge kết quả tìm kiếm */}
        {q && (
          <p className="text-xs text-zinc-500">
            Tìm thấy <span className="text-white font-medium">{filtered.length}</span> / {materials.length} vật tư
          </p>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto" ref={colMenuRef}>
          <table className="w-full text-sm border-collapse table-auto">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                {visibleCols.map(key => (
                  <th key={key} className={`text-center text-xs text-zinc-400 font-semibold p-0 whitespace-nowrap relative group/th ${key === 'name' ? 'w-full' : ''}`}>
                    {editingLabel === key ? (
                      <div className="flex items-center justify-center gap-1 px-2 py-1.5">
                        <input ref={labelInputRef} value={labelDraft} onChange={e => setLabelDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveLabel(key); if (e.key === 'Escape') setEditingLabel(null); }}
                          className="bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-xs w-28 outline-none focus:border-emerald-500 text-white" />
                        <button onClick={() => saveLabel(key)} title="Lưu" className="text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingLabel(null)} title="Huỷ" className="text-zinc-500 hover:text-zinc-300"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 px-3 py-2.5">
                        <span className={copied === key ? 'text-emerald-400' : ''}>{colLabels[key]}</span>
                        <button onClick={() => setColMenu(prev => prev === key ? null : key)}
                          className="opacity-0 group-hover/th:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300 ml-0.5"
                          title="Tuỳ chọn cột">
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                            <circle cx="6" cy="2" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                    {colMenu === key && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px]">
                        <button onClick={() => copyColToClipboard(key)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white text-left">
                          <ClipboardCopy className="w-3.5 h-3.5" /> Sao chép cột
                        </button>
                        {canAdmin && (
                          <button onClick={() => startEditLabel(key)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white text-left">
                            <Pencil className="w-3.5 h-3.5" /> Đổi tên cột
                          </button>
                        )}
                        {canAdmin && colLabels[key] !== DEFAULT_LABELS[key] && (
                          <button onClick={() => resetLabel(key)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 text-left">
                            <X className="w-3.5 h-3.5" /> Đặt lại mặc định
                          </button>
                        )}
                        <div className="border-t border-zinc-700 my-1" />
                        <button onClick={() => { toggleCol(key); setColMenu(null); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white text-left">
                          <EyeOff className="w-3.5 h-3.5" /> Ẩn cột
                        </button>
                      </div>
                    )}
                  </th>
                ))}
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, mi) => {
                const diff = (m.qtyBoq ?? 0) - (m.qtyPlanned ?? 0);
                const hasBothQty = (m.qtyBoq ?? 0) > 0;
                return (
                  <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 group/row">
                    {visibleCols.map(key => (
                      <td key={key} className={`px-3 py-2 align-middle whitespace-nowrap ${key === 'name' ? 'text-left w-full' : 'text-center'}`}>

                        {key === 'stt' && <span className="text-zinc-500 text-xs">{mi + 1}</span>}

                        {key === 'boqCode' && (
                          <button onClick={() => canEdit && editBoq(m)}
                            title={canEdit ? `${m.boqCode ?? 'Chưa gán mã BOQ'} — bấm để sửa` : (m.boqCode ?? 'Chưa gán mã BOQ')}
                            className={`font-mono text-xs ${m.boqCode ? 'text-amber-400' : 'text-zinc-600'} ${canEdit ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>
                            {m.boqCode ?? '—'}
                          </button>
                        )}

                        {key === 'name' && (
                          <div className="flex items-center gap-2 min-w-0">
                            {canAdmin ? (
                              <input
                                defaultValue={m.name}
                                key={`name-${m.id}`}
                                onBlur={e => e.target.value.trim() && e.target.value !== m.name && patch(m.id, { name: e.target.value.trim() })}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { (e.target as HTMLInputElement).value = m.name; (e.target as HTMLInputElement).blur(); } }}
                                className="font-medium bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-600 focus:bg-zinc-800 rounded px-1 py-0.5 outline-none w-full min-w-0"
                              />
                            ) : (
                              <span className="font-medium truncate">{m.name}</span>
                            )}
                            {m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 shrink-0">
                                <AlertTriangle className="w-3 h-3" /> vượt ĐM
                              </span>
                            )}
                          </div>
                        )}

                        {key === 'unit' && (
                          canEdit ? (
                            <select value={m.unit ?? ''}
                              onChange={e => patch(m.id, { unit: e.target.value || null })}
                              className="bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-600 focus:bg-zinc-800 rounded px-1 py-0.5 text-xs outline-none text-zinc-300 text-center">
                              <option value="">—</option>
                              {DVT_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                              {m.unit && !DVT_OPTIONS.includes(m.unit) && <option value={m.unit}>{m.unit}</option>}
                            </select>
                          ) : (
                            <span className="text-zinc-400 text-xs">{m.unit ?? '—'}</span>
                          )
                        )}

                        {key === 'sheet' && (
                          <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs">{m.sheetCode ?? '—'}</span>
                        )}

                        {key === 'qtyBoq' && (
                          canEdit ? (
                            <input type="number" min="0" defaultValue={m.qtyBoq ?? 0} key={`b${m.id}-${m.qtyBoq}`}
                              onBlur={e => Number(e.target.value) !== (m.qtyBoq ?? 0) && patch(m.id, { qtyBoq: Number(e.target.value) })}
                              className="w-20 bg-transparent border border-transparent hover:border-zinc-700 focus:border-amber-600 focus:bg-zinc-800 rounded px-1 py-0.5 text-center outline-none text-amber-300" />
                          ) : (
                            <span className="text-amber-300">{m.qtyBoq ?? 0}</span>
                          )
                        )}

                        {key === 'qtyPlanned' && (
                          canEdit ? (
                            <input type="number" min="0" defaultValue={m.qtyPlanned} key={`p${m.id}-${m.qtyPlanned}`}
                              onBlur={e => Number(e.target.value) !== m.qtyPlanned && patch(m.id, { qtyPlanned: Number(e.target.value) })}
                              className="w-20 bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-600 focus:bg-zinc-800 rounded px-1 py-0.5 text-center outline-none" />
                          ) : (
                            <span>{m.qtyPlanned}</span>
                          )
                        )}

                        {key === 'diff' && (
                          <span className={`font-medium text-xs ${!hasBothQty ? 'text-zinc-600' : diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                            {!hasBothQty ? '—' : diff > 0 ? `+${diff}` : diff === 0 ? '0' : String(diff)}
                          </span>
                        )}

                        {key === 'status' && (() => {
                          const over = m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned;
                          return (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${over ? 'bg-red-900/60 text-red-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                              {over ? 'Vượt ĐM' : 'Trong ĐM'}
                            </span>
                          );
                        })()}

                        {key === 'note' && (
                          canEdit ? (
                            <input defaultValue={m.note ?? ''} key={`n${m.id}`}
                              onBlur={e => e.target.value !== (m.note ?? '') && patch(m.id, { note: e.target.value || null })}
                              placeholder="—"
                              className="w-full min-w-24 bg-transparent border border-transparent hover:border-zinc-700 focus:border-zinc-600 focus:bg-zinc-800 rounded px-1 py-0.5 text-center outline-none text-zinc-400 placeholder:text-zinc-700" />
                          ) : (
                            <span className="text-zinc-500 text-xs">{m.note ?? '—'}</span>
                          )
                        )}
                      </td>
                    ))}
                    {/* Actions — hiện khi hover */}
                    <td className="px-1 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button onClick={() => setHistoryMat(m)} title="Lịch sử nhập/xuất"
                          className="text-zinc-500 hover:text-emerald-400 p-1"><History className="w-3.5 h-3.5" /></button>
                        {canEdit && (m.qtyStock ?? 0) > 0 && (
                          <button onClick={() => { setIssueMat(m); setIssueQty(''); setIssueNote(''); }}
                            title="Xuất kho ra công trường"
                            className="text-zinc-500 hover:text-blue-400 p-1"><ArrowDownToLine className="w-3.5 h-3.5" /></button>
                        )}
                        {canEdit && (
                          <button onClick={() => copyRow(m)} title="Nhân đôi hàng"
                            className="text-zinc-500 hover:text-sky-400 p-1"><Copy className="w-3.5 h-3.5" /></button>
                        )}
                        {canDelete && (
                          <button onClick={() => remove(m)} title="Xoá hàng"
                            className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length + 1} className="p-8 text-center text-zinc-500">
                    {q ? `Không tìm thấy vật tư nào khớp "${search}"` : 'Chưa có vật tư nào — hãy Import Excel để thêm dữ liệu.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>}
      </main>

      {/* Modal sửa mã BOQ */}
      {boqEditMat && (
        <Modal onClose={closeBoqModal} className="max-w-sm">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <h3 className="font-semibold text-sm flex-1">Mã BOQ — {boqEditMat.name}</h3>
            <button onClick={closeBoqModal} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-zinc-500">Để trống = xoá mã. Gõ để lọc mã đã dùng.</p>
            <input
              autoFocus
              value={boqDraft}
              onChange={e => setBoqDraft(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitBoq(); } if (e.key === 'Escape') { e.stopPropagation(); closeBoqModal(); } }}
              placeholder="VD: AV4, AF3..."
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm font-mono outline-none"
            />
            {(() => {
              const matches = materials.filter(m => m.boqCode && m.id !== boqEditMat.id &&
                (!boqDraft || m.boqCode!.toLowerCase().includes(boqDraft.toLowerCase())));
              if (!matches.length) return null;
              return (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-700 divide-y divide-zinc-800">
                  {matches.map(m => {
                    const isDupe = m.boqCode?.toLowerCase() === boqDraft.toLowerCase();
                    return (
                      <button key={m.id} type="button"
                        onMouseDown={e => { e.preventDefault(); setBoqDraft(m.boqCode!); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-zinc-800 ${isDupe ? 'bg-red-900/30 text-red-300' : 'text-zinc-400'}`}>
                        <span className={`font-mono w-16 shrink-0 ${isDupe ? 'text-red-400' : 'text-amber-400'}`}>{m.boqCode}</span>
                        <span className="truncate">{m.name}</span>
                        {isDupe && <span className="ml-auto text-red-400 font-medium shrink-0">Trùng!</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={closeBoqModal} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white">Huỷ</button>
              <button onClick={submitBoq} className="px-4 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium">OK</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal xuất kho nhanh */}
      {issueMat && (
        <Modal onClose={() => setIssueMat(null)} className="max-w-sm">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-sm flex-1">Xuất kho — {issueMat.name}</h3>
            <button onClick={() => setIssueMat(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-zinc-400">
              Tồn kho hiện tại: <span className="text-blue-300 font-semibold">{issueMat.qtyStock} {issueMat.unit ?? ''}</span>
            </p>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Số lượng xuất *</label>
              <input type="number" min="0.001" max={issueMat.qtyStock} step="any"
                value={issueQty} onChange={e => setIssueQty(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Ghi chú (vị trí, tầng...)</label>
              <input value={issueNote} onChange={e => setIssueNote(e.target.value)}
                placeholder="vd: xuất tầng 24F, block A"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600" />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={async () => {
                  const qty = Number(issueQty);
                  if (!qty || qty <= 0) { setError('Số lượng không hợp lệ'); return; }
                  const r = await fetch(`/api/materials/${issueMat.id}/issue`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ qty, note: issueNote.trim() || undefined }),
                  });
                  if (r.ok) { setIssueMat(null); load(); }
                  else { const j = await r.json(); setError(j.error ?? 'Lỗi xuất kho'); }
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-lg py-2.5 text-sm font-medium">
                <ArrowDownToLine className="w-4 h-4" /> Xuất kho
              </button>
              <button onClick={() => setIssueMat(null)} className="px-4 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm text-zinc-400">Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {historyMat && (
        <MaterialHistoryModal material={historyMat} canEdit={canEdit}
          onClose={() => { setHistoryMat(null); load(); }} />
      )}
    </div>
  );
}

// ─── Modal lịch sử nhập/xuất ────────────────────────────────────────────────

type Transaction = { id: number; delta: number; qtyAfter: number; note: string | null; createdAt: string; userName: string | null; type?: string; };

function MaterialHistoryModal({ material, canEdit, onClose }: { material: Material; canEdit: boolean; onClose: () => void; }) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [qtyUsed, setQtyUsed] = useState(material.qtyUsed);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/materials/${material.id}/transactions`).then(r => r.json()).then(j => setItems(j.transactions ?? []));
  }, [material.id]);
  useEffect(() => { load(); }, [load]);

  async function add(sign: 1 | -1) {
    const d = (Number(delta) || 0) * sign;
    if (!d) return;
    setBusy(true); setError('');
    const res = await fetch(`/api/materials/${material.id}/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: d, note: note.trim() || undefined }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Lỗi không xác định'); }
    else { const j = await res.json(); setQtyUsed(j.qtyAfter); setDelta(''); setNote(''); }
    setBusy(false); load();
  }

  const over = material.qtyPlanned > 0 && qtyUsed > material.qtyPlanned;

  return (
    <Modal onClose={onClose} className="max-w-lg max-h-[85vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <History className="w-4 h-4 text-emerald-400" />
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">Nhập/xuất — {material.name}{material.unit ? ` (${material.unit})` : ''}</h3>
          <p className="text-xs text-zinc-500">
            {material.boqCode && <span className="font-mono text-amber-400 mr-2">{material.boqCode}</span>}
            Tồn kho: <span className="text-blue-300 font-medium">{material.qtyStock ?? 0}</span>
            {' · '} Đã dùng <span className={over ? 'text-red-400 font-medium' : 'text-zinc-300'}>{qtyUsed}</span>
            {material.qtyPlanned > 0 && <> / ĐM {material.qtyPlanned}</>}
          </p>
        </div>
        <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
      </div>

      {canEdit && (
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2">
            <input type="number" min="0" step="any" placeholder="Số lượng" value={delta} onChange={e => setDelta(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm w-28 outline-none focus:border-emerald-600" />
            <input placeholder="Ghi chú (vd: xuất cho tầng 24F)" value={note} onChange={e => setNote(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm flex-1 outline-none focus:border-emerald-600" />
            <button onClick={() => add(1)} disabled={busy || !Number(delta)}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-3 py-1.5 text-sm font-medium">+</button>
            <button onClick={() => add(-1)} disabled={busy || !Number(delta)}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded-lg px-3 py-1.5 text-sm font-medium">−</button>
          </div>
        </div>
      )}

      <div className="overflow-auto p-4">
        {items === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
        {items?.length === 0 && <p className="text-sm text-zinc-500">Chưa có giao dịch nào.</p>}
        {!!items?.length && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800 text-left">
                <th className="py-1.5 pr-2">Thời điểm</th>
                <th className="py-1.5 pr-2">Người ghi</th>
                <th className="py-1.5 pr-2 text-right">±</th>
                <th className="py-1.5 pr-2 text-right">Còn lại</th>
                <th className="py-1.5">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id} className="border-b border-zinc-800/50">
                  <td className="py-1.5 pr-2 text-zinc-400 whitespace-nowrap">{new Date(t.createdAt).toLocaleString('vi-VN')}</td>
                  <td className="py-1.5 pr-2 text-zinc-300">{t.userName ?? '—'}</td>
                  <td className={`py-1.5 pr-2 text-right font-medium ${t.delta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {t.delta >= 0 ? `+${t.delta}` : t.delta}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-zinc-300">{t.qtyAfter}</td>
                  <td className="py-1.5 text-zinc-500">{t.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
