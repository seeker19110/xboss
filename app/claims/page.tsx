"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Paperclip, Scale } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert, appConfirm, appPrompt } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type ClaimKind = "cost" | "eot";
type ClaimStatus = "notice" | "quantified" | "negotiating" | "settled" | "rejected";

const KIND_LABEL: Record<ClaimKind, string> = { cost: "Chi phí", eot: "Gia hạn (EOT)" };
const STATUS_LABEL: Record<ClaimStatus, string> = {
  notice: "Đã thông báo",
  quantified: "Đã định lượng",
  negotiating: "Đang đàm phán",
  settled: "Đã chốt",
  rejected: "Từ chối",
};
const STATUS_BADGE: Record<ClaimStatus, string> = {
  notice: "bg-zinc-800 text-zinc-300",
  quantified: "bg-sky-900 text-sky-200",
  negotiating: "bg-amber-900 text-amber-200",
  settled: "bg-emerald-900 text-emerald-200",
  rejected: "bg-rose-900 text-rose-200",
};
const OPEN_STATUSES: ClaimStatus[] = ["notice", "quantified", "negotiating"];

type Claim = {
  id: number;
  code: string;
  kind: ClaimKind;
  title: string;
  contractId: number | null;
  contractCode: string | null;
  voId: number | null;
  voCode: string | null;
  noticeDate: string;
  cause: string;
  amountRequested: number | null;
  daysRequested: number | null;
  amountSettled: number | null;
  daysSettled: number | null;
  status: ClaimStatus;
  settlementNote: string | null;
  settledByName: string | null;
  settledAt: string | null;
  createdByName: string | null;
  createdAt: string;
  documentCount: number;
};

type Contract = { id: number; code: string; title: string; kind: string };

function fmtVND(n: number | null) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

