'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeft, Search, ChevronRight, ChevronDown, Pencil, Check, X, History, UserCheck, RefreshCw, Link2 } from 'lucide-react';

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
type Data = { sheet: { code: string; name: string; responsible?: string }; packages: Pkg[]; version?: string };
type AppUser = { id: number; name: string; role: string };

const SYNC_POLL_MS = 10_000;

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
    }).finally(() => setLoading(false));
  }, [sheet]);
  useEffect(() => { load(); }, [load]);

  // Đồng bộ đa người dùng: poll watermark; người khác sửa → tự reload + toast.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden || editingRef.current) return;
      try {
        const r = await fetch(`/api/tasks/version?sheet=${sheet}`);
        if (!r.ok) return;
        const j = await r.json();
        if (versionRef.current && j.v !== versionRef.current) {
          versionRef.current = j.v;
          load();
          setRefreshKey(k => k + 1);
          setSyncToast(true);
          setTimeout(() => setSyncToast(false), 3500);
        } else {
          versionRef.current = j.v;
        }
      } catch { /* mạng chập chờn — thử lại lần poll sau */ }
    }, SYNC_POLL_MS);
    return () => clearInterval(t);
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
  const packages = (data?.packages ?? []).filter(p =>
    (!query || p.code.toLowerCase().includes(query.toLowerCase()) || p.name.toLowerCase().includes(query.toLowerCase()))
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
        {packages.map(p => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/60">
              <button onClick={() => setExpanded(s => ({ ...s, [p.id]: !s[p.id] }))} className="flex items-center gap-2 text-left">
                {expanded[p.id] ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                <span className="font-mono text-emerald-400 w-20">{p.code}</span>
              </button>
              <button onClick={() => canEdit && editPkgBoq(p)}
                title={canEdit ? 'BOQCODE — bấm để sửa' : `BOQCODE: ${p.boqCode ?? 'chưa gán'}`}
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 max-w-[130px] truncate shrink-0 ${canEdit ? 'text-amber-400 hover:bg-zinc-700 cursor-pointer' : 'text-amber-400/70 cursor-default'}`}>
                {p.boqCode ?? '—'}
              </button>
              {(p.drawingUrl || canEdit) && (
                p.drawingUrl ? (
                  <span className="flex items-center shrink-0">
                    <a href={p.drawingUrl} target="_blank" rel="noreferrer" title={`Bản vẽ: ${p.drawingUrl}`}
                      className="text-sky-400 hover:text-sky-300"><Link2 className="w-3.5 h-3.5" /></a>
                    {canEdit && <button onClick={() => editPkgDrawing(p)} title="Sửa link bản vẽ" className="text-zinc-600 hover:text-emerald-400 ml-0.5"><Pencil className="w-3 h-3" /></button>}
                  </span>
                ) : (
                  <button onClick={() => editPkgDrawing(p)} title="Thêm link bản vẽ / BBNT"
                    className="text-zinc-700 hover:text-sky-400 shrink-0"><Link2 className="w-3.5 h-3.5" /></button>
                )
              )}
              {editPkg?.id === p.id ? (
                <span className="flex items-center gap-1 flex-1">
                  <input autoFocus value={editPkg.value} onChange={e => setEditPkg({ id: p.id, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') savePkgName(p.id, editPkg.value); if (e.key === 'Escape') setEditPkg(null); }}
                    className="bg-zinc-800 border border-emerald-600 rounded px-2 py-1 text-sm flex-1 outline-none" />
                  <button onClick={() => savePkgName(p.id, editPkg.value)} className="text-emerald-400"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditPkg(null)} className="text-zinc-500"><X className="w-4 h-4" /></button>
                </span>
              ) : (
                <span className="font-medium flex-1 flex items-center gap-2">
                  {p.name}
                  {canEdit && <button onClick={() => setEditPkg({ id: p.id, value: p.name })} className="text-zinc-600 hover:text-emerald-400"><Pencil className="w-3.5 h-3.5" /></button>}
                </span>
              )}
              <span className="text-xs text-zinc-500 w-10 text-right shrink-0">{p.floorLabel || ''}</span>
              <span className="text-xs text-zinc-500 w-14 text-right shrink-0">{p.tasks.length} task</span>
              <div className="flex items-center gap-2 w-36 shrink-0">
                <div className="bg-zinc-800 rounded-full h-1.5 flex-1"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(p.progress ?? 0) * 100}%` }} /></div>
                <span className="text-zinc-400 text-sm w-10 text-right">{Math.round((p.progress ?? 0) * 100)}%</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs w-28 text-center shrink-0 ${STATUS_CLS[p.status] ?? STATUS_CLS.chuan_bi}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
            </div>
            {expanded[p.id] && <PkgGrid pkgId={p.id} canEdit={canEdit} users={users} refreshKey={refreshKey} onChanged={load} />}
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
    </div>
  );
}

type Cell = { id: number; installed: boolean };
type GridTask = { id: number; code: string; name: string; status: string; progressPercent: number; boqCode: string | null; drawingUrl: string | null; assignedTo: number | null; assigneeName: string | null; cells: Record<string, Cell> };
type Grid = { columns: string[]; tasks: GridTask[] };

