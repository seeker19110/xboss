'use client';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Search, ChevronRight, ChevronDown, Pencil, Check, X } from 'lucide-react';

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
type Pkg = { id: number; code: string; floorLabel: string | null; name: string; status: string; progress: number; tasks: Task[] };
type Data = { sheet: { code: string; name: string; responsible?: string }; packages: Pkg[] };

export default function TrackingPage({ params }: { params: { sheet: string } }) {
  const { sheet } = params;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [editPkg, setEditPkg] = useState<{ id: number; value: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/tasks?sheet=${sheet}`).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [sheet]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => {
      const role = j?.user?.role; setCanEdit(role === 'admin' || role === 'pm');
    });
  }, []);

  async function savePkgName(id: number, name: string) {
    await fetch(`/api/workpackages/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    setEditPkg(null); load();
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Đang tải...</div>;

  const packages = (data?.packages ?? []).filter(p =>
    !query || p.code.toLowerCase().includes(query.toLowerCase()) || p.name.toLowerCase().includes(query.toLowerCase()));

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
              <span className="text-xs text-zinc-500">{p.floorLabel || ''}</span>
              <span className="text-xs text-zinc-500">{p.tasks.length} task</span>
              <div className="flex items-center gap-2 w-32">
                <div className="bg-zinc-800 rounded-full h-1.5 flex-1"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(p.progress ?? 0) * 100}%` }} /></div>
                <span className="text-zinc-400 text-sm w-10 text-right">{Math.round((p.progress ?? 0) * 100)}%</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs ${STATUS_CLS[p.status] ?? STATUS_CLS.chuan_bi}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
            </div>
            {expanded[p.id] && <PkgGrid pkgId={p.id} canEdit={canEdit} onChanged={load} />}
          </div>
        ))}
        {packages.length === 0 && (
          <div className="p-8 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">Không có dữ liệu. Hãy import file Excel trước.</div>
        )}
      </main>
    </div>
  );
}

type Cell = { id: number; installed: boolean };
type GridTask = { id: number; code: string; name: string; status: string; progressPercent: number; cells: Record<string, Cell> };
type Grid = { columns: string[]; tasks: GridTask[] };

function PkgGrid({ pkgId, canEdit, onChanged }: { pkgId: number; canEdit: boolean; onChanged: () => void }) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [editTask, setEditTask] = useState<{ id: number; value: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/workpackages/${pkgId}/dimensions`).then(r => r.json()).then(setGrid);
  }, [pkgId]);
  useEffect(() => { load(); }, [load]);

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
            <th className="sticky left-0 z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-left min-w-[200px]">Công việc</th>
            <th className="sticky left-[200px] z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-1 text-center w-14">%</th>
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
              <td className="sticky left-0 z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1">
                {editTask?.id === t.id ? (
                  <span className="flex items-center gap-1">
                    <input autoFocus value={editTask.value} onChange={e => setEditTask({ id: t.id, value: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') saveTaskName(t.id, editTask.value); if (e.key === 'Escape') setEditTask(null); }}
                      className="bg-zinc-800 border border-emerald-600 rounded px-1 py-0.5 text-xs w-44 outline-none" />
                    <button onClick={() => saveTaskName(t.id, editTask.value)} className="text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-500">{t.code}</span>
                    <span className="truncate max-w-[120px]" title={t.name}>{t.name}</span>
                    {canEdit && <button onClick={() => setEditTask({ id: t.id, value: t.name })} className="text-zinc-600 hover:text-emerald-400"><Pencil className="w-3 h-3" /></button>}
                  </div>
                )}
                <div className="flex gap-2 mt-0.5">
                  <button onClick={() => setAllInRow(t, true)} className="text-[10px] text-emerald-500 hover:underline">Tất cả</button>
                  <button onClick={() => setAllInRow(t, false)} className="text-[10px] text-zinc-500 hover:underline">Bỏ</button>
                </div>
              </td>
              <td className="sticky left-[200px] z-10 bg-zinc-900 border-b border-r border-zinc-800 px-1 py-1 text-center">
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
    </div>
  );
}
