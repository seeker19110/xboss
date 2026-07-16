"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  X,
  Trash2,
  Paperclip,
  FileSignature,
  Lock,
  RotateCcw,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import MaskedValue from "@/app/components/MaskedValue";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type ContractKind = "nhan_thau" | "giao_thau" | "ncc";
type ContractStatus = "draft" | "active" | "completed" | "terminated";

const KIND_LABEL: Record<ContractKind, string> = {
  nhan_thau: "Nhận thầu",
  giao_thau: "Giao thầu",
  ncc: "Nhà cung cấp",
};
const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Nháp",
  active: "Hiệu lực",
  completed: "Hoàn thành",
  terminated: "Chấm dứt",
};
const STATUS_BADGE: Record<ContractStatus, string> = {
  draft: "bg-zinc-800 text-zinc-300",
  active: "bg-emerald-900 text-emerald-200",
  completed: "bg-sky-900 text-sky-200",
  terminated: "bg-rose-900 text-rose-200",
};

type Contract = {
  id: number;
  code: string;
  kind: ContractKind;
  title: string;
  partySupplierId: number | null;
  partySupplierName: string | null;
  partyName: string | null;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  value: number;
  advancePct: number;
  retentionPct: number;
  signedDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: ContractStatus;
  note: string | null;
  addendaTotal: number;
  paid: number;
  poCommitted: number;
  deletedAt: string | null;
};
type Supplier = { id: number; name: string };
type SystemOption = { id: number; code: string; name: string };

function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}
function todayISO() {
  const iso = new Date().toISOString().slice(0, 10);
  return iso;
}