function PkgGrid({ pkgId, canEdit, users, refreshKey, onChanged }: { pkgId: number; canEdit: boolean; users: AppUser[]; refreshKey: number; onChanged: () => void }) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [editTask, setEditTask] = useState<{ id: number; value: string } | null>(null);
  const [historyTask, setHistoryTask] = useState<GridTask | null>(null);

  const load = useCallback(() => {
    fetch(`/api/workpackages/${pkgId}/dimensions`).then(r => r.json()).then(setGrid);
  }, [pkgId]);
  // refreshKey tăng khi phát hiện người khác cập nhật → tải lại lưới checkbox.
  useEffect(() => { load(); }, [load, refreshKey]);

  async function toggle(cell: Cell, task: GridTask, label: string) {
    setGrid(g => g && ({
      ...g, tasks: g.tasks.map(t => t.id === task.id
        ? { ...t, cells: { ...t.cells, [label]: { ...cell, installed: !cell.installed } } } : t),
    }));
    const res = await fetch(`/api/dimensions/${cell.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installed: !cell.installed }),
    });
    const j = await res.json().catch(() => null);
    if (j?.task) setGrid(g => g && ({ ...g, tasks: g.tasks.map(t => t.id === task.id ? { ...t, progressPercent: j.task.progress, status: j.task.status } : t) }));
    onChanged();
  }

  async function setAllInRow(task: GridTask, value: boolean) {
    const ids = Object.values(task.cells).map(c => c.id);
    await Promise.all(ids.map(id => fetch(`/api/dimensions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installed: value }),
    })));
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

  async function renameColumn(oldLabel: string) {
    const newLabel = window.prompt('Đổi tên cột (áp dụng toàn sheet):', oldLabel);
    if (!newLabel || newLabel === oldLabel) return;
    await fetch('/api/dimensions/rename', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId: pkgId, oldLabel, newLabel }),
    });
    load(); onChanged();
  }

  if (!grid) return <div className="px-4 py-3 text-sm text-zinc-500">Đang tải lưới...</div>;
  if (grid.columns.length === 0) {
    return <div className="px-4 py-3 text-sm text-zinc-500 border-t border-zinc-800">Nhóm này chưa có dữ liệu lưới. {grid.tasks.length} task.</div>;
  }

  return (
    <div className="border-t border-zinc-800 overflow-auto max-h-[70vh]">
      <table className="text-xs border-collapse">
        <thead>
          <tr className="bg-zinc-950">
            <th className="sticky left-0 z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-left w-[110px] min-w-[110px] max-w-[110px]">BOQ</th>
            <th className="sticky left-[110px] z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-left w-[240px] min-w-[240px] max-w-[240px]">Công việc</th>
            <th className="sticky left-[350px] z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-center w-14 min-w-[56px] max-w-[56px]">%</th>
            {grid.columns.map(col => (
              <th key={col} className="border-b border-zinc-800 align-bottom p-1 h-28 w-8">
                <div className="mx-auto whitespace-nowrap text-[10px] text-zinc-400 hover:text-emerald-400 cursor-default"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                  title={canEdit ? 'Bấm để đổi tên' : col}
                  onClick={() => canEdit && renameColumn(col)}>{col}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.tasks.map(t => (
            <tr key={t.id} className="hover:bg-zinc-800/30">
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
              <td className="sticky left-[110px] z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 w-[240px] min-w-[240px] max-w-[240px]">
                {editTask?.id === t.id ? (
                  <span className="flex items-center gap-1">
                    <input autoFocus value={editTask.value} onChange={e => setEditTask({ id: t.id, value: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') saveTaskName(t.id, editTask.value); if (e.key === 'Escape') setEditTask(null); }}
                      className="bg-zinc-800 border border-emerald-600 rounded px-1 py-0.5 text-xs w-44 outline-none" />
                    <button onClick={() => saveTaskName(t.id, editTask.value)} className="text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
                  </span>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-zinc-500 shrink-0">{t.code}</span>
                    <span className="truncate flex-1" title={t.name}>{t.name}</span>
                    {canEdit && <button onClick={() => setEditTask({ id: t.id, value: t.name })} className="shrink-0 text-zinc-600 hover:text-emerald-400"><Pencil className="w-3 h-3" /></button>}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <button onClick={() => setAllInRow(t, true)} className="text-[10px] text-emerald-500 hover:underline">Tất cả</button>
                  <button onClick={() => setAllInRow(t, false)} className="text-[10px] text-zinc-500 hover:underline">Bỏ</button>
                  <button onClick={() => setHistoryTask(t)} title="Lịch sử tiến độ"
                    className="text-zinc-600 hover:text-emerald-400"><History className="w-3 h-3" /></button>
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
              <td className="sticky left-[350px] z-10 bg-zinc-900 border-b border-r border-zinc-800 px-1 py-1 text-center w-14 min-w-[56px] max-w-[56px]">
                <span className={Math.round(t.progressPercent * 100) === 100 ? 'text-emerald-400' : 'text-zinc-300'}>{Math.round((t.progressPercent ?? 0) * 100)}%</span>
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
            </tr>
          ))}
        </tbody>
      </table>
      {historyTask && <HistoryModal task={historyTask} onClose={() => setHistoryTask(null)} />}
    </div>
  );
}

type HistoryItem = {
  id: number; oldProgress: number | null; newProgress: number | null;
  status: string | null; note: string | null; changedBy: string | null; changedAt: string;
};

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
