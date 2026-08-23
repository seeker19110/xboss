"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Truck,
  Plus,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Package,
  AlertCircle,
  Clock,
  CheckCircle,
  Star,
  ShoppingCart,
  ClipboardList,
  Search,
  Filter,
} from "lucide-react";
import { appConfirm, Modal } from "@/app/components/dialogs";
import { fetchMe } from "@/app/lib/me";
import { todayISO, formatDateVN } from "@/lib/nen/date";
import RatingModal from "@/app/procurement/_components/RatingModal";

type PO = {
  id: number;
  poCode: string;
  status: string;
  expectedDate: string | null;
  note: string | null;
  supplierId: number | null;
  supplierName: string | null;
  createdByName: string;
  createdAt: string;
  itemCount: number;
  totalOrdered: number;
  totalReceived: number;
};

type POItem = {
  id: number;
  materialId: number;
  materialName: string;
  unit: string | null;
  boqCode: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  unitPrice: number | null;
  note: string | null;
  prId: number | null;
};

type Supplier = { id: number; name: string; avgRating?: number | null };
type ContractOption = { id: number; code: string; title: string };
type PRItem = {
  id: number;
  prCode: string;
  materialId: number;
  materialName: string;
  unit: string | null;
  qtyRequested: number;
};

type Material = {
  id: number;
  name: string;
  unit: string | null;
  sheetCode: string | null;
  boqCode?: string | null;
};

type PR = {
  id: number;
  prCode: string;
  materialId: number;
  materialName: string;
  unit: string | null;
  qtyRequested: number;
  status: string;
  note: string | null;
  reviewNote: string | null;
  requestedBy: number;
  requestedByName: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  delivering: "Đang giao",
  partial: "Nhập một phần",
  received: "Đã nhập đủ",
  reconciled: "Đã đối chiếu",
  cancelled: "Đã huỷ",
};

const STATUS_CLS: Record<string, string> = {
  draft: "bg-zinc-800 text-zinc-300 border border-zinc-700",
  confirmed: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  delivering: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  partial: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  received: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  reconciled: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
  cancelled: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
};

const STEP_ORDER = ["draft", "confirmed", "delivering", "partial", "received", "reconciled"];
const STEP_LABEL: Record<string, string> = {
  draft: "Đặt",
  confirmed: "Xác nhận",
  delivering: "Đang giao",
  partial: "Một phần",
  received: "Đủ hàng",
  reconciled: "Đối chiếu",
};

const PR_STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  ordered: "Đã đặt hàng",
};

const PR_STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  ordered: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

