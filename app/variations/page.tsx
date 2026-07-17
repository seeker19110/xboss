"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, Paperclip, FilePlus2, Lock } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import MaskedValue from "@/app/components/MaskedValue";
import { mSum } from "@/app/lib/masked";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import type { EntityApprovalStatus } from "@/lib/approvals";

type VoReason = "design_change" | "client_request" | "site_condition" | "other";
type VoStatus =
  "draft" | "submitted" | "approved" | "partially_approved" | "rejected" | "contract_added";

const REASON_LABEL: Record<VoReason, string> = {
  design_change: "Thay đổi thiết kế",
  client_request: "Yêu cầu CĐT",
  site_condition: "Điều kiện hiện trường",
  other: "Khác",
};
const STATUS_LABEL: Record<VoStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  partially_approved: "Duyệt một phần",
  rejected: "Từ chối",
  contract_added: "Đã vào phụ lục HĐ",
};
const STATUS_BADGE: Record<VoStatus, string> = {
  draft: "bg-zinc-800 text-zinc-300",
  submitted: "bg-amber-900 text-amber-200",
  approved: "bg-emerald-900 text-emerald-200",
  partially_approved: "bg-sky-900 text-sky-200",
  rejected: "bg-rose-900 text-rose-200",
  contract_added: "bg-violet-900 text-violet-200",
};

type VoLine = {
  id: number;
  code: string;
  name: string;
  unit: string;
  qtyProposed: number;
  qtyApproved: number | null;
  unitPrice: number;
};

type Vo = {
  id: number;
  code: string;
  title: string;
  reason: VoReason;
  description: string | null;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  contractId: number | null;
  contractCode: string | null;
  status: VoStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  proposedValue: number;
  approvedValue: number;
  lines: VoLine[];
};

type SystemOption = { id: number; code: string; name: string };
type Contract = { id: number; code: string; title: string; kind: string };
type BoqItem = { code: string; unitPrice: number; voId: number | null };

function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

