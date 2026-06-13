'use client';
import { useEffect, useState, useCallback } from 'react';
import { ShoppingCart, Plus, Check, X, Clock, AlertCircle, CheckCircle, Package, ClipboardList } from 'lucide-react';
import { appConfirm } from '@/app/components/dialogs';

type PR = {
  id: number; prCode: string; materialId: number; materialName: string; unit: string | null;
  qtyRequested: number; status: string; note: string | null; reviewNote: string | null;
  requestedBy: number; requestedByName: string;
  reviewedByName: string | null; reviewedAt: string | null; createdAt: string;
};
type Material = { id: number; name: string; unit: string | null; sheetCode: string | null };
type Supplier = { id: number; name: string };

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', ordered: 'Đã đặt hàng',
};
const STATUS_CLS: Record<string, string> = {
  pending: 'bg-amber-950 text-amber-300',
  approved: 'bg-green-950 text-green-300',
  rejected: 'bg-red-950 text-red-400',
  ordered: 'bg-blue-950 text-blue-300',
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  approved: <CheckCircle className="w-3 h-3" />,
  rejected: <AlertCircle className="w-3 h-3" />,
  ordered: <Package className="w-3 h-3" />,
};

type POItem = { materialId: string; prId: string; qtyOrdered: string; unitPrice: string };