export default function ClaimsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Claim[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<ClaimKind | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdminOrPm = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/claims").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, c]) => {
        if (!meData) return;
        setMe(meData);
        setItems(c?.items ?? []);
        if (meData.role === "admin" || meData.role === "pm") {
          fetch("/api/contracts")
            .then((r) => (r.ok ? r.json() : null))
            .then((cr) => setContracts(cr?.contracts ?? []));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const c = await load();
    setItems(c?.items ?? []);
  }

  const filtered = useMemo(
    () => (kindFilter === "all" ? items : items.filter((c) => c.kind === kindFilter)),
    [items, kindFilter],
  );

  const kpi = useMemo(() => {
    const cost = items.filter((c) => c.kind === "cost" && OPEN_STATUSES.includes(c.status));
    const eot = items.filter((c) => c.kind === "eot" && OPEN_STATUSES.includes(c.status));
    return {
      costCount: cost.length,
      costAmount: cost.reduce((s, c) => s + (c.amountRequested ?? 0), 0),
      eotCount: eot.length,
      eotDays: eot.reduce((s, c) => s + (c.daysRequested ?? 0), 0),
    };
  }, [items]);

  const selected = items.find((c) => c.id === selectedId) ?? null;

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Claim chi phí & EOT"
        subtitle="Claim chi phí & gia hạn thời gian ngoài hợp đồng gốc"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm claim"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm claim</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Claim chi phí đang mở</p>
            <p className="text-lg font-semibold mt-1">
              {kpi.costCount} — {fmtVND(kpi.costAmount)}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wide">Claim EOT đang mở</p>
            <p className="text-lg font-semibold mt-1">
              {kpi.eotCount} — {kpi.eotDays} ngày
            </p>
          </div>
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Lọc theo loại claim">
          {(
            [
              ["all", "Tất cả"],
              ["cost", "Chi phí"],
              ["eot", "EOT"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setKindFilter(key)}
              aria-pressed={kindFilter === key}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                kindFilter === key
                  ? "bg-emerald-700 text-on-accent"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="Chưa có claim nào"
            message={canManage ? 'Bấm "Thêm claim" để bắt đầu.' : "Chưa có dữ liệu claim."}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng claim">
              <table className="w-full text-sm sm:min-w-[760px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">MÃ</th>
                    <th className="text-left p-3">LOẠI</th>
                    <th className="text-left p-3">TIÊU ĐỀ</th>
                    <th className="text-left p-3 hidden sm:table-cell">HĐ</th>
                    <th className="text-left p-3 hidden sm:table-cell">NGÀY THÔNG BÁO</th>
                    <th className="text-right p-3">GIÁ TRỊ / NGÀY</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                    >
                      <td className="p-3 font-mono text-xs">{c.code}</td>
                      <td className="p-3 text-xs text-zinc-300">{KIND_LABEL[c.kind]}</td>
                      <td className="p-3">
                        <p className="truncate max-w-[220px]">{c.title}</p>
                      </td>
                      <td className="p-3 hidden sm:table-cell text-xs text-zinc-400">
                        {c.contractCode ?? "—"}
                      </td>
                      <td className="p-3 hidden sm:table-cell text-xs text-zinc-400">
                        {c.noticeDate}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {c.kind === "cost"
                          ? fmtVND(c.amountSettled ?? c.amountRequested)
                          : `${c.daysSettled ?? c.daysRequested ?? 0} ngày`}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[c.status]}`}
                        >
                          {STATUS_LABEL[c.status]}
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
        <ClaimDetailModal
          claim={selected}
          me={me}
          isAdminOrPm={isAdminOrPm}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      )}
      {addOpen && (
        <AddClaimModal
          contracts={contracts}
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

function AddClaimModal({
  contracts,
  onClose,
  onCreated,
}: {
  contracts: Contract[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<ClaimKind>("cost");
  const [title, setTitle] = useState("");
  const [contractId, setContractId] = useState<number | "">("");
  const [noticeDate, setNoticeDate] = useState("");
  const [cause, setCause] = useState("");
  const [amountRequested, setAmountRequested] = useState("");
  const [daysRequested, setDaysRequested] = useState("");
  const [suggestion, setSuggestion] = useState<{
    suggestedDays: number;
    waitingFloors: number;
  } | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (kind !== "eot") return;
    fetch("/api/claims/eot-suggestion")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSuggestion(j ?? null))
      .catch(() => setSuggestion(null));
  }, [kind]);

  const canSubmit =
    title.trim() &&
    noticeDate.trim() &&
    cause.trim() &&
    (kind === "cost" ? Number(amountRequested) > 0 : Number(daysRequested) > 0);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          contractId: contractId || null,
          noticeDate,
          cause: cause.trim(),
          amountRequested: kind === "cost" ? Number(amountRequested) || 0 : null,
          daysRequested: kind === "eot" ? Number(daysRequested) || 0 : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được claim");
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
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm claim</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Chọn loại claim">
          {(["cost", "eot"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                kind === k
                  ? "bg-emerald-700 text-on-accent"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <label className="text-xs text-zinc-400 block">
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày thông báo
            <input
              type="date"
              value={noticeDate}
              onChange={(e) => setNoticeDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hợp đồng (tuỳ chọn)
            <select
              value={contractId}
              onChange={(e) => setContractId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Không gắn —</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Nguyên nhân
          <textarea
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {kind === "cost" ? (
          <label className="text-xs text-zinc-400 block">
            Giá trị đề xuất (đ)
            <input
              type="number"
              value={amountRequested}
              onChange={(e) => setAmountRequested(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 block">
              Số ngày đề xuất
              <input
                type="number"
                value={daysRequested}
                onChange={(e) => setDaysRequested(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            {suggestion && suggestion.waitingFloors > 0 && (
              <p className="text-xs text-amber-300">
                Gợi ý: {suggestion.suggestedDays} ngày chờ mặt bằng luỹ kế (
                {suggestion.waitingFloors} tầng đang chờ) —{" "}
                <button
                  onClick={() => setDaysRequested(String(suggestion.suggestedDays))}
                  className="underline hover:no-underline"
                >
                  dùng số này
                </button>
              </p>
            )}
          </div>
        )}

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo claim"}
        </button>
      </div>
    </Modal>
  );
}

type ClaimDocument = {
  id: number;
  title: string | null;
  originalName: string | null;
  uploadedBy: number | null;
};

function ClaimDetailModal({
  claim,
  me,
  isAdminOrPm,
  onClose,
  onSaved,
}: {
  claim: Claim;
  me: Me | null;
  isAdminOrPm: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"info" | "documents">("info");
  const [documents, setDocuments] = useState<ClaimDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOpen = OPEN_STATUSES.includes(claim.status);

  function loadDocs() {
    fetch(`/api/claims/${claim.id}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDocuments(j?.documents ?? []));
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim.id]);

  async function settle() {
    const amount =
      claim.kind === "cost"
        ? await appPrompt(`Giá trị chốt (đ) cho ${claim.code}`, String(claim.amountRequested ?? ""))
        : null;
    if (claim.kind === "cost" && amount == null) return;
    const days =
      claim.kind === "eot"
        ? await appPrompt(`Số ngày chốt cho ${claim.code}`, String(claim.daysRequested ?? ""))
        : null;
    if (claim.kind === "eot" && days == null) return;
    const note = await appPrompt(`Ghi chú chốt claim ${claim.code} (tuỳ chọn)`);
    if (note == null) return;

    setBusy(true);
    const res = await fetch(`/api/claims/${claim.id}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountSettled: amount ? Number(amount) : null,
        daysSettled: days ? Number(days) : null,
        settlementNote: note || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Chốt claim thất bại", "error");
      return;
    }
    showToast(`Đã chốt claim ${claim.code}`, "success");
    onSaved();
    onClose();
  }

  async function reject() {
    const note = await appPrompt(`Lý do từ chối claim ${claim.code}`);
    if (!note?.trim()) return;
    if (!(await appConfirm(`Từ chối claim ${claim.code}?`, { danger: true }))) return;

    setBusy(true);
    const res = await fetch(`/api/claims/${claim.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settlementNote: note.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Từ chối thất bại", "error");
      return;
    }
    onSaved();
    onClose();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/claims/${claim.id}/documents`, { method: "POST", body: form });
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
    if (!(await appConfirm("Xoá hồ sơ này?", { danger: true, confirmLabel: "Xoá" }))) return;
    const res = await fetch(`/api/claim-documents/${id}`, { method: "DELETE" });
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
            <h2 className="font-semibold font-mono text-sm">{claim.code}</h2>
            <p className="text-sm text-zinc-300">{claim.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[claim.status]}`}
            >
              {STATUS_LABEL[claim.status]}
            </span>
            <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-zinc-800 text-sm" role="tablist">
          {(
            [
              ["info", "Thông tin"],
              ["documents", "Hồ sơ"],
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
              <div>Loại: {KIND_LABEL[claim.kind]}</div>
              <div>Hợp đồng: {claim.contractCode ?? "—"}</div>
              <div>Phát sinh/VO liên quan: {claim.voCode ?? "—"}</div>
              <div>Ngày thông báo: {claim.noticeDate}</div>
              <div>Nguyên nhân: {claim.cause}</div>
              <div>
                {claim.kind === "cost"
                  ? `Giá trị đề xuất: ${fmtVND(claim.amountRequested)}`
                  : `Số ngày đề xuất: ${claim.daysRequested ?? "—"}`}
              </div>
              {claim.status === "settled" && (
                <div>
                  {claim.kind === "cost"
                    ? `Giá trị chốt: ${fmtVND(claim.amountSettled)}`
                    : `Số ngày chốt: ${claim.daysSettled ?? "—"}`}
                </div>
              )}
              {claim.settlementNote && <div>Ghi chú: {claim.settlementNote}</div>}
              <div>Người tạo: {claim.createdByName ?? "—"}</div>
              {claim.settledByName && <div>Người xử lý: {claim.settledByName}</div>}
            </dl>

            {isOpen && isAdminOrPm && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={settle}
                  disabled={busy}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Chốt
                </button>
                <button
                  onClick={reject}
                  disabled={busy}
                  className="bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-on-accent text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Từ chối
                </button>
              </div>
            )}
            {!isOpen && (
              <p className="text-xs text-zinc-500">Claim đã có quyết định — không thể sửa thêm.</p>
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
                      href={`/api/claim-documents/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-0 truncate text-sky-300 hover:underline"
                    >
                      {d.title || d.originalName || "File"}
                    </a>
                    {(d.uploadedBy === me?.id || isAdminOrPm) && (
                      <button
                        onClick={() => deleteFile(d.id)}
                        aria-label={`Xoá hồ sơ ${d.title ?? d.originalName ?? d.id}`}
                        className="text-zinc-500 hover:text-rose-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="Chưa có hồ sơ đính kèm nào." compact />
            )}
            {isOpen && (
              <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg">
                <Paperclip className="w-4 h-4" />
                {uploading ? "Đang tải lên…" : "Tải hồ sơ lên"}
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
