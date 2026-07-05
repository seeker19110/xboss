"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, Paperclip, FileDown, Gavel } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type TenderStatus = "draft" | "open" | "closed" | "awarded" | "cancelled";
const STATUS_LABEL: Record<TenderStatus, string> = {
  draft: "Nháp",
  open: "Đang mời thầu",
  closed: "Đã đóng",
  awarded: "Đã trao thầu",
  cancelled: "Đã huỷ",
};
const STATUS_BADGE: Record<TenderStatus, string> = {
  draft: "bg-zinc-800 text-zinc-300",
  open: "bg-amber-900/40 text-amber-300",
  closed: "bg-sky-900/40 text-sky-300",
  awarded: "bg-emerald-900/40 text-emerald-300",
  cancelled: "bg-rose-900/40 text-rose-300",
};

type Tender = {
  id: number;
  code: string;
  name: string;
  scope: string | null;
  dueDate: string | null;
  status: TenderStatus;
  awardedBidId: number | null;
  itemCount: number;
  bidCount: number;
};
type BoqItem = { id: number; code: string; name: string; unit: string };
type Supplier = { id: number; name: string };

function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function TendersPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/tenders").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([
      fetchMe(),
      load(),
      fetch("/api/boq?includeVo=0").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/suppliers").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, t, boq, s]) => {
        if (!meData) return;
        setMe(meData);
        setTenders(t?.tenders ?? []);
        setBoqItems(boq?.items ?? []);
        setSuppliers(s?.suppliers ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const t = await load();
    setTenders(t?.tenders ?? []);
  }

  const selected = tenders.find((t) => t.id === selectedId) ?? null;

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Đấu thầu"
        subtitle="Gói giao thầu phụ · so sánh báo giá"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm gói thầu"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm gói thầu</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        {tenders.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title="Chưa có gói thầu nào"
            message={canManage ? 'Bấm "Thêm gói thầu" để bắt đầu.' : "Chưa có dữ liệu đấu thầu."}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng gói thầu">
              <table className="w-full text-sm sm:min-w-[720px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">MÃ</th>
                    <th className="text-left p-3">TÊN GÓI</th>
                    <th className="text-right p-3 hidden sm:table-cell">SỐ DÒNG BOQ</th>
                    <th className="text-right p-3 hidden sm:table-cell">SỐ NCC CHÀO</th>
                    <th className="text-left p-3 hidden sm:table-cell">HẠN NỘP</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {tenders.map((t) => {
                    const today = todayISO();
                    const late = t.dueDate != null && t.dueDate < today && t.status === "open";
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                      >
                        <td className="p-3 font-mono text-xs">{t.code}</td>
                        <td className="p-3 truncate max-w-[260px]">{t.name}</td>
                        <td className="p-3 hidden sm:table-cell text-right">{t.itemCount}</td>
                        <td className="p-3 hidden sm:table-cell text-right">{t.bidCount}</td>
                        <td className="p-3 hidden sm:table-cell">
                          {t.dueDate ? (
                            <span className={late ? "text-rose-300 font-medium" : "text-zinc-300"}>
                              {t.dueDate}
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[t.status]}`}
                          >
                            {STATUS_LABEL[t.status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selected && (
        <TenderDetailModal
          tender={selected}
          suppliers={suppliers}
          canManage={canManage}
          canAward={!!(me?.role === "admin" || me?.role === "pm")}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      )}
      {addOpen && (
        <AddTenderModal
          boqItems={boqItems}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

type ItemDraft = { boqItemId: number | ""; qty: string };

function AddTenderModal({
  boqItems,
  onClose,
  onCreated,
}: {
  boqItems: BoqItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ boqItemId: "", qty: "" }]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function updateItem(i: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  const canSubmit =
    name.trim() &&
    items.length > 0 &&
    items.every((it) => it.boqItemId !== "" && Number(it.qty) > 0);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/tenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scope: scope.trim() || null,
          dueDate: dueDate || null,
          items: items.map((it) => ({ boqItemId: Number(it.boqItemId), qty: Number(it.qty) })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được gói thầu");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm gói thầu</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400 col-span-2">
            Tên gói thầu
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Phạm vi (mô tả)
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={2}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hạn nộp báo giá
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Phạm vi mời thầu (dòng BOQ)
            </h3>
            <button
              onClick={() => setItems((prev) => [...prev, { boqItemId: "", qty: "" }])}
              className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm dòng
            </button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
              <select
                value={it.boqItemId}
                onChange={(e) =>
                  updateItem(i, { boqItemId: e.target.value ? Number(e.target.value) : "" })
                }
                aria-label={`Dòng BOQ ${i + 1}`}
                className="col-span-8 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
              >
                <option value="">— Chọn dòng BOQ —</option>
                {boqItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={it.qty}
                onChange={(e) => updateItem(i, { qty: e.target.value })}
                placeholder="KL mời"
                aria-label={`Khối lượng mời dòng ${i + 1}`}
                className="col-span-3 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
              />
              <button
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={items.length === 1}
                aria-label={`Xoá dòng ${i + 1}`}
                className="col-span-1 text-zinc-500 hover:text-rose-300 disabled:opacity-30 flex justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo gói thầu"}
        </button>
      </div>
    </Modal>
  );
}

type BidData = {
  bidId: number;
  supplierId: number;
  supplierName: string;
  lumpSum: number | null;
  note: string | null;
  fileName: string | null;
  originalName: string | null;
  quotedLines: number;
  totalLines: number;
  total: number;
  prices: Record<number, number>;
};
type ItemData = { boqItemId: number; code: string; name: string; unit: string; qty: number };

function TenderDetailModal({
  tender,
  suppliers,
  canManage,
  canAward,
  onClose,
  onSaved,
}: {
  tender: Tender;
  suppliers: Supplier[];
  canManage: boolean;
  canAward: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<ItemData[]>([]);
  const [bids, setBids] = useState<BidData[]>([]);
  const [addBidOpen, setAddBidOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadDetail() {
    fetch(`/api/tenders/${tender.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setItems(j?.items ?? []);
        setBids(j?.bids ?? []);
      });
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tender.id]);

  const lowestByLine = useMemo(() => {
    const map = new Map<number, number>();
    for (const it of items) {
      let lowest: number | null = null;
      for (const b of bids) {
        const p = b.prices[it.boqItemId];
        if (p != null && (lowest == null || p < lowest)) lowest = p;
      }
      if (lowest != null) map.set(it.boqItemId, lowest);
    }
    return map;
  }, [items, bids]);

  async function deleteBid(bidId: number) {
    if (!(await appConfirm("Xoá báo giá này?", { danger: true, confirmLabel: "Xoá" }))) return;
    const res = await fetch(`/api/tenders/${tender.id}/bids/${bidId}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    loadDetail();
  }

  async function uploadBidFile(bidId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/tenders/${tender.id}/bids/${bidId}/file`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
      return;
    }
    loadDetail();
  }

  async function award(bidId: number, supplierName: string, total: number) {
    if (
      !(await appConfirm(
        `Trao thầu cho ${supplierName} — giá trị ${fmtVND(total)}? Sẽ tự tạo hợp đồng giao thầu.`,
      ))
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/tenders/${tender.id}/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bidId }),
    });
    setBusy(false);
    if (!res.ok) {
      appAlert((await res.json().catch(() => null))?.error ?? "Trao thầu thất bại");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose} className="max-w-4xl">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{tender.code}</h2>
            <p className="text-sm text-zinc-300">{tender.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[tender.status]}`}
            >
              {STATUS_LABEL[tender.status]}
            </span>
            {tender.status !== "awarded" && (
              <a
                href={`/api/tenders/${tender.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                aria-label="Xuất PDF bảng so sánh"
                className="text-zinc-400 hover:text-white"
              >
                <FileDown className="w-4 h-4" />
              </a>
            )}
            <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {canManage && tender.status !== "awarded" && (
          <button
            onClick={() => setAddBidOpen(true)}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-3 py-2 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" /> Nhập báo giá NCC
          </button>
        )}

        {bids.length === 0 ? (
          <EmptyState message="Chưa có báo giá nào." compact />
        ) : (
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Bảng so sánh báo giá"
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-1.5 sticky left-0 bg-zinc-900">Mã / Tên</th>
                  {bids.map((b) => (
                    <th key={b.bidId} className="text-right p-1.5 min-w-[110px]">
                      {b.supplierName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.boqItemId} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-1.5 sticky left-0 bg-zinc-900">
                      <span className="font-mono">{it.code}</span> {it.name}
                    </td>
                    {bids.map((b) => {
                      const p = b.prices[it.boqItemId];
                      const isLowest = p != null && lowestByLine.get(it.boqItemId) === p;
                      return (
                        <td
                          key={b.bidId}
                          className={`p-1.5 text-right ${isLowest ? "bg-emerald-950/40 text-emerald-300 font-semibold" : ""}`}
                        >
                          {p != null ? fmtVND(p) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="font-semibold border-t border-zinc-700">
                  <td className="p-1.5 sticky left-0 bg-zinc-900">Tổng</td>
                  {bids.map((b) => (
                    <td key={b.bidId} className="p-1.5 text-right">
                      {fmtVND(b.total)}
                      <span className="block text-[10px] font-normal text-zinc-500">
                        chào {b.quotedLines}/{b.totalLines} dòng
                      </span>
                    </td>
                  ))}
                </tr>
                {canManage && tender.status !== "awarded" && (
                  <tr>
                    <td className="p-1.5 sticky left-0 bg-zinc-900"></td>
                    {bids.map((b) => (
                      <td key={b.bidId} className="p-1.5">
                        <div className="flex flex-col items-end gap-1">
                          <label className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white cursor-pointer">
                            <Paperclip className="w-3 h-3" />
                            {b.originalName ? (
                              <a
                                href={`/api/tenders/${tender.id}/bids/${b.bidId}/file`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-300 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                File
                              </a>
                            ) : (
                              "Tải file"
                            )}
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadBidFile(b.bidId, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            onClick={() => deleteBid(b.bidId)}
                            className="text-[10px] text-rose-300 hover:text-rose-200"
                          >
                            Xoá
                          </button>
                          {canAward && (
                            <button
                              onClick={() => award(b.bidId, b.supplierName, b.total)}
                              disabled={busy}
                              className="text-[10px] bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-2 py-1 rounded"
                            >
                              Trao thầu
                            </button>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addBidOpen && (
        <AddBidModal
          tenderId={tender.id}
          items={items}
          suppliers={suppliers}
          onClose={() => setAddBidOpen(false)}
          onCreated={() => {
            setAddBidOpen(false);
            loadDetail();
          }}
        />
      )}
    </Modal>
  );
}

function AddBidModal({
  tenderId,
  items,
  suppliers,
  onClose,
  onCreated,
}: {
  tenderId: number;
  items: ItemData[];
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [lumpSum, setLumpSum] = useState("");
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!supplierId) return;
    setSaving(true);
    setErr("");
    try {
      const priceList = Object.entries(prices)
        .filter(([, v]) => v.trim() !== "")
        .map(([boqItemId, unitPrice]) => ({
          boqItemId: Number(boqItemId),
          unitPrice: Number(unitPrice),
        }));
      const res = await fetch(`/api/tenders/${tenderId}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          lumpSum: lumpSum.trim() ? Number(lumpSum) : null,
          prices: priceList,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không thêm được báo giá");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-xl" zIndex="z-[60]">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Nhập báo giá NCC</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <label className="text-xs text-zinc-400 block">
          Nhà thầu
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Chọn nhà thầu —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400 block">
          Chào trọn gói (tuỳ chọn — bỏ trống nếu chào theo dòng)
          <input
            type="number"
            value={lumpSum}
            onChange={(e) => setLumpSum(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Giá theo dòng (để trống dòng chưa chào)
          </h3>
          {items.map((it) => (
            <div key={it.boqItemId} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-zinc-300 truncate">
                {it.code} — {it.name}
              </span>
              <input
                type="number"
                value={prices[it.boqItemId] ?? ""}
                onChange={(e) => setPrices((prev) => ({ ...prev, [it.boqItemId]: e.target.value }))}
                aria-label={`Đơn giá dòng ${it.code}`}
                className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white text-right"
              />
            </div>
          ))}
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !supplierId}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu báo giá"}
        </button>
      </div>
    </Modal>
  );
}