export default function ContractsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<ContractKind>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";
  const isAdmin = me?.role === "admin";

  function load(deleted = showDeleted) {
    return fetch(`/api/contracts${deleted ? "?includeDeleted=1" : ""}`).then((r) =>
      r.ok ? r.json() : null,
    );
  }

  useEffect(() => {
    Promise.all([
      fetchMe(),
      load(false),
      fetch("/api/suppliers").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/systems").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, c, s, d]) => {
        if (!meData) return;
        setMe(meData);
        setContracts(c?.contracts ?? []);
        setSuppliers(s?.suppliers ?? []);
        setSystems(d?.systems ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(deleted = showDeleted) {
    const c = await load(deleted);
    setContracts(c?.contracts ?? []);
  }

  async function toggleShowDeleted() {
    const next = !showDeleted;
    setShowDeleted(next);
    setSelectedId(null);
    setLoading(true);
    await refresh(next);
    setLoading(false);
  }

  async function restoreContract(id: number) {
    setRestoringId(id);
    const res = await fetch(`/api/contracts/${id}/restore`, { method: "POST" });
    if (res.ok) {
      showToast("Đã khôi phục hợp đồng", "success");
      await refresh(true);
    } else {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Khôi phục thất bại", "error");
    }
    setRestoringId(null);
  }

  const groups = useMemo(() => {
    const order: ContractKind[] = ["nhan_thau", "giao_thau", "ncc"];
    return order
      .map((kind) => ({ kind, items: contracts.filter((c) => c.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [contracts]);

  const kindTotals = useMemo(() => {
    const map: Record<ContractKind, { total: number; paid: number }> = {
      nhan_thau: { total: 0, paid: 0 },
      giao_thau: { total: 0, paid: 0 },
      ncc: { total: 0, paid: 0 },
    };
    for (const c of contracts) {
      map[c.kind].total += Number(c.value) + Number(c.addendaTotal);
      map[c.kind].paid += Number(c.paid);
    }
    return map;
  }, [contracts]);

  function toggleGroup(kind: ContractKind) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const selected = contracts.find((c) => c.id === selectedId) ?? null;

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Hợp đồng"
        subtitle="Nhận thầu · giao thầu · nhà cung cấp"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm hợp đồng"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm hợp đồng</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["nhan_thau", "giao_thau", "ncc"] as ContractKind[]).map((kind) => (
            <div key={kind} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">{KIND_LABEL[kind]}</p>
              <p className="text-lg font-semibold mt-1">{fmtVND(kindTotals[kind].total)}</p>
              <p className="text-xs text-zinc-400 mt-1">
                Đã thanh toán: {fmtVND(kindTotals[kind].paid)}
              </p>
            </div>
          ))}
        </div>

        {isAdmin && (
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={toggleShowDeleted}
              className="rounded"
            />
            Xem hợp đồng đã xoá
          </label>
        )}

        {contracts.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={showDeleted ? "Không có hợp đồng nào đã xoá" : "Chưa có hợp đồng nào"}
            message={
              showDeleted
                ? "Chưa hợp đồng nào bị xoá."
                : canManage
                  ? 'Bấm "Thêm hợp đồng" để bắt đầu.'
                  : "Chưa có dữ liệu hợp đồng."
            }
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng hợp đồng">
              <table className="w-full text-sm sm:min-w-[860px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">SỐ HĐ</th>
                    <th className="text-left p-3">TÊN / ĐỐI TÁC</th>
                    <th className="text-left p-3 hidden sm:table-cell">HỆ</th>
                    <th className="text-right p-3 hidden sm:table-cell">GIÁ TRỊ</th>
                    <th className="text-right p-3 hidden sm:table-cell">ĐÃ TT</th>
                    <th className="text-right p-3">CÒN LẠI</th>
                    <th className="text-left p-3 hidden sm:table-cell">HIỆU LỰC</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const isCollapsed = collapsed.has(g.kind);
                    return (
                      <Fragment key={g.kind}>
                        <tr className="bg-zinc-950/60">
                          <td colSpan={8} className="p-0">
                            <button
                              onClick={() => toggleGroup(g.kind)}
                              aria-expanded={!isCollapsed}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:text-white transition"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                              )}
                              {KIND_LABEL[g.kind]} ({g.items.length})
                            </button>
                          </td>
                        </tr>
                        {!isCollapsed &&
                          g.items.map((c) => {
                            const total = Number(c.value) + Number(c.addendaTotal);
                            const remaining = total - Number(c.paid);
                            const today = todayISO();
                            const expiringSoon =
                              c.status === "active" && c.validTo != null && c.validTo <= today;
                            return (
                              <tr
                                key={c.id}
                                onClick={showDeleted ? undefined : () => setSelectedId(c.id)}
                                className={`border-b border-zinc-800/60 last:border-0 ${
                                  showDeleted ? "opacity-60" : "hover:bg-zinc-800/40 cursor-pointer"
                                }`}
                              >
                                <td className="p-3 font-mono text-xs">{c.code}</td>
                                <td className="p-3">
                                  <p className="truncate max-w-[220px]">{c.title}</p>
                                  <p className="text-xs text-zinc-400 truncate max-w-[220px]">
                                    {c.partySupplierName ?? c.partyName ?? "—"}
                                  </p>
                                </td>
                                <td className="p-3 hidden sm:table-cell">
                                  {c.systemName ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                                      <span
                                        className={`w-2 h-2 rounded-full bg-${c.systemColor}-400`}
                                      />
                                      {c.systemName}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-500 text-xs">—</span>
                                  )}
                                </td>
                                <td className="p-3 hidden sm:table-cell text-right font-medium">
                                  {fmtVND(total)}
                                </td>
                                <td className="p-3 hidden sm:table-cell text-right">
                                  {fmtVND(Number(c.paid))}
                                </td>
                                <td
                                  className={`p-3 text-right ${remaining > 0 ? "text-amber-300" : "text-emerald-300"}`}
                                >
                                  {fmtVND(remaining)}
                                </td>
                                <td className="p-3 hidden sm:table-cell">
                                  {c.validTo ? (
                                    <span
                                      className={
                                        expiringSoon ? "text-rose-300 font-medium" : "text-zinc-300"
                                      }
                                    >
                                      {c.validTo}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-500">Không thời hạn</span>
                                  )}
                                </td>
                                <td className="p-3">
                                  {showDeleted ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        restoreContract(c.id);
                                      }}
                                      disabled={restoringId === c.id}
                                      aria-label={`Khôi phục hợp đồng ${c.code}`}
                                      className="flex items-center gap-1 text-emerald-300 hover:text-emerald-200 disabled:opacity-50 text-xs font-medium"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" /> Khôi phục
                                    </button>
                                  ) : (
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[c.status]}`}
                                    >
                                      {STATUS_LABEL[c.status]}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selected && (
        <ContractDetailModal
          contract={selected}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
          onDeleted={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      )}
      {addOpen && (
        <AddContractModal
          suppliers={suppliers}
          systems={systems}
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

function AddContractModal({
  suppliers,
  systems,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  systems: SystemOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ContractKind>("ncc");
  const [title, setTitle] = useState("");
  const [partySupplierId, setPartySupplierId] = useState<number | "">("");
  const [partyName, setPartyName] = useState("");
  const [systemId, setSystemId] = useState<number | "">("");
  const [value, setValue] = useState("0");
  const [advancePct, setAdvancePct] = useState("0");
  const [retentionPct, setRetentionPct] = useState("0");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const needsSupplier = kind !== "nhan_thau";

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          kind,
          title: title.trim(),
          partySupplierId: needsSupplier && partySupplierId ? Number(partySupplierId) : null,
          partyName: !needsSupplier ? partyName.trim() || null : null,
          systemId: systemId || null,
          value: Number(value) || 0,
          advancePct: Number(advancePct) || 0,
          retentionPct: Number(retentionPct) || 0,
          validFrom: validFrom || null,
          validTo: validTo || null,
          status: "active",
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được hợp đồng");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    code.trim() && title.trim() && (needsSupplier ? partySupplierId : partyName.trim());

  return (
    <Modal onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm hợp đồng</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số hợp đồng
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Loại
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ContractKind)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="ncc">Nhà cung cấp</option>
              <option value="giao_thau">Giao thầu</option>
              <option value="nhan_thau">Nhận thầu</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Tên hợp đồng
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          {needsSupplier ? (
            <label className="text-xs text-zinc-400 col-span-2">
              Đối tác (NCC/thầu phụ)
              <select
                value={partySupplierId}
                onChange={(e) => setPartySupplierId(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— Chọn đối tác —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs text-zinc-400 col-span-2">
              Tên CĐT / tổng thầu
              <input
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          )}
          <label className="text-xs text-zinc-400 col-span-2">
            Hệ
            <select
              value={systemId}
              onChange={(e) => setSystemId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {systems.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Giá trị hợp đồng
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            % tạm ứng
            <input
              type="number"
              value={advancePct}
              onChange={(e) => setAdvancePct(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            % giữ lại bảo hành
            <input
              type="number"
              value={retentionPct}
              onChange={(e) => setRetentionPct(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hiệu lực từ
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hiệu lực đến
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo hợp đồng"}
        </button>
      </div>
    </Modal>
  );
}

type ContractDetail = {
  contract: Contract;
  addenda: {
    id: number;
    code: string;
    title: string | null;
    valueDelta: number;
    signedDate: string | null;
    note: string | null;
    createdByName: string | null;
  }[];
  documents: {
    id: number;
    originalName: string | null;
    mimeType: string;
    sizeBytes: number | null;
    caption: string | null;
    createdAt: string;
    uploaderName: string | null;
    sha256: string | null;
  }[];
  bills: { id: number; responsible: string; type: string; amount: number; paidDate: string }[];
  purchaseOrders: {
    id: number;
    poCode: string;
    status: string;
    expectedDate: string | null;
    supplierName: string | null;
  }[];
  floorContracts: {
    id: number;
    floorLabel: string;
    contractValue: number;
    sheetName: string;
    sheetSlug: string | null;
  }[];
};

function ContractDetailModal({
  contract,
  canManage,
  onClose,
  onSaved,
  onDeleted,
}: {
  contract: Contract;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [tab, setTab] = useState<"info" | "addenda" | "documents" | "links" | "ipc">("info");
  const [certs, setCerts] = useState<
    { id: number; code: string; periodNo: number; status: string }[]
  >([]);

  const [title, setTitle] = useState(contract.title);
  const [value, setValue] = useState(String(contract.value));
  const [advancePct, setAdvancePct] = useState(String(contract.advancePct));
  const [retentionPct, setRetentionPct] = useState(String(contract.retentionPct));
  const [status, setStatus] = useState<ContractStatus>(contract.status);
  const [validTo, setValidTo] = useState(contract.validTo ?? "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoErr, setInfoErr] = useState("");

  const [addCode, setAddCode] = useState("");
  const [addDelta, setAddDelta] = useState("0");
  const [savingAddendum, setSavingAddendum] = useState(false);

  const [uploading, setUploading] = useState(false);

  function loadDetail() {
    fetch(`/api/contracts/${contract.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDetail(j));
  }

  useEffect(() => {
    loadDetail();
    fetch(`/api/payment-certs?contractId=${contract.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCerts(j?.certs ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.id]);

  async function saveInfo() {
    setSavingInfo(true);
    setInfoErr("");
    try {
      const res = await fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          value: Number(value) || 0,
          advancePct: Number(advancePct) || 0,
          retentionPct: Number(retentionPct) || 0,
          status,
          validTo: validTo || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setInfoErr(j?.error ?? "Lưu thất bại");
        return;
      }
      onSaved();
      loadDetail();
    } catch {
      setInfoErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSavingInfo(false);
    }
  }

  async function addAddendum() {
    if (!addCode.trim()) return;
    setSavingAddendum(true);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/addenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: addCode.trim(), valueDelta: Number(addDelta) || 0 }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(j?.error ?? "Không thêm được phụ lục", "error");
        return;
      }
      setAddCode("");
      setAddDelta("0");
      onSaved();
      loadDetail();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setSavingAddendum(false);
    }
  }

  async function removeAddendum(aid: number) {
    if (!(await appConfirm("Xoá phụ lục này?", { danger: true, confirmLabel: "Xoá" }))) return;
    const res = await fetch(`/api/contracts/${contract.id}/addenda/${aid}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    onSaved();
    loadDetail();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/contracts/${contract.id}/documents`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
        return;
      }
      loadDetail();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: number) {
    if (!(await appConfirm("Xoá file đính kèm này?", { danger: true, confirmLabel: "Xoá" })))
      return;
    const res = await fetch(`/api/contract-documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    loadDetail();
  }

  async function deleteContract() {
    if (
      !(await appConfirm(`Xoá hợp đồng "${contract.code}"? Không thể hoàn tác.`, {
        danger: true,
        confirmLabel: "Xoá",
      }))
    )
      return;
    const res = await fetch(`/api/contracts/${contract.id}`, { method: "DELETE" });
    if (!res.ok) {
      appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
      return;
    }
    onDeleted();
  }

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{contract.code}</h2>
            <p className="text-sm text-zinc-300">{contract.title}</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={deleteContract}
                aria-label={`Xoá hợp đồng ${contract.code}`}
                className="text-zinc-400 hover:text-rose-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-zinc-800 text-sm" role="tablist">
          {(
            [
              ["info", "Thông tin"],
              ["addenda", "Phụ lục"],
              ["documents", "File"],
              ["links", "Liên kết"],
              ["ipc", "Đợt IPC"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 -mb-px border-b-2 transition ${
                tab === key
                  ? "border-emerald-400 text-white"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "info" && (
          <section className="space-y-3">
            {canManage ? (
              <>
                <label className="text-xs text-zinc-400 block">
                  Tên hợp đồng
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-zinc-400">
                    Giá trị
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Trạng thái
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ContractStatus)}
                      className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      {(Object.keys(STATUS_LABEL) as ContractStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-400">
                    % tạm ứng
                    <input
                      type="number"
                      value={advancePct}
                      onChange={(e) => setAdvancePct(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    % giữ lại bảo hành
                    <input
                      type="number"
                      value={retentionPct}
                      onChange={(e) => setRetentionPct(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-zinc-400 col-span-2">
                    Hiệu lực đến
                    <input
                      type="date"
                      value={validTo}
                      onChange={(e) => setValidTo(e.target.value)}
                      className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </label>
                </div>
                {infoErr && <p className="text-sm text-rose-300">{infoErr}</p>}
                <button
                  onClick={saveInfo}
                  disabled={savingInfo}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {savingInfo ? "Đang lưu…" : "Lưu"}
                </button>
              </>
            ) : (
              <dl className="text-sm space-y-1 text-zinc-300">
                <div>
                  Giá trị: <MaskedValue value={contract.value} format={fmtVND} />
                </div>
                <div>Trạng thái: {STATUS_LABEL[contract.status]}</div>
                <div>Hiệu lực đến: {contract.validTo ?? "Không thời hạn"}</div>
              </dl>
            )}
          </section>
        )}

        {tab === "addenda" && (
          <section className="space-y-3">
            {detail?.addenda.length ? (
              <ul className="space-y-1.5">
                {detail.addenda.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-zinc-400">{a.code}</span>{" "}
                      {a.title ?? ""}
                    </span>
                    <span className={a.valueDelta >= 0 ? "text-emerald-300" : "text-rose-300"}>
                      {a.valueDelta >= 0 ? "+" : ""}
                      {fmtVND(a.valueDelta)}
                    </span>
                    {canManage && (
                      <button
                        onClick={() => removeAddendum(a.id)}
                        aria-label={`Xoá phụ lục ${a.code}`}
                        className="text-zinc-500 hover:text-rose-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="Chưa có phụ lục nào." compact />
            )}
            {canManage && (
              <div className="flex items-center gap-2">
                <input
                  value={addCode}
                  onChange={(e) => setAddCode(e.target.value)}
                  placeholder="Số phụ lục"
                  aria-label="Số phụ lục"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
                <input
                  type="number"
                  value={addDelta}
                  onChange={(e) => setAddDelta(e.target.value)}
                  placeholder="Giá trị +/-"
                  aria-label="Giá trị tăng giảm"
                  className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
                <button
                  onClick={addAddendum}
                  disabled={savingAddendum || !addCode.trim()}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent text-sm font-medium px-3 py-2 rounded-lg shrink-0"
                >
                  Thêm
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "documents" && (
          <section className="space-y-3">
            {detail?.documents.length ? (
              <ul className="space-y-1.5">
                {detail.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <a
                      href={`/api/contract-documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-0 truncate text-sky-300 hover:underline"
                    >
                      {d.originalName ?? "File"}
                    </a>
                    {d.sha256 && (
                      <span
                        className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0"
                        title={`SHA-256: ${d.sha256}`}
                      >
                        <Lock className="w-3 h-3" aria-hidden="true" />
                        {d.sha256.slice(0, 8)}...
                      </span>
                    )}
                    {canManage && (
                      <button
                        onClick={() => deleteFile(d.id)}
                        aria-label={`Xoá file ${d.originalName ?? d.id}`}
                        className="text-zinc-500 hover:text-rose-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="Chưa có file đính kèm nào." compact />
            )}
            {canManage && (
              <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg">
                <Paperclip className="w-4 h-4" />
                {uploading ? "Đang tải lên…" : "Tải file lên"}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </section>
        )}

        {tab === "links" && (
          <section className="space-y-4 text-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Đơn đặt hàng ({detail?.purchaseOrders.length ?? 0})
              </h3>
              {detail?.purchaseOrders.length ? (
                <ul className="space-y-1">
                  {detail.purchaseOrders.map((po) => (
                    <li key={po.id} className="flex justify-between text-zinc-300">
                      <span className="font-mono text-xs">{po.poCode}</span>
                      <span className="text-zinc-400">{po.status}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500">Chưa có PO nào gắn hợp đồng này.</p>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Thanh toán ({detail?.bills.length ?? 0})
              </h3>
              {detail?.bills.length ? (
                <ul className="space-y-1">
                  {detail.bills.map((b) => (
                    <li key={b.id} className="flex justify-between text-zinc-300">
                      <span>{b.paidDate}</span>
                      <span>
                        <MaskedValue value={b.amount} format={fmtVND} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500">Chưa có phiếu thanh toán nào gắn hợp đồng này.</p>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
                Giá trị giao thầu theo tầng ({detail?.floorContracts.length ?? 0})
              </h3>
              {detail?.floorContracts.length ? (
                <ul className="space-y-1">
                  {detail.floorContracts.map((fc) => (
                    <li key={fc.id} className="flex justify-between text-zinc-300">
                      <span>
                        {fc.sheetName} — {fc.floorLabel}
                      </span>
                      <span>
                        <MaskedValue value={fc.contractValue} format={fmtVND} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-zinc-500">Chưa gắn tầng nào.</p>
              )}
            </div>
          </section>
        )}

        {tab === "ipc" && (
          <section className="space-y-3 text-sm">
            {certs.length ? (
              <ul className="space-y-1.5">
                {certs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-zinc-300">
                    <span>
                      <span className="font-mono text-xs">{c.code}</span> — Đợt {c.periodNo}
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${IPC_STATUS_BADGE[c.status] ?? "bg-zinc-800 text-zinc-300"}`}
                    >
                      {IPC_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="Chưa có đợt thanh toán khối lượng nào." compact />
            )}
            <a
              href={`/payment-certs?contractId=${contract.id}`}
              className="inline-block text-xs text-sky-300 hover:underline"
            >
              Quản lý đợt thanh toán khối lượng (IPC) →
            </a>
          </section>
        )}
      </div>
    </Modal>
  );
}

const IPC_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};
const IPC_STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-800 text-zinc-300",
  submitted: "bg-amber-900 text-amber-200",
  approved: "bg-emerald-900 text-emerald-200",
  rejected: "bg-rose-900 text-rose-200",
};
