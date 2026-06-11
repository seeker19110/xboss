'use client';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Package, Plus, Trash2, AlertTriangle } from 'lucide-react';

type Material = {
  id: number; sheetTypeId: number | null; name: string; unit: string | null;
  qtyPlanned: number; qtyUsed: number; status: string; note: string | null; sheetCode: string | null;
};
type Sheet = { id: number; code: string; name: string };

const STATUS_LABEL: Record<string, string> = { dat_hang: 'Đã đặt hàng', ve_kho: 'Về kho', da_dung: 'Đã dùng' };
const STATUS_CLS: Record<string, string> = {
  dat_hang: 'bg-amber-950 text-amber-300', ve_kho: 'bg-blue-950 text-blue-300', da_dung: 'bg-emerald-950 text-emerald-300',
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetFilter, setSheetFilter] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', unit: '', qtyPlanned: '', sheetTypeId: '' });

  const load = useCallback(() => {
    const q = sheetFilter ? `?sheetTypeId=${sheetFilter}` : '';
    fetch(`/api/materials${q}`).then(r => r.json()).then(j => setMaterials(j.materials ?? []));
  }, [sheetFilter]);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      const role = j.user?.role;
      setCanEdit(role === 'admin' || role === 'pm' || role === 'engineer');
      setCanDelete(role === 'admin' || role === 'pm');
    });
    fetch('/api/sheets').then(r => r.json()).then(j => setSheets(j.sheets ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function api(path: string, init: RequestInit, okFn?: () => void) {
    setError('');
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Lỗi không xác định'); return; }
    okFn?.(); load();
  }

  const addMaterial = () => api('/api/materials', {
    method: 'POST',
    body: JSON.stringify({ ...form, sheetTypeId: Number(form.sheetTypeId || sheetFilter), qtyPlanned: Number(form.qtyPlanned) || 0 }),
  }, () => setForm({ name: '', unit: '', qtyPlanned: '', sheetTypeId: '' }));

  const patch = (id: number, body: object) => api(`/api/materials/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  const remove = (m: Material) => { if (window.confirm(`Xoá vật tư "${m.name}"?`)) api(`/api/materials/${m.id}`, { method: 'DELETE' }); };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <a href="/" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></a>
        <h1 className="text-lg font-bold flex items-center gap-2"><Package className="w-5 h-5 text-emerald-400" /> Quản lý vật tư</h1>
        <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
          className="ml-auto bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">Tất cả hệ</option>
          {sheets.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-4">
        {error && <div className="rounded-lg border border-red-800 bg-red-950/40 text-red-300 px-4 py-2.5 text-sm">{error}</div>}

        {canEdit && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <input placeholder="Tên vật tư *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 col-span-2 md:col-span-1" />
              <input placeholder="Đơn vị (m, cái...)" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600" />
              <input placeholder="Định mức" type="number" min="0" value={form.qtyPlanned} onChange={e => setForm(f => ({ ...f, qtyPlanned: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600" />
              <select value={form.sheetTypeId || sheetFilter} onChange={e => setForm(f => ({ ...f, sheetTypeId: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="">— Hệ * —</option>
                {sheets.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
              <button onClick={addMaterial} disabled={!form.name || !(form.sheetTypeId || sheetFilter)}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg px-3 py-2 text-sm font-medium transition">
                <Plus className="w-4 h-4" /> Thêm
              </button>
            </div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="text-left p-3">Vật tư</th>
                <th className="text-left p-3">Hệ</th>
                <th className="text-right p-3">Định mức</th>
                <th className="text-right p-3">Đã dùng</th>
                <th className="text-left p-3 w-40">Mức dùng</th>
                <th className="text-left p-3">Trạng thái</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => {
                const ratio = m.qtyPlanned > 0 ? m.qtyUsed / m.qtyPlanned : 0;
                const over = m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned;
                return (
                  <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40">
                    <td className="p-3">
                      <span className="font-medium">{m.name}</span>
                      {m.unit && <span className="text-zinc-500 text-xs ml-1">({m.unit})</span>}
                      {over && <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-red-400"><AlertTriangle className="w-3 h-3" /> vượt định mức</span>}
                    </td>
                    <td className="p-3"><span className="px-2 py-0.5 bg-zinc-800 rounded text-xs">{m.sheetCode ?? '—'}</span></td>
                    <td className="p-3 text-right text-zinc-400">
                      {canEdit ? (
                        <input type="number" min="0" defaultValue={m.qtyPlanned} key={`p${m.id}-${m.qtyPlanned}`}
                          onBlur={e => Number(e.target.value) !== m.qtyPlanned && patch(m.id, { qtyPlanned: Number(e.target.value) })}
                          className="w-20 bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-600 focus:bg-zinc-800 rounded px-1 py-0.5 text-right outline-none" />
                      ) : m.qtyPlanned}
                    </td>
                    <td className="p-3 text-right">
                      {canEdit ? (
                        <input type="number" min="0" defaultValue={m.qtyUsed} key={`u${m.id}-${m.qtyUsed}`}
                          onBlur={e => Number(e.target.value) !== m.qtyUsed && patch(m.id, { qtyUsed: Number(e.target.value) })}
                          className={`w-20 bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-600 focus:bg-zinc-800 rounded px-1 py-0.5 text-right outline-none ${over ? 'text-red-400' : ''}`} />
                      ) : m.qtyUsed}
                    </td>
                    <td className="p-3">
                      <div className="bg-zinc-800 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${over ? 'bg-red-500' : ratio >= 0.9 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-zinc-500">{m.qtyPlanned > 0 ? `${Math.round(ratio * 100)}%` : '—'}</span>
                    </td>
                    <td className="p-3">
                      {canEdit ? (
                        <select value={m.status} onChange={e => patch(m.id, { status: e.target.value })}
                          className={`rounded px-2 py-1 text-xs outline-none border border-zinc-700 ${STATUS_CLS[m.status] ?? 'bg-zinc-800'}`}>
                          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_CLS[m.status] ?? 'bg-zinc-800'}`}>{STATUS_LABEL[m.status] ?? m.status}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {canDelete && (
                        <button onClick={() => remove(m)} title="Xoá" className="text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {materials.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-zinc-500">Chưa có vật tư nào{canEdit ? ' — thêm ở ô phía trên' : ''}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
