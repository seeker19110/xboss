'use client';
import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { ArrowLeft, Search, ChevronRight, ChevronDown, Pencil, Check, X, History, UserCheck, RefreshCw, Link2, Camera, Trash2, Upload, MessageSquare, Send, WifiOff, CloudUpload, Plus, ChevronUp, ChevronDown as ChevronDownIcon, Columns } from 'lucide-react';
import { useOfflineTickQueue } from '@/app/components/offlineQueue';
import { DELAY_REASON_LABEL } from '@/lib/delay';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};
const STATUS_CLS: Record<string, string> = {
  chuan_bi: 'bg-zinc-800 text-zinc-300', dang_thi_cong: 'bg-blue-950 text-blue-300',
  hoan_thanh: 'bg-emerald-950 text-emerald-300', nghiem_thu: 'bg-teal-950 text-teal-300',
  tre: 'bg-red-950 text-red-300',
};

type Task = { id: number; code: string; name: string; status: string; endDate: string | null; progressPercent: number };
type Pkg = { id: number; code: string; floorLabel: string | null; name: string; status: string; progress: number; tasks: Task[]; boqCode: string | null; drawingUrl: string | null };
type Data = { sheet: { id?: number; code: string; name: string; responsible?: string }; packages: Pkg[]; version?: string };
type AppUser = { id: number; name: string; role: string };

const SYNC_POLL_MS = 10_000;

// Ngày rút gọn d/M cho dòng task (đỡ chiếm chỗ trên lưới).
const fmtShortDate = (d: string | null) => {
  if (!d) return '?';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '?' : `${dt.getDate()}/${dt.getMonth() + 1}`;
};

