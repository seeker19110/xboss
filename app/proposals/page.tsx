"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Inbox,
  FileCheck2,
  Send,
  CheckCircle2,
  XCircle,
  Trash2,
  Paperclip,
  AlertTriangle,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm, appPrompt } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";

// Nhân bản label từ lib/proposals.ts — không import trực tiếp vì lib đó kéo theo
// lib/db (chỉ chạy server), giống pattern trang HSE.
type ProposalKind = "advance" | "payment" | "allocation" | "other";
const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = {
  advance: "Tạm ứng",
  payment: "Thanh toán",
  allocation: "Cấp phát vật tư",
  other: "Khác",
};

type ProposalStatus = "draft" | "submitted" | "approved" | "rejected";
const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};

const STATUS_BADGE: Record<ProposalStatus, string> = {
  draft: "bg-zinc-800 text-zinc-300",
  submitted: "bg-sky-900/40 text-sky-300",
  approved: "bg-emerald-900/40 text-emerald-300",
  rejected: "bg-rose-900/40 text-rose-300",
};

type Proposal = {
  id: number;
  code: string;
  kind: ProposalKind;
  title: string;
  amount: number | null;
  contractId: number | null;
  contractCode: string | null;
  materialId: number | null;
  materialName: string | null;
  reason: string | null;
  status: ProposalStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  rejectReason: string | null;
  requestedBy: number;
  requestedByName: string | null;
  createdAt: string;
  documentCount: number;
};

type ProposalDoc = {
  id: number;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  uploaderName: string | null;
};

type OverNorm = {
  boqCode: string;
  resourceLabel: string;
  unitLabel: string;
  expected: number;
  actual: number;
  variancePct: number;
};

type ContractOpt = { id: number; code: string; title: string };
type MaterialOpt = { id: number; name: string; unit: string | null };

