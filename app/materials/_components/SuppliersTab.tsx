'use client';
import { useEffect, useState, useRef } from 'react';
import { Building2, Plus, Pencil, Trash2, Check, X, Tag, Copy } from 'lucide-react';
import { appConfirm } from '@/app/components/dialogs';

export type Supplier = {
  id: number; name: string; title: string | null; phone: string | null; email: string | null;
  address: string | null; note: string | null; createdAt: string;
  buyerCompany: string | null; buyerProject: string | null; buyerAddress: string | null;
  buyerRep: string | null; buyerTitle: string | null; buyerPhone: string | null;
  sellerRep: string | null;
  receiverCompany: string | null; receiverAddress: string | null;
  receiverRep: string | null; receiverPhone: string | null; receiverSubcon: string | null;
  deliveryTime: string | null; deliveryContact: string | null; deliveryPhone: string | null;
  deliveryNote: string | null; deliveryOrder: string | null;
};

export const EMPTY_DRAFT = {
  name: '', title: '', phone: '', email: '', address: '', note: '',
  buyerCompany: '', buyerProject: '', buyerAddress: '', buyerRep: '', buyerTitle: '', buyerPhone: '',
  sellerRep: '',
  receiverCompany: '', receiverAddress: '', receiverRep: '', receiverPhone: '', receiverSubcon: '',
  deliveryTime: '', deliveryContact: '', deliveryPhone: '', deliveryNote: '', deliveryOrder: '',
};
export type SupplierDraft = typeof EMPTY_DRAFT;

// ── Các component nhỏ định nghĩa NGOÀI SuppliersTab để tránh unmount/remount ──

function SField({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 outline-none focus:border-blue-500" />
    </div>
  );
}

function PartyForm({ d, set }: { d: SupplierDraft; set: (fn: (d: SupplierDraft) => SupplierDraft) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs text-zinc-400 block"><Tag className="w-3 h-3 inline mr-1" />Tiêu đề / Phân loại nhà cung cấp</label>
        <input value={d.title} onChange={e => set(x => ({ ...x, title: e.target.value }))}
          placeholder="vd: Nhà Cung Cấp Ống Gió, Nhà Cung Cấp Ống Đồng + Cách Nhiệt..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500 placeholder:text-zinc-600" />
      </div>
    <div className="grid grid-cols-3 gap-x-4 gap-y-2">
      {/* Bên mua */}
      <div className="space-y-2 border border-sky-700/50 bg-sky-950/20 rounded p-2">
        <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wide">Bên mua hàng</p>
        <SField label="Tên công ty" value={d.buyerCompany} onChange={v => set(x => ({ ...x, buyerCompany: v }))} />
        <SField label="Tên công trình" value={d.buyerProject} onChange={v => set(x => ({ ...x, buyerProject: v }))} />
        <SField label="Địa chỉ giao hàng" value={d.buyerAddress} onChange={v => set(x => ({ ...x, buyerAddress: v }))} />
        <SField label="Đại diện" value={d.buyerRep} onChange={v => set(x => ({ ...x, buyerRep: v }))} />
        <SField label="Chức vụ" value={d.buyerTitle} onChange={v => set(x => ({ ...x, buyerTitle: v }))} />
        <SField label="Phone" value={d.buyerPhone} onChange={v => set(x => ({ ...x, buyerPhone: v }))} />
      </div>

      {/* Bên bán */}
      <div className="space-y-2 border border-amber-700/50 bg-amber-950/20 rounded p-2">
        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Bên bán hàng</p>
        <SField label="Tên công ty *" value={d.name} onChange={v => set(x => ({ ...x, name: v }))} />
        <SField label="Địa chỉ" value={d.address} onChange={v => set(x => ({ ...x, address: v }))} />
        <SField label="Đại diện" value={d.sellerRep} onChange={v => set(x => ({ ...x, sellerRep: v }))} />
        <SField label="Phone" value={d.phone} onChange={v => set(x => ({ ...x, phone: v }))} />
        <SField label="Email" type="email" value={d.email} onChange={v => set(x => ({ ...x, email: v }))} />
        <SField label="Ghi chú" value={d.note} onChange={v => set(x => ({ ...x, note: v }))} />
      </div>

      {/* Bên nhận */}
      <div className="space-y-2 border border-green-700/50 bg-green-950/20 rounded p-2">
        <p className="text-[10px] font-bold text-green-400 uppercase tracking-wide">Bên nhận hàng</p>
        <SField label="Tên công ty" value={d.receiverCompany} onChange={v => set(x => ({ ...x, receiverCompany: v }))} />
        <SField label="Địa chỉ giao hàng" value={d.receiverAddress} onChange={v => set(x => ({ ...x, receiverAddress: v }))} />
        <SField label="Đại diện" value={d.receiverRep} onChange={v => set(x => ({ ...x, receiverRep: v }))} />
        <SField label="Phone" value={d.receiverPhone} onChange={v => set(x => ({ ...x, receiverPhone: v }))} />
        <SField label="Nhà thầu phụ" value={d.receiverSubcon} onChange={v => set(x => ({ ...x, receiverSubcon: v }))} />
      </div>
    </div>

    {/* Thông tin giao hàng */}
    <div className="space-y-2 border border-teal-700/50 bg-teal-950/20 rounded p-2">
      <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wide">E. Thông tin giao hàng</p>
      <SField label="Thời gian giao hàng" value={d.deliveryTime} onChange={v => set(x => ({ ...x, deliveryTime: v }))} />
      <div className="grid grid-cols-2 gap-2">
        <SField label="Người liên hệ" value={d.deliveryContact} onChange={v => set(x => ({ ...x, deliveryContact: v }))} />
        <SField label="Phone liên hệ" value={d.deliveryPhone} onChange={v => set(x => ({ ...x, deliveryPhone: v }))} />
      </div>
      <SField label="Ghi chú khác" value={d.deliveryNote} onChange={v => set(x => ({ ...x, deliveryNote: v }))} />
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Giao theo thứ tự (chữ đỏ)</label>
        <textarea value={d.deliveryOrder} onChange={e => set(x => ({ ...x, deliveryOrder: e.target.value }))}
          rows={3} placeholder="Giao hàng theo số thứ tự đơn hàng:&#10;Từ 1 đến … giao trước&#10;Từ … đến … giao sau"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 outline-none focus:border-teal-500 resize-none placeholder:text-zinc-600" />
      </div>
    </div>
    </div>
  );
}

