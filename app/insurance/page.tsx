"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  X,
  Umbrella,
  Paperclip,
  Trash2,
  Pencil,
  AlertTriangle,
  Upload,
  FileSignature,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";

type InsuranceKind =
  | "car"
  | "tnbt"
  | "tai_nan_ld"
  | "bao_lanh_thuc_hien"
  | "bao_lanh_tam_ung"
  | "bao_lanh_bao_hanh"
  | "khac";
const KIND_LABEL: Record<InsuranceKind, string> = {
  car: "Bảo hiểm công trình (CAR)",
  tnbt: "Bảo hiểm trách nhiệm bên thứ ba",
  tai_nan_ld: "Bảo hiểm tai nạn lao động",
  bao_lanh_thuc_hien: "Bảo lãnh thực hiện HĐ",
  bao_lanh_tam_ung: "Bảo lãnh tạm ứng",
  bao_lanh_bao_hanh: "Bảo lãnh bảo hành",
  khac: "Khác",
};
const INSURANCE_KINDS: InsuranceKind[] = ["car", "tnbt", "tai_nan_ld"];
const BOND_KINDS: InsuranceKind[] = ["bao_lanh_thuc_hien", "bao_lanh_tam_ung", "bao_lanh_bao_hanh"];

type InsuranceStatus = "valid" | "expired" | "released";
const STATUS_LABEL: Record<InsuranceStatus, string> = {
  valid: "Còn hiệu lực",
  expired: "Hết hạn",
  released: "Đã tất toán/thu hồi",
};
const STATUS_BADGE: Record<InsuranceStatus, string> = {
  valid: "bg-emerald-900/40 text-emerald-300",
  expired: "bg-rose-900/40 text-rose-300",
  released: "bg-zinc-800 text-zinc-400",
};

const EXPIRY_WARN_DAYS = 30;

type InsuranceBond = {
  id: number;
  contractId: number | null;
  contractTitle: string | null;
  contractCode: string | null;
  kind: InsuranceKind;
  title: string;
  provider: string | null;
  code: string | null;
  value: number | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: InsuranceStatus;
  note: string | null;
  fileName: string | null;
  originalName: string | null;
};

type Contract = { id: number; code: string; title: string };

function fmtVND(n: number | null) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

function isExpiringSoon(b: InsuranceBond): boolean {
  if (b.status !== "valid" || !b.expiryDate) return false;
  const limit = new Date(Date.now() + EXPIRY_WARN_DAYS * 86400_000).toISOString().slice(0, 10);
  return b.expiryDate <= limit;
}
function isExpired(b: InsuranceBond): boolean {
  return b.status === "valid" && !!b.expiryDate && b.expiryDate < todayISO();
}

