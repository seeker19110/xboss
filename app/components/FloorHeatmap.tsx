'use client';
import { useEffect, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { slugFromCode } from '@/lib/sheets';

type CellData = { tower: string | null; sheetType: string; floor: string; progress: number; tasks: number; delayed: number; sheetSlug?: string | null };
type Tower = { name: string; sheets: string[]; floors: string[] };
type Data = { towers: Tower[]; floors: string[]; sheets: string[]; cells: CellData[] };
type TowerRow = { id: number; name: string };

function cellClass(progress: number, delayed: number): string {
  const ring = delayed > 0 ? ' ring-1 ring-red-500/70' : '';
  if (progress >= 0.999) return 'bg-emerald-600 text-white' + ring;
  if (progress >= 0.7) return 'bg-emerald-800 text-emerald-100' + ring;
  if (progress >= 0.4) return 'bg-amber-800 text-amber-100' + ring;
  if (progress > 0) return 'bg-red-900 text-red-200' + ring;
  return 'bg-zinc-800 text-zinc-500' + ring;
}

function TowerTable({ tower, byKey }: { tower: Tower; byKey: Map<string, CellData> }) {
  return (
    <table className="border-separate" style={{ borderSpacing: 3 }}>
      <thead>
        <tr>
          <th className="text-xs text-zinc-500 font-normal text-right pr-2 sticky left-0 bg-zinc-900">Tầng</th>
          {tower.sheets.map(s => (
            <th key={s} className="text-[11px] text-zinc-400 font-medium px-1 pb-1 whitespace-nowrap min-w-[88px]">{s}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tower.floors.map(f => (
          <tr key={f}>
            <td className="text-xs text-zinc-400 text-right pr-2 font-mono sticky left-0 bg-zinc-900">{f}</td>
            {tower.sheets.map(s => {
              const c = byKey.get(`${tower.name}|${f}|${s}`);
              if (!c) return <td key={s} className="rounded bg-zinc-900 border border-dashed border-zinc-800 text-center text-[10px] text-zinc-700 h-8">—</td>;
              const slug = c.sheetSlug ?? slugFromCode(s);
              const inner = (
                <div className="flex items-center justify-center gap-1 h-8 px-2 text-xs font-medium">
                  {Math.round(c.progress * 100)}%
                  {c.delayed > 0 && <span className="text-[9px] bg-red-600/80 text-white rounded px-1">{c.delayed}</span>}
                </div>
              );
              return (
                <td key={s} className={`rounded text-center transition hover:scale-105 hover:z-10 ${cellClass(c.progress, c.delayed)}`}
                  title={`${s} · ${f}: ${Math.round(c.progress * 100)}% (${c.tasks} task${c.delayed ? `, ${c.delayed} trễ` : ''})`}>
                  {slug ? <a href={`/tracking/${slug}?floor=${encodeURIComponent(f)}`} className="block">{inner}</a> : inner}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function FloorHeatmap() {
  const [data, setData] = useState<Data | null>(null);
  const [towerList, setTowerList] = useState<TowerRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  function reload() {
    fetch('/api/dashboard/floors').then(r => r.ok ? r.json() : null).then(setData);
    fetch('/api/towers').then(r => r.ok ? r.json() : null).then(j => setTowerList(j?.towers ?? []));
  }

  useEffect(() => {
    reload();
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(j => {
      const role = j?.user?.role;
      setCanEdit(role === 'admin' || role === 'pm');
    });
  }, []);

  async function saveName(id: number) {
    if (!editName.trim()) { setEditId(null); return; }
    await fetch(`/api/towers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    setEditId(null); reload();
  }

  async function deleteTower(id: number, name: string) {
    if (!confirm(`Xoá tháp "${name}"? Tháp phải không còn sheet nào.`)) return;
    const res = await fetch(`/api/towers/${id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json(); alert(j.error); return; }
    reload();
  }

  async function addTower() {
    if (!newName.trim()) return;
    await fetch('/api/towers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    setAdding(false); setNewName(''); reload();
  }

  if (!data || data.floors.length === 0) return null;

  const towers: Tower[] = data.towers?.length
    ? data.towers
    : [{ name: '', sheets: data.sheets, floors: data.floors }];

  const byKey = new Map(data.cells.map(c => [`${c.tower ?? ''}|${c.floor}|${c.sheetType}`, c]));
  const multi = towers.length > 1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <h2 className="font-semibold text-sm text-zinc-300">Bản đồ tiến độ theo tầng</h2>
        {canEdit && (
          <button onClick={() => { setAdding(true); setNewName(''); }}
            title="Thêm tháp mới"
            className="ml-1 text-zinc-600 hover:text-emerald-400 transition">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-600 mb-3">Màu theo % hoàn thành · viền đỏ = có task trễ · bấm ô để mở sheet tại tầng đó</p>

      {/* Form thêm tháp */}
      {adding && (
        <div className="flex items-center gap-2 mb-3">
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTower(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Tên tháp mới (vd: Tháp B)"
            className="bg-zinc-800 border border-emerald-600 rounded px-2 py-1 text-sm outline-none w-48" />
          <button onClick={addTower} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
          <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="overflow-auto">
        <div className={`mx-auto w-max flex items-start ${multi ? 'gap-[10vw]' : ''}`}>
          {towers.map(t => {
            const tr = towerList.find(r => r.name === t.name);
            return (
              <div key={t.name}>
                {multi && (
                  <div className="text-center mb-2 flex items-center justify-center gap-1.5">
                    {editId === tr?.id ? (
                      <>
                        <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveName(tr!.id); if (e.key === 'Escape') setEditId(null); }}
                          className="bg-zinc-800 border border-emerald-600 rounded px-2 py-0.5 text-xs outline-none w-28 text-center font-semibold" />
                        <button onClick={() => saveName(tr!.id)} className="text-emerald-400"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditId(null)} className="text-zinc-500"><X className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs font-semibold text-zinc-300">{t.name || 'Chưa đặt tên tháp'}</span>
                        {canEdit && tr && (
                          <>
                            <button onClick={() => { setEditId(tr.id); setEditName(tr.name); }}
                              title="Đổi tên tháp" className="text-zinc-600 hover:text-emerald-400">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => deleteTower(tr.id, tr.name)}
                              title="Xoá tháp" className="text-zinc-600 hover:text-red-400">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
                <TowerTable tower={t} byKey={byKey} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