// ── Component chính ──

export default function SuppliersTab({ role }: { role: string }) {
  const canManage = role === 'admin' || role === 'pm';
  const canDelete = role === 'admin';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<SupplierDraft>({ ...EMPTY_DRAFT });
  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState<SupplierDraft>({ ...EMPTY_DRAFT });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Inline-edit tiêu đề trực tiếp trên card (không cần mở form đầy đủ)
  const [editingTitle, setEditingTitle] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.suppliers ?? []));

  useEffect(() => { load(); }, []);

  const startEditTitle = (s: Supplier) => {
    setEditingTitle(s.id);
    setTitleDraft(s.title ?? '');
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const saveTitle = async (id: number) => {
    const title = titleDraft.trim() || null;
    setEditingTitle(null);
    await fetch(`/api/suppliers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    load();
  };

  const startEdit = (s: Supplier) => {
    setEditing(s.id);
    setDraft({
      name: s.name, title: s.title ?? '', phone: s.phone ?? '', email: s.email ?? '',
      address: s.address ?? '', note: s.note ?? '',
      buyerCompany: s.buyerCompany ?? '', buyerProject: s.buyerProject ?? '',
      buyerAddress: s.buyerAddress ?? '', buyerRep: s.buyerRep ?? '',
      buyerTitle: s.buyerTitle ?? '', buyerPhone: s.buyerPhone ?? '',
      sellerRep: s.sellerRep ?? '',
      receiverCompany: s.receiverCompany ?? '', receiverAddress: s.receiverAddress ?? '',
      receiverRep: s.receiverRep ?? '', receiverPhone: s.receiverPhone ?? '',
      receiverSubcon: s.receiverSubcon ?? '',
      deliveryTime: s.deliveryTime ?? '', deliveryContact: s.deliveryContact ?? '',
      deliveryPhone: s.deliveryPhone ?? '', deliveryNote: s.deliveryNote ?? '',
      deliveryOrder: s.deliveryOrder ?? '',
    });
  };

  const saveEdit = async () => {
    if (!editing || !draft.name.trim()) { setError('Tên không được trống'); return; }
    setSaving(true);
    const r = await fetch(`/api/suppliers/${editing}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    });
    setSaving(false);
    if (r.ok) { setEditing(null); load(); }
    else { const j = await r.json(); setError(j.error ?? 'Lỗi'); }
  };

  const saveAdd = async () => {
    if (!addDraft.name.trim()) { setError('Tên không được trống'); return; }
    setSaving(true);
    const r = await fetch('/api/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addDraft),
    });
    setSaving(false);
    if (r.ok) { setShowAdd(false); setAddDraft({ ...EMPTY_DRAFT }); load(); }
    else { const j = await r.json(); setError(j.error ?? 'Lỗi'); }
  };

  const copySupplier = (s: Supplier) => {
    const d: SupplierDraft = {
      name: s.name + ' (bản sao)', title: s.title ?? '', phone: s.phone ?? '',
      email: s.email ?? '', address: s.address ?? '', note: s.note ?? '',
      buyerCompany: s.buyerCompany ?? '', buyerProject: s.buyerProject ?? '',
      buyerAddress: s.buyerAddress ?? '', buyerRep: s.buyerRep ?? '',
      buyerTitle: s.buyerTitle ?? '', buyerPhone: s.buyerPhone ?? '',
      sellerRep: s.sellerRep ?? '',
      receiverCompany: s.receiverCompany ?? '', receiverAddress: s.receiverAddress ?? '',
      receiverRep: s.receiverRep ?? '', receiverPhone: s.receiverPhone ?? '',
      receiverSubcon: s.receiverSubcon ?? '',
      deliveryTime: s.deliveryTime ?? '', deliveryContact: s.deliveryContact ?? '',
      deliveryPhone: s.deliveryPhone ?? '', deliveryNote: s.deliveryNote ?? '',
      deliveryOrder: s.deliveryOrder ?? '',
    };
    setAddDraft(d);
    setShowAdd(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const del = async (id: number, name: string) => {
    if (!await appConfirm(`Xoá nhà cung cấp "${name}"?`)) return;
    const r = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
    if (r.ok) load(); else { const j = await r.json(); setError(j.error ?? 'Lỗi xoá'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{suppliers.length} nhà cung cấp</span>
        {canManage && (
          <button onClick={() => { setShowAdd(true); setAddDraft({ ...EMPTY_DRAFT }); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded text-sm font-medium">
            <Plus className="w-4 h-4" /> Thêm
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded text-sm flex justify-between">
          {error} <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {showAdd && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-zinc-200">Thêm nhà cung cấp mới</p>
          <PartyForm d={addDraft} set={setAddDraft} />
          <div className="flex gap-2 pt-1">
            <button onClick={saveAdd} disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded text-sm">
              <Check className="w-3.5 h-3.5" /> Lưu
            </button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded text-sm bg-zinc-700 hover:bg-zinc-600">Huỷ</button>
          </div>
        </div>
      )}

      {suppliers.length === 0 && !showAdd && (
        <div className="text-center py-12 text-zinc-500">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có nhà cung cấp nào</p>
        </div>
      )}

      <div className="space-y-2">
        {suppliers.map(s => (
          <div key={s.id} className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
            {/* Tiêu đề nhà cung cấp — inline edit cho Admin/PM */}
            <div className="px-3 pt-2.5 pb-1.5 border-b border-zinc-700/60 flex items-center gap-2 group/title">
              {editingTitle === s.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <input ref={titleInputRef} value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTitle(s.id); if (e.key === 'Escape') setEditingTitle(null); }}
                    placeholder="Nhập tiêu đề nhà cung cấp..."
                    className="flex-1 bg-zinc-700 border border-emerald-600 rounded px-2 py-0.5 text-sm font-semibold text-zinc-100 outline-none" />
                  <button onClick={() => saveTitle(s.id)} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingTitle(null)} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <>
                  <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {s.title ? (
                    <span className="text-sm font-semibold text-emerald-300 flex-1">{s.title}</span>
                  ) : (
                    <span className="text-xs text-zinc-600 italic flex-1">
                      {canManage ? 'Chưa có tiêu đề — bấm để thêm' : ''}
                    </span>
                  )}
                  {canManage && (
                    <button onClick={() => startEditTitle(s)}
                      className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-emerald-400 shrink-0"
                      title="Sửa tiêu đề">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="p-3">
            {editing === s.id ? (
              <div className="space-y-3">
                <PartyForm d={draft} set={setDraft} />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded text-sm">
                    <Check className="w-3.5 h-3.5" /> Lưu
                  </button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded text-sm bg-zinc-700 hover:bg-zinc-600">Huỷ</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 grid grid-cols-3 gap-4 text-xs">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wide mb-1">Bên mua</p>
                    {s.buyerCompany && <p className="text-zinc-200 font-medium">{s.buyerCompany}</p>}
                    {s.buyerProject && <p className="text-zinc-400">{s.buyerProject}</p>}
                    {s.buyerAddress && <p className="text-zinc-500">{s.buyerAddress}</p>}
                    {s.buyerRep && <p className="text-zinc-400">{s.buyerRep}{s.buyerTitle ? ` — ${s.buyerTitle}` : ''}</p>}
                    {s.buyerPhone && <p className="text-zinc-400">{s.buyerPhone}</p>}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-1">Bên bán</p>
                    <p className="text-zinc-200 font-medium">{s.name}</p>
                    {s.address && <p className="text-zinc-400">{s.address}</p>}
                    {s.sellerRep && <p className="text-zinc-400">{s.sellerRep}</p>}
                    {s.phone && <p className="text-zinc-400">{s.phone}</p>}
                    {s.email && <p className="text-zinc-500 italic">{s.email}</p>}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wide mb-1">Bên nhận</p>
                    {s.receiverCompany && <p className="text-zinc-200 font-medium">{s.receiverCompany}</p>}
                    {s.receiverAddress && <p className="text-zinc-400">{s.receiverAddress}</p>}
                    {s.receiverRep && <p className="text-zinc-400">{s.receiverRep}</p>}
                    {s.receiverPhone && <p className="text-zinc-400">{s.receiverPhone}</p>}
                    {s.receiverSubcon && <p className="text-zinc-500 italic">NTP: {s.receiverSubcon}</p>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100" title="Sửa"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => copySupplier(s)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-blue-400" title="Nhân bản"><Copy className="w-3.5 h-3.5" /></button>
                    {canDelete && <button onClick={() => del(s.id, s.name)} className="p-1.5 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-400" title="Xoá"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
