'use client';
import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Plus, ChevronDown, ChevronRight, Truck, Check, X, Package, AlertCircle } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';
import { appConfirm } from '@/app/components/dialogs';

type PO = {
  id: number; poCode: string; status: string;
  expectedDate: string | null; note: string | null;
  supplierId: number | null; supplierName: string | null;
  createdByName: string; createdAt: string;
  itemCount: number; totalOrdered: number; totalReceived: number;
};
type POItem = {
  id: number; materialId: number; materialName: string; unit: string | null; boqCode: string | null;
  qtyOrdered: number; qtyReceived: number; unitPrice: number | null; note: string | null; prId: number | null;
};
type Supplier = { id: number; name: string };
type PRItem = { id: number; prCode: string; materialId: number; materialName: string; unit: string | null; qtyRequested: number };
type Material = { id: number; name: string; unit: string | null; sheetCode: string | null };

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp', confirmed: 'Đã xác nhận', partial: 'Nhập một phần',
  received: 'Đã nhập đủ', cancelled: 'Đã huỷ',
};
const STATUS_CLS: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-300',
  confirmed: 'bg-blue-950 text-blue-300',
  partial: 'bg-amber-950 text-amber-300',
  received: 'bg-green-950 text-green-300',
  cancelled: 'bg-red-950 text-red-400',
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [approvedPRs, setApprovedPRs] = useState<PRItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, POItem[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [showReceive, setShowReceive] = useState<PO | null>(null);
  const [receiveItems, setReceiveItems] = useState<Record<number, string>>({});
  const [receiveNote, setReceiveNote] = useState('');
  const [receivePoItems, setReceivePoItems] = useState<POItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form tạo PO
  const [newPO, setNewPO] = useState({
    supplierId: '', expectedDate: '', note: '',
    items: [{ materialId: '', prId: '', qtyOrdered: '', unitPrice: '', note: '' }] as {
      materialId: string; prId: string; qtyOrdered: string; unitPrice: string; note: string;
    }[],
  });

  const load = useCallback(() => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    fetch(`/api/purchase-orders${q}`).then(r => r.json()).then(j => setOrders(j.orders ?? []));
  }, [statusFilter]);

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
      const j = await r.json();
      setCanManage(j.user?.role === 'admin' || j.user?.role === 'pm');
    });
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.suppliers ?? []));
    fetch('/api/purchase-requests?status=approved').then(r => r.json()).then(j => setApprovedPRs(j.requests ?? []));
    fetch('/api/materials').then(r => r.json()).then(j => setMaterials(j.materials ?? []));
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadItems = async (poId: number) => {
    if (expandedItems[poId]) return;
    const r = await fetch(`/api/purchase-orders/${poId}`);
    const j = await r.json();
    setExpandedItems(prev => ({ ...prev, [poId]: j.items ?? [] }));
  };

  const toggleExpand = async (poId: number) => {
    if (expanded === poId) { setExpanded(null); return; }
    setExpanded(poId);
    await loadItems(poId);
  };

  const createPO = async () => {
    const validItems = newPO.items.filter(i => i.materialId && Number(i.qtyOrdered) > 0);
    if (!validItems.length) { setError('Cần ít nhất 1 vật tư với số lượng > 0'); return; }
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
          note: i.note || undefined,
        })),
      }),
    });
    setSaving(false);
    if (r.ok) { setShowCreate(false); resetNewPO(); load(); }
    else { const j = await r.json(); setError(j.error ?? 'Lỗi tạo PO'); }
  };

  const resetNewPO = () => setNewPO({
    supplierId: '', expectedDate: '', note: '',
    items: [{ materialId: '', prId: '', qtyOrdered: '', unitPrice: '', note: '' }],
  });

  const openReceive = async (po: PO) => {
    const r = await fetch(`/api/purchase-orders/${po.id}`);
    const j = await r.json();
    const items: POItem[] = j.items ?? [];
    setReceivePoItems(items);
    const initQty: Record<number, string> = {};
    items.forEach(i => { initQty[i.id] = String(Math.max(0, i.qtyOrdered - i.qtyReceived)); });
    setReceiveItems(initQty);
    setReceiveNote('');
    setShowReceive(po);
  };

  const submitReceive = async () => {
    if (!showReceive) return;
    const items = receivePoItems
      .map(i => ({ poItemId: i.id, qtyReceived: Number(receiveItems[i.id] ?? 0), note: '' }))
      .filter(i => i.qtyReceived > 0);
    if (!items.length) { setError('Nhập số lượng nhận cho ít nhất 1 dòng'); return; }
    setSaving(true);
    const r = await fetch(`/api/purchase-orders/${showReceive.id}/receive`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: receiveNote || null, items }),
    });
    setSaving(false);
    if (r.ok) {
      setShowReceive(null);
      setExpandedItems(prev => { const n = { ...prev }; delete n[showReceive.id]; return n; });
      load();
    } else { const j = await r.json(); setError(j.error ?? 'Lỗi nhập kho'); }
  };

  const updateStatus = async (po: PO, status: string) => {
    const label = status === 'confirmed' ? 'xác nhận' : status === 'cancelled' ? 'huỷ' : status;
    if (!await appConfirm(`${label} đơn hàng ${po.poCode}?`)) return;
    const r = await fetch(`/api/purchase-orders/${po.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    if (r.ok) load();
    else { const j = await r.json(); setError(j.error ?? 'Lỗi cập nhật'); }
  };

  const deletePO = async (po: PO) => {
    if (!await appConfirm(`Xoá đơn hàng ${po.poCode}?`)) return;
    const r = await fetch(`/api/purchase-orders/${po.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else { const j = await r.json(); setError(j.error ?? 'Lỗi xoá'); }
  };

  const addItem = () => setNewPO(p => ({ ...p, items: [...p.items, { materialId: '', prId: '', qtyOrdered: '', unitPrice: '', note: '' }] }));
  const removeItem = (i: number) => setNewPO(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, key: string, v: string) =>
    setNewPO(p => { const items = [...p.items]; (items[i] as Record<string, string>)[key] = v; return { ...p, items }; });

  // Khi chọn PR → tự điền materialId và qtyOrdered
  const selectPR = (i: number, prId: string) => {
    const pr = approvedPRs.find(p => p.id === Number(prId));
    setNewPO(p => {
      const items = [...p.items];
      items[i] = { ...items[i], prId, materialId: pr ? String(pr.materialId) : items[i].materialId, qtyOrdered: pr ? String(pr.qtyRequested) : items[i].qtyOrdered };
      return { ...p, items };
    });
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold">Đơn đặt hàng (PO)</h1>
            <span className="text-sm text-zinc-400">({orders.length})</span>
          </div>
          {canManage && (
            <button onClick={() => { setShowCreate(true); resetNewPO(); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium">
              <Plus className="w-4 h-4" /> Tạo đơn hàng
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-sm flex justify-between">
            {error} <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Bộ lọc */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {[['', 'Tất cả'], ['draft', 'Nháp'], ['confirmed', 'Đã xác nhận'], ['partial', 'Một phần'], ['received', 'Đã nhận đủ'], ['cancelled', 'Đã huỷ']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded text-sm font-medium ${statusFilter === v ? 'bg-zinc-600 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Danh sách PO */}
        <div className="space-y-2">
          {orders.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Không có đơn hàng nào</p>
            </div>
          )}
          {orders.map(po => {
            const items = expandedItems[po.id] ?? [];
            const pct = po.totalOrdered > 0 ? Math.round((po.totalReceived / po.totalOrdered) * 100) : 0;
            return (
              <div key={po.id} className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button onClick={() => toggleExpand(po.id)} className="text-zinc-400 hover:text-zinc-100 shrink-0">
                        {expanded === po.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono text-sm font-semibold text-zinc-100">{po.poCode}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[po.status]}`}>
                            {STATUS_LABEL[po.status]}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-400">
                          {po.supplierName && <span>NCC: <span className="text-zinc-300">{po.supplierName}</span></span>}
                          {po.expectedDate && <span>Giao dự kiến: <span className="text-zinc-300">{new Date(po.expectedDate).toLocaleDateString('vi-VN')}</span></span>}
                          <span>{po.itemCount} vật tư</span>
                          <span>Tạo bởi {po.createdByName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {po.totalOrdered > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-zinc-400 mb-0.5">Tiến độ nhập</div>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-zinc-300">{pct}%</span>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-1">
                        {canManage && po.status === 'draft' && (
                          <button onClick={() => updateStatus(po, 'confirmed')}
                            className="px-2.5 py-1.5 rounded bg-blue-800 hover:bg-blue-700 text-xs">Xác nhận</button>
                        )}
                        {(po.status === 'confirmed' || po.status === 'partial') && (
                          <button onClick={() => openReceive(po)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-green-800 hover:bg-green-700 text-xs">
                            <Truck className="w-3.5 h-3.5" /> Nhập kho
                          </button>
                        )}
                        {canManage && po.status === 'draft' && (
                          <button onClick={() => deletePO(po)} className="p-1.5 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-400">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {canManage && (po.status === 'confirmed' || po.status === 'partial') && (
                          <button onClick={() => updateStatus(po, 'cancelled')}
                            className="p-1.5 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-400">
                            <AlertCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chi tiết items */}
                {expanded === po.id && (
                  <div className="border-t border-zinc-700 bg-zinc-850">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-zinc-400 bg-zinc-900/50">
                          <th className="text-left px-4 py-2">Vật tư</th>
                          <th className="text-right px-4 py-2">ĐVT</th>
                          <th className="text-right px-4 py-2">SL đặt</th>
                          <th className="text-right px-4 py-2">Đã nhận</th>
                          <th className="text-right px-4 py-2">Đơn giá</th>
                          <th className="text-right px-4 py-2">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 && (
                          <tr><td colSpan={6} className="text-center py-4 text-zinc-500">Đang tải...</td></tr>
                        )}
                        {items.map(item => (
                          <tr key={item.id} className="border-t border-zinc-700/50 hover:bg-zinc-700/20">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-zinc-100">{item.materialName}</div>
                              {item.boqCode && <div className="text-xs text-zinc-500">{item.boqCode}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-zinc-400">{item.unit ?? '-'}</td>
                            <td className="px-4 py-2.5 text-right font-medium">{item.qtyOrdered}</td>
                            <td className={`px-4 py-2.5 text-right font-medium ${item.qtyReceived >= item.qtyOrdered ? 'text-green-400' : item.qtyReceived > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
                              {item.qtyReceived}
                            </td>
                            <td className="px-4 py-2.5 text-right text-zinc-400">
                              {item.unitPrice ? item.unitPrice.toLocaleString('vi-VN') : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-zinc-300">
                              {item.unitPrice ? (item.unitPrice * item.qtyOrdered).toLocaleString('vi-VN') : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal tạo PO */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl w-full max-w-3xl my-8 p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-lg">Tạo đơn đặt hàng mới</h3>
              <button onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-zinc-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
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
              <div className="col-span-2">
                <label className="text-xs text-zinc-400 mb-1 block">Ghi chú</label>
                <input type="text" value={newPO.note} onChange={e => setNewPO(p => ({ ...p, note: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500" />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-zinc-300">Danh sách vật tư</span>
                <button onClick={addItem} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
                  <Plus className="w-4 h-4" /> Thêm dòng
                </button>
              </div>
              <div className="space-y-2">
                {newPO.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end bg-zinc-700/40 rounded p-3">
                    <div className="col-span-3">
                      <label className="text-xs text-zinc-400 mb-1 block">Từ yêu cầu mua (PR)</label>
                      <select value={item.prId} onChange={e => selectPR(i, e.target.value)}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500">
                        <option value="">-- Chọn PR --</option>
                        {approvedPRs.map(pr => <option key={pr.id} value={pr.id}>{pr.prCode} – {pr.materialName}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="text-xs text-zinc-400 mb-1 block">Vật tư *</label>
                      <select value={item.materialId} onChange={e => updateItem(i, 'materialId', e.target.value)}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500">
                        <option value="">-- Chọn vật tư --</option>
                        {materials.map(m => <option key={m.id} value={m.id}>[{m.sheetCode}] {m.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-400 mb-1 block">SL đặt *</label>
                      <input type="number" min="0" step="any" value={item.qtyOrdered}
                        onChange={e => updateItem(i, 'qtyOrdered', e.target.value)}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-zinc-400 mb-1 block">Đơn giá</label>
                      <input type="number" min="0" value={item.unitPrice}
                        onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-blue-500" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {newPO.items.length > 1 && (
                        <button onClick={() => removeItem(i)} className="p-1 text-zinc-400 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={createPO} disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 rounded text-sm font-medium">
                <Check className="w-4 h-4" /> Tạo đơn hàng
              </button>
              <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded bg-zinc-700 hover:bg-zinc-600 text-sm">Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nhập kho */}
      {showReceive && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl w-full max-w-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-lg">Nhập kho</h3>
                <p className="text-sm text-zinc-400">{showReceive.poCode} {showReceive.supplierName ? `– ${showReceive.supplierName}` : ''}</p>
              </div>
              <button onClick={() => setShowReceive(null)} className="text-zinc-400 hover:text-zinc-100"><X className="w-5 h-5" /></button>
            </div>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-700">
                  <th className="text-left py-2">Vật tư</th>
                  <th className="text-right py-2">ĐVT</th>
                  <th className="text-right py-2">Còn cần nhận</th>
                  <th className="text-right py-2">SL nhận lần này</th>
                </tr>
              </thead>
              <tbody>
                {receivePoItems.map(item => {
                  const remaining = item.qtyOrdered - item.qtyReceived;
                  return (
                    <tr key={item.id} className="border-b border-zinc-700/50">
                      <td className="py-2.5 pr-2">
                        <div className="font-medium">{item.materialName}</div>
                        <div className="text-xs text-zinc-500">Đặt: {item.qtyOrdered} | Đã nhận: {item.qtyReceived}</div>
                      </td>
                      <td className="py-2.5 text-right text-zinc-400 pr-2">{item.unit ?? '-'}</td>
                      <td className="py-2.5 text-right text-zinc-300 pr-2">{remaining}</td>
                      <td className="py-2.5 text-right">
                        <input type="number" min="0" max={remaining} step="any"
                          value={receiveItems[item.id] ?? '0'}
                          onChange={e => setReceiveItems(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-24 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-100 text-right outline-none focus:border-blue-500" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mb-4">
              <label className="text-xs text-zinc-400 mb-1 block">Ghi chú phiếu nhập</label>
              <input type="text" value={receiveNote} onChange={e => setReceiveNote(e.target.value)}
                className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={submitReceive} disabled={saving}
                className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 px-5 py-2.5 rounded text-sm font-medium">
                <Package className="w-4 h-4" /> Xác nhận nhập kho
              </button>
              <button onClick={() => setShowReceive(null)} className="px-5 py-2.5 rounded bg-zinc-700 hover:bg-zinc-600 text-sm">Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
