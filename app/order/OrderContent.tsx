'use client';
import { useEffect, useState, useCallback } from 'react';
import { Printer, ArrowLeft, Plus, Trash2, X } from 'lucide-react';

type Supplier = {
  id: number; name: string;
  buyerCompany: string | null; buyerProject: string | null; buyerAddress: string | null;
  buyerRep: string | null; buyerTitle: string | null; buyerPhone: string | null;
  address: string | null; sellerRep: string | null; phone: string | null;
  receiverCompany: string | null; receiverAddress: string | null;
  receiverRep: string | null; receiverPhone: string | null; receiverSubcon: string | null;
  deliveryTime: string | null; deliveryContact: string | null; deliveryPhone: string | null;
  deliveryNote: string | null; deliveryOrder: string | null;
};

type Material = {
  id: number; boqCode: string | null; name: string; unit: string | null;
  qtyBoq: number; qtyPlanned: number; qtyUsed: number; sheetCode: string | null;
};

type OrderRow = {
  uid: string;
  stt: string;
  boqCode: string;
  name: string;
  dvt: string;
  qtyBoq: string;
  qtyPlanned: string;
  qtyUsed: string;
  orderQty: string;
  note: string;
  linked: boolean;
};

let _uid = 0;
function uid() { return String(++_uid); }

function emptyRow(stt: number): OrderRow {
  return { uid: uid(), stt: String(stt), boqCode: '', name: '', dvt: '', qtyBoq: '', qtyPlanned: '', qtyUsed: '', orderQty: '', note: '', linked: false };
}

