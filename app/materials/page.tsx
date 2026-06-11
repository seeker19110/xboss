'use client';
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Package, Plus, Trash2, AlertTriangle, History, X } from 'lucide-react';

type Material = {
  id: number; sheetTypeId: number | null; boqCode: string | null; name: string; unit: string | null;
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
  const [form, setForm] = useState({ boqCode: '', name: '', unit: '', qtyPlanned: '', sheetTypeId: '' });
  const [historyMat, setHistoryMat] = useState<Material | null>(null);

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
  }, () => setForm({ boqCode: '', name: '', unit: '', qtyPlanned: '', sheetTypeId: '' }));

  const patch = (id: number, body: object) => api(`/api/materials/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  const remove = (m: Material) => { if (window.confirm(`Xoá vật tư "${m.name}"?`)) api(`/api/materials/${m.id}`, { method: 'DELETE' }); };

  function editBoq(m: Material) {
    const v = window.prompt('Mã BOQ của vật tư (duy nhất toàn hệ thống — tránh trùng mã đặt hàng; để trống = xoá mã):', m.boqCode ?? '');
    if (v === null) return;
    patch(m.id, { boqCode: v });
  }

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

        {(() => {
          const over = materials.filter(m => m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned);
          return over.length > 0 && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 text-red-300 px-4 py-2.5 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><b>{over.length}</b> vật tư đang dùng vượt định mức: {over.slice(0, 5).map(m => m.name).join(', ')}{over.length > 5 ? '…' : ''}</span>
            </div>
          );
        })()}

        {canEdit && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <input placeholder="Mã BOQ" value={form.boqCode} onChange={e => setForm(f => ({ ...f, boqCode: e.target.value }))}
                title="Mã BOQ duy nhất toàn hệ thống — tránh trùng mã khi đặt hàng (tuỳ chọn)"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-amber-600" />
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
                <th className="text-left p-3">Mã BOQ</th>
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
                      <button onClick={() => canEdit && editBoq(m)}
                        title={canEdit ? `${m.boqCode ?? 'Chưa gán mã BOQ'} — bấm để sửa` : m.boqCode ?? 'Chưa gán mã BOQ'}
                        className={`font-mono text-xs ${m.boqCode ? 'text-amber-400' : 'text-zinc-600'} ${canEdit ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>
                        {m.boqCode ?? '—'}
                      </button>
                    </td>
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
                    <td className="p-3 text-right whitespace-nowrap">
                      <button onClick={() => setHistoryMat(m)} title="Lịch sử nhập/xuất"
                        className="text-zinc-500 hover:text-emerald-400 mr-2"><History className="w-4 h-4" /></button>
                      {canDelete && (
                        <button onClick={() => remove(m)} title="Xoá" className="text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {materials.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-zinc-500">Chưa có vật tư nào{canEdit ? ' — thêm ở ô phía trên' : ''}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {historyMat && (
        <MaterialHistoryModal material={historyMat} canEdit={canEdit}
          onClose={() => { setHistoryMat(null); load(); }} />
      )}
    </div>
  );
}

type Transaction = {
  id: number; delta: number; qtyAfter: number; note: string | null;
  createdAt: string; userName: string | null;
};

// Lịch sử nhập/xuất của 1 vật tư + form ghi giao dịch mới (delta ±).
function MaterialHistoryModal({ material, canEdit, onClose }: {
  material: Material; canEdit: boolean; onClose: () => void;
}) {
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">Nhập/xuất — {material.name}{material.unit ? ` (${material.unit})` : ''}</h3>
            <p className="text-xs text-zinc-500">
              {material.boqCode && <span className="font-mono text-amber-400 mr-2">{material.boqCode}</span>}
              Đã dùng <span className={over ? 'text-red-400 font-medium' : 'text-zinc-300'}>{qtyUsed}</span>
              {material.qtyPlanned > 0 && <> / định mức {material.qtyPlanned}</>}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {canEdit && (
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/50">
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex gap-2">
              <input type="number" min="0" step="any" placeholder="Số lượng" value={delta}
                onChange={e => setDelta(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm w-28 outline-none focus:border-emerald-600" />
              <input placeholder="Ghi chú (vd: xuất cho tầng 24F)" value={note} onChange={e => setNote(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm flex-1 outline-none focus:border-emerald-600" />
              <button onClick={() => add(1)} disabled={busy || !Number(delta)} title="Ghi dùng thêm (+)"
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-3 py-1.5 text-sm font-medium">+</button>
              <button onClick={() => add(-1)} disabled={busy || !Number(delta)} title="Điều chỉnh giảm (−)"
                className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded-lg px-3 py-1.5 text-sm font-medium">−</button>
            </div>
          </div>
        )}

        <div className="overflow-auto p-4">
          {items === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
          {items?.length === 0 && <p className="text-sm text-zinc-500">Chưa có giao dịch nào. Ghi nhập/xuất ở ô phía trên để truy vết được số liệu.</p>}
          {!!items?.length && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 text-left">
                  <th className="py-1.5 pr-2">Thời điểm</th>
                  <th className="py-1.5 pr-2">Người ghi</th>
                  <th className="py-1.5 pr-2 text-right">±</th>
                  <th className="py-1.5 pr-2 text-right">Còn lại sau</th>
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
      </div>
    </div>
  );
}