export default function InsurancePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [bonds, setBonds] = useState<InsuranceBond[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<InsuranceKind | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editBond, setEditBond] = useState<InsuranceBond | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/insurance-bonds").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, bondsRes]) => {
        if (!meData) return;
        setMe(meData);
        setBonds(bondsRes?.bonds ?? []);
        if (meData.role === "admin" || meData.role === "pm") {
          fetch("/api/contracts")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setContracts(j?.contracts ?? []));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const bondsRes = await load();
    setBonds(bondsRes?.bonds ?? []);
  }

  const filtered = useMemo(
    () => (kindFilter === "all" ? bonds : bonds.filter((b) => b.kind === kindFilter)),
    [bonds, kindFilter],
  );

  const expiringCount = useMemo(() => bonds.filter((b) => isExpiringSoon(b)).length, [bonds]);
  const totalBondValue = useMemo(
    () =>
      bonds
        .filter((b) => BOND_KINDS.includes(b.kind) && b.status === "valid")
        .reduce((s, b) => s + (b.value ?? 0), 0),
    [bonds],
  );

  const insuranceRows = filtered.filter((b) => INSURANCE_KINDS.includes(b.kind));
  const bondRows = filtered.filter((b) => BOND_KINDS.includes(b.kind));
  const otherRows = filtered.filter((b) => b.kind === "khac");

  async function deleteBond(id: number) {
    if (!(await appConfirm("Xoá bảo hiểm/bảo lãnh này? Không thể hoàn tác.", { danger: true })))
      return;
    const res = await fetch(`/api/insurance-bonds/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Bảo hiểm & Bảo lãnh"
        subtitle="Sổ theo dõi bảo hiểm công trình, trách nhiệm bên thứ ba, tai nạn LĐ & bảo lãnh thực hiện/tạm ứng/bảo hành"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm bảo hiểm/bảo lãnh"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" />{" "}
              <span className="hidden sm:inline">Thêm bảo hiểm/bảo lãnh</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${expiringCount > 0 ? "text-amber-400" : ""}`}>
              {expiringCount}
            </p>
            <p className="text-xs text-zinc-400">Sắp/đã hết hiệu lực</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{fmtVND(totalBondValue)}</p>
            <p className="text-xs text-zinc-400">Tổng giá trị bảo lãnh đang hiệu lực</p>
          </div>
        </div>

        <label className="text-xs text-zinc-400 block w-fit">
          Lọc theo loại
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as InsuranceKind | "all")}
            className="mt-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="all">Tất cả</option>
            {(Object.keys(KIND_LABEL) as InsuranceKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        {bonds.length === 0 ? (
          <EmptyState
            icon={Umbrella}
            title="Chưa có bảo hiểm/bảo lãnh"
            message="Bấm “Thêm bảo hiểm/bảo lãnh” để thêm hồ sơ đầu tiên."
          />
        ) : (
          <>
            <InsuranceTable
              title="Bảo hiểm"
              rows={insuranceRows}
              canManage={canManage}
              onEdit={setEditBond}
              onDelete={deleteBond}
            />
            <InsuranceTable
              title="Bảo lãnh"
              rows={bondRows}
              canManage={canManage}
              onEdit={setEditBond}
              onDelete={deleteBond}
            />
            {otherRows.length > 0 && (
              <InsuranceTable
                title="Khác"
                rows={otherRows}
                canManage={canManage}
                onEdit={setEditBond}
                onDelete={deleteBond}
              />
            )}
          </>
        )}
      </main>

      {(addOpen || editBond) && (
        <InsuranceModal
          bond={editBond}
          contracts={contracts}
          onClose={() => {
            setAddOpen(false);
            setEditBond(null);
          }}
          onSaved={() => {
            setAddOpen(false);
            setEditBond(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function InsuranceTable({
  title,
  rows,
  canManage,
  onEdit,
  onDelete,
}: {
  title: string;
  rows: InsuranceBond[];
  canManage: boolean;
  onEdit: (b: InsuranceBond) => void;
  onDelete: (id: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <h2 className="px-3 pt-3 text-sm font-semibold text-zinc-300">{title}</h2>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={title}>
        <table className="w-full text-sm sm:min-w-[820px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3">LOẠI</th>
              <th className="text-left p-3">TÊN / SỐ</th>
              <th className="text-left p-3">BÊN PHÁT HÀNH</th>
              <th className="text-left p-3">HĐ GẮN</th>
              <th className="text-left p-3">GIÁ TRỊ</th>
              <th className="text-left p-3">HIỆU LỰC</th>
              <th className="text-left p-3">TRẠNG THÁI</th>
              <th className="text-left p-3">FILE</th>
              <th className="text-left p-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const expiringSoon = isExpiringSoon(b);
              const expired = isExpired(b);
              return (
                <tr key={b.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-3 text-xs text-zinc-400">{KIND_LABEL[b.kind]}</td>
                  <td className="p-3">
                    <p className="truncate max-w-[220px]">{b.title}</p>
                    {b.code && <p className="text-xs text-zinc-500">{b.code}</p>}
                  </td>
                  <td className="p-3 text-xs text-zinc-400">{b.provider ?? "—"}</td>
                  <td className="p-3 text-xs">
                    {b.contractId ? (
                      <Link
                        href={`/contracts`}
                        className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                      >
                        <FileSignature className="w-3.5 h-3.5" />
                        {b.contractCode ?? b.contractTitle}
                      </Link>
                    ) : (
                      <span className="text-zinc-500">Toàn dự án</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">{fmtVND(b.value)}</td>
                  <td className="p-3 text-xs">
                    {b.expiryDate ? (
                      <span
                        className={
                          expired
                            ? "text-rose-400 font-medium"
                            : expiringSoon
                              ? "text-amber-400 font-medium"
                              : "text-zinc-400"
                        }
                      >
                        {(expired || expiringSoon) && (
                          <AlertTriangle className="w-3 h-3 inline mr-1" />
                        )}
                        {formatDateVN(b.expiryDate)}
                      </span>
                    ) : (
                      <span className="text-zinc-500">Không hạn</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[b.status]}`}
                    >
                      {STATUS_LABEL[b.status]}
                    </span>
                  </td>
                  <td className="p-3">
                    {b.fileName ? (
                      <a
                        href={`/api/insurance-bonds/${b.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Xem file đính kèm"
                        className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                      >
                        <Paperclip className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs truncate max-w-[100px]">
                          {b.originalName ?? "File"}
                        </span>
                      </a>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onEdit(b)}
                          aria-label="Sửa"
                          className="text-zinc-400 hover:text-white"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(b.id)}
                          aria-label="Xoá"
                          className="text-zinc-400 hover:text-rose-400"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InsuranceModal({
  bond,
  contracts,
  onClose,
  onSaved,
}: {
  bond: InsuranceBond | null;
  contracts: Contract[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<InsuranceKind>(bond?.kind ?? "car");
  const [title, setTitle] = useState(bond?.title ?? "");
  const [provider, setProvider] = useState(bond?.provider ?? "");
  const [code, setCode] = useState(bond?.code ?? "");
  const [contractId, setContractId] = useState<number | "">(bond?.contractId ?? "");
  const [value, setValue] = useState(bond?.value != null ? String(bond.value) : "");
  const [issuedDate, setIssuedDate] = useState(bond?.issuedDate ?? "");
  const [expiryDate, setExpiryDate] = useState(bond?.expiryDate ?? "");
  const [status, setStatus] = useState<InsuranceStatus>(bond?.status ?? "valid");
  const [note, setNote] = useState(bond?.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        kind,
        title: title.trim(),
        provider: provider.trim() || null,
        code: code.trim() || null,
        contractId: contractId === "" ? null : contractId,
        value: value.trim() === "" ? null : Number(value),
        issuedDate: issuedDate || null,
        expiryDate: expiryDate || null,
        status,
        note: note.trim() || null,
      };

      let id = bond?.id;
      if (!id) {
        const res = await fetch("/api/insurance-bonds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setErr(j?.error ?? "Không tạo được bảo hiểm/bảo lãnh");
          return;
        }
        id = j.id;
      } else if (!file) {
        const res = await fetch(`/api/insurance-bonds/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          setErr((await res.json().catch(() => null))?.error ?? "Không sửa được");
          return;
        }
      }

      if (file && id) {
        const form = new FormData();
        for (const [k, v] of Object.entries(payload)) if (v != null) form.append(k, String(v));
        form.append("file", file);
        const res = await fetch(`/api/insurance-bonds/${id}`, { method: "PATCH", body: form });
        if (!res.ok) {
          setErr((await res.json().catch(() => null))?.error ?? "Không lưu được file");
          return;
        }
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
          <h2 className="font-semibold">
            {bond ? "Sửa bảo hiểm/bảo lãnh" : "Thêm bảo hiểm/bảo lãnh"}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Loại
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as InsuranceKind)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(KIND_LABEL) as InsuranceKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Tên
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Bên phát hành
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Hợp đồng gắn
          <select
            value={contractId}
            onChange={(e) => setContractId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Toàn dự án (không gắn HĐ) —</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Giá trị (đ)
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày cấp
            <input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Ngày hết hạn
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as InsuranceStatus)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(STATUS_LABEL) as InsuranceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Ghi chú
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Upload className="w-4 h-4" />
          {file
            ? file.name
            : bond?.originalName
              ? "Thay chứng thư đính kèm"
              : "Chọn chứng thư (PDF/ảnh)"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