export default function OrderContent({ isEmbed = false }: { isEmbed?: boolean }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [project, setProject] = useState<{ name: string | null; code: string | null; tower: string | null }>({ name: null, code: null, tower: null });
  const [rows, setRows] = useState<OrderRow[]>([emptyRow(1), emptyRow(2), emptyRow(3)]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [buyer, setBuyer] = useState({ company: '', project: '', address: '', rep: '', title: '', phone: '' });
  const [seller, setSeller] = useState({ company: '', address: '', rep: '', phone: '' });
  const [receiver, setReceiver] = useState({ company: '', address: '', rep: '', phone: '', subcon: '' });
  const [orderDate, setOrderDate] = useState(() => new Date().toLocaleDateString('vi-VN'));
  const [docTitle, setDocTitle] = useState('ĐƠN ĐẶT HÀNG');
  const [delivery, setDelivery] = useState({ time: '', contact: '', phone: '', note: '', order: '' });
  const [signers, setSigners] = useState([
    { role: 'NTP THI CÔNG', name: 'ĐỖ VĂN LIÊN' },
    { role: 'GS PHỤ TRÁCH', name: 'NGUYỄN VIẾT ĐỨC' },
    { role: 'CHỈ HUY TRƯỞNG MEP', name: 'DIỆP THANH NAM' },
    { role: 'CHỈ HUY TRƯỞNG', name: 'VŨ VIỆT HƯNG' },
  ]);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem('order_logo');
    if (stored) setLogoSrc(stored);
  }, []);
  const saveLogo = (src: string | null) => {
    setLogoSrc(src);
    if (src) localStorage.setItem('order_logo', src);
    else localStorage.removeItem('order_logo');
  };
  const logoInputRef = useCallback((el: HTMLInputElement | null) => { if (el) el.value = ''; }, []);
  const [boqSearch, setBoqSearch] = useState<{ uid: string; term: string } | null>(null);

  useEffect(() => {
    fetch('/api/project').then(r => r.json()).then(j => setProject(j));
    fetch('/api/materials')
      .then(r => r.json().catch(() => ({ materials: [] })))
      .then(j => setMaterials(j.materials ?? []));
    fetch('/api/suppliers').then(r => r.json()).then(j => setSuppliers(j.suppliers ?? []));
  }, []);

  function applySupplier(id: string) {
    const s = suppliers.find(x => x.id === Number(id));
    if (!s) return;
    setBuyer({ company: s.buyerCompany ?? '', project: s.buyerProject ?? '', address: s.buyerAddress ?? '', rep: s.buyerRep ?? '', title: s.buyerTitle ?? '', phone: s.buyerPhone ?? '' });
    setSeller({ company: s.name, address: s.address ?? '', rep: s.sellerRep ?? '', phone: s.phone ?? '' });
    setReceiver({ company: s.receiverCompany ?? '', address: s.receiverAddress ?? '', rep: s.receiverRep ?? '', phone: s.receiverPhone ?? '', subcon: s.receiverSubcon ?? '' });
    setDelivery({ time: s.deliveryTime ?? '', contact: s.deliveryContact ?? '', phone: s.deliveryPhone ?? '', note: s.deliveryNote ?? '', order: s.deliveryOrder ?? '' });
  }

  const findByBoq = useCallback((code: string): Material | undefined => {
    if (!code.trim()) return undefined;
    return materials.find(m => (m.boqCode ?? '').toLowerCase() === code.trim().toLowerCase());
  }, [materials]);

  const suggestions = boqSearch
    ? materials.filter(m => m.boqCode && (
        m.boqCode.toLowerCase().includes(boqSearch.term.toLowerCase()) ||
        m.name.toLowerCase().includes(boqSearch.term.toLowerCase())
      )).slice(0, 8)
    : [];

  function updateRow(uid: string, patch: Partial<OrderRow>) {
    setRows(prev => prev.map(r => r.uid === uid ? { ...r, ...patch } : r));
  }

  function applyMaterial(rowUid: string, mat: Material) {
    updateRow(rowUid, { boqCode: mat.boqCode ?? '', name: mat.name, dvt: mat.unit ?? '', qtyBoq: String(mat.qtyBoq ?? 0), qtyPlanned: String(mat.qtyPlanned ?? 0), qtyUsed: String(mat.qtyUsed ?? 0), linked: true });
    setBoqSearch(null);
  }

  function onBoqChange(uid: string, val: string) {
    updateRow(uid, { boqCode: val, linked: false });
    setBoqSearch(val.trim() ? { uid, term: val } : null);
    const mat = findByBoq(val);
    if (mat) applyMaterial(uid, mat);
  }

  function addRow() {
    setRows(prev => {
      const last5 = prev.slice(-5);
      const maxStt = last5.reduce((max, r) => { const n = parseFloat(r.stt); return isFinite(n) && n > max ? n : max; }, 0);
      return [...prev, emptyRow(Math.floor(maxStt) + 1)];
    });
  }

  function removeRow(uid: string) {
    setRows(prev => prev.filter(r => r.uid !== uid));
  }

  function remaining(r: OrderRow) {
    const planned = parseFloat(r.qtyPlanned) || 0;
    const used    = parseFloat(r.qtyUsed) || 0;
    const order   = parseFloat(r.orderQty) || 0;
    if (!r.qtyPlanned) return '';
    return String(Math.max(0, planned - used - order));
  }

  const inputCls = "no-print outline-none border-b border-gray-300 bg-transparent w-full text-[10px] text-center py-[2px] focus:border-gray-500";
  const inputLeftCls = "no-print outline-none border-b border-gray-300 bg-transparent w-full text-[10px] py-[2px] focus:border-gray-500";

  const InfoField = ({ label, value, onChange, placeholder = '', labelWidth = '108px', style }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; labelWidth?: string; style?: React.CSSProperties }) => (
    <div className="flex items-baseline gap-2 text-[10px] min-w-0 py-[2px]" style={style}>
      <span className="shrink-0 text-gray-600 whitespace-nowrap" style={{ width: labelWidth }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="no-print min-w-0 flex-1 outline-none border-b border-gray-300 bg-transparent py-[1px] focus:border-gray-500 placeholder:text-gray-300" />
      <span className="print-only min-w-0 flex-1 border-b border-gray-200 min-h-[14px] break-words">{value}</span>
    </div>
  );

  // Dùng để tránh warning khi project không được dùng trực tiếp
  void project;

  return (
    <>
      {/* Thanh công cụ */}
      <div className="no-print bg-zinc-950 border-b border-zinc-800 px-6 py-3 flex items-center gap-3 sticky top-0 z-50">
        {!isEmbed && (
          <>
            <a href="/materials" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" /> Quay lại
            </a>
            <span className="text-zinc-700">|</span>
          </>
        )}
        <span className="text-sm text-zinc-300 font-medium">Đơn đặt hàng</span>
        <div className="ml-auto flex items-center gap-3">
          {suppliers.length > 0 && (
            <select onChange={e => applySupplier(e.target.value)} defaultValue=""
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-zinc-500">
              <option value="">Chọn nhà cung cấp…</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button onClick={addRow}
            className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white rounded-lg px-3 py-1.5 text-sm transition">
            <Plus className="w-4 h-4" /> Thêm hàng
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-1.5 text-sm font-medium text-white transition">
            <Printer className="w-4 h-4" /> In / Xuất PDF
          </button>
        </div>
      </div>

      {/* Trang A4 */}
      <div className="no-print-bg min-h-screen bg-zinc-900 py-8 px-4 flex justify-center" onClick={() => setBoqSearch(null)}>
        <div className="a4-page bg-white text-black w-[210mm] min-h-[297mm] shadow-2xl p-[14mm]">

          {/* Tiêu đề */}
          <div className="mb-4">
            <div className="border-b-2 border-teal-600 pb-1 mb-1 flex items-end gap-4">
              <input value={docTitle} onChange={e => setDocTitle(e.target.value)}
                className="no-print text-[15px] font-bold text-teal-700 outline-none bg-transparent flex-1 hover:bg-teal-50/50 focus:bg-teal-50/50 rounded px-1 -mx-1" />
              <p className="print-only text-[15px] font-bold text-teal-700 flex-1">{docTitle}</p>
              <label className="no-print relative flex items-center justify-center w-32 h-10 border border-dashed border-teal-300 rounded cursor-pointer hover:border-teal-500 hover:bg-teal-50/50 shrink-0 overflow-hidden group">
                {logoSrc
                  ? <img src={logoSrc} alt="logo" className="max-h-full max-w-full object-contain" />
                  : <span className="text-[9px] text-teal-400 group-hover:text-teal-600 select-none">+ Chèn logo</span>
                }
                <input type="file" accept="image/*" className="hidden" ref={logoInputRef}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = ev => saveLogo(ev.target?.result as string);
                    reader.readAsDataURL(f);
                  }} />
                {logoSrc && (
                  <button type="button" onClick={e => { e.preventDefault(); saveLogo(null); }}
                    className="absolute top-0.5 right-0.5 bg-white/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </label>
              {logoSrc && <img src={logoSrc} alt="logo" className="print-only max-h-10 max-w-[8rem] object-contain shrink-0" />}
            </div>
            <div className="bg-teal-50 border border-teal-100 rounded px-2 py-[3px] flex items-center gap-2 text-[10px] text-teal-700 italic">
              <span>Ngày khởi tạo đơn hàng</span>
              <input value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className="no-print outline-none bg-transparent border-b border-teal-300 italic text-[10px] text-teal-700 w-24 focus:border-teal-500" />
              <span className="print-only">{orderDate}</span>
            </div>
          </div>

          {/* Thông tin các bên */}
          <div className="mb-3 space-y-2 text-[10px]">
            <div className="bg-sky-50 border border-sky-200 rounded px-3 py-2 space-y-1">
              <p className="font-bold text-sky-800 uppercase text-[9px] tracking-wide mb-1">A. Thông tin bên mua hàng</p>
              <div className="grid gap-y-1 [&>*]:min-w-0" style={{ gridTemplateColumns: '1fr 220px', columnGap: '24px' }}>
                <InfoField label="Tên công ty:" value={buyer.company} onChange={v => setBuyer(b => ({ ...b, company: v }))} placeholder="…" />
                <InfoField label="Đại diện:" value={buyer.rep} onChange={v => setBuyer(b => ({ ...b, rep: v }))} placeholder="…" labelWidth="56px" />
                <InfoField label="Tên công trình:" value={buyer.project} onChange={v => setBuyer(b => ({ ...b, project: v }))} placeholder="…" />
                <InfoField label="Chức vụ:" value={buyer.title} onChange={v => setBuyer(b => ({ ...b, title: v }))} placeholder="…" labelWidth="56px" />
                <InfoField label="Địa chỉ giao hàng:" value={buyer.address} onChange={v => setBuyer(b => ({ ...b, address: v }))} placeholder="…" />
                <InfoField label="Phone:" value={buyer.phone} onChange={v => setBuyer(b => ({ ...b, phone: v }))} placeholder="…" labelWidth="56px" />
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-1">
              <p className="font-bold text-amber-800 uppercase text-[9px] tracking-wide mb-1">B. Thông tin bên bán hàng</p>
              <div className="grid gap-y-1 [&>*]:min-w-0" style={{ gridTemplateColumns: '1fr 220px', columnGap: '24px' }}>
                <InfoField label="Tên công ty:" value={seller.company} onChange={v => setSeller(s => ({ ...s, company: v }))} placeholder="…" />
                <InfoField label="Đại diện:" value={seller.rep} onChange={v => setSeller(s => ({ ...s, rep: v }))} placeholder="…" labelWidth="56px" />
                <InfoField label="Địa chỉ:" value={seller.address} onChange={v => setSeller(s => ({ ...s, address: v }))} placeholder="…" />
                <InfoField label="Phone:" value={seller.phone} onChange={v => setSeller(s => ({ ...s, phone: v }))} placeholder="…" labelWidth="56px" />
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded px-3 py-2 space-y-1">
              <p className="font-bold text-green-800 uppercase text-[9px] tracking-wide mb-1">C. Thông tin bên nhận hàng</p>
              <div className="grid gap-y-1 [&>*]:min-w-0" style={{ gridTemplateColumns: '1fr 220px', columnGap: '24px' }}>
                <InfoField label="Tên công ty:" value={receiver.company} onChange={v => setReceiver(r => ({ ...r, company: v }))} placeholder="…" />
                <InfoField label="Đại diện:" value={receiver.rep} onChange={v => setReceiver(r => ({ ...r, rep: v }))} placeholder="…" labelWidth="56px" />
                <InfoField label="Địa chỉ giao hàng:" value={receiver.address} onChange={v => setReceiver(r => ({ ...r, address: v }))} placeholder="…" />
                <InfoField label="Phone:" value={receiver.phone} onChange={v => setReceiver(r => ({ ...r, phone: v }))} placeholder="…" labelWidth="56px" />
                <InfoField label="Nhà thầu phụ:" value={receiver.subcon} onChange={v => setReceiver(r => ({ ...r, subcon: v }))} placeholder="…" />
              </div>
            </div>
            <p className="font-bold text-[10px] uppercase pt-1">D. Chi tiết đơn hàng:</p>
          </div>

          {/* Bảng đặt hàng */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="no-print border border-gray-400 px-1 py-1 text-center w-14">Mã BOQ</th>
                  <th className="border border-gray-400 px-1 py-1 text-center w-7">STT</th>
                  <th className="border border-gray-400 px-1.5 py-1 text-center">Mô tả / Tên vật tư</th>
                  <th className="border border-gray-400 px-1 py-1 text-center w-9">ĐVT</th>
                  <th className="no-print border border-gray-400 px-1 py-1 text-center w-12">ĐM BOQ</th>
                  <th className="border border-gray-400 px-1 py-1 text-center w-12">ĐM Tháp</th>
                  <th className="border border-gray-400 px-1 py-1 text-center w-14">KL đã đặt hàng</th>
                  <th className="border border-gray-400 px-1 py-1 text-center w-14">KL đặt hàng</th>
                  <th className="no-print border border-gray-400 px-1 py-1 text-center w-12">KL còn lại</th>
                  <th className="border border-gray-400 px-1 py-1 text-center w-12">% Đặt hàng</th>
                  <th className="border border-gray-400 px-1 py-1 text-center w-14">% Tiến độ ĐH</th>
                  <th className="border border-gray-400 px-1.5 py-1 text-center w-20">Ghi chú</th>
                  <th className="no-print border border-gray-400 px-1 py-1 w-6"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rem = remaining(r);
                  const remNum = parseFloat(rem);
                  const planned = parseFloat(r.qtyPlanned) || 0;
                  const used    = parseFloat(r.qtyUsed)    || 0;
                  const order   = parseFloat(r.orderQty)   || 0;
                  const pctOrder    = planned > 0 ? Math.round(order / planned * 100) : null;
                  const pctProgress = planned > 0 ? Math.round((used + order) / planned * 100) : null;
                  const showSuggestions = boqSearch?.uid === r.uid && suggestions.length > 0;
                  return (
                    <tr key={r.uid} className="group/row hover:bg-gray-50">
                      <td className="no-print border border-gray-300 px-1 py-0.5 relative">
                        <input value={r.boqCode}
                          onChange={e => onBoqChange(r.uid, e.target.value)}
                          onClick={e => { e.stopPropagation(); if (r.boqCode) setBoqSearch({ uid: r.uid, term: r.boqCode }); }}
                          placeholder="Nhập mã…"
                          className={`outline-none border-b border-gray-300 bg-transparent w-full text-[10px] text-center py-[2px] focus:border-blue-400 font-mono ${r.linked ? 'text-amber-600 font-semibold' : ''}`} />
                        {showSuggestions && (
                          <div className="absolute left-0 top-full z-50 bg-white border border-gray-300 shadow-lg rounded w-56 max-h-40 overflow-auto">
                            {suggestions.map(m => (
                              <button key={m.id} onMouseDown={e => { e.preventDefault(); applyMaterial(r.uid, m); }}
                                className="w-full text-left px-2 py-1.5 text-[10px] hover:bg-blue-50 border-b border-gray-100">
                                <span className="font-mono font-semibold text-amber-600 mr-1">{m.boqCode}</span>
                                <span className="text-gray-700">{m.name}</span>
                                {m.sheetCode && <span className="text-gray-400 ml-1">[{m.sheetCode}]</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="border border-gray-300 px-1 py-0.5">
                        <input value={r.stt} onChange={e => updateRow(r.uid, { stt: e.target.value })} className={inputCls} />
                        <span className="print-only block text-center">{r.stt}</span>
                      </td>
                      <td className="border border-gray-300 px-1 py-0.5">
                        <input value={r.name} onChange={e => updateRow(r.uid, { name: e.target.value })}
                          placeholder={r.linked ? '' : 'Nhập tên hoặc điền mã BOQ…'}
                          className={`${inputLeftCls} placeholder:text-gray-300`} />
                        <span className="print-only block">{r.name}</span>
                      </td>
                      <td className="border border-gray-300 px-1 py-0.5">
                        <input value={r.dvt} onChange={e => updateRow(r.uid, { dvt: e.target.value })} className={inputCls} />
                        <span className="print-only block text-center">{r.dvt}</span>
                      </td>
                      <td className="no-print border border-gray-300 px-1 py-0.5 text-center text-gray-600">{r.qtyBoq || ''}</td>
                      <td className="border border-gray-300 px-1 py-0.5 text-center text-gray-600">{r.qtyPlanned || ''}</td>
                      <td className="border border-gray-300 px-1 py-0.5 text-center text-gray-600">{r.qtyUsed || ''}</td>
                      <td className="border border-gray-300 px-1 py-0.5">
                        <input type="number" min="0" value={r.orderQty}
                          onChange={e => updateRow(r.uid, { orderQty: e.target.value })}
                          placeholder="0"
                          className={`${inputCls} placeholder:text-gray-300`} />
                        <span className="print-only block text-center">{r.orderQty}</span>
                      </td>
                      <td className={`no-print border border-gray-300 px-1 py-0.5 text-center font-medium ${rem && remNum <= 0 ? 'text-red-600' : 'text-gray-700'}`}>{rem}</td>
                      <td className={`border border-gray-300 px-1 py-0.5 text-center font-medium ${pctOrder !== null && pctOrder > 100 ? 'text-red-600' : 'text-gray-700'}`}>
                        {pctOrder !== null ? `${pctOrder}%` : ''}
                      </td>
                      <td className={`border border-gray-300 px-1 py-0.5 text-center font-medium ${pctProgress !== null && pctProgress > 100 ? 'text-red-600' : pctProgress !== null && pctProgress >= 100 ? 'text-green-600' : 'text-gray-700'}`}>
                        {pctProgress !== null ? `${pctProgress}%` : ''}
                      </td>
                      <td className="border border-gray-300 px-1 py-0.5">
                        <input value={r.note} onChange={e => updateRow(r.uid, { note: e.target.value })} className={inputLeftCls} />
                        <span className="print-only block">{r.note}</span>
                      </td>
                      <td className="no-print border border-gray-300 px-0.5 py-0.5 text-center">
                        <button onClick={() => removeRow(r.uid)}
                          className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 transition">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button onClick={addRow}
              className="no-print mt-1 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700 transition">
              <Plus className="w-3 h-3" /> Thêm hàng
            </button>
          </div>

          {/* Thông tin giao hàng */}
          <div className="mt-4 border border-teal-200 rounded text-[10px]">
            <div className="bg-teal-50 px-3 py-1.5 border-b border-teal-200">
              <p className="font-bold text-teal-800 uppercase text-[9px] tracking-wide">E. Thông tin giao hàng</p>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              <div className="flex items-baseline gap-1">
                <span className="shrink-0 text-gray-600">Thời gian giao hàng:</span>
                <input value={delivery.time} onChange={e => setDelivery(d => ({ ...d, time: e.target.value }))}
                  className="no-print flex-1 outline-none border-b border-gray-300 bg-transparent py-[1px] focus:border-teal-400" />
                <span className="print-only flex-1 border-b border-gray-200 min-h-[14px]">{delivery.time}</span>
              </div>
              <div className="flex items-baseline gap-4">
                <div className="flex items-baseline gap-1 flex-1 min-w-0">
                  <span className="shrink-0 text-gray-600">Người liên hệ khi giao hàng:</span>
                  <input value={delivery.contact} onChange={e => setDelivery(d => ({ ...d, contact: e.target.value }))}
                    className="no-print flex-1 min-w-0 outline-none border-b border-gray-300 bg-transparent py-[1px] focus:border-teal-400" />
                  <span className="print-only flex-1 border-b border-gray-200 min-h-[14px]">{delivery.contact}</span>
                </div>
                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="shrink-0 text-gray-600">Phone:</span>
                  <input value={delivery.phone} onChange={e => setDelivery(d => ({ ...d, phone: e.target.value }))}
                    className="no-print w-32 outline-none border-b border-gray-300 bg-transparent py-[1px] focus:border-teal-400" />
                  <span className="print-only border-b border-gray-200 min-h-[14px] min-w-[8rem]">{delivery.phone}</span>
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="shrink-0 text-gray-600">Ghi chú khác:</span>
                <input value={delivery.note} onChange={e => setDelivery(d => ({ ...d, note: e.target.value }))}
                  className="no-print flex-1 outline-none border-b border-gray-300 bg-transparent py-[1px] focus:border-teal-400" />
                <span className="print-only flex-1 border-b border-gray-200 min-h-[14px]">{delivery.note}</span>
              </div>
              <div>
                <textarea value={delivery.order} onChange={e => setDelivery(d => ({ ...d, order: e.target.value }))}
                  placeholder="Giao hàng theo số thứ tự đơn hàng:&#10;Từ 1 đến … giao trước&#10;Từ … đến … giao sau"
                  rows={3}
                  className="no-print w-full outline-none bg-transparent border border-dashed border-red-200 rounded px-2 py-1 text-red-600 text-[10px] resize-none focus:border-red-400 placeholder:text-red-300" />
                {delivery.order && (
                  <pre className="print-only text-red-600 text-[10px] whitespace-pre-wrap">{delivery.order}</pre>
                )}
              </div>
            </div>
          </div>

          {/* Ký tên */}
          <div className="mt-6 text-[10px]">
            <div className="grid grid-cols-4 gap-2 text-center">
              {signers.map((s, i) => (
                <div key={i} className="flex flex-col items-center">
                  <input value={s.role} onChange={e => setSigners(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                    className="no-print font-bold text-teal-800 text-[10px] text-center outline-none bg-transparent border-b border-transparent hover:border-gray-300 focus:border-teal-400 w-full" />
                  <p className="print-only font-bold text-teal-800">{s.role}</p>
                  <p className="text-gray-400 text-[9px]">(Ký, ghi rõ họ tên)</p>
                  <div className="mt-20" />
                  <input value={s.name} onChange={e => setSigners(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    className="no-print mt-1 font-bold text-teal-800 text-[10px] text-center outline-none bg-transparent border-b border-transparent hover:border-gray-300 focus:border-teal-400 w-full" />
                  <p className="print-only mt-1 font-bold text-teal-800">{s.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .a4-page, .a4-page * { visibility: visible !important; }
          .a4-page { position: fixed !important; inset: 0 !important; width: 100% !important; min-height: auto !important; box-shadow: none !important; padding: 10mm !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          table input, table textarea { display: none !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
    </>
  );
}