export default function VariationsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Vo[]>([]);
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [boqIndex, setBoqIndex] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const canCreate = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdminOrPm = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/variations").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load(), fetch("/api/systems").then((r) => (r.ok ? r.json() : null))])
      .then(([meData, v, d]) => {
        if (!meData) return;
        setMe(meData);
        setItems(v?.items ?? []);
        setSystems(d?.systems ?? []);
        if (meData.role === "admin" || meData.role === "pm") {
          fetch("/api/contracts")
            .then((r) => (r.ok ? r.json() : null))
            .then((c) => setContracts(c?.contracts ?? []));
        }
        fetch("/api/boq?includeVo=0")
          .then((r) => (r.ok ? r.json() : null))
          .then((b) => {
            const idx = new Map<string, number>();
            for (const it of (b?.items ?? []) as BoqItem[])
              idx.set(it.code.trim().toLowerCase(), Number(it.unitPrice));
            setBoqIndex(idx);
          });
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const v = await load();
    setItems(v?.items ?? []);
  }

  // M50 PR2: giá trị VO có thể bị che (null) với user thiếu viewPayments (vd engineer) —
  // dùng mSum để tổng cũng "bị che" (null) thay vì ngầm thành 0, để MaskedValue hiện "•••".
  const totals = useMemo(() => {
    const map: Record<"draft" | "submitted" | "approved" | "rejected", number | null> = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
    };
    for (const v of items) {
      if (v.status === "draft") map.draft = mSum(map.draft, v.proposedValue);
      else if (v.status === "submitted") map.submitted = mSum(map.submitted, v.proposedValue);
      else if (v.status === "rejected") map.rejected = mSum(map.rejected, v.proposedValue);
      // approved/partially_approved/contract_added
      else map.approved = mSum(map.approved, v.approvedValue);
    }
    return map;
  }, [items]);

  const selected = items.find((v) => v.id === selectedId) ?? null;

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Phát sinh"
        subtitle="Khối lượng ngoài hợp đồng gốc (VO)"
        bottomActions={
          canCreate ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm phát sinh"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm phát sinh</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ["draft", "Nháp"],
              ["submitted", "Đã trình"],
              ["approved", "Được duyệt"],
              ["rejected", "Từ chối"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-400 uppercase tracking-wide">{label}</p>
              <p className="text-lg font-semibold mt-1">
                <MaskedValue value={totals[key]} format={fmtVND} />
              </p>
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={FilePlus2}
            title="Chưa có phát sinh nào"
            message={canCreate ? 'Bấm "Thêm phát sinh" để bắt đầu.' : "Chưa có dữ liệu phát sinh."}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng phát sinh">
              <table className="w-full text-sm sm:min-w-[820px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">MÃ</th>
                    <th className="text-left p-3">TÊN / LÝ DO</th>
                    <th className="text-left p-3 hidden sm:table-cell">HỆ</th>
                    <th className="text-right p-3 hidden sm:table-cell">ĐỀ XUẤT</th>
                    <th className="text-right p-3">ĐƯỢC DUYỆT</th>
                    <th className="text-left p-3 hidden sm:table-cell">NGÀY</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedId(v.id)}
                      className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                    >
                      <td className="p-3 font-mono text-xs">{v.code}</td>
                      <td className="p-3">
                        <p className="truncate max-w-[220px]">{v.title}</p>
                        <p className="text-xs text-zinc-400">{REASON_LABEL[v.reason]}</p>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        {v.systemName ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                            <span className={`w-2 h-2 rounded-full bg-${v.systemColor}-400`} />
                            {v.systemName}
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 hidden sm:table-cell text-right">
                        <MaskedValue value={v.proposedValue} format={fmtVND} />
                      </td>
                      <td className="p-3 text-right font-medium">
                        <MaskedValue value={v.approvedValue} format={fmtVND} />
                      </td>
                      <td className="p-3 hidden sm:table-cell text-xs text-zinc-400">
                        {v.decidedAt ?? v.submittedAt ?? "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[v.status]}`}
                        >
                          {STATUS_LABEL[v.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selected && (
        <VoDetailModal
          vo={selected}
          me={me}
          contracts={contracts}
          isAdminOrPm={isAdminOrPm}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      )}
      {addOpen && (
        <AddVoModal
          systems={systems}
          boqIndex={boqIndex}
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

type LineDraft = { code: string; name: string; unit: string; qty: string; unitPrice: string };

function emptyLine(): LineDraft {
  return { code: "", name: "", unit: "", qty: "", unitPrice: "" };
}

function AddVoModal({
  systems,
  boqIndex,
  onClose,
  onCreated,
}: {
  systems: SystemOption[];
  boqIndex: Map<string, number>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState<VoReason>("design_change");
  const [systemId, setSystemId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // Prefill đơn giá theo BOQ gốc khi mã dòng KL trùng mã đã có (sửa được sau đó).
  function prefillPriceFromBoq(i: number, code: string) {
    const price = boqIndex.get(code.trim().toLowerCase());
    if (price != null) updateLine(i, { unitPrice: String(price) });
  }

  const canSubmit =
    title.trim() &&
    lines.length > 0 &&
    lines.every((l) => l.code.trim() && l.name.trim() && l.unit.trim() && Number(l.qty) > 0);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          reason,
          description: description.trim() || null,
          systemId: systemId || null,
          lines: lines.map((l) => ({
            code: l.code.trim(),
            name: l.name.trim(),
            unit: l.unit.trim(),
            qty: Number(l.qty) || 0,
            unitPrice: Number(l.unitPrice) || 0,
          })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được phát sinh");
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
          <h2 className="font-semibold">Thêm phát sinh (VO)</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400 col-span-2">
            Tên phát sinh
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Lý do
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as VoReason)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(REASON_LABEL) as VoReason[]).map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
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
            Mô tả
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Dòng khối lượng
            </h3>
            <button
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
              className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm dòng
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <input
                  value={l.code}
                  onChange={(e) => updateLine(i, { code: e.target.value })}
                  onBlur={(e) => prefillPriceFromBoq(i, e.target.value)}
                  placeholder="Mã"
                  aria-label={`Mã dòng ${i + 1}`}
                  className="col-span-3 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  value={l.name}
                  onChange={(e) => updateLine(i, { name: e.target.value })}
                  placeholder="Tên công tác"
                  aria-label={`Tên dòng ${i + 1}`}
                  className="col-span-3 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  value={l.unit}
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                  placeholder="ĐVT"
                  aria-label={`Đơn vị tính dòng ${i + 1}`}
                  className="col-span-2 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  type="number"
                  value={l.qty}
                  onChange={(e) => updateLine(i, { qty: e.target.value })}
                  placeholder="KL"
                  aria-label={`Khối lượng dòng ${i + 1}`}
                  className="col-span-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <input
                  type="number"
                  value={l.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  placeholder="Đơn giá"
                  aria-label={`Đơn giá dòng ${i + 1}`}
                  className="col-span-2 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <button
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={lines.length === 1}
                  aria-label={`Xoá dòng ${i + 1}`}
                  className="col-span-1 text-zinc-500 hover:text-rose-300 disabled:opacity-30 flex justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo phát sinh"}
        </button>
      </div>
    </Modal>
  );
}

type VoDocument = {
  id: number;
  originalName: string | null;
  caption: string | null;
  uploadedBy: number | null;
  sha256: string | null;
};

function VoDetailModal({
  vo,
  me,
  contracts,
  isAdminOrPm,
  onClose,
  onSaved,
}: {
  vo: Vo;
  me: Me | null;
  contracts: Contract[];
  isAdminOrPm: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"info" | "lines" | "documents">("info");
  const [documents, setDocuments] = useState<VoDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approvals, setApprovals] = useState<Record<number, string>>({});
  const [addendaCode, setAddendaCode] = useState("");
  const [addendaContractId, setAddendaContractId] = useState<number | "">("");
  // Trạng thái duyệt engine (M46 PR2) — null khi chưa có flow cấu hình cho "variation",
  // giữ UI y hệt trước (không hiện badge/lịch sử) đúng nguyên tắc "dormant" của M46.
  const [approvalStatus, setApprovalStatus] = useState<EntityApprovalStatus | null>(null);

  const canEditMeta =
    (vo.status === "draft" && (vo.createdBy === me?.id || isAdminOrPm)) ||
    (vo.status === "submitted" && isAdminOrPm);
  const canDecide = vo.status === "submitted" && isAdminOrPm;
  const canContractAdd =
    (vo.status === "approved" || vo.status === "partially_approved") && isAdminOrPm;

  function loadDocs() {
    fetch(`/api/variations/${vo.id}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDocuments(j?.documents ?? []));
  }

  useEffect(() => {
    loadDocs();
    setApprovals(Object.fromEntries(vo.lines.map((l) => [l.id, String(l.qtyProposed)])));
    fetch(`/api/variations/${vo.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setApprovalStatus(j?.approvalStatus ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vo.id]);

  async function submitVo() {
    if (!(await appConfirm(`Trình phát sinh ${vo.code} lên CĐT/TVGS?`))) return;
    setBusy(true);
    const res = await fetch(`/api/variations/${vo.id}/submit`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Trình thất bại", "error");
      return;
    }
    onSaved();
  }

  async function decide(decision: "approved" | "partially_approved" | "rejected") {
    const value =
      decision === "rejected"
        ? 0
        : decision === "approved"
          ? vo.lines.reduce((s, l) => s + l.qtyProposed * l.unitPrice, 0)
          : vo.lines.reduce((s, l) => s + (Number(approvals[l.id]) || 0) * l.unitPrice, 0);
    const label =
      decision === "rejected"
        ? `Từ chối phát sinh ${vo.code}?`
        : `Duyệt phát sinh ${vo.code} — giá trị ${fmtVND(value)}?`;
    if (!(await appConfirm(label, { danger: decision === "rejected" }))) return;

    setBusy(true);
    const body: { decision: string; lines?: { id: number; qtyApproved: number }[] } = { decision };
    if (decision === "partially_approved")
      body.lines = vo.lines.map((l) => ({ id: l.id, qtyApproved: Number(approvals[l.id]) || 0 }));
    const res = await fetch(`/api/variations/${vo.id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Quyết định thất bại", "error");
      return;
    }
    onSaved();
    onClose();
  }

  async function contractAdd() {
    if (!addendaContractId || !addendaCode.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/variations/${vo.id}/contract-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId: addendaContractId, addendaCode: addendaCode.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Thất bại", "error");
      return;
    }
    showToast(`Đã đưa ${vo.code} vào phụ lục hợp đồng`, "success");
    onSaved();
    onClose();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/variations/${vo.id}/documents`, { method: "POST", body: form });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
        return;
      }
      loadDocs();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: number) {
    if (!(await appConfirm("Xoá file đính kèm này?", { danger: true, confirmLabel: "Xoá" })))
      return;
    const res = await fetch(`/api/vo-documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
      return;
    }
    loadDocs();
  }

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{vo.code}</h2>
            <p className="text-sm text-zinc-300">{vo.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[vo.status]}`}
            >
              {STATUS_LABEL[vo.status]}
            </span>
            {approvalStatus && approvalStatus.status === "pending" && (
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-900 text-amber-200">
                Chờ duyệt (bước {approvalStatus.currentSeq}/{approvalStatus.totalSteps})
              </span>
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
              ["lines", "Khối lượng"],
              ["documents", "File"],
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
          <section className="space-y-2 text-sm">
            <dl className="space-y-1 text-zinc-300">
              <div>Lý do: {REASON_LABEL[vo.reason]}</div>
              <div>Hệ: {vo.systemName ?? "—"}</div>
              <div>Người tạo: {vo.createdByName ?? "—"}</div>
              <div>Ngày trình: {vo.submittedAt ?? "—"}</div>
              <div>Ngày quyết định: {vo.decidedAt ?? "—"}</div>
              {vo.description && <div>Mô tả: {vo.description}</div>}
              {vo.contractCode && <div>Phụ lục hợp đồng: {vo.contractCode}</div>}
            </dl>
            {vo.status === "draft" && isAdminOrPm && (
              <button
                onClick={submitVo}
                disabled={busy}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent text-sm font-medium px-4 py-2 rounded-lg"
              >
                Trình lên CĐT/TVGS
              </button>
            )}
            {!canEditMeta && vo.status !== "draft" && (
              <p className="text-xs text-zinc-500">
                Chỉ Admin/PM sửa được thông tin ở giai đoạn này.
              </p>
            )}

            {/* Lịch sử duyệt engine (M46 PR2) — ẩn hoàn toàn khi chưa có flow cấu hình
                cho "variation" (approvalStatus null), giữ UI y hệt trước đây. */}
            {approvalStatus && approvalStatus.actions.length > 0 && (
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Lịch sử duyệt
                </h3>
                <ul className="space-y-1.5">
                  {approvalStatus.actions.map((a) => (
                    <li key={a.seq} className="text-xs text-zinc-300 flex flex-wrap gap-x-1.5">
                      <span className="font-medium">{a.actorName ?? `#${a.actorId}`}</span>
                      <span
                        className={a.decision === "approve" ? "text-emerald-300" : "text-rose-300"}
                      >
                        {a.decision === "approve" ? "đã duyệt" : "đã từ chối"}
                      </span>
                      <span className="text-zinc-500">bước {a.seq}</span>
                      {a.note && <span className="text-zinc-400">— {a.note}</span>}
                      <span className="text-zinc-500">({a.at})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {tab === "lines" && (
          <section className="space-y-3 text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-1.5">Mã</th>
                    <th className="text-left p-1.5">Tên</th>
                    <th className="text-right p-1.5">Đề xuất</th>
                    <th className="text-right p-1.5">Duyệt</th>
                    <th className="text-right p-1.5">Đơn giá</th>
                  </tr>
                </thead>
                <tbody>
                  {vo.lines.map((l) => (
                    <tr key={l.id} className="border-b border-zinc-800/60 last:border-0">
                      <td className="p-1.5 font-mono">{l.code}</td>
                      <td className="p-1.5">
                        {l.name} <span className="text-zinc-500">({l.unit})</span>
                      </td>
                      <td className="p-1.5 text-right">{l.qtyProposed}</td>
                      <td className="p-1.5 text-right">
                        {canDecide ? (
                          <input
                            type="number"
                            value={approvals[l.id] ?? ""}
                            onChange={(e) =>
                              setApprovals((prev) => ({ ...prev, [l.id]: e.target.value }))
                            }
                            aria-label={`Khối lượng duyệt dòng ${l.code}`}
                            min={0}
                            max={l.qtyProposed}
                            className="w-20 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-white text-right"
                          />
                        ) : (
                          (l.qtyApproved ?? "—")
                        )}
                      </td>
                      <td className="p-1.5 text-right">
                        <MaskedValue value={l.unitPrice} format={fmtVND} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canDecide && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => decide("approved")}
                  disabled={busy}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent text-xs font-medium px-3 py-2 rounded-lg"
                >
                  Duyệt toàn bộ
                </button>
                <button
                  onClick={() => decide("partially_approved")}
                  disabled={busy}
                  className="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-on-accent text-xs font-medium px-3 py-2 rounded-lg"
                >
                  Duyệt một phần
                </button>
                <button
                  onClick={() => decide("rejected")}
                  disabled={busy}
                  className="bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-on-accent text-xs font-medium px-3 py-2 rounded-lg"
                >
                  Từ chối
                </button>
              </div>
            )}

            {canContractAdd && (
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Đưa vào phụ lục hợp đồng
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={addendaContractId}
                    onChange={(e) =>
                      setAddendaContractId(e.target.value ? Number(e.target.value) : "")
                    }
                    aria-label="Chọn hợp đồng"
                    className="flex-1 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">— Chọn hợp đồng —</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title}
                      </option>
                    ))}
                  </select>
                  <input
                    value={addendaCode}
                    onChange={(e) => setAddendaCode(e.target.value)}
                    placeholder="Mã phụ lục"
                    aria-label="Mã phụ lục"
                    className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <button
                    onClick={contractAdd}
                    disabled={busy || !addendaContractId || !addendaCode.trim()}
                    className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-on-accent text-xs font-medium px-3 py-2 rounded-lg shrink-0"
                  >
                    Chốt
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "documents" && (
          <section className="space-y-3">
            {documents.length ? (
              <ul className="space-y-1.5">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <a
                      href={`/api/vo-documents/${d.id}`}
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
                    {(d.uploadedBy === me?.id || isAdminOrPm) && (
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
            {canEditMeta && (
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
      </div>
    </Modal>
  );
}
