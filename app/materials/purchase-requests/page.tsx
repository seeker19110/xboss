'use client';
import { useEffect, useState, useCallback } from 'react';
import { ShoppingCart, Plus, Check, X, Clock, AlertCircle, CheckCircle, Package } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import { appConfirm } from '@/app/components/dialogs';

type PR = {
  id: number; prCode: string; materialId: number; materialName: string; unit: string | null;
  qtyRequested: number; status: string; note: string | null; reviewNote: string | null;
  requestedBy: number; requestedByName: string;
  reviewedByName: string | null; reviewedAt: string | null; createdAt: string;
};
type Material = { id: number; name: string; unit: string | null; sheetCode: string | null };

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
  pending: <Clock className="w-3.5 h-3.5" />,
  approved: <CheckCircle className="w-3.5 h-3.5" />,
  rejected: <AlertCircle className="w-3.5 h-3.5" />,
  ordered: <Package className="w-3.5 h-3.5" />,
};

export default function PurchaseRequestsPage() {
  const [requests, setRequests] = useState<PR[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [canApprove, setCanApprove] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState({ materialId: '', qtyRequested: '', note: '' });
  const [reviewModal, setReviewModal] = useState<PR | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    fetch(`/api/purchase-requests${q}`)
      .then(r => r.json()).then(j => setRequests(j.requests ?? []));
  }, [statusFilter]);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      setCanApprove(j.user?.role === 'admin' || j.user?.role === 'pm');
      setUserId(j.user?.id);
    });
    fetch('/api/materials').then(r => r.json()).then(j => setMaterials(j.materials ?? []));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitPR = async () => {
    if (!addDraft.materialId) { setError('Chọn vật tư'); return; }
    if (!Number(addDraft.qtyRequested) || Number(addDraft.qtyRequested) <= 0) { setError('Số lượng không hợp lệ'); return; }
    setSaving(true);
    const r = await fetch('/api/purchase-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId: Number(addDraft.materialId), qtyRequested: Number(addDraft.qtyRequested), note: addDraft.note }),
    });
    setSaving(false);
    if (r.ok) { setShowAdd(false); setAddDraft({ materialId: '', qtyRequested: '', note: '' }); load(); }
    else { const j = await r.json(); setError(j.error ?? 'Lỗi tạo yêu cầu'); }
  };

  const review = async (action: 'approve' | 'reject') => {
    if (!reviewModal) return;
    setSaving(true);
    const r = await fetch(`/api/purchase-requests/${reviewModal.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reviewNote }),
    });
    setSaving(false);
    if (r.ok) { setReviewModal(null); setReviewNote(''); load(); }
    else { const j = await r.json(); setError(j.error ?? 'Lỗi duyệt'); }
  };

  const deletePR = async (id: number, code: string) => {
    if (!await appConfirm(`Xoá yêu cầu ${code}?`)) return;
    const r = await fetch(`/api/purchase-requests/${id}`, { method: 'DELETE' });
    if (r.ok) load();
    else { const j = await r.json(); setError(j.error ?? 'Lỗi xoá'); }
  };

  const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0, ordered: 0 };
  requests.forEach(r => { if (r.status in counts) counts[r.status]++; });

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <AppHeader />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-bold">Yêu cầu mua vật tư</h1>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded text-sm font-medium">
            <Plus className="w-4 h-4" /> Tạo yêu cầu
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-sm flex justify-between">
            {error} <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Bộ lọc trạng thái */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {[['', 'Tất cả'], ['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối'], ['ordered', 'Đã đặt']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${statusFilter === v ? 'bg-zinc-600 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
              {l}
              {v && counts[v] > 0 && <span className="ml-1.5 bg-zinc-700 px-1.5 py-0.5 rounded-full text-xs">{counts[v]}</span>}
            </button>
          ))}
        </div>

        {/* Form thêm */}
        {showAdd && (
          <div className="mb-5 bg-zinc-800 border border-amber-700/50 rounded-lg p-5">
            <h2 className="font-semibold mb-4 text-amber-300">Yêu cầu mua vật tư mới</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Vật tư *</label>
                <select value={addDraft.materialId} onChange={e => setAddDraft(d => ({ ...d, materialId: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500">
                  <option value="">-- Chọn vật tư --</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>[{m.sheetCode}] {m.name} {m.unit ? `(${m.unit})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Số lượng yêu cầu *</label>
                <input type="number" min="0" step="any" value={addDraft.qtyRequested}
                  onChange={e => setAddDraft(d => ({ ...d, qtyRequested: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Lý do / Ghi chú</label>
                <input type="text" value={addDraft.note} onChange={e => setAddDraft(d => ({ ...d, note: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={submitPR} disabled={saving}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-4 py-2 rounded text-sm">
                <Check className="w-4 h-4" /> Gửi yêu cầu
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded text-sm bg-zinc-700 hover:bg-zinc-600">Huỷ</button>
            </div>
          </div>
        )}

        {/* Danh sách */}
        <div className="space-y-2">
          {requests.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Không có yêu cầu nào</p>
            </div>
          )}
          {requests.map(pr => (
            <div key={pr.id} className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-zinc-400">{pr.prCode}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[pr.status]}`}>
                      {STATUS_ICON[pr.status]} {STATUS_LABEL[pr.status]}
                    </span>
                  </div>
                  <div className="font-medium text-zinc-100">{pr.materialName}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-zinc-400 mt-1">
                    <span>SL: <span className="text-zinc-200 font-medium">{pr.qtyRequested} {pr.unit ?? ''}</span></span>
                    <span>Người yêu cầu: {pr.requestedByName}</span>
                    <span>{new Date(pr.createdAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                  {pr.note && <div className="mt-1 text-sm text-zinc-400 italic">{pr.note}</div>}
                  {pr.reviewNote && (
                    <div className={`mt-1 text-sm italic ${pr.status === 'rejected' ? 'text-red-400' : 'text-green-400'}`}>
                      Phản hồi: {pr.reviewNote}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {canApprove && pr.status === 'pending' && (
                    <button onClick={() => { setReviewModal(pr); setReviewNote(''); }}
                      className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-sm">
                      Xét duyệt
                    </button>
                  )}
                  {(userId === pr.requestedBy || canApprove) && pr.status !== 'ordered' && (
                    <button onClick={() => deletePR(pr.id, pr.prCode)}
                      className="p-1.5 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal xét duyệt */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-1">Xét duyệt yêu cầu</h3>
            <p className="text-zinc-400 text-sm mb-1">{reviewModal.prCode}</p>
            <p className="text-zinc-100 mb-1">{reviewModal.materialName}</p>
            <p className="text-zinc-300 mb-4 text-sm">SL yêu cầu: <strong>{reviewModal.qtyRequested} {reviewModal.unit ?? ''}</strong></p>
            {reviewModal.note && <p className="text-zinc-400 text-sm mb-4 italic">Lý do: {reviewModal.note}</p>}
            <div className="mb-4">
              <label className="text-xs text-zinc-400 mb-1 block">Phản hồi (tuỳ chọn)</label>
              <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={2}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => review('approve')} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 py-2 rounded text-sm font-medium">
                <Check className="w-4 h-4" /> Duyệt
              </button>
              <button onClick={() => review('reject')} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 py-2 rounded text-sm font-medium">
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