function fmtVND(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

type Tab = "inbox" | ProposalKind;

export default function ProposalsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [materials, setMaterials] = useState<MaterialOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("advance");
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<Proposal | null>(null);

  const canApprove = me?.role === "admin" || me?.role === "pm";
  const canCreate =
    me != null &&
    (me.role === "admin" || me.role === "pm" || me.role === "engineer" || me.role === "subcon");

  const load = useCallback(() => fetch("/api/proposals").then((r) => (r.ok ? r.json() : null)), []);

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, r]) => {
        if (!meData) return;
        setMe(meData);
        setProposals(r?.proposals ?? []);
        if (meData.role === "admin" || meData.role === "pm") setTab("inbox");
        // Hợp đồng chỉ vai trò xem thanh toán lấy được; vật tư mọi vai trò đăng nhập.
        if (["admin", "pm", "bch"].includes(meData.role))
          fetch("/api/contracts")
            .then((r2) => (r2.ok ? r2.json() : null))
            .then((d) => setContracts(d?.contracts ?? []))
            .catch(() => {});
        fetch("/api/materials")
          .then((r2) => (r2.ok ? r2.json() : null))
          .then((d) => setMaterials(d?.materials ?? []))
          .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    const r = await load();
    const list: Proposal[] = r?.proposals ?? [];
    setProposals(list);
    // Cập nhật modal chi tiết đang mở theo dữ liệu mới (trạng thái vừa đổi).
    setDetail((d) => (d ? (list.find((p) => p.id === d.id) ?? null) : null));
  }

  const submitted = useMemo(() => proposals.filter((p) => p.status === "submitted"), [proposals]);
  const shown = useMemo(
    () => (tab === "inbox" ? submitted : proposals.filter((p) => p.kind === tab)),
    [tab, proposals, submitted],
  );

  if (loading) return <PageSkeleton />;

  const tabs: { key: Tab; label: string; count: number }[] = [
    ...(canApprove ? [{ key: "inbox" as Tab, label: "Chờ duyệt", count: submitted.length }] : []),
    ...(Object.keys(PROPOSAL_KIND_LABEL) as ProposalKind[]).map((k) => ({
      key: k as Tab,
      label: PROPOSAL_KIND_LABEL[k],
      count: proposals.filter((p) => p.kind === k).length,
    })),
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Đề xuất & phê duyệt"
        subtitle="Tạm ứng, thanh toán, cấp phát vật tư và đề xuất khác — duyệt online"
        bottomActions={
          canCreate ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Tạo đề xuất"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Đề xuất mới</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-sky-400">{submitted.length}</p>
            <p className="text-xs text-zinc-400">Chờ duyệt</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {proposals.filter((p) => p.status === "approved").length}
            </p>
            <p className="text-xs text-zinc-400">Được duyệt</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-rose-400">
              {proposals.filter((p) => p.status === "rejected").length}
            </p>
            <p className="text-xs text-zinc-400">Từ chối</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">
              {proposals.filter((p) => p.status === "draft").length}
            </p>
            <p className="text-xs text-zinc-400">Nháp</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Loại đề xuất">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                tab === t.key
                  ? t.key === "inbox"
                    ? "bg-sky-900/60 border-sky-700 text-sky-200"
                    : "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {t.key === "inbox" && <Inbox className="w-3 h-3 inline mr-1 -mt-0.5" />}
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title={tab === "inbox" ? "Không có đề xuất chờ duyệt" : "Chưa có đề xuất"}
            message={
              tab === "inbox"
                ? "Mọi đề xuất đã được quyết."
                : canCreate
                  ? "Bấm “Đề xuất mới” để tạo."
                  : "Chưa có đề xuất nào."
            }
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Danh sách đề xuất"
            >
              <table className="w-full text-sm sm:min-w-[680px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">MÃ</th>
                    <th className="text-left p-3">TIÊU ĐỀ</th>
                    {tab === "inbox" && <th className="text-left p-3">LOẠI</th>}
                    <th className="text-right p-3">GIÁ TRỊ</th>
                    <th className="text-left p-3 hidden sm:table-cell">NGƯỜI ĐỀ XUẤT</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                    <th className="text-left p-3 hidden sm:table-cell">NGÀY</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setDetail(p)}
                      className="border-b border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-800/40 transition"
                    >
                      <td className="p-3 font-mono text-xs text-zinc-400">{p.code}</td>
                      <td className="p-3">
                        <p className="max-w-[240px] truncate">{p.title}</p>
                        {p.documentCount > 0 && (
                          <p className="text-xs text-zinc-500 flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> {p.documentCount} file
                          </p>
                        )}
                      </td>
                      {tab === "inbox" && (
                        <td className="p-3 text-xs text-zinc-300">{PROPOSAL_KIND_LABEL[p.kind]}</td>
                      )}
                      <td className="p-3 text-right tabular-nums">{fmtVND(p.amount)}</td>
                      <td className="p-3 text-xs text-zinc-300 hidden sm:table-cell">
                        {p.requestedByName ?? "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status]}`}
                        >
                          {PROPOSAL_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-zinc-400 hidden sm:table-cell">
                        {formatDateVN(p.submittedAt ?? p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {addOpen && (
        <ProposalFormModal
          contracts={contracts}
          materials={materials}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}

      {detail && me && (
        <ProposalDetailModal
          proposal={detail}
          me={me}
          onClose={() => setDetail(null)}
          onChanged={refresh}
          onDeleted={() => {
            setDetail(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Modal tạo đề xuất (mobile-first — kỹ sư hiện trường dùng được) ─────────────
function ProposalFormModal({
  contracts,
  materials,
  onClose,
  onSaved,
}: {
  contracts: ContractOpt[];
  materials: MaterialOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ProposalKind>("advance");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [contractId, setContractId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const isMoney = kind === "advance" || kind === "payment";

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          amount: amount ? Number(amount) : null,
          contractId: isMoney && contractId ? Number(contractId) : null,
          materialId: kind === "allocation" && materialId ? Number(materialId) : null,
          reason: reason.trim() || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được đề xuất");
        return;
      }
      if (file && j?.id) {
        const form = new FormData();
        form.append("file", file);
        await fetch(`/api/proposals/${j.id}/documents`, { method: "POST", body: form });
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Đề xuất mới</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Loại đề xuất
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProposalKind)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(PROPOSAL_KIND_LABEL) as ProposalKind[]).map((k) => (
              <option key={k} value={k}>
                {PROPOSAL_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Tạm ứng đợt 2 thầu phụ điện"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Giá trị (đ, tuỳ chọn)
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {isMoney && contracts.length > 0 && (
          <label className="text-xs text-zinc-400 block">
            Hợp đồng liên quan (tuỳ chọn)
            <select
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Không gắn HĐ —</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {kind === "allocation" && materials.length > 0 && (
          <label className="text-xs text-zinc-400 block">
            Vật tư (tuỳ chọn)
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa rõ vật tư —</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.unit ? ` (${m.unit})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="text-xs text-zinc-400 block">
          Lý do
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Paperclip className="w-4 h-4" />
          {file ? file.name : "Đính kèm ảnh / PDF"}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !title.trim()}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Tạo đề xuất (nháp)"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal chi tiết + duyệt/từ chối ─────────────────────────────────────────────
function ProposalDetailModal({
  proposal: p,
  me,
  onClose,
  onChanged,
  onDeleted,
}: {
  proposal: Proposal;
  me: Me;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [docs, setDocs] = useState<ProposalDoc[]>([]);
  const [overNorm, setOverNorm] = useState<OverNorm | null>(null);
  const [createBill, setCreateBill] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdminOrPm = me.role === "admin" || me.role === "pm";
  const isOwner = p.requestedBy === me.id;
  const canSubmit = p.status === "draft" && (isOwner || isAdminOrPm);
  const canDecide = p.status === "submitted" && isAdminOrPm;
  const canDelete = (p.status === "draft" && isOwner) || me.role === "admin";
  const canUpload = p.status === "draft" && (isOwner || isAdminOrPm);
  const billable =
    (p.kind === "advance" || p.kind === "payment") &&
    p.contractId != null &&
    p.amount != null &&
    p.amount > 0;

  useEffect(() => {
    fetch(`/api/proposals/${p.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOverNorm(d?.overNorm ?? null))
      .catch(() => {});
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  function loadDocs() {
    fetch(`/api/proposals/${p.id}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDocs(d?.documents ?? []))
      .catch(() => {});
  }

  async function act(fn: () => Promise<Response>, failMsg: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? failMsg, "error");
        return false;
      }
      onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    act(() => fetch(`/api/proposals/${p.id}/submit`, { method: "POST" }), "Trình duyệt thất bại");
  }

  function approve() {
    act(
      () =>
        fetch(`/api/proposals/${p.id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approved", createBill: billable && createBill }),
        }),
      "Duyệt thất bại",
    );
  }

  async function reject() {
    const reason = await appPrompt("Lý do từ chối:");
    if (reason == null || !reason.trim()) return;
    act(
      () =>
        fetch(`/api/proposals/${p.id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "rejected", rejectReason: reason.trim() }),
        }),
      "Từ chối thất bại",
    );
  }

  async function remove() {
    if (!(await appConfirm(`Xoá đề xuất ${p.code}?`, { danger: true }))) return;
    const ok = await act(
      () => fetch(`/api/proposals/${p.id}`, { method: "DELETE" }),
      "Xoá thất bại",
    );
    if (ok) onDeleted();
  }

  async function upload(f: File) {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch(`/api/proposals/${p.id}/documents`, { method: "POST", body: form });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
      return;
    }
    loadDocs();
    onChanged();
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-zinc-400 font-mono">{p.code}</p>
            <h2 className="font-semibold truncate">{p.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="text-zinc-400 hover:text-white shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status]}`}>
            {PROPOSAL_STATUS_LABEL[p.status]}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
            {PROPOSAL_KIND_LABEL[p.kind]}
          </span>
          {p.amount != null && (
            <span className="text-sm font-semibold tabular-nums">{fmtVND(p.amount)}</span>
          )}
        </div>

        <dl className="text-sm space-y-1.5">
          <div className="flex gap-2">
            <dt className="text-zinc-500 w-28 shrink-0">Người đề xuất</dt>
            <dd>{p.requestedByName ?? "—"}</dd>
          </div>
          {p.contractCode && (
            <div className="flex gap-2">
              <dt className="text-zinc-500 w-28 shrink-0">Hợp đồng</dt>
              <dd className="font-mono text-xs mt-0.5">{p.contractCode}</dd>
            </div>
          )}
          {p.materialName && (
            <div className="flex gap-2">
              <dt className="text-zinc-500 w-28 shrink-0">Vật tư</dt>
              <dd>{p.materialName}</dd>
            </div>
          )}
          {p.reason && (
            <div className="flex gap-2">
              <dt className="text-zinc-500 w-28 shrink-0">Lý do</dt>
              <dd className="whitespace-pre-wrap">{p.reason}</dd>
            </div>
          )}
          {p.submittedAt && (
            <div className="flex gap-2">
              <dt className="text-zinc-500 w-28 shrink-0">Ngày trình</dt>
              <dd>{formatDateVN(p.submittedAt)}</dd>
            </div>
          )}
          {p.decidedAt && (
            <div className="flex gap-2">
              <dt className="text-zinc-500 w-28 shrink-0">Quyết định</dt>
              <dd>
                {formatDateVN(p.decidedAt)}
                {p.decidedByName && ` — ${p.decidedByName}`}
              </dd>
            </div>
          )}
          {p.rejectReason && (
            <div className="flex gap-2">
              <dt className="text-zinc-500 w-28 shrink-0">Lý do từ chối</dt>
              <dd className="text-rose-300">{p.rejectReason}</dd>
            </div>
          )}
        </dl>

        {/* Cảnh báo cấp phát vượt định mức (M18) — cảnh báo mềm, không chặn duyệt */}
        {overNorm && (
          <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 text-sm text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Vật tư <strong>{overNorm.resourceLabel}</strong> đang vượt định mức [
              {overNorm.boqCode}]: {Math.round(overNorm.actual)}/{Math.round(overNorm.expected)}{" "}
              {overNorm.unitLabel} (+{Math.round(overNorm.variancePct)}%). Cân nhắc trước khi cấp
              phát thêm.
            </p>
          </div>
        )}

        {/* File đính kèm */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
            Đính kèm ({docs.length})
          </p>
          {docs.length === 0 ? (
            <p className="text-sm text-zinc-500">Chưa có file.</p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/api/proposals/${p.id}/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"
                  >
                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{d.originalName ?? `file-${d.id}`}</span>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {Math.round(d.sizeBytes / 1024)} KB
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {canUpload && (
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg">
              <Paperclip className="w-3.5 h-3.5" /> Thêm file
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {/* Hành động theo trạng thái */}
        {canDecide && billable && (
          <label className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800/60 rounded-lg p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={createBill}
              onChange={(e) => setCreateBill(e.target.checked)}
              className="accent-emerald-500 w-4 h-4"
            />
            Tạo phiếu thanh toán tương ứng (HĐ {p.contractCode}, {fmtVND(p.amount)})
          </label>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {canSubmit && (
            <button
              onClick={submit}
              disabled={busy}
              className="flex items-center gap-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition"
            >
              <Send className="w-4 h-4" /> Trình duyệt
            </button>
          )}
          {canDecide && (
            <>
              <button
                onClick={approve}
                disabled={busy}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                <CheckCircle2 className="w-4 h-4" /> Duyệt
              </button>
              <button
                onClick={reject}
                disabled={busy}
                className="flex items-center gap-2 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                <XCircle className="w-4 h-4" /> Từ chối
              </button>
            </>
          )}
          {canDelete && (
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-2 rounded-lg text-sm text-zinc-300 transition ml-auto"
            >
              <Trash2 className="w-4 h-4" /> Xoá
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