export default function TrackingPage({ params }: { params: { sheet: string } }) {
  const { sheet } = params;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState('');
  // ?floor=4F trên URL (từ heatmap Dashboard) → mở sẵn filter tầng.
  const [floorFilter, setFloorFilter] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('floor') ?? '' : '');
  const [statusFilter, setStatusFilter] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [editPkg, setEditPkg] = useState<{ id: number; value: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncToast, setSyncToast] = useState(false);
  const versionRef = useRef<string | null>(null);
  const editingRef = useRef(false);
  editingRef.current = editPkg !== null;

  const load = useCallback(() => {
    fetch(`/api/tasks?sheet=${sheet}`).then(r => r.json()).then((d: Data) => {
      setData(d);
      if (d?.version) versionRef.current = d.version;
    }).catch(() => { /* mất mạng — giữ dữ liệu đang hiển thị */ }).finally(() => setLoading(false));
  }, [sheet]);
  useEffect(() => { load(); }, [load]);

  // Hàng đợi offline: tick khi mất mạng được gửi lại tự động lúc có mạng.
  const { pending: offlinePending, online, enqueue } = useOfflineTickQueue(load);

  // Đồng bộ đa người dùng: SSE (/api/events, độ trễ ~3s) — lỗi/timeout thì
  // fallback về poll watermark 10s như trước. Người khác sửa → tự reload + toast.
  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const applyVersion = (v: string) => {
      if (document.hidden || editingRef.current) return;
      if (versionRef.current && v !== versionRef.current) {
        versionRef.current = v;
        load();
        setRefreshKey(k => k + 1);
        setSyncToast(true);
        setTimeout(() => setSyncToast(false), 3500);
      } else {
        versionRef.current = v;
      }
    };

    const startPolling = () => {
      if (pollTimer || stopped) return;
      pollTimer = setInterval(async () => {
        if (document.hidden || editingRef.current) return;
        try {
          const r = await fetch(`/api/tasks/version?sheet=${sheet}`);
          if (!r.ok) return;
          applyVersion((await r.json()).v);
        } catch { /* mạng chập chờn — thử lại lần poll sau */ }
      }, SYNC_POLL_MS);
    };

    if (typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/events?sheet=${sheet}`);
      es.addEventListener('version', e => {
        try { applyVersion(JSON.parse((e as MessageEvent).data).v); } catch { /* payload lạ — bỏ qua */ }
      });
      es.onerror = () => { es?.close(); es = null; startPolling(); };
    } else {
      startPolling();
    }

    return () => { stopped = true; es?.close(); if (pollTimer) clearInterval(pollTimer); };
  }, [sheet, load]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => {
      if (!j) { window.location.href = '/login'; return; }
      const role = j?.user?.role;
      const editable = role === 'admin' || role === 'pm';
      setCanEdit(editable);
      if (editable) fetch('/api/users').then(r => r.ok ? r.json() : null).then(x => setUsers(x?.users ?? []));
    });
  }, []);

  async function savePkgName(id: number, name: string) {
    await fetch(`/api/workpackages/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    setEditPkg(null); load();
  }

  async function addPackageAfter(afterPkg: Pkg | null) {
    const sheetTypeId = data?.sheet?.id;
    if (!sheetTypeId) { window.alert('Không lấy được sheetTypeId'); return; }
    const code = window.prompt('Mã nhóm mới (ví dụ: A10):');
    if (!code?.trim()) return;
    const name = window.prompt('Tên nhóm:');
    if (!name?.trim()) return;
    const floorLabel = window.prompt('Tầng (tuỳ chọn, để trống bỏ qua):') ?? '';
    const res = await fetch('/api/workpackages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetTypeId, code: code.trim(), name: name.trim(), floorLabel: floorLabel.trim() || undefined, afterId: afterPkg?.id }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); return; }
    load();
  }

  async function movePackage(p: Pkg, direction: 'up' | 'down') {
    await fetch(`/api/workpackages/${p.id}/move`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
    });
    load();
  }

  async function editPkgBoq(p: Pkg) {
    const v = window.prompt('BOQCODE của nhóm (duy nhất toàn hệ thống, để trống = xoá mã):', p.boqCode ?? '');
    if (v === null) return;
    const res = await fetch(`/api/workpackages/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boqCode: v }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); return; }
    load();
  }

  async function editPkgDrawing(p: Pkg) {
    const v = window.prompt('Link bản vẽ / BBNT của nhóm (để trống = xoá):', p.drawingUrl ?? '');
    if (v === null) return;
    await fetch(`/api/workpackages/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drawingUrl: v.trim() || null }),
    });
    load();
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Đang tải...</div>;

  const floors = [...new Set((data?.packages ?? []).map(p => p.floorLabel).filter((f): f is string => !!f))]
    .sort((a, b) => parseInt(a) - parseInt(b));
  const q = query.toLowerCase();
  const packages = (data?.packages ?? []).filter(p =>
    (!q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.boqCode ?? '').toLowerCase().includes(q))
    && (!floorFilter || p.floorLabel === floorFilter)
    && (!statusFilter || p.status === statusFilter));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <a href="/" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></a>
        <div>
          <h1 className="text-lg font-bold">{data?.sheet.name ?? sheet}</h1>
          <p className="text-xs text-zinc-500">{data?.sheet.code} {data?.sheet.responsible ? `· ${data.sheet.responsible}` : ''}</p>
        </div>
        {canEdit && <span className="ml-auto text-xs bg-emerald-950 text-emerald-400 px-2 py-1 rounded">Chế độ chỉnh sửa (Admin/PM)</span>}
      </header>

      <div className="px-6 py-3 flex flex-wrap gap-3 items-center border-b border-zinc-800/60">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhóm/tầng..."
            className="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56 outline-none focus:border-emerald-600" />
        </div>
        <select value={floorFilter} onChange={e => setFloorFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả tầng</option>
          {floors.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-xs text-zinc-500 ml-auto">{packages.length} nhóm · bấm vào nhóm để mở lưới checkbox</span>
      </div>

      <main className="p-4 space-y-2">
        {canEdit && (
          <button onClick={() => addPackageAfter(null)}
            title="Thêm nhóm mới vào đầu danh sách"
            className="w-full flex items-center justify-center gap-1.5 border border-dashed border-zinc-700 hover:border-emerald-600 hover:text-emerald-400 text-zinc-600 rounded-xl py-1.5 text-xs transition">
            <Plus className="w-3.5 h-3.5" /> Thêm nhóm
          </button>
        )}
        {packages.map((p, pi) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Bấm bất kỳ đâu trên hàng để mở/đóng lưới; các nút bên trong stopPropagation. */}
            <div onClick={() => setExpanded(s => ({ ...s, [p.id]: !s[p.id] }))}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 cursor-pointer select-none">
              {expanded[p.id] ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
              <span className="font-mono text-emerald-400 shrink-0 max-w-[180px] truncate" title={`BOQCODE: ${p.boqCode ?? p.code} (mã Excel: ${p.code})`}>
                {p.boqCode ?? p.code}
              </span>
              {canEdit && (
                <button onClick={e => { e.stopPropagation(); editPkgBoq(p); }} title="Sửa BOQCODE"
                  className="text-zinc-600 hover:text-amber-400 shrink-0"><Pencil className="w-3 h-3" /></button>
              )}
              {(p.drawingUrl || canEdit) && (
                p.drawingUrl ? (
                  <span className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
                    <a href={p.drawingUrl} target="_blank" rel="noreferrer" title={`Bản vẽ: ${p.drawingUrl}`}
                      className="text-sky-400 hover:text-sky-300"><Link2 className="w-3.5 h-3.5" /></a>
                    {canEdit && <button onClick={() => editPkgDrawing(p)} title="Sửa link bản vẽ" className="text-zinc-600 hover:text-emerald-400 ml-0.5"><Pencil className="w-3 h-3" /></button>}
                  </span>
                ) : (
                  <button onClick={e => { e.stopPropagation(); editPkgDrawing(p); }} title="Thêm link bản vẽ / BBNT"
                    className="text-zinc-700 hover:text-sky-400 shrink-0"><Link2 className="w-3.5 h-3.5" /></button>
                )
              )}
              {editPkg?.id === p.id ? (
                <span className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                  <input autoFocus value={editPkg.value} onChange={e => setEditPkg({ id: p.id, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') savePkgName(p.id, editPkg.value); if (e.key === 'Escape') setEditPkg(null); }}
                    className="bg-zinc-800 border border-emerald-600 rounded px-2 py-1 text-sm flex-1 outline-none" />
                  <button onClick={() => savePkgName(p.id, editPkg.value)} className="text-emerald-400"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditPkg(null)} className="text-zinc-500"><X className="w-4 h-4" /></button>
                </span>
              ) : (
                <span className="font-medium flex-1 flex items-center gap-2 min-w-0">
                  <span className="truncate">{p.name}</span>
                  {canEdit && <button onClick={e => { e.stopPropagation(); setEditPkg({ id: p.id, value: p.name }); }} className="text-zinc-600 hover:text-emerald-400 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>}
                </span>
              )}
              <span className="text-xs text-zinc-500 w-10 text-right shrink-0">{p.floorLabel || ''}</span>
              <span className="text-xs text-zinc-500 w-14 text-right shrink-0">{p.tasks.length} task</span>
              <div className="flex items-center gap-2 w-36 shrink-0">
                <div className="bg-zinc-800 rounded-full h-1.5 flex-1"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(p.progress ?? 0) * 100}%` }} /></div>
                <span className="text-zinc-400 text-sm w-10 text-right">{Math.round((p.progress ?? 0) * 100)}%</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs w-28 text-center shrink-0 ${STATUS_CLS[p.status] ?? STATUS_CLS.chuan_bi}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
              {canEdit && (
                <span className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => movePackage(p, 'up')} title="Di chuyển lên" disabled={pi === 0}
                    className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => movePackage(p, 'down')} title="Di chuyển xuống" disabled={pi === packages.length - 1}
                    className="p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-30"><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                </span>
              )}
            </div>
            {expanded[p.id] && <PkgGrid pkgId={p.id} canEdit={canEdit} users={users} refreshKey={refreshKey} onChanged={load} onOfflineTick={enqueue} />}
            {canEdit && (
              <button onClick={() => addPackageAfter(p)}
                title="Chèn nhóm mới ngay dưới nhóm này"
                className="w-full flex items-center justify-center gap-1 border-t border-dashed border-zinc-800 hover:border-emerald-700 hover:bg-emerald-950/20 hover:text-emerald-500 text-zinc-700 py-1 text-[10px] transition">
                <Plus className="w-3 h-3" /> chèn nhóm sau
              </button>
            )}
          </div>
        ))}
        {packages.length === 0 && (
          <div className="p-8 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">Không có dữ liệu. Hãy import file Excel trước.</div>
        )}
      </main>

      {syncToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-900/95 border border-emerald-700 text-emerald-200 px-4 py-2 rounded-full text-sm shadow-xl">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Dữ liệu vừa được người khác cập nhật — đã làm mới
        </div>
      )}

      {(!online || offlinePending > 0) && (
        <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm shadow-xl border ${
          online ? 'bg-sky-900/95 border-sky-700 text-sky-200' : 'bg-amber-900/95 border-amber-700 text-amber-200'}`}>
          {online
            ? <><CloudUpload className="w-3.5 h-3.5 animate-pulse" /> Đang gửi lại {offlinePending} thay đổi đã lưu offline...</>
            : <><WifiOff className="w-3.5 h-3.5" /> Mất mạng — thao tác vẫn được lưu{offlinePending > 0 ? ` (${offlinePending} chờ gửi)` : ''}, tự đồng bộ khi có mạng</>}
        </div>
      )}
    </div>
  );
}

type Cell = { id: number; installed: boolean };
type GridTask = { id: number; code: string; name: string; status: string; progressPercent: number; boqCode: string | null; drawingUrl: string | null; assignedTo: number | null; assigneeName: string | null; photoCount: number; commentCount: number; delayReason: string | null; startDate: string | null; endDate: string | null; cells: Record<string, Cell> };
type Grid = { columns: string[]; tasks: GridTask[] };

function PkgGrid({ pkgId, canEdit, users, refreshKey, onChanged, onOfflineTick }: { pkgId: number; canEdit: boolean; users: AppUser[]; refreshKey: number; onChanged: () => void; onOfflineTick: (dimId: number, installed: boolean) => void }) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [editTask, setEditTask] = useState<{ id: number; value: string } | null>(null);
  const [historyTask, setHistoryTask] = useState<GridTask | null>(null);
  const [photosTask, setPhotosTask] = useState<GridTask | null>(null);
  const [commentsTask, setCommentsTask] = useState<GridTask | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Mục tiêu sửa ngày: 1 task hoặc danh sách task đã chọn (bulk).
  const [datesTarget, setDatesTarget] = useState<{ ids: number[]; init: { start: string; end: string } } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/workpackages/${pkgId}/dimensions`).then(r => r.json()).then(setGrid)
      .catch(() => { /* mất mạng — giữ lưới đang hiển thị */ });
  }, [pkgId]);
  // refreshKey tăng khi phát hiện người khác cập nhật → tải lại lưới checkbox.
  useEffect(() => { load(); }, [load, refreshKey]);

  async function toggle(cell: Cell, task: GridTask, label: string) {
    setGrid(g => g && ({
      ...g, tasks: g.tasks.map(t => t.id === task.id
        ? { ...t, cells: { ...t.cells, [label]: { ...cell, installed: !cell.installed } } } : t),
    }));
    try {
      const res = await fetch(`/api/dimensions/${cell.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installed: !cell.installed }),
      });
      const j = await res.json().catch(() => null);
      if (j?.task) setGrid(g => g && ({ ...g, tasks: g.tasks.map(t => t.id === task.id ? { ...t, progressPercent: j.task.progress, status: j.task.status } : t) }));
    } catch {
      // Mất mạng — giữ UI lạc quan, xếp hàng gửi lại khi online.
      onOfflineTick(cell.id, !cell.installed);
    }
    onChanged();
  }

  async function setAllInRow(task: GridTask, value: boolean) {
    const cells = Object.values(task.cells);
    await Promise.all(cells.map(c => fetch(`/api/dimensions/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installed: value }),
    }).catch(() => onOfflineTick(c.id, value))));
    load(); onChanged();
  }

  async function saveTaskName(id: number, name: string) {
    await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    setEditTask(null); load();
  }

  async function assignTask(id: number, value: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: value ? Number(value) : null }),
    });
    load();
  }

  async function editTaskBoq(t: GridTask) {
    const v = window.prompt('BOQCODE (duy nhất toàn hệ thống, để trống = xoá mã):', t.boqCode ?? '');
    if (v === null) return;
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boqCode: v }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); return; }
    load();
  }

  async function editTaskDrawing(t: GridTask) {
    const v = window.prompt('Link bản vẽ / BBNT (để trống = xoá):', t.drawingUrl ?? '');
    if (v === null) return;
    await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drawingUrl: v.trim() || null }),
    });
    load();
  }

  function toggleSelect(id: number) {
    setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // Lưu ngày cho 1 hoặc nhiều task — ô để trống = giữ nguyên giá trị cũ.
  async function saveDates(ids: number[], start: string, end: string) {
    const body: Record<string, string> = {};
    if (start) body.startDate = start;
    if (end) body.endDate = end;
    if (!Object.keys(body).length) { setDatesTarget(null); return; }
    await Promise.all(ids.map(id => fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })));
    setDatesTarget(null); setSelected(new Set()); load(); onChanged();
  }

  async function bulkAssign(value: string) {
    if (!value) return;
    await Promise.all([...selected].map(id => fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: value === 'none' ? null : Number(value) }),
    })));
    setSelected(new Set()); load();
  }

  async function setDelayReason(t: GridTask, reason: string) {
    let note: string | null = null;
    if (reason === 'khac') note = window.prompt('Ghi chú lý do trễ:') ?? null;
    const res = await fetch(`/api/tasks/${t.id}/delay-reason`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || null, note }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); }
    load();
  }

  async function approveTask(t: GridTask, approve: boolean) {
    if (!window.confirm(approve ? `Duyệt nghiệm thu "${t.code} — ${t.name}"?` : `Huỷ nghiệm thu "${t.code}"?`)) return;
    const res = await fetch(`/api/tasks/${t.id}/approve`, { method: approve ? 'POST' : 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function renameColumn(oldLabel: string) {
    const newLabel = window.prompt('Đổi tên cột (áp dụng toàn sheet):', oldLabel);
    if (!newLabel || newLabel === oldLabel) return;
    await fetch('/api/dimensions/rename', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: pkgId, oldLabel, newLabel }),
    });
    load(); onChanged();
  }

  async function deleteColumn(label: string) {
    if (!window.confirm(`Xoá cột "${label}" và toàn bộ dữ liệu checkbox trong cột này?`)) return;
    const res = await fetch(`/api/workpackages/${pkgId}/dimensions/column?label=${encodeURIComponent(label)}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function addColumnAfter(afterLabel: string | null) {
    const label = window.prompt(afterLabel ? `Tên cột mới (chèn sau "${afterLabel}"):` : 'Tên cột mới (thêm vào cuối):');
    if (!label?.trim()) return;
    const res = await fetch(`/api/workpackages/${pkgId}/dimensions/column`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), afterLabel: afterLabel ?? undefined }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function moveColumn(label: string, direction: 'left' | 'right') {
    await fetch(`/api/workpackages/${pkgId}/dimensions/column/move`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, direction }),
    });
    load();
  }

  async function addTaskAfter(afterTask: GridTask | null) {
    const code = window.prompt('Mã task mới (ví dụ: A1,10):');
    if (!code?.trim()) return;
    const name = window.prompt('Tên task:');
    if (!name?.trim()) return;
    const res = await fetch(`/api/workpackages/${pkgId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), name: name.trim(), afterId: afterTask?.id }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); window.alert(j.error ?? 'Lỗi không xác định'); return; }
    load(); onChanged();
  }

  async function moveTask(t: GridTask, direction: 'up' | 'down') {
    await fetch(`/api/tasks/${t.id}/move`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }),
    });
    load();
  }

  if (!grid) return <div className="px-4 py-3 text-sm text-zinc-500">Đang tải lưới...</div>;
  if (grid.columns.length === 0) {
    return <div className="px-4 py-3 text-sm text-zinc-500 border-t border-zinc-800">Nhóm này chưa có dữ liệu lưới. {grid.tasks.length} task.</div>;
  }

  return (
    <div className="border-t border-zinc-800 overflow-auto max-h-[70vh]">
      {canEdit && selected.size > 0 && (
        <div className="sticky top-0 left-0 z-30 flex flex-wrap items-center gap-2 bg-zinc-950 border-b border-emerald-900 px-3 py-2 text-xs">
          <span className="text-emerald-400 font-medium">{selected.size} task đã chọn</span>
          <select defaultValue="" onChange={e => { bulkAssign(e.target.value); e.target.value = ''; }}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 outline-none text-zinc-300">
            <option value="" disabled>Gán cho...</option>
            <option value="none">— Bỏ gán —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button onClick={() => setDatesTarget({ ids: [...selected], init: { start: '', end: '' } })}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded px-2 py-1 text-zinc-300">📅 Đặt ngày</button>
          <button onClick={() => setSelected(new Set())} className="text-zinc-500 hover:text-zinc-300 ml-auto">Bỏ chọn</button>
        </div>
      )}
      <table className="text-xs border-collapse">
        <thead>
          <tr className="bg-zinc-950">
            <th className="sticky left-0 z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-left w-[110px] min-w-[110px] max-w-[110px]">BOQ</th>
            <th className="sticky left-[110px] z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-left w-[360px] min-w-[360px] max-w-[360px]">Công việc</th>
            <th className="sticky left-[470px] z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-center w-14 min-w-[56px] max-w-[56px]">%</th>
            {grid.columns.map((col, ci) => (
              <th key={col} className="border-b border-zinc-800 align-bottom p-1 h-28 w-8">
                <div className="mx-auto whitespace-nowrap text-[10px] text-zinc-400 hover:text-emerald-400 cursor-default"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  title={canEdit ? 'Bấm để đổi tên / click ← → để di chuyển' : col}
                  onClick={() => canEdit && renameColumn(col)}>{col}</div>
                {canEdit && (
                  <div className="flex justify-center gap-0.5 mt-0.5">
                    <button onClick={() => moveColumn(col, 'left')} disabled={ci === 0} title="Di chuyển cột sang trái"
                      className="text-zinc-700 hover:text-zinc-400 disabled:opacity-20 text-[8px]">←</button>
                    <button onClick={() => addColumnAfter(col)} title={`Chèn cột mới sau "${col}"`}
                      className="text-zinc-700 hover:text-emerald-400 text-[8px]">+</button>
                    <button onClick={() => moveColumn(col, 'right')} disabled={ci === grid.columns.length - 1} title="Di chuyển cột sang phải"
                      className="text-zinc-700 hover:text-zinc-400 disabled:opacity-20 text-[8px]">→</button>
                    <button onClick={() => deleteColumn(col)} title={`Xoá cột "${col}"`}
                      className="text-zinc-700 hover:text-red-400 text-[8px]">✕</button>
                  </div>
                )}
              </th>
            ))}
            {canEdit && (
              <th className="border-b border-zinc-800 align-bottom p-1 w-8">
                <button onClick={() => addColumnAfter(grid.columns[grid.columns.length - 1] ?? null)}
                  title="Thêm cột mới vào cuối"
                  className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-emerald-400 hover:bg-emerald-950/40 rounded mx-auto">
                  <Columns className="w-3 h-3" />
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {canEdit && (
            <tr>
              <td colSpan={3 + grid.columns.length + (canEdit ? 1 : 0)} className="p-0">
                <button onClick={() => addTaskAfter(null)}
                  className="w-full text-[10px] text-zinc-700 hover:text-emerald-500 hover:bg-emerald-950/20 py-0.5 flex items-center justify-center gap-1 transition">
                  <Plus className="w-3 h-3" /> thêm task đầu nhóm
                </button>
              </td>
            </tr>
          )}
          {grid.tasks.map((t, ti) => (
            <Fragment key={t.id}>
            <tr className="hover:bg-zinc-800/30">
              <td className="sticky left-0 z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 w-[110px] min-w-[110px] max-w-[110px]">
                <button onClick={() => canEdit && editTaskBoq(t)}
                  title={canEdit ? `${t.boqCode ?? 'Chưa gán'} — bấm để sửa` : t.boqCode ?? 'Chưa gán'}
                  className={`font-mono text-[10px] truncate block max-w-full text-left ${canEdit ? 'text-amber-400 hover:underline cursor-pointer' : 'text-amber-400/70 cursor-default'}`}>
                  {t.boqCode ?? '—'}
                </button>
                {(t.drawingUrl || canEdit) && (
                  t.drawingUrl ? (
                    <span className="flex items-center gap-0.5 mt-0.5">
                      <a href={t.drawingUrl} target="_blank" rel="noreferrer" title={`Bản vẽ: ${t.drawingUrl}`}
                        className="text-sky-400 hover:text-sky-300"><Link2 className="w-3 h-3" /></a>
                      {canEdit && <button onClick={() => editTaskDrawing(t)} className="text-zinc-600 hover:text-emerald-400"><Pencil className="w-2.5 h-2.5" /></button>}
                    </span>
                  ) : (
                    <button onClick={() => editTaskDrawing(t)} title="Thêm link bản vẽ / BBNT"
                      className="block mt-0.5 text-zinc-700 hover:text-sky-400"><Link2 className="w-3 h-3" /></button>
                  )
                )}
              </td>
              <td className="sticky left-[110px] z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 w-[360px] min-w-[360px] max-w-[360px]">
                {editTask?.id === t.id ? (
                  <span className="flex items-center gap-1">
                    <input autoFocus value={editTask.value} onChange={e => setEditTask({ id: t.id, value: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') saveTaskName(t.id, editTask.value); if (e.key === 'Escape') setEditTask(null); }}
                      className="bg-zinc-800 border border-emerald-600 rounded px-1 py-0.5 text-xs w-72 outline-none" />
                    <button onClick={() => saveTaskName(t.id, editTask.value)} className="text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
                  </span>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    {canEdit && (
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)}
                        title="Chọn để gán/đặt ngày hàng loạt"
                        className="w-3 h-3 accent-emerald-500 cursor-pointer shrink-0" />
                    )}
                    <span className="font-mono text-zinc-500 shrink-0">{t.code}</span>
                    <span className="truncate flex-1" title={t.name}>{t.name}</span>
                    {canEdit && <button onClick={() => setEditTask({ id: t.id, value: t.name })} className="shrink-0 text-zinc-600 hover:text-emerald-400"><Pencil className="w-3 h-3" /></button>}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <button onClick={() => canEdit && setDatesTarget({ ids: [t.id], init: { start: t.startDate ?? '', end: t.endDate ?? '' } })}
                    title={canEdit ? 'Sửa ngày bắt đầu / kết thúc' : `${t.startDate ?? '?'} → ${t.endDate ?? '?'}`}
                    className={`text-[10px] whitespace-nowrap ${t.status === 'tre' ? 'text-red-400' : 'text-zinc-500'} ${canEdit ? 'hover:text-emerald-400 hover:underline cursor-pointer' : 'cursor-default'}`}>
                    📅 {fmtShortDate(t.startDate)}→{fmtShortDate(t.endDate)}
                  </button>
                  <button onClick={() => setAllInRow(t, true)} className="text-[10px] text-emerald-500 hover:underline">Tất cả</button>
                  <button onClick={() => setAllInRow(t, false)} className="text-[10px] text-zinc-500 hover:underline">Bỏ</button>
                  <button onClick={() => setHistoryTask(t)} title="Lịch sử tiến độ"
                    className="text-zinc-600 hover:text-emerald-400"><History className="w-3 h-3" /></button>
                  <button onClick={() => setPhotosTask(t)} title="Ảnh hiện trường"
                    className={`flex items-center gap-0.5 ${t.photoCount > 0 ? 'text-sky-400 hover:text-sky-300' : 'text-zinc-600 hover:text-sky-400'}`}>
                    <Camera className="w-3 h-3" />{t.photoCount > 0 && <span className="text-[10px]">{t.photoCount}</span>}
                  </button>
                  <button onClick={() => setCommentsTask(t)} title="Bình luận / trao đổi"
                    className={`flex items-center gap-0.5 ${t.commentCount > 0 ? 'text-violet-400 hover:text-violet-300' : 'text-zinc-600 hover:text-violet-400'}`}>
                    <MessageSquare className="w-3 h-3" />{t.commentCount > 0 && <span className="text-[10px]">{t.commentCount}</span>}
                  </button>
                  {t.status === 'nghiem_thu' ? (
                    <span className="flex items-center gap-1 text-[10px] text-teal-300 bg-teal-950 px-1.5 py-0.5 rounded">
                      ✓ Đã NT
                      {canEdit && <button onClick={() => approveTask(t, false)} title="Huỷ nghiệm thu" className="text-teal-500 hover:text-red-400"><X className="w-2.5 h-2.5" /></button>}
                    </span>
                  ) : canEdit && t.progressPercent >= 1 && (
                    <button onClick={() => approveTask(t, true)} title="Duyệt nghiệm thu (task đã 100%)"
                      className="text-[10px] text-teal-400 border border-teal-800 bg-teal-950/50 hover:bg-teal-900/60 px-1.5 py-0.5 rounded">Nghiệm thu</button>
                  )}
                  {t.status === 'tre' && (
                    <select value={t.delayReason ?? ''} onChange={e => setDelayReason(t, e.target.value)}
                      title="Nguyên nhân trễ — giúp PM thống kê và xử lý"
                      className={`text-[10px] rounded px-1 py-0.5 outline-none border max-w-[110px] ${t.delayReason
                        ? 'bg-red-950/60 border-red-900 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
                      <option value="">— Lý do trễ? —</option>
                      {Object.entries(DELAY_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  )}
                  {canEdit ? (
                    <select value={t.assignedTo ?? ''} onChange={e => assignTask(t.id, e.target.value)}
                      title="Giao task cho người làm"
                      className="ml-auto bg-zinc-800 border border-zinc-700 rounded text-[10px] px-1 py-0.5 max-w-[100px] outline-none text-zinc-400">
                      <option value="">— Giao —</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  ) : t.assigneeName && (
                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-sky-400 truncate max-w-[100px]" title={`Giao cho ${t.assigneeName}`}>
                      <UserCheck className="w-3 h-3 shrink-0" />{t.assigneeName}
                    </span>
                  )}
                </div>
              </td>
              <td className="sticky left-[470px] z-10 bg-zinc-900 border-b border-r border-zinc-800 px-1 py-1 text-center w-14 min-w-[56px] max-w-[56px]">
                <span className={Math.round(t.progressPercent * 100) === 100 ? 'text-emerald-400' : 'text-zinc-300'}>{Math.round((t.progressPercent ?? 0) * 100)}%</span>
                {canEdit && (
                  <div className="flex justify-center gap-0.5 mt-0.5">
                    <button onClick={() => moveTask(t, 'up')} disabled={ti === 0} title="Lên"
                      className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20"><ChevronUp className="w-3 h-3" /></button>
                    <button onClick={() => moveTask(t, 'down')} disabled={ti === grid.tasks.length - 1} title="Xuống"
                      className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20"><ChevronDownIcon className="w-3 h-3" /></button>
                  </div>
                )}
              </td>
              {grid.columns.map(col => {
                const cell = t.cells[col];
                return (
                  <td key={col} className="border-b border-zinc-800/60 text-center p-0.5">
                    {cell ? (
                      <input type="checkbox" checked={cell.installed} onChange={() => toggle(cell, t, col)}
                        className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                    ) : <span className="text-zinc-700">·</span>}
                  </td>
                );
              })}
              {canEdit && <td className="border-b border-zinc-800/60" />}
            </tr>
            {canEdit && (
              <tr>
                <td colSpan={3 + grid.columns.length + 1} className="p-0">
                  <button onClick={() => addTaskAfter(t)}
                    className="w-full text-[10px] text-zinc-700 hover:text-emerald-500 hover:bg-emerald-950/20 py-0.5 flex items-center justify-center gap-1 transition">
                    <Plus className="w-3 h-3" /> chèn task sau
                  </button>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {historyTask && <HistoryModal task={historyTask} onClose={() => setHistoryTask(null)} />}
      {photosTask && <PhotosModal task={photosTask} onClose={() => { setPhotosTask(null); load(); }} />}
      {commentsTask && <CommentsModal task={commentsTask} onClose={() => { setCommentsTask(null); load(); }} />}
      {datesTarget && <DatesModal target={datesTarget} onSave={saveDates} onClose={() => setDatesTarget(null)} />}
    </div>
  );
}

type HistoryItem = {
  id: number; oldProgress: number | null; newProgress: number | null;
  status: string | null; note: string | null; changedBy: string | null; changedAt: string;
};

type Photo = {
  id: number; originalName: string | null; mimeType: string; sizeBytes: number;
  caption: string | null; createdAt: string; uploadedBy: number | null; uploaderName: string | null;
};

// Gallery ảnh hiện trường của task: xem, upload (chụp từ mobile), xoá.
function PhotosModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);

  const load = useCallback(() => {
    fetch(`/api/tasks/${task.id}/photos`).then(r => r.json()).then(j => setPhotos(j.photos ?? []));
  }, [task.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => j && setMe({ id: j.user.id, role: j.user.role }));
  }, []);

  async function upload(file: File) {
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    const caption = window.prompt('Ghi chú cho ảnh (tuỳ chọn):') ?? '';
    if (caption.trim()) fd.append('caption', caption.trim());
    const res = await fetch(`/api/tasks/${task.id}/photos`, { method: 'POST', body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Upload thất bại');
    }
    setUploading(false); load();
  }

  async function remove(p: Photo) {
    if (!window.confirm('Xoá ảnh này?')) return;
    const res = await fetch(`/api/photos/${p.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Không xoá được'); return; }
    load();
  }

  const canDelete = (p: Photo) => me && (p.uploadedBy === me.id || me.role === 'admin' || me.role === 'pm');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <Camera className="w-4 h-4 text-sky-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">Ảnh hiện trường — {task.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{task.code} · {photos?.length ?? 0} ảnh</p>
          </div>
          <label className="ml-auto shrink-0 flex items-center gap-1.5 bg-sky-900/60 hover:bg-sky-800/60 border border-sky-800 text-sky-200 px-3 py-1.5 rounded-lg text-xs cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> {uploading ? 'Đang tải lên...' : 'Thêm ảnh'}
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          </label>
          <button onClick={onClose} className="text-zinc-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-4">
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          {photos === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
          {photos?.length === 0 && (
            <p className="text-sm text-zinc-500">Chưa có ảnh nào. Chụp ảnh hiện trường làm bằng chứng thi công/nghiệm thu.</p>
          )}
          {!!photos?.length && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map(p => (
                <div key={p.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photos/${p.id}`} alt={p.caption ?? p.originalName ?? `Ảnh #${p.id}`}
                    className="w-full h-32 object-cover cursor-zoom-in" loading="lazy" onClick={() => setViewer(p)} />
                  <div className="px-2 py-1.5 flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      {p.caption && <p className="text-xs truncate" title={p.caption}>{p.caption}</p>}
                      <p className="text-[10px] text-zinc-500 truncate">
                        {p.uploaderName ?? '—'} · {new Date(p.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    {canDelete(p) && (
                      <button onClick={() => remove(p)} title="Xoá ảnh"
                        className="text-zinc-600 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {viewer && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); setViewer(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/photos/${viewer.id}`} alt={viewer.caption ?? ''} className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

// Modal sửa ngày bắt đầu/kết thúc — dùng cho 1 task hoặc nhiều task đã chọn.
// Ô để trống = giữ nguyên giá trị hiện tại của từng task.
function DatesModal({ target, onSave, onClose }: {
  target: { ids: number[]; init: { start: string; end: string } };
  onSave: (ids: number[], start: string, end: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(target.init.start);
  const [end, setEnd] = useState(target.init.end);
  const [saving, setSaving] = useState(false);
  const bulk = target.ids.length > 1;
  const invalid = !!start && !!end && end < start;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <h3 className="font-semibold text-sm">📅 {bulk ? `Đặt ngày cho ${target.ids.length} task` : 'Sửa ngày bắt đầu / kết thúc'}</h3>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {bulk && <p className="text-xs text-zinc-500">Ô để trống sẽ giữ nguyên ngày hiện tại của từng task.</p>}
          <div>
            <label className="text-xs text-zinc-400">Ngày bắt đầu</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Ngày kết thúc (deadline)</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]" />
          </div>
          {invalid && <p className="text-xs text-red-400">Ngày kết thúc phải sau ngày bắt đầu.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setSaving(true); onSave(target.ids, start, end); }}
              disabled={saving || invalid || (!start && !end)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg py-2 text-sm font-medium transition">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button onClick={onClose} className="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm">Huỷ</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type Comment = {
  id: number; body: string; createdAt: string;
  userId: number | null; userName: string | null; userRole: string | null;
};

const ROLE_BADGE: Record<string, string> = { admin: 'Admin', pm: 'PM', engineer: 'Kỹ sư', subcon: 'Thầu phụ' };

// Trao đổi trên task: PM hỏi — người thi công trả lời ngay trong app.
function CommentsModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/tasks/${task.id}/comments`).then(r => r.json()).then(j => setComments(j.comments ?? []));
  }, [task.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => j && setMe({ id: j.user.id, role: j.user.role }));
  }, []);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setError('');
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Gửi thất bại'); }
    else setDraft('');
    setSending(false); load();
  }

  async function remove(c: Comment) {
    if (!window.confirm('Xoá bình luận này?')) return;
    await fetch(`/api/comments/${c.id}`, { method: 'DELETE' });
    load();
  }

  const canDelete = (c: Comment) => me && (c.userId === me.id || me.role === 'admin' || me.role === 'pm');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">Trao đổi — {task.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{task.code}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-4 flex-1 space-y-3">
          {comments === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
          {comments?.length === 0 && <p className="text-sm text-zinc-500">Chưa có trao đổi nào. Đặt câu hỏi hoặc báo cáo vướng mắc tại đây.</p>}
          {comments?.map(c => (
            <div key={c.id} className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 group">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-violet-300">{c.userName ?? '—'}</span>
                {c.userRole && <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">{ROLE_BADGE[c.userRole] ?? c.userRole}</span>}
                <span className="text-zinc-600">{new Date(c.createdAt).toLocaleString('vi-VN')}</span>
                {canDelete(c) && (
                  <button onClick={() => remove(c)} title="Xoá"
                    className="ml-auto text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3 h-3" /></button>
                )}
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-zinc-800 p-3">
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2">
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={2000}
              placeholder="Viết bình luận... (Ctrl+Enter để gửi)"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
              className="bg-zinc-950 border border-zinc-800 focus:border-violet-600 rounded-lg px-3 py-2 text-sm flex-1 outline-none resize-none" />
            <button onClick={send} disabled={!draft.trim() || sending} title="Gửi"
              className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 self-end py-2.5">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/history`).then(r => r.json()).then(j => setItems(j.history ?? []));
  }, [task.id]);

  const pct = (v: number | null) => `${Math.round((v ?? 0) * 100)}%`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{task.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{task.code} · hiện tại {pct(task.progressPercent)}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-4">
          {items === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
          {items?.length === 0 && <p className="text-sm text-zinc-500">Chưa có thay đổi nào được ghi nhận.</p>}
          {!!items?.length && (
            <ol className="relative border-l border-zinc-800 ml-1.5 space-y-4">
              {items.map(h => {
                const up = (h.newProgress ?? 0) >= (h.oldProgress ?? 0);
                return (
                  <li key={h.id} className="ml-4">
                    <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${up ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <p className="text-sm">
                      <span className="text-zinc-400">{pct(h.oldProgress)}</span>
                      <span className="text-zinc-600"> → </span>
                      <span className={up ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>{pct(h.newProgress)}</span>
                      {h.status && <span className="ml-2 px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-400">{STATUS_LABEL[h.status] ?? h.status}</span>}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {h.changedBy ?? '—'} · {new Date(h.changedAt).toLocaleString('vi-VN')}
                      {h.note && <span className="text-zinc-600"> · {h.note}</span>}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