export default function PurchaseRequestsTab({ role, userId, materials }: {
  role: string; userId: number | null; materials: Material[];
}) {
  const canApprove = role === 'admin' || role === 'pm';
  const [requests, setRequests] = useState<PR[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');

  // Form tạo PR
  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState({ materialId: '', qtyRequested: '', note: '' });

  // Modal xét duyệt
  const [reviewModal, setReviewModal] = useState<PR | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  // Form tạo PO (nhúng inline)
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [newPO, setNewPO] = useState({ supplierId: '', expectedDate: '', note: '' });
  const [poItems, setPoItems] = useState<POItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    fetch(`/api/purchase-requests${q}`).then(r => r.json()).then(j => setRequests(j.requests ?? []));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.suppliers ?? []));
  }, []);

  // --- PR actions ---
  const submitPR = async () => {
    if (!addDraft.materialId) { setError('Chọn vật tư'); return; }
    if (Number(addDraft.qtyRequested) <= 0) { setError('Số lượng không hợp lệ'); return; }
    setSaving(true);
    const r = await fetch('/api/purchase-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId: Number(addDraft.materialId), qtyRequested: Number(addDraft.qtyRequested), note: addDraft.note }),
    });
    setSaving(false);
    if (r.ok) { setShowAdd(false); setAddDraft({ materialId: '', qtyRequested: '', note: '' }); load(); }
    else { const j = await r.json(); setError(j.error ?? 'Lỗi'); }
  };

  const review = async (action: 'approve' | 'reject') => {
    if (!reviewModal) return;
    setSaving(true);
    const r = await fetch(`/api/purchase-requests/${reviewModal.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reviewNote }),
    });
    setSaving(false);
    if (r.ok) {
      setReviewModal(null); setReviewNote('');
      // Nếu vừa duyệt → hỏi có muốn tạo PO luôn không
      if (action === 'approve') load();
      else load();
    } else { const j = await r.json(); setError(j.error ?? 'Lỗi'); }
  };

  const deletePR = async (id: number, code: string) => {
    if (!await appConfirm(`Xoá yêu cầu ${code}?`)) return;
    const r = await fetch(`/api/purchase-requests/${id}`, { method: 'DELETE' });
    if (r.ok) load(); else { const j = await r.json(); setError(j.error ?? 'Lỗi xoá'); }
  };

  // --- PO creation (inline) ---
  const openCreatePO = (preselectedPRs?: PR[]) => {
    const items: POItem[] = preselectedPRs
      ? preselectedPRs.map(pr => ({ prId: String(pr.id), materialId: String(pr.materialId), qtyOrdered: String(pr.qtyRequested), unitPrice: '' }))
      : [{ prId: '', materialId: '', qtyOrdered: '', unitPrice: '' }];
    setPoItems(items);
    setNewPO({ supplierId: '', expectedDate: '', note: '' });
    setShowCreatePO(true);
    setShowAdd(false);
  };

  const addPoItem = () => setPoItems(p => [...p, { prId: '', materialId: '', qtyOrdered: '', unitPrice: '' }]);
  const removePoItem = (i: number) => setPoItems(p => p.filter((_, idx) => idx !== i));
  const updatePoItem = (i: number, key: keyof POItem, v: string) =>
    setPoItems(p => { const n = [...p]; n[i] = { ...n[i], [key]: v }; return n; });

  // Khi chọn PR trong form PO → tự điền materialId + qty
  const selectPR = (i: number, prId: string) => {
    const pr = requests.find(p => p.id === Number(prId) && p.status === 'approved');
    setPoItems(p => {
      const n = [...p];
      n[i] = { ...n[i], prId, materialId: pr ? String(pr.materialId) : n[i].materialId, qtyOrdered: pr ? String(pr.qtyRequested) : n[i].qtyOrdered };
      return n;
    });
  };

  const submitPO = async () => {
    const validItems = poItems.filter(i => i.materialId && Number(i.qtyOrdered) > 0);
    if (!validItems.length) { setError('Cần ít nhất 1 vật tư với SL > 0'); return; }
    setSaving(true);
    const r = await fetch('/api/purchase-orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: newPO.supplierId ? Number(newPO.supplierId) : null,
        expectedDate: newPO.expectedDate || null,
        note: newPO.note || null,
        items: validItems.map(i => ({
          materialId: Number(i.materialId),
          prId: i.prId ? Number(i.prId) : undefined,
          qtyOrdered: Number(i.qtyOrdered),
          unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
        })),
      }),
    });
    setSaving(false);
    if (r.ok) {
      const j = await r.json();
      setShowCreatePO(false);
      setError('');
      load(); // reload để PR chuyển → ordered
      // Thông báo thành công
      setError(`✓ Đã tạo đơn hàng ${j.poCode}`);
      setTimeout(() => setError(''), 4000);
    } else { const j = await r.json(); setError(j.error ?? 'Lỗi tạo PO'); }
  };

  const approvedPRs = requests.filter(r => r.status === 'approved');

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {[['', 'Tất cả'], ['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối'], ['ordered', 'Đã đặt']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === v ? 'bg-zinc-600 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 shrink-0">
          {canApprove && approvedPRs.length > 0 && !showCreatePO && (
            <button onClick={() => openCreatePO(approvedPRs)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-sm font-medium">
              <ClipboardList className="w-4 h-4" /> Tạo đơn hàng ({approvedPRs.length} PR)
            </button>
          )}
          <button onClick={() => { setShowAdd(v => !v); setShowCreatePO(false); }}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded text-sm font-medium">
            <Plus className="w-4 h-4" /> Tạo yêu cầu
          </button>
        </div>
      </div>

      {error && (
        <div className={`p-3 border rounded text-sm flex justify-between ${error.startsWith('✓') ? 'bg-green-900/50 border-green-700 text-green-300' : 'bg-red-900/50 border-red-700 text-red-300'}`}>
          {error} <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Form tạo PR */}
      {showAdd && (
        <div className="bg-zinc-800 border border-amber-700/40 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-300 mb-3">Yêu cầu mua vật tư mới</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-3">
              <label className="text-xs text-zinc-400 mb-1 block">Vật tư *</label>
              <select value={addDraft.materialId} onChange={e => setAddDraft(d => ({ ...d, materialId: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500">
                <option value="">-- Chọn vật tư --</option>
                {materials.map(m => <option key={m.id} value={m.id}>[{m.sheetCode}] {m.name}{m.unit ? ` (${m.unit})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Số lượng *</label>
              <input type="number" min="0" step="any" value={addDraft.qtyRequested}
                onChange={e => setAddDraft(d => ({ ...d, qtyRequested: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-400 mb-1 block">Lý do / Ghi chú</label>
              <input type="text" value={addDraft.note} onChange={e => setAddDraft(d => ({ ...d, note: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={submitPR} disabled={saving}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-1.5 rounded text-sm">
              <Check className="w-3.5 h-3.5" /> Gửi yêu cầu
            </button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded text-sm bg-zinc-700 hover:bg-zinc-600">Huỷ</button>
          </div>
        </div>
      )}

      {/* Form tạo PO (nhúng inline) */}
      {showCreatePO && (
        <div className="bg-zinc-800 border border-blue-700/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-blue-300 flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Tạo đơn đặt hàng (PO)
            </p>
            <button onClick={() => setShowCreatePO(false)} className="text-zinc-400 hover:text-zinc-100"><X className="w-4 h-4" /></button>
          </div>

          {/* Thông tin PO */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Nhà cung cấp</label>
              <select value={newPO.supplierId} onChange={e => setNewPO(p => ({ ...p, supplierId: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500">
                <option value="">-- Chọn NCC --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Ngày giao dự kiến</label>
              <input type="date" value={newPO.expectedDate} onChange={e => setNewPO(p => ({ ...p, expectedDate: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Ghi chú đơn hàng</label>
              <input type="text" value={newPO.note} onChange={e => setNewPO(p => ({ ...p, note: e.target.value }))}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500" />
            </div>
          </div>

          {/* Danh sách vật tư */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Danh sách vật tư đặt hàng</span>
              <button onClick={addPoItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                <Plus className="w-3.5 h-3.5" /> Thêm dòng
              </button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-2 mb-1 text-xs text-zinc-500">
              <div className="col-span-3">Từ PR</div>
              <div className="col-span-4">Vật tư</div>
              <div className="col-span-2 text-right">SL đặt</div>
              <div className="col-span-2 text-right">Đơn giá</div>
              <div className="col-span-1" />
            </div>

            <div className="space-y-1.5">
              {poItems.map((item, i) => {
                const linkedPR = requests.find(p => p.id === Number(item.prId));
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center bg-zinc-700/30 rounded px-2 py-2">
                    {/* Chọn PR */}
                    <div className="col-span-3">
                      <select value={item.prId} onChange={e => selectPR(i, e.target.value)}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500">
                        <option value="">-- PR --</option>
                        {requests.filter(r => r.status === 'approved').map(pr => (
                          <option key={pr.id} value={pr.id}>{pr.prCode}</option>
                        ))}
                      </select>
                      {linkedPR && <div className="text-xs text-green-400 mt-0.5 truncate">{linkedPR.materialName}</div>}
                    </div>

                    {/* Vật tư */}
                    <div className="col-span-4">
                      <select value={item.materialId} onChange={e => updatePoItem(i, 'materialId', e.target.value)}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500">
                        <option value="">-- Chọn vật tư --</option>
                        {materials.map(m => <option key={m.id} value={m.id}>[{m.sheetCode}] {m.name}</option>)}
                      </select>
                    </div>

                    {/* SL đặt */}
                    <div className="col-span-2">
                      <input type="number" min="0" step="any" value={item.qtyOrdered}
                        onChange={e => updatePoItem(i, 'qtyOrdered', e.target.value)}
                        placeholder="SL"
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 text-right outline-none focus:border-blue-500" />
                    </div>

                    {/* Đơn giá */}
                    <div className="col-span-2">
                      <input type="number" min="0" value={item.unitPrice}
                        onChange={e => updatePoItem(i, 'unitPrice', e.target.value)}
                        placeholder="Giá"
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 text-right outline-none focus:border-blue-500" />
                    </div>

                    <div className="col-span-1 flex justify-end">
                      {poItems.length > 1 && (
                        <button onClick={() => removePoItem(i)} className="p-1 text-zinc-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={submitPO} disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium">
              <Check className="w-4 h-4" /> {saving ? 'Đang tạo...' : 'Tạo đơn hàng'}
            </button>
            <button onClick={() => setShowCreatePO(false)} className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-sm">Huỷ</button>
          </div>
        </div>
      )}

      {/* Danh sách PR */}
      {requests.length === 0 && !showAdd && !showCreatePO && (
        <div className="text-center py-12 text-zinc-500">
          <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Không có yêu cầu nào</p>
        </div>
      )}
      <div className="space-y-2">
        {requests.map(pr => (
          <div key={pr.id} className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs text-zinc-400">{pr.prCode}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[pr.status]}`}>
                    {STATUS_ICON[pr.status]} {STATUS_LABEL[pr.status]}
                  </span>
                </div>
                <div className="font-medium text-zinc-100 text-sm">{pr.materialName}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-400 mt-0.5">
                  <span>SL: <span className="text-zinc-200 font-medium">{pr.qtyRequested} {pr.unit ?? ''}</span></span>
                  <span>{pr.requestedByName}</span>
                  <span>{new Date(pr.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
                {pr.note && <div className="text-xs text-zinc-500 italic mt-0.5">{pr.note}</div>}
                {pr.reviewNote && (
                  <div className={`text-xs italic mt-0.5 ${pr.status === 'rejected' ? 'text-red-400' : 'text-green-400'}`}>
                    Phản hồi: {pr.reviewNote}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                {canApprove && pr.status === 'pending' && (
                  <button onClick={() => { setReviewModal(pr); setReviewNote(''); }}
                    className="px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-xs">Xét duyệt</button>
                )}
                {/* Nút tạo PO ngay từ PR đã duyệt */}
                {canApprove && pr.status === 'approved' && (
                  <button onClick={() => openCreatePO([pr])}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-700 text-xs text-blue-200">
                    <ClipboardList className="w-3 h-3" /> Đặt hàng
                  </button>
                )}
                {(userId === pr.requestedBy || canApprove) && pr.status !== 'ordered' && (
                  <button onClick={() => deletePR(pr.id, pr.prCode)}
                    className="p-1.5 rounded hover:bg-red-900/50 text-zinc-500 hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal xét duyệt */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl w-full max-w-md p-5">
            <h3 className="font-bold mb-1">Xét duyệt — {reviewModal.prCode}</h3>
            <p className="text-zinc-100 mb-0.5">{reviewModal.materialName}</p>
            <p className="text-zinc-400 text-sm mb-3">
              SL: <strong className="text-zinc-200">{reviewModal.qtyRequested} {reviewModal.unit ?? ''}</strong>
              {reviewModal.note && ` · ${reviewModal.note}`}
            </p>
            <div className="mb-3">
              <label className="text-xs text-zinc-400 mb-1 block">Phản hồi (tuỳ chọn)</label>
              <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={2}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => review('approve')} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 py-2 rounded text-sm font-medium">
                <Check className="w-4 h-4" /> Duyệt
              </button>
              <button onClick={() => review('reject')} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 py-2 rounded text-sm font-medium">
                <X className="w-4 h-4" /> Từ chối
              </button>
              <button onClick={() => setReviewModal(null)} className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-sm">Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