function PoStepper({ status }: { status: string }) {
  if (status === "cancelled") return null;
  const idx = STEP_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-1 py-1" role="list" aria-label="Tiến trình đơn hàng">
      {STEP_ORDER.map((s, i) => {
        const done = idx >= 0 && i <= idx;
        const current = i === idx;
        return (
          <div key={s} className="flex items-center gap-1" role="listitem">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                current
                  ? "bg-amber-400 ring-2 ring-amber-400/30"
                  : done
                    ? "bg-amber-600"
                    : "bg-zinc-700"
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-[10px] whitespace-nowrap ${
                current ? "text-amber-300 font-semibold" : done ? "text-zinc-400" : "text-zinc-600"
              }`}
            >
              {STEP_LABEL[s]}
            </span>
            {i < STEP_ORDER.length - 1 && (
              <span
                className={`w-2.5 sm:w-3.5 h-px shrink-0 ${done && i < idx ? "bg-amber-600" : "bg-zinc-800"}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const isPoLate = (po: { status: string; expectedDate: string | null }) =>
  !!po.expectedDate &&
  po.expectedDate < todayISO() &&
  !["received", "reconciled", "cancelled"].includes(po.status);

export default function OrdersTab() {
  const [subView, setSubView] = useState<"po" | "pr">("po");
  const [orders, setOrders] = useState<PO[]>([]);
  const [requests, setRequests] = useState<PR[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [approvedPRs, setApprovedPRs] = useState<PRItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [prStatusFilter, setPrStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, POItem[]>>({});
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [showReceive, setShowReceive] = useState<PO | null>(null);
  const [receiveItems, setReceiveItems] = useState<Record<number, string>>({});
  const [receiveNote, setReceiveNote] = useState("");
  const [receivePoItems, setReceivePoItems] = useState<POItem[]>([]);
  const [receiveKey, setReceiveKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ratingPo, setRatingPo] = useState<PO | null>(null);

  // Form tạo PR
  const [showAddPR, setShowAddPR] = useState(false);
  const [addPRDraft, setAddPRDraft] = useState({ materialId: "", qtyRequested: "", note: "" });

  // Modal duyệt PR
  const [reviewPRModal, setReviewPRModal] = useState<PR | null>(null);
  const [reviewPRNote, setReviewPRNote] = useState("");

  // Form tạo PO
  const [newPO, setNewPO] = useState({
    supplierId: "",
    contractId: "",
    expectedDate: "",
    note: "",
    items: [{ materialId: "", prId: "", qtyOrdered: "", unitPrice: "", note: "" }] as {
      materialId: string;
      prId: string;
      qtyOrdered: string;
      unitPrice: string;
      note: string;
    }[],
  });

  const loadPOs = useCallback(() => {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    fetch(`/api/purchase-orders${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          setError(j?.error ?? `Lỗi tải danh sách đơn hàng (${r.status})`);
          return;
        }
        setOrders((await r.json()).orders ?? []);
      })
      .catch(() => setError("Mất kết nối mạng — không tải được danh sách đơn hàng"));
  }, [statusFilter]);

  const loadPRs = useCallback(() => {
    const q = prStatusFilter ? `?status=${prStatusFilter}` : "";
    fetch(`/api/purchase-requests${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          setError(j?.error ?? `Lỗi tải danh sách yêu cầu mua (${r.status})`);
          return;
        }
        setRequests((await r.json()).requests ?? []);
      })
      .catch(() => setError("Mất kết nối mạng — không tải được danh sách yêu cầu mua"));
  }, [prStatusFilter]);

  useEffect(() => {
    fetchMe().then((user) => {
      if (!user) return;
      setCanManage(user.role === "admin" || user.role === "pm");
    });
    fetch("/api/suppliers")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list: Supplier[] = j?.suppliers ?? [];
        list.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1));
        setSuppliers(list);
      })
      .catch(() => setSuppliers([]));
    fetch("/api/purchase-requests?status=approved")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setApprovedPRs(j?.requests ?? []))
      .catch(() => setApprovedPRs([]));
    fetch("/api/materials")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMaterials(j?.materials ?? []))
      .catch(() => setMaterials([]));
    fetch("/api/contracts?kind=ncc")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setContracts(j?.contracts ?? []))
      .catch(() => setContracts([]));
  }, []);

  useEffect(() => {
    if (subView === "po") loadPOs();
    else loadPRs();
  }, [subView, loadPOs, loadPRs]);

  const loadItems = async (poId: number) => {
    if (expandedItems[poId]) return;
    const r = await fetch(`/api/purchase-orders/${poId}`);
    const j = await r.json();
    setExpandedItems((prev) => ({ ...prev, [poId]: j.items ?? [] }));
  };

  const toggleExpand = async (poId: number) => {
    if (expanded === poId) {
      setExpanded(null);
      return;
    }
    setExpanded(poId);
    await loadItems(poId);
  };

  const createPO = async () => {
    const validItems = newPO.items.filter((i) => i.materialId && Number(i.qtyOrdered) > 0);
    if (!validItems.length) {
      setError("Cần ít nhất 1 vật tư với số lượng > 0");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: newPO.supplierId ? Number(newPO.supplierId) : null,
          contractId: newPO.contractId ? Number(newPO.contractId) : null,
          expectedDate: newPO.expectedDate || null,
          note: newPO.note || null,
          items: validItems.map((i) => ({
            materialId: Number(i.materialId),
            prId: i.prId ? Number(i.prId) : undefined,
            qtyOrdered: Number(i.qtyOrdered),
            unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
            note: i.note || undefined,
          })),
        }),
      });
      if (r.ok) {
        setShowCreatePO(false);
        resetNewPO();
        loadPOs();
      } else {
        const j = await r.json();
        setError(j.error ?? "Lỗi tạo PO");
      }
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  const resetNewPO = () =>
    setNewPO({
      supplierId: "",
      contractId: "",
      expectedDate: "",
      note: "",
      items: [{ materialId: "", prId: "", qtyOrdered: "", unitPrice: "", note: "" }],
    });

  const openReceive = async (po: PO) => {
    const r = await fetch(`/api/purchase-orders/${po.id}`);
    const j = await r.json();
    const items: POItem[] = j.items ?? [];
    setReceivePoItems(items);
    const initQty: Record<number, string> = {};
    items.forEach((i) => {
      initQty[i.id] = String(Math.max(0, i.qtyOrdered - i.qtyReceived));
    });
    setReceiveItems(initQty);
    setReceiveNote("");
    setReceiveKey(crypto.randomUUID());
    setShowReceive(po);
  };

  const submitReceive = async () => {
    if (!showReceive) return;
    const itemsToReceive = receivePoItems
      .filter((i) => Number(receiveItems[i.id] ?? 0) > 0)
      .map((i) => ({ poItemId: i.id, qtyReceived: Number(receiveItems[i.id]) }));

    if (!itemsToReceive.length) {
      setError("Cần nhập số lượng > 0 cho ít nhất 1 vật tư");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/purchase-orders/${showReceive.id}/receive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": receiveKey,
        },
        body: JSON.stringify({
          note: receiveNote || undefined,
          items: itemsToReceive,
        }),
      });
      if (r.ok) {
        const finishedPo = showReceive;
        setShowReceive(null);
        loadPOs();
        if (finishedPo.supplierId) {
          setRatingPo(finishedPo);
        }
      } else {
        const j = await r.json();
        setError(j.error ?? "Lỗi nhập hàng");
      }
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  const updatePOStatus = async (poId: number, status: string) => {
    const ok = await appConfirm(`Cập nhật trạng thái đơn hàng sang "${STATUS_LABEL[status]}"?`);
    if (!ok) return;
    try {
      const r = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (r.ok) loadPOs();
      else {
        const j = await r.json();
        setError(j.error ?? "Lỗi cập nhật");
      }
    } catch {
      setError("Mất kết nối mạng");
    }
  };

  const deletePO = async (poId: number, poCode: string) => {
    const ok = await appConfirm(`Xoá đơn hàng ${poCode}? Hành động này không thể hoàn tác.`);
    if (!ok) return;
    try {
      const r = await fetch(`/api/purchase-orders/${poId}`, { method: "DELETE" });
      if (r.ok) loadPOs();
      else {
        const j = await r.json();
        setError(j.error ?? "Lỗi xoá");
      }
    } catch {
      setError("Mất kết nối mạng");
    }
  };

  const submitPR = async () => {
    if (!addPRDraft.materialId || !Number(addPRDraft.qtyRequested)) {
      setError("Vui lòng chọn vật tư và nhập số lượng");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: Number(addPRDraft.materialId),
          qtyRequested: Number(addPRDraft.qtyRequested),
          note: addPRDraft.note.trim() || undefined,
        }),
      });
      if (r.ok) {
        setShowAddPR(false);
        setAddPRDraft({ materialId: "", qtyRequested: "", note: "" });
        loadPRs();
      } else {
        const j = await r.json();
        setError(j.error ?? "Lỗi tạo yêu cầu mua");
      }
    } catch {
      setError("Mất kết nối mạng");
    } finally {
      setSaving(false);
    }
  };

  const handleReviewPR = async (prId: number, status: "approved" | "rejected") => {
    setSaving(true);
    try {
      const r = await fetch(`/api/purchase-requests/${prId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: reviewPRNote.trim() || undefined }),
      });
      if (r.ok) {
        setReviewPRModal(null);
        setReviewPRNote("");
        loadPRs();
      } else {
        const j = await r.json();
        setError(j.error ?? "Lỗi duyệt yêu cầu");
      }
    } catch {
      setError("Mất kết nối mạng");
    } finally {
      setSaving(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.poCode.toLowerCase().includes(q) ||
        (o.supplierName && o.supplierName.toLowerCase().includes(q)) ||
        (o.note && o.note.toLowerCase().includes(q)),
    );
  }, [orders, search]);

  const filteredRequests = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.toLowerCase();
    return requests.filter(
      (r) =>
        r.prCode.toLowerCase().includes(q) ||
        r.materialName.toLowerCase().includes(q) ||
        (r.note && r.note.toLowerCase().includes(q)),
    );
  }, [requests, search]);

  return (
    <div className="space-y-4">
      {/* Sub-view switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setSubView("po")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              subView === "po"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Truck className="w-3.5 h-3.5" /> Đơn Đặt Hàng (PO)
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800/80 text-zinc-300">
              {orders.length}
            </span>
          </button>

          <button
            onClick={() => setSubView("pr")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              subView === "pr"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Yêu Cầu Mua Sắm (PR)
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800/80 text-zinc-300">
              {requests.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subView === "po" && canManage && (
            <button
              onClick={() => setShowCreatePO(true)}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-zinc-950 rounded-xl px-3.5 py-2 text-xs font-semibold transition shadow"
            >
              <Plus className="w-4 h-4" /> Lập Đơn Hàng PO
            </button>
          )}

          {subView === "pr" && (
            <button
              onClick={() => setShowAddPR(true)}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-zinc-950 rounded-xl px-3.5 py-2 text-xs font-semibold transition shadow"
            >
              <Plus className="w-4 h-4" /> Gửi Yêu Cầu PR
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/80 text-red-200 px-4 py-2.5 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-wrap items-center gap-2.5 justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              subView === "po" ? "Tìm mã PO, nhà cung cấp, ghi chú..." : "Tìm mã PR, tên vật tư..."
            }
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition h-10"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {subView === "po" ? (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {[
              { val: "", label: "Tất cả PO" },
              { val: "draft", label: "Nháp" },
              { val: "confirmed", label: "Xác nhận" },
              { val: "delivering", label: "Đang giao" },
              { val: "partial", label: "Nhập 1 phần" },
              { val: "received", label: "Đã nhập đủ" },
            ].map((f) => (
              <button
                key={f.val}
                onClick={() => setStatusFilter(f.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition border ${
                  statusFilter === f.val
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {[
              { val: "", label: "Tất cả PR" },
              { val: "pending", label: "Chờ duyệt" },
              { val: "approved", label: "Đã duyệt" },
              { val: "rejected", label: "Từ chối" },
              { val: "ordered", label: "Đã đặt hàng" },
            ].map((f) => (
              <button
                key={f.val}
                onClick={() => setPrStatusFilter(f.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition border ${
                  prStatusFilter === f.val
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Danh sách PO */}
      {subView === "po" && (
        <div className="space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-12 text-center text-zinc-400 space-y-2">
              <Truck className="w-8 h-8 text-zinc-600 mx-auto" />
              <p>Chưa có đơn đặt hàng nào.</p>
            </div>
          ) : (
            filteredOrders.map((po) => {
              const isExpanded = expanded === po.id;
              const late = isPoLate(po);
              const items = expandedItems[po.id] || [];

              return (
                <div
                  key={po.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/80 overflow-hidden shadow-sm transition hover:border-zinc-700"
                >
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <button
                        onClick={() => toggleExpand(po.id)}
                        className="mt-1 p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                      >
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm sm:text-base text-zinc-100">
                            {po.poCode}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_CLS[po.status] || ""}`}
                          >
                            {STATUS_LABEL[po.status] || po.status}
                          </span>
                          {late && (
                            <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              Quá hạn giao
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">
                          NCC:{" "}
                          <span className="text-zinc-200 font-medium">
                            {po.supplierName || "Chưa gán NCC"}
                          </span>{" "}
                          • Người tạo: {po.createdByName} • {formatDateVN(po.createdAt)}
                        </p>
                        {po.expectedDate && (
                          <p className="text-xs text-zinc-400">
                            Hạn giao:{" "}
                            <span className={late ? "text-rose-400 font-medium" : "text-zinc-300"}>
                              {formatDateVN(po.expectedDate)}
                            </span>
                          </p>
                        )}
                        <PoStepper status={po.status} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-8 lg:pl-0">
                      {canManage && po.status === "draft" && (
                        <button
                          onClick={() => updatePOStatus(po.id, "confirmed")}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-zinc-950 font-semibold text-xs transition"
                        >
                          Xác Nhận Đơn
                        </button>
                      )}
                      {canManage && po.status === "confirmed" && (
                        <button
                          onClick={() => updatePOStatus(po.id, "delivering")}
                          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-zinc-950 font-semibold text-xs transition"
                        >
                          Đang Vận Chuyển
                        </button>
                      )}
                      {canManage && ["delivering", "partial"].includes(po.status) && (
                        <button
                          onClick={() => openReceive(po)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-zinc-950 font-semibold text-xs transition flex items-center gap-1.5 shadow"
                        >
                          <Package className="w-3.5 h-3.5" /> Nhận Hàng (GRN)
                        </button>
                      )}
                      {canManage && po.status === "received" && (
                        <button
                          onClick={() => updatePOStatus(po.id, "reconciled")}
                          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-zinc-950 font-semibold text-xs transition"
                        >
                          Khớp & Đối Chiếu Xong
                        </button>
                      )}
                      {canManage && po.status === "draft" && (
                        <button
                          onClick={() => deletePO(po.id, po.poCode)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition"
                          title="Xoá đơn hàng"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chi tiết vật tư bên trong PO */}
                  {isExpanded && (
                    <div className="border-t border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Danh mục vật tư trong đơn ({items.length} dòng)
                      </h4>
                      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
                        <table className="w-full text-xs text-left text-zinc-300">
                          <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                            <tr>
                              <th className="p-3">Mã BOQ</th>
                              <th className="p-3">Tên vật tư</th>
                              <th className="p-3 text-center">ĐVT</th>
                              <th className="p-3 text-right">SL Đặt</th>
                              <th className="p-3 text-right">SL Đã Nhận</th>
                              <th className="p-3 text-right">Đơn Giá</th>
                              <th className="p-3 text-right">Thành Tiền</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60">
                            {items.map((item) => (
                              <tr key={item.id} className="hover:bg-zinc-900/30">
                                <td className="p-3 font-mono text-amber-400">
                                  {item.boqCode || "—"}
                                </td>
                                <td className="p-3 font-medium text-zinc-100">
                                  {item.materialName}
                                </td>
                                <td className="p-3 text-center text-zinc-400">
                                  {item.unit || "—"}
                                </td>
                                <td className="p-3 text-right font-mono tabular-nums">
                                  {item.qtyOrdered}
                                </td>
                                <td className="p-3 text-right font-mono tabular-nums text-emerald-400">
                                  {item.qtyReceived}
                                </td>
                                <td className="p-3 text-right font-mono tabular-nums">
                                  {item.unitPrice ? item.unitPrice.toLocaleString("vi-VN") : "—"}
                                </td>
                                <td className="p-3 text-right font-mono tabular-nums font-semibold text-zinc-200">
                                  {item.unitPrice
                                    ? (item.qtyOrdered * item.unitPrice).toLocaleString("vi-VN") +
                                      " ₫"
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Danh sách PR */}
      {subView === "pr" && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-zinc-300">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">Mã PR</th>
                  <th className="p-3">Vật tư đề xuất</th>
                  <th className="p-3 text-center">ĐVT</th>
                  <th className="p-3 text-right">SL Yêu Cầu</th>
                  <th className="p-3">Trạng Thái</th>
                  <th className="p-3">Người Đề Xuất</th>
                  <th className="p-3">Ngày Gửi</th>
                  {canManage && <th className="p-3 text-right">Thao Tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-zinc-500">
                      Không có yêu cầu mua sắm nào.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-900/30">
                      <td className="p-3 font-mono font-medium text-amber-400">{r.prCode}</td>
                      <td className="p-3 font-semibold text-zinc-100">{r.materialName}</td>
                      <td className="p-3 text-center text-zinc-400">{r.unit || "—"}</td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-zinc-200">
                        {r.qtyRequested}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                            PR_STATUS_CLS[r.status] || ""
                          }`}
                        >
                          {PR_STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-400">{r.requestedByName}</td>
                      <td className="p-3 text-zinc-400">{formatDateVN(r.createdAt)}</td>
                      {canManage && (
                        <td className="p-3 text-right">
                          {r.status === "pending" && (
                            <button
                              onClick={() => {
                                setReviewPRModal(r);
                                setReviewPRNote("");
                              }}
                              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-[11px] transition shadow"
                            >
                              Xét Duyệt
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal tạo PO mới */}
      {showCreatePO && (
        <Modal onClose={() => setShowCreatePO(false)} className="max-w-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-base text-zinc-100">Lập Đơn Đặt Hàng Mới (PO)</h3>
            <button
              onClick={() => setShowCreatePO(false)}
              className="text-zinc-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Nhà Cung Cấp</label>
                <select
                  value={newPO.supplierId}
                  onChange={(e) => setNewPO({ ...newPO, supplierId: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500"
                >
                  <option value="">-- Chọn Nhà Cung Cấp --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.avgRating ? `(★ ${s.avgRating.toFixed(1)})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Hạn Giao Hàng</label>
                <input
                  type="date"
                  value={newPO.expectedDate}
                  onChange={(e) => setNewPO({ ...newPO, expectedDate: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-zinc-300">Danh Mục Vật Tư Đặt</label>
                <button
                  type="button"
                  onClick={() =>
                    setNewPO({
                      ...newPO,
                      items: [
                        ...newPO.items,
                        { materialId: "", prId: "", qtyOrdered: "", unitPrice: "", note: "" },
                      ],
                    })
                  }
                  className="text-xs text-amber-400 hover:underline"
                >
                  + Thêm dòng
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {newPO.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800"
                  >
                    <select
                      value={item.materialId}
                      onChange={(e) => {
                        const updated = [...newPO.items];
                        updated[idx].materialId = e.target.value;
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none"
                    >
                      <option value="">-- Chọn Vật Tư --</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.boqCode ? `[${m.boqCode}] ` : ""}
                          {m.name} ({m.unit || "Cái"})
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      placeholder="SL đặt"
                      value={item.qtyOrdered}
                      onChange={(e) => {
                        const updated = [...newPO.items];
                        updated[idx].qtyOrdered = e.target.value;
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none text-right font-mono"
                    />

                    <input
                      type="number"
                      placeholder="Đơn giá"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const updated = [...newPO.items];
                        updated[idx].unitPrice = e.target.value;
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="w-24 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none text-right font-mono"
                    />

                    {newPO.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = newPO.items.filter((_, i) => i !== idx);
                          setNewPO({ ...newPO, items: updated });
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-1"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Ghi Chú</label>
              <textarea
                value={newPO.note}
                onChange={(e) => setNewPO({ ...newPO, note: e.target.value })}
                rows={2}
                placeholder="Điều khoản giao hàng, địa chỉ..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowCreatePO(false)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200"
              >
                Huỷ
              </button>
              <button
                disabled={saving}
                onClick={createPO}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition shadow disabled:opacity-50"
              >
                {saving ? "Đang tạo..." : "Phát Hành Đơn Hàng"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal nhập hàng GRN */}
      {showReceive && (
        <Modal onClose={() => setShowReceive(null)} className="max-w-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-base text-zinc-100">Tiếp Nhận Hàng & Cấp Phiếu GRN</h3>
              <p className="text-xs text-zinc-400">
                {showReceive.poCode} – {showReceive.supplierName}
              </p>
            </div>
            <button onClick={() => setShowReceive(null)} className="text-zinc-400 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {receivePoItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-zinc-100">{item.materialName}</p>
                    <p className="text-[11px] text-zinc-400">
                      Đã đặt: {item.qtyOrdered} • Đã nhận: {item.qtyReceived} {item.unit || ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Nhận đợt này:</span>
                    <input
                      type="number"
                      value={receiveItems[item.id] ?? "0"}
                      onChange={(e) =>
                        setReceiveItems({ ...receiveItems, [item.id]: e.target.value })
                      }
                      className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-right font-mono text-emerald-400 font-semibold outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Ghi chú phiếu nhập kho</label>
              <input
                value={receiveNote}
                onChange={(e) => setReceiveNote(e.target.value)}
                placeholder="Số phiếu giao hàng DO, biển số xe..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowReceive(null)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400"
              >
                Huỷ
              </button>
              <button
                disabled={saving}
                onClick={submitReceive}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-zinc-950 font-semibold text-xs transition shadow disabled:opacity-50"
              >
                {saving ? "Đang ghi nhận..." : "Xác Nhận Nhập Kho (GRN)"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal tạo PR mới */}
      {showAddPR && (
        <Modal onClose={() => setShowAddPR(false)} className="max-w-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-base text-zinc-100">Gửi Yêu Cầu Mua Sắm Vật Tư (PR)</h3>
            <button onClick={() => setShowAddPR(false)} className="text-zinc-400 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Chọn Vật Tư</label>
              <select
                value={addPRDraft.materialId}
                onChange={(e) => setAddPRDraft({ ...addPRDraft, materialId: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500"
              >
                <option value="">-- Chọn Vật Tư --</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.boqCode ? `[${m.boqCode}] ` : ""}
                    {m.name} ({m.unit || "Cái"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Số Lượng Yêu Cầu</label>
              <input
                type="number"
                value={addPRDraft.qtyRequested}
                onChange={(e) => setAddPRDraft({ ...addPRDraft, qtyRequested: e.target.value })}
                placeholder="vd: 50"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Lý do / Ghi chú</label>
              <textarea
                value={addPRDraft.note}
                onChange={(e) => setAddPRDraft({ ...addPRDraft, note: e.target.value })}
                rows={2}
                placeholder="Lắp đặt khu vực Zone 2, cấp bách..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowAddPR(false)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400"
              >
                Huỷ
              </button>
              <button
                disabled={saving}
                onClick={submitPR}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition shadow disabled:opacity-50"
              >
                {saving ? "Đang gửi..." : "Gửi Phê Duyệt PR"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal xét duyệt PR */}
      {reviewPRModal && (
        <Modal onClose={() => setReviewPRModal(null)} className="max-w-md p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-base text-zinc-100">Xét Duyệt Yêu Cầu Mua Sắm</h3>
              <p className="text-xs text-zinc-400">
                {reviewPRModal.prCode} – {reviewPRModal.materialName}
              </p>
            </div>
            <button
              onClick={() => setReviewPRModal(null)}
              className="text-zinc-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 space-y-1 text-xs">
              <p>
                Số lượng:{" "}
                <span className="font-bold text-zinc-100">
                  {reviewPRModal.qtyRequested} {reviewPRModal.unit || ""}
                </span>
              </p>
              <p>
                Người yêu cầu:{" "}
                <span className="text-zinc-300">{reviewPRModal.requestedByName}</span>
              </p>
              {reviewPRModal.note && (
                <p>
                  Ghi chú: <span className="text-zinc-400">{reviewPRModal.note}</span>
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Ý kiến xét duyệt</label>
              <input
                value={reviewPRNote}
                onChange={(e) => setReviewPRNote(e.target.value)}
                placeholder="Đồng ý xuất mua theo kế hoạch..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                disabled={saving}
                onClick={() => handleReviewPR(reviewPRModal.id, "rejected")}
                className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30"
              >
                Từ Chối
              </button>
              <button
                disabled={saving}
                onClick={() => handleReviewPR(reviewPRModal.id, "approved")}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-zinc-950 font-semibold text-xs transition shadow"
              >
                Phê Duyệt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal đánh giá NCC */}
      {ratingPo && <RatingModal po={ratingPo} onClose={() => setRatingPo(null)} />}
    </div>
  );
}
