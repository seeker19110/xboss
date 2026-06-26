'use client';
import { useEffect, useState, useCallback, useRef, useDeferredValue, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Package, Plus, Trash2, AlertTriangle, History, X,
  ChevronUp, ChevronDown, Copy, EyeOff, Eye, ClipboardCopy, Pencil, Check, FileUp, Search,
  Building2, ShoppingCart, ClipboardList, BarChart2, ArrowDownToLine, PenLine, LockOpen,
} from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import EditableText from '@/app/components/EditableText';
import EditModeToggle from '@/app/components/EditModeToggle';
import { Modal, appConfirm, appPrompt } from '@/app/components/dialogs';
import SuppliersTab from './_components/SuppliersTab';
import PurchaseRequestsTab from './_components/PurchaseRequestsTab';
import ReportsTab from './_components/ReportsTab';
import { Skeleton } from '@/app/components/Skeleton';
import SpreadsheetGrid, { type GridColumn, type GridEdit } from '@/app/components/SpreadsheetGrid';
import { Table2, RefreshCw } from 'lucide-react';

// Cache in-memory ngoài component — sống qua tab-switch, mất khi reload trang.
// Khác localStorage: không serialize/deserialize JSON → gán reference O(1).
let materialsCache: { key: string; data: Material[]; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30 giây — sau đó fetch lại background

type Material = {
  id: number; sheetTypeId: number | null; boqCode: string | null;
  name: string; unit: string | null;
  qtyBoq: number; qtyPlanned: number; qtyUsed: number;
  qtyStock: number; minStockLevel: number;
  status: string; note: string | null; sheetCode: string | null;
};
type Sheet = { id: number; code: string; name: string };

const DVT_OPTIONS = ['Cái', 'Mét', 'm2', 'Ống'];

// Cột "Trạng thái" = so sánh Định mức Tháp A với Định mức BOQ.
// Cần có Định mức BOQ ( > 0) mới so sánh; Tháp A vượt BOQ ⇒ "Vượt ĐM".
function budgetStatus(m: Material): 'none' | 'over' | 'within' {
  if ((m.qtyBoq ?? 0) <= 0) return 'none';
  return (m.qtyPlanned ?? 0) > (m.qtyBoq ?? 0) ? 'over' : 'within';
}
const BUDGET_LABEL: Record<'none' | 'over' | 'within', string> = {
  none: '—', over: 'Vượt ĐM', within: 'Trong ĐM',
};

type ColKey = 'boqCode' | 'stt' | 'name' | 'unit' | 'qtyBoq' | 'qtyPlanned' | 'diff' | 'status' | 'note';

const DEFAULT_LABELS: Record<ColKey, string> = {
  boqCode:    'Mã BOQ',
  stt:        'STT',
  name:       'Mô Tả',
  unit:       'ĐVT',
  qtyBoq:     'Định mức BOQ',
  qtyPlanned: 'Định mức Tháp A',
  diff:       'Chênh lệch ĐM',
  status:     'Trạng thái',
  note:       'Ghi chú',
};

const ALL_COL_KEYS: ColKey[] = ['boqCode', 'stt', 'name', 'unit', 'qtyBoq', 'qtyPlanned', 'diff', 'status', 'note'];

// Kết quả đồng bộ Google Sheet (khớp SyncSummary ở lib/material-sync).
type SyncSummary = {
  pushed: number; pulled: number; created: number; total: number;
  conflicts: { id: number; name: string; winner: 'db' | 'sheet' }[];
  skipped: { row: number; reason: string }[];
};

export default function MaterialsPage() {
  const [activeTab, setActiveTab] = useState<'materials' | 'suppliers' | 'requests' | 'reports'>('materials');
  const [role, setRole] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetFilter, setSheetFilter] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Chế độ "Bảng tính" (Excel/GG Sheet): lưới sửa nhanh copy/paste/fill — bật/tắt riêng.
  const [sheetMode, setSheetMode] = useState(false);
  const [error, setError] = useState('');
  const [historyMat, setHistoryMat] = useState<Material | null>(null);
  // Đồng bộ Google Sheet (hai chiều)
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncSummary | null>(null);

  const [search, setSearch] = useState('');
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set());
  const [colMenu, setColMenu] = useState<ColKey | null>(null);
  const [colLabels, setColLabels] = useState<Record<ColKey, string>>({ ...DEFAULT_LABELS });
  const [editingLabel, setEditingLabel] = useState<ColKey | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [boqEditMat, setBoqEditMat] = useState<Material | null>(null);
  const [boqDraft, setBoqDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [issueMat, setIssueMat] = useState<Material | null>(null);
  const [issueQty, setIssueQty] = useState('');
  const [issueNote, setIssueNote] = useState('');
  const colMenuRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback((revalidate = false) => {
    const cacheKey = sheetFilter;
    const now = Date.now();

    // Cache còn hợp lệ (cùng filter, trong TTL) và không cần revalidate → hiển thị ngay.
    if (!revalidate && materialsCache && materialsCache.key === cacheKey && now - materialsCache.ts < CACHE_TTL) {
      setMaterials(materialsCache.data);
      setLoading(false);
      return;
    }

    // Có cache cũ (cùng filter) → hiển thị ngay để tránh màn hình trắng, fetch mới ở background.
    if (materialsCache && materialsCache.key === cacheKey) {
      setMaterials(materialsCache.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const q = sheetFilter ? `?sheetTypeId=${sheetFilter}` : '';
    fetch(`/api/materials${q}`)
      .then(r => r.json().catch(() => ({ materials: [] })))
      .then(j => {
        const data: Material[] = j.materials ?? [];
        materialsCache = { key: cacheKey, data, ts: Date.now() };
        setMaterials(data);
        setLoading(false);
      })
      .catch(() => { setMaterials([]); setLoading(false); });
  }, [sheetFilter]);

  // Gộp 3 fetch khởi tạo thành Promise.all để khai thác HTTP/2 multiplexing.
  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me'),
      fetch('/api/sheets'),
      fetch('/api/materials/columns'),
    ]).then(async ([meRes, sheetsRes, colsRes]) => {
      if (meRes.status === 401) { window.location.href = '/login'; return; }
      const [meJ, sheetsJ, colsJ] = await Promise.all([
        meRes.json(),
        sheetsRes.json(),
        colsRes.json().catch(() => ({})),
      ]);
      const role = meJ.user?.role;
      setRole(role ?? '');
      setUserId(meJ.user?.id ?? null);
      setCanEdit(role === 'admin' || role === 'pm' || role === 'engineer');
      setCanDelete(role === 'admin' || role === 'pm');
      setCanAdmin(role === 'admin' || role === 'pm');
      setSheets(sheetsJ.sheets ?? []);
      if (colsJ.labels && typeof colsJ.labels === 'object') {
        setColLabels(prev => ({ ...prev, ...colsJ.labels }));
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
    okFn?.(); load(true); // revalidate: bỏ qua cache sau khi mutate
  }

  const patch = (id: number, body: object) =>
    api(`/api/materials/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

  // Đồng bộ hai chiều vật tư ↔ Google Sheet (Admin/PM).
  async function runSync() {
    if (!await appConfirm('Đồng bộ hai chiều vật tư với Google Sheet?\nThay đổi ở cả hai phía sẽ được gộp (DB ưu tiên khi xung đột).', { confirmLabel: 'Đồng bộ' })) return;
    setError('');
    setSyncing(true);
    try {
      const res = await fetch('/api/materials/sync', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Lỗi đồng bộ Google Sheet'); return; }
      setSyncResult(j.summary as SyncSummary);
      load(true);
    } catch {
      setError('Không kết nối được máy chủ để đồng bộ.');
    } finally {
      setSyncing(false);
    }
  }

  const remove = async (m: Material) => {
    if (await appConfirm(`Xoá vật tư "${m.name}"?`, { danger: true, confirmLabel: 'Xoá' }))
      api(`/api/materials/${m.id}`, { method: 'DELETE' });
  };

  // Xoá nhiều dòng đang chọn trong lưới bảng tính.
  const removeRows = useCallback(async (ids: (number | string)[]) => {
    if (!ids.length) return;
    if (!await appConfirm(`Xoá ${ids.length} vật tư đang chọn?`, { danger: true, confirmLabel: 'Xoá' })) return;
    setError('');
    const results = await Promise.all(ids.map(id =>
      fetch(`/api/materials/${id}`, { method: 'DELETE' }).then(r => r.ok).catch(() => false)));
    const failed = results.filter(ok => !ok).length;
    if (failed) setError(`Không xoá được ${failed}/${ids.length} vật tư.`);
    load(true);
  }, [load]);

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
        case 'qtyBoq': return String(m.qtyBoq ?? 0);
        case 'qtyPlanned': return String(m.qtyPlanned);
        case 'diff': return String((m.qtyBoq ?? 0) - (m.qtyPlanned ?? 0));
        case 'status': return BUDGET_LABEL[budgetStatus(m)];
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

  const deferredSearch = useDeferredValue(search);
  const q = deferredSearch.trim().toLowerCase();
  const filtered = q
    ? materials.filter(m =>
        (m.boqCode ?? '').toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.sheetCode ?? '').toLowerCase().includes(q) ||
        (m.unit ?? '').toLowerCase().includes(q)
      )
    : materials;

  // Thêm 1 dòng vật tư trống vào cuối lưới bảng tính. Cần biết hệ (sheetTypeId):
  // ưu tiên filter đang chọn, nếu không lấy theo dòng cuối đang hiển thị.
  const addBlankRow = useCallback(async () => {
    const sheetTypeId = sheetFilter ? Number(sheetFilter) : filtered[filtered.length - 1]?.sheetTypeId;
    if (!sheetTypeId) { setError('Chọn hệ (ở góc trên) trước khi thêm dòng mới'); return; }
    await api('/api/materials', { method: 'POST', body: JSON.stringify({ name: 'Vật tư mới', sheetTypeId }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetFilter, filtered]);

  // Cấu hình cột cho lưới bảng tính. Cột dẫn xuất (stt/diff/status) chỉ đọc;
  // còn lại sửa được khi có quyền. STT cần chỉ số dòng → tra qua idxMap.
  const idxMap = useMemo(() => {
    const m = new Map<number, number>();
    filtered.forEach((mat, i) => m.set(mat.id, i + 1));
    return m;
  }, [filtered]);

  const gridColumns: GridColumn<Material>[] = useMemo(() => {
    // Trong chế độ bảng tính, bản thân lưới là affordance sửa — không cần editMode.
    const editableBy = (admin: boolean) => admin ? canAdmin : canEdit;
    const defs: Record<ColKey, GridColumn<Material>> = {
      boqCode: { key: 'boqCode', label: colLabels.boqCode, width: 90, type: 'text', editable: editableBy(false),
        get: m => m.boqCode ?? '', toPatch: raw => ({ boqCode: raw.trim().toUpperCase() }) },
      stt: { key: 'stt', label: colLabels.stt, width: 50, type: 'readonly', align: 'center',
        get: m => idxMap.get(m.id) ?? '' },
      name: { key: 'name', label: colLabels.name, width: 280, type: 'text', editable: editableBy(true),
        get: m => m.name, toPatch: raw => raw.trim() ? { name: raw.trim() } : null },
      unit: { key: 'unit', label: colLabels.unit, width: 80, type: 'select', editable: editableBy(false),
        options: [{ value: '', label: '—' }, ...DVT_OPTIONS.map(v => ({ value: v, label: v }))],
        get: m => m.unit ?? '', toPatch: raw => ({ unit: raw.trim() || null }) },
      qtyBoq: { key: 'qtyBoq', label: colLabels.qtyBoq, width: 110, type: 'number', editable: editableBy(false),
        get: m => m.qtyBoq ?? 0, toPatch: raw => ({ qtyBoq: Number(raw) || 0 }) },
      qtyPlanned: { key: 'qtyPlanned', label: colLabels.qtyPlanned, width: 120, type: 'number', editable: editableBy(false),
        get: m => m.qtyPlanned ?? 0, toPatch: raw => ({ qtyPlanned: Number(raw) || 0 }) },
      diff: { key: 'diff', label: colLabels.diff, width: 100, type: 'readonly', align: 'right',
        get: m => ((m.qtyBoq ?? 0) > 0 ? (m.qtyBoq ?? 0) - (m.qtyPlanned ?? 0) : '—') },
      status: { key: 'status', label: colLabels.status, width: 110, type: 'readonly', align: 'center',
        get: m => BUDGET_LABEL[budgetStatus(m)] },
      note: { key: 'note', label: colLabels.note, width: 180, type: 'text', editable: editableBy(false),
        get: m => m.note ?? '', toPatch: raw => ({ note: raw.trim() || null }) },
    };
    return visibleCols.map(k => defs[k]);
  }, [visibleCols, colLabels, idxMap, canAdmin, canEdit]);

  // Cột dính: các cột dẫn đầu trong nhóm mã/STT/tên.
  const stickyCount = useMemo(() => {
    let n = 0;
    for (const k of visibleCols) { if (['boqCode', 'stt', 'name'].includes(k)) n++; else break; }
    return n;
  }, [visibleCols]);

  const commitGrid = useCallback(async (edits: GridEdit[]) => {
    setError('');
    const res = await fetch('/api/materials/batch', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: edits.map(e => ({ id: e.rowId, patch: e.patch })) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = j.error ?? 'Lỗi lưu';
      setError(msg);
      throw new Error(msg);
    }
    load(true); // revalidate sau khi sửa
  }, [load]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => colMenuRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader>
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
        <EditModeToggle canEdit={canEdit} editMode={editMode} onToggle={() => setEditMode(v => !v)} />
      </AppHeader>

      <main className="p-4 sm:p-6 w-full space-y-4">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-zinc-800 pb-0 overflow-x-auto">
          {[
            { key: 'materials' as const, icon: <Package className="w-3.5 h-3.5" />, label: 'Định Mức BOQ' },
            { key: 'suppliers' as const, icon: <Building2 className="w-3.5 h-3.5" />, label: 'Nhà cung cấp' },
            { key: 'requests' as const, icon: <ShoppingCart className="w-3.5 h-3.5" />, label: 'Yêu cầu mua' },
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
          {/* Tách sang trang riêng: form đơn đặt hàng (in PDF) + quản lý PO */}
          <a href="/materials/order-form"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition-colors">
            <ClipboardList className="w-3.5 h-3.5" /> Đơn đặt hàng
          </a>
          <a href="/materials/purchase-orders"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-zinc-400 hover:text-zinc-200 transition-colors">
            <ClipboardList className="w-3.5 h-3.5" /> Quản lý đơn hàng
          </a>
        </div>

        {/* Nội dung các tab phụ */}
        {activeTab === 'suppliers' && <SuppliersTab role={role} />}
        {activeTab === 'requests' && <PurchaseRequestsTab role={role} userId={userId} materials={materials} />}
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
          {canEdit && (
            <button onClick={() => setSheetMode(v => !v)}
              title={sheetMode ? 'Tắt chế độ bảng tính' : 'Bật chế độ bảng tính (copy/paste/fill như Excel)'}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition shrink-0 border ${
                sheetMode ? 'bg-sky-600/20 border-sky-600 text-sky-300' : 'border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white'}`}>
              <Table2 className="w-4 h-4" /> Bảng tính
            </button>
          )}
          <a href="/materials/order-form"
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl px-4 py-2.5 text-sm font-medium transition shrink-0">
            <Plus className="w-4 h-4" /> Đặt hàng
          </a>
          {canEdit && (
            <a href="/materials/import"
              className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-xl px-4 py-2.5 text-sm font-medium transition shrink-0">
              <FileUp className="w-4 h-4" /> Import Excel
            </a>
          )}
          {canAdmin && (
            <button onClick={runSync} disabled={syncing}
              title="Đồng bộ hai chiều bảng vật tư với Google Sheet"
              className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-xl px-4 py-2.5 text-sm font-medium transition shrink-0 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Đang đồng bộ…' : 'Đồng bộ Google Sheet'}
            </button>
          )}
        </div>

        {/* Badge kết quả tìm kiếm */}
        {q && (
          <p className="text-xs text-zinc-500">
            Tìm thấy <span className="text-white font-medium">{filtered.length}</span> / {materials.length} vật tư
          </p>
        )}

        {/* Skeleton khi chưa có dữ liệu lần đầu */}
        {loading && materials.length === 0 && (
          <div className="space-y-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className={`h-10 w-full ${i === 0 ? 'h-12' : ''}`} />
            ))}
          </div>
        )}

        {/* Chế độ bảng tính: lưới sửa nhanh copy/paste/fill, dữ liệu vẫn lưu Postgres */}
        {sheetMode && !(loading && materials.length === 0) && (
          <>
            <p className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Mẹo: click ô để chọn, <b>Enter</b>/gõ để sửa, <b>Ctrl/⌘+C</b> sao chép, <b>Ctrl/⌘+V</b> dán, <b>Ctrl/⌘+D</b> điền xuống, kéo chọn vùng.</span>
              {filtered.length > 0 && <span>{filtered.length} dòng</span>}
            </p>
            <SpreadsheetGrid<Material>
              rows={filtered}
              columns={gridColumns}
              rowKey={m => m.id}
              onCommit={commitGrid}
              readOnly={!canEdit}
              stickyCols={stickyCount}
              maxBodyHeight={Math.round(typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600)}
              onAddRow={canEdit ? addBlankRow : undefined}
              onDeleteRows={canDelete ? removeRows : undefined}
            />
            {filtered.length === 0 && (
              <p className="p-8 text-center text-zinc-500 text-sm">
                {q ? `Không tìm thấy vật tư nào khớp "${search}"` : 'Chưa có vật tư nào — hãy Import Excel để thêm dữ liệu.'}
              </p>
            )}
          </>
        )}

        <div className={`bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto ${(loading && materials.length === 0) || sheetMode ? 'hidden' : ''}`}
          ref={colMenuRef} style={{ maxHeight: 'calc(100vh - 13rem)' }}>
          <table className="w-full text-sm border-collapse table-auto">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-800 bg-zinc-900">
                {visibleCols.map(key => (
                  <th key={key} className={`text-center text-xs text-zinc-400 font-semibold p-0 align-middle whitespace-nowrap relative group/th ${key === 'name' ? 'w-full min-w-[250px]' : ''}`}>
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
                          className="opacity-100 sm:opacity-0 sm:group-hover/th:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300 ml-0.5"
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
                {canEdit && (
                  <th className="w-10 px-2 text-center align-middle">
                    <button onClick={() => setEditMode(v => !v)}
                      title={editMode ? 'Tắt chế độ chỉnh sửa' : 'Bật chế độ chỉnh sửa'}
                      className={`p-1.5 rounded-lg transition-colors ${editMode ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'}`}>
                      {editMode ? <PenLine className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getVirtualItems()[0].start > 0 && (
                <tr><td style={{ height: rowVirtualizer.getVirtualItems()[0].start }} /></tr>
              )}
              {rowVirtualizer.getVirtualItems().map(vRow => {
                const m = filtered[vRow.index];
                const mi = vRow.index;
                const globalIdx = mi;
                const diff = (m.qtyBoq ?? 0) - (m.qtyPlanned ?? 0);
                const hasBothQty = (m.qtyBoq ?? 0) > 0;
                return (
                  <tr key={m.id} className={`border-b border-zinc-800/50 hover:bg-zinc-700/40 group/row ${mi % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800/30'}`}>
                    {visibleCols.map(key => (
                      <td key={key} className={`px-3 py-2 align-middle ${key === 'name' ? 'text-left w-full min-w-[250px] overflow-hidden' : 'whitespace-nowrap ' + (key === 'boqCode' ? 'text-left' : 'text-center')}`}>

                        {key === 'stt' && <span className="text-zinc-500 text-xs">{globalIdx + 1}</span>}

                        {key === 'boqCode' && (
                          <button onClick={() => canEdit && editMode && editBoq(m)}
                            title={canEdit && editMode ? `${m.boqCode ?? 'Chưa gán mã BOQ'} — bấm để sửa` : (m.boqCode ?? 'Chưa gán mã BOQ')}
                            className={`font-mono text-xs ${m.boqCode ? 'text-amber-400' : 'text-zinc-600'} ${canEdit && editMode ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>
                            {m.boqCode ?? '—'}
                          </button>
                        )}

                        {key === 'name' && (
                          <div className="flex items-center gap-2 min-w-0">
                            {canAdmin && editMode ? (
                              <textarea
                                defaultValue={m.name}
                                key={`name-${m.id}`}
                                rows={1}
                                ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                                onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                                onKeyDown={e => {
                                  if (e.key === 'Escape') { const t = e.target as HTMLTextAreaElement; t.value = m.name; t.blur(); }
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
                                }}
                                onBlur={async e => {
                                  const newName = e.target.value.trim();
                                  if (!newName || newName === m.name) { e.target.value = m.name; return; }
                                  const ok = await appConfirm(`Đổi tên "${m.name}" thành "${newName}"?`, { confirmLabel: 'Đổi tên' });
                                  if (ok) { patch(m.id, { name: newName }); }
                                  else { e.target.value = m.name; }
                                }}
                                className="font-medium bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-600 focus:bg-zinc-800 rounded px-1 py-0.5 outline-none w-full min-w-0 resize-none overflow-hidden leading-snug"
                              />
                            ) : (
                              <span className="font-medium whitespace-pre-wrap break-words">{m.name}</span>
                            )}
                            {m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 shrink-0">
                                <AlertTriangle className="w-3 h-3" /> vượt ĐM
                              </span>
                            )}
                          </div>
                        )}

                        {key === 'unit' && (
                          canEdit && editMode ? (
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

                        {key === 'qtyBoq' && (
                          canEdit && editMode ? (
                            <input type="number" min="0" defaultValue={m.qtyBoq ?? 0} key={`b${m.id}-${m.qtyBoq}`}
                              onBlur={e => Number(e.target.value) !== (m.qtyBoq ?? 0) && patch(m.id, { qtyBoq: Number(e.target.value) })}
                              className="w-20 bg-transparent border border-transparent hover:border-zinc-700 focus:border-amber-600 focus:bg-zinc-800 rounded px-1 py-0.5 text-center outline-none text-amber-300" />
                          ) : (
                            <span className="text-amber-300">{m.qtyBoq ?? 0}</span>
                          )
                        )}

                        {key === 'qtyPlanned' && (
                          canEdit && editMode ? (
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
                          const bs = budgetStatus(m);
                          if (bs === 'none') return <span className="text-zinc-600 text-xs">—</span>;
                          return bs === 'over' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-950 text-rose-300">
                              <AlertTriangle className="w-3 h-3" /> Vượt ĐM
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-950 text-emerald-300">
                              <Check className="w-3 h-3" /> Trong ĐM
                            </span>
                          );
                        })()}

                        {key === 'note' && (
                          canEdit && editMode ? (
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
                    {/* Actions — hiện khi hover, chỉ hiện đủ khi editMode */}
                    {canEdit && (
                    <td className="px-1 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-0 opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
                        <button onClick={() => setHistoryMat(m)} title="Lịch sử nhập/xuất"
                          className="text-zinc-500 hover:text-emerald-400 p-2"><History className="w-3.5 h-3.5" /></button>
                        {editMode && (m.qtyStock ?? 0) > 0 && (
                          <button onClick={() => { setIssueMat(m); setIssueQty(''); setIssueNote(''); }}
                            title="Xuất kho ra công trường"
                            className="text-zinc-500 hover:text-blue-400 p-2"><ArrowDownToLine className="w-3.5 h-3.5" /></button>
                        )}
                        {editMode && (
                          <button onClick={() => copyRow(m)} title="Nhân đôi hàng"
                            className="text-zinc-500 hover:text-sky-400 p-2"><Copy className="w-3.5 h-3.5" /></button>
                        )}
                        {editMode && canDelete && (
                          <button onClick={() => remove(m)} title="Xoá hàng"
                            className="text-zinc-500 hover:text-red-400 p-2"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                    )}
                  </tr>
                );
              })}
              {(() => {
                const items = rowVirtualizer.getVirtualItems();
                const paddingBottom = items.length > 0
                  ? rowVirtualizer.getTotalSize() - items[items.length - 1].end
                  : 0;
                return paddingBottom > 0 ? <tr><td style={{ height: paddingBottom }} /></tr> : null;
              })()}
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

      {/* Modal kết quả đồng bộ Google Sheet */}
      {syncResult && (
        <Modal onClose={() => setSyncResult(null)} className="max-w-md">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm flex-1">Kết quả đồng bộ Google Sheet</h3>
            <button onClick={() => setSyncResult(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <div className="text-xs text-zinc-500">Đẩy ra Sheet</div>
                <div className="text-lg font-semibold text-sky-300">{syncResult.pushed}</div>
              </div>
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <div className="text-xs text-zinc-500">Kéo về DB</div>
                <div className="text-lg font-semibold text-emerald-300">{syncResult.pulled}</div>
              </div>
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <div className="text-xs text-zinc-500">Tạo mới từ Sheet</div>
                <div className="text-lg font-semibold text-violet-300">{syncResult.created}</div>
              </div>
              <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                <div className="text-xs text-zinc-500">Tổng vật tư</div>
                <div className="text-lg font-semibold text-zinc-200">{syncResult.total}</div>
              </div>
            </div>
            {syncResult.conflicts.length > 0 && (
              <div>
                <div className="text-xs font-medium text-amber-400 mb-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {syncResult.conflicts.length} xung đột (DB ưu tiên)
                </div>
                <ul className="space-y-1 max-h-40 overflow-y-auto text-xs text-zinc-400">
                  {syncResult.conflicts.map(c => <li key={c.id}>• {c.name}</li>)}
                </ul>
              </div>
            )}
            {syncResult.skipped.length > 0 && (
              <div>
                <div className="text-xs font-medium text-zinc-400 mb-1.5">{syncResult.skipped.length} dòng bỏ qua</div>
                <ul className="space-y-1 max-h-40 overflow-y-auto text-xs text-zinc-500">
                  {syncResult.skipped.map((s, i) => <li key={i}>• Dòng {s.row}: {s.reason}</li>)}
                </ul>
              </div>
            )}
            {syncResult.conflicts.length === 0 && syncResult.skipped.length === 0 && (
              <p className="text-xs text-zinc-500">Đồng bộ hoàn tất, không có xung đột.</p>
            )}
          </div>
        </Modal>
      )}

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
