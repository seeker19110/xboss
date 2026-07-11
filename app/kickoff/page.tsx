"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Landmark,
  FileText,
  Paperclip,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Upload,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";

type LegalKind = "giay_phep_xd" | "phe_duyet_qh" | "phe_duyet_tk" | "hd_chinh" | "khac";
const LEGAL_KIND_LABEL: Record<LegalKind, string> = {
  giay_phep_xd: "Giấy phép xây dựng",
  phe_duyet_qh: "Phê duyệt quy hoạch",
  phe_duyet_tk: "Phê duyệt thiết kế",
  hd_chinh: "Hợp đồng chính",
  khac: "Khác",
};

type LegalStatus = "draft" | "valid" | "expired" | "superseded";
const LEGAL_STATUS_LABEL: Record<LegalStatus, string> = {
  draft: "Nháp",
  valid: "Còn hiệu lực",
  expired: "Hết hạn",
  superseded: "Đã thay thế",
};
const LEGAL_STATUS_BADGE: Record<LegalStatus, string> = {
  draft: "bg-zinc-800 text-zinc-400",
  valid: "bg-emerald-900 text-emerald-200",
  expired: "bg-rose-900 text-rose-200",
  superseded: "bg-zinc-800 text-zinc-500",
};

const EXPIRY_WARN_DAYS = 30;

type LegalDocument = {
  id: number;
  kind: LegalKind;
  code: string | null;
  title: string;
  issuedBy: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: LegalStatus;
  note: string | null;
  fileName: string | null;
  originalName: string | null;
};

type MobCategory = "mat_bang" | "khao_sat" | "trac_dac" | "huy_dong" | "khac";
const MOB_CATEGORY_LABEL: Record<MobCategory, string> = {
  mat_bang: "Bàn giao mặt bằng",
  khao_sat: "Khảo sát",
  trac_dac: "Trắc đạc & mốc chuẩn",
  huy_dong: "Huy động công trường",
  khac: "Khác",
};

type MobStatus = "pending" | "in_progress" | "done";
const MOB_STATUS_LABEL: Record<MobStatus, string> = {
  pending: "Chưa làm",
  in_progress: "Đang làm",
  done: "Hoàn thành",
};
const MOB_STATUS_BADGE: Record<MobStatus, string> = {
  pending: "bg-zinc-800 text-zinc-400",
  in_progress: "bg-sky-900 text-sky-200",
  done: "bg-emerald-900 text-emerald-200",
};

type MobilizationItem = {
  id: number;
  category: MobCategory;
  title: string;
  status: MobStatus;
  dueDate: string | null;
  doneDate: string | null;
  assignee: number | null;
  assigneeName: string | null;
  note: string | null;
};

type Tab = "legal" | MobCategory;
const TABS: { key: Tab; label: string; icon: typeof Landmark }[] = [
  { key: "legal", label: "Pháp lý", icon: FileText },
  { key: "mat_bang", label: "Bàn giao mặt bằng", icon: Landmark },
  { key: "khao_sat", label: "Khảo sát", icon: Landmark },
  { key: "trac_dac", label: "Trắc đạc", icon: Landmark },
  { key: "huy_dong", label: "Huy động", icon: Landmark },
];

function isExpiringSoon(d: LegalDocument): boolean {
  if (d.status !== "valid" || !d.expiryDate) return false;
  const limit = new Date(Date.now() + EXPIRY_WARN_DAYS * 86400_000).toISOString().slice(0, 10);
  return d.expiryDate <= limit;
}
function isExpired(d: LegalDocument): boolean {
  return d.status === "valid" && !!d.expiryDate && d.expiryDate < todayISO();
}

export default function KickoffPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [legalDocs, setLegalDocs] = useState<LegalDocument[]>([]);
  const [mobItems, setMobItems] = useState<MobilizationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("legal");
  const [addLegalOpen, setAddLegalOpen] = useState(false);
  const [editLegal, setEditLegal] = useState<LegalDocument | null>(null);
  const [addMobOpen, setAddMobOpen] = useState(false);
  const [editMob, setEditMob] = useState<MobilizationItem | null>(null);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);

  const canManage = me?.role === "admin" || me?.role === "pm";

  function load() {
    return Promise.all([
      fetch("/api/legal-documents").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/mobilization").then((r) => (r.ok ? r.json() : null)),
    ]);
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, [legalRes, mobRes]]) => {
        if (!meData) return;
        setMe(meData);
        setLegalDocs(legalRes?.documents ?? []);
        setMobItems(mobRes?.items ?? []);
        if (meData.role === "admin" || meData.role === "pm") {
          fetch("/api/users")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setUsers(j?.users ?? []));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const [legalRes, mobRes] = await load();
    setLegalDocs(legalRes?.documents ?? []);
    setMobItems(mobRes?.items ?? []);
  }

  const readiness = useMemo(() => {
    const total = mobItems.length;
    const done = mobItems.filter((m) => m.status === "done").length;
    return { total, done, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [mobItems]);

  const expiringCount = useMemo(
    () => legalDocs.filter((d) => isExpiringSoon(d)).length,
    [legalDocs],
  );

  async function deleteLegal(id: number) {
    if (!(await appConfirm("Xoá hồ sơ pháp lý này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/legal-documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  async function deleteMob(id: number) {
    if (!(await appConfirm("Xoá hạng mục này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/mobilization/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  async function toggleMobDone(item: MobilizationItem) {
    const nextStatus: MobStatus = item.status === "done" ? "pending" : "done";
    const res = await fetch(`/api/mobilization/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  const mobFiltered = tab === "legal" ? [] : mobItems.filter((m) => m.category === tab);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Khởi động & Pháp lý"
        subtitle="Hồ sơ pháp lý, bàn giao mặt bằng, khảo sát, trắc đạc & huy động công trường"
        bottomActions={
          canManage ? (
            <div className="flex items-center gap-2">
              {tab === "legal" ? (
                <button
                  onClick={() => setAddLegalOpen(true)}
                  aria-label="Thêm hồ sơ"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm hồ sơ</span>
                </button>
              ) : (
                <button
                  onClick={() => setAddMobOpen(true)}
                  aria-label="Thêm hạng mục"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm hạng mục</span>
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{readiness.percent}%</p>
            <p className="text-xs text-zinc-400">
              Sẵn sàng huy động ({readiness.done}/{readiness.total})
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${expiringCount > 0 ? "text-amber-400" : ""}`}>
              {expiringCount}
            </p>
            <p className="text-xs text-zinc-400">Giấy phép sắp/đã hết hạn</p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Nhóm khởi động & pháp lý"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                tab === t.key
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}{" "}
              {t.key === "legal"
                ? `(${legalDocs.length})`
                : `(${mobItems.filter((m) => m.category === t.key).length})`}
            </button>
          ))}
        </div>

        {tab === "legal" ? (
          legalDocs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Chưa có hồ sơ pháp lý"
              message="Bấm “Thêm hồ sơ” để thêm giấy phép/phê duyệt/HĐ chính."
            />
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Hồ sơ pháp lý"
              >
                <table className="w-full text-sm sm:min-w-[720px]">
                  <thead>
                    <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                      <th className="text-left p-3">LOẠI</th>
                      <th className="text-left p-3">TÊN / SỐ</th>
                      <th className="text-left p-3">HẠN</th>
                      <th className="text-left p-3">TRẠNG THÁI</th>
                      <th className="text-left p-3">FILE</th>
                      <th className="text-left p-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {legalDocs.map((d) => {
                      const expiringSoon = isExpiringSoon(d);
                      const expired = isExpired(d);
                      return (
                        <tr key={d.id} className="border-b border-zinc-800/60 last:border-0">
                          <td className="p-3 text-xs text-zinc-400">{LEGAL_KIND_LABEL[d.kind]}</td>
                          <td className="p-3">
                            <p className="truncate max-w-[240px]">{d.title}</p>
                            {d.code && <p className="text-xs text-zinc-500">{d.code}</p>}
                          </td>
                          <td className="p-3 text-xs">
                            {d.expiryDate ? (
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
                                {formatDateVN(d.expiryDate)}
                              </span>
                            ) : (
                              <span className="text-zinc-500">Không hạn</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LEGAL_STATUS_BADGE[d.status]}`}
                            >
                              {LEGAL_STATUS_LABEL[d.status]}
                            </span>
                          </td>
                          <td className="p-3">
                            {d.fileName ? (
                              <a
                                href={`/api/legal-documents/${d.id}/file`}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Xem file đính kèm"
                                className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-4 h-4" />
                                <span className="hidden sm:inline text-xs truncate max-w-[120px]">
                                  {d.originalName ?? "File"}
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
                                  onClick={() => setEditLegal(d)}
                                  aria-label="Sửa hồ sơ"
                                  className="text-zinc-400 hover:text-white"
                                  title="Sửa"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteLegal(d.id)}
                                  aria-label="Xoá hồ sơ"
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
          )
        ) : mobFiltered.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Chưa có hạng mục"
            message="Bấm “Thêm hạng mục” để thêm việc cần làm."
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Checklist huy động"
            >
              <table className="w-full text-sm sm:min-w-[640px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3 w-10"></th>
                    <th className="text-left p-3">HẠNG MỤC</th>
                    <th className="text-left p-3">NGƯỜI PHỤ TRÁCH</th>
                    <th className="text-left p-3">HẠN</th>
                    <th className="text-left p-3">TRẠNG THÁI</th>
                    <th className="text-left p-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {mobFiltered.map((m) => {
                    const overdue =
                      m.status !== "done" && m.dueDate != null && m.dueDate < todayISO();
                    return (
                      <tr key={m.id} className="border-b border-zinc-800/60 last:border-0">
                        <td className="p-3">
                          {canManage && (
                            <button
                              onClick={() => toggleMobDone(m)}
                              aria-label={
                                m.status === "done"
                                  ? "Bỏ đánh dấu hoàn thành"
                                  : "Đánh dấu hoàn thành"
                              }
                              title={m.status === "done" ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}
                              className={
                                m.status === "done"
                                  ? "text-emerald-400"
                                  : "text-zinc-500 hover:text-white"
                              }
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                          )}
                        </td>
                        <td className="p-3">
                          <p className="truncate max-w-[240px]">{m.title}</p>
                          {m.note && (
                            <p className="text-xs text-zinc-500 truncate max-w-[240px]">{m.note}</p>
                          )}
                        </td>
                        <td className="p-3 text-xs text-zinc-400">{m.assigneeName ?? "—"}</td>
                        <td className="p-3 text-xs">
                          {m.dueDate ? (
                            <span
                              className={overdue ? "text-rose-400 font-medium" : "text-zinc-400"}
                            >
                              {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                              {formatDateVN(m.dueDate)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${MOB_STATUS_BADGE[m.status]}`}
                          >
                            {MOB_STATUS_LABEL[m.status]}
                          </span>
                        </td>
                        <td className="p-3">
                          {canManage && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditMob(m)}
                                aria-label="Sửa hạng mục"
                                className="text-zinc-400 hover:text-white"
                                title="Sửa"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteMob(m.id)}
                                aria-label="Xoá hạng mục"
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
        )}
      </main>

      {(addLegalOpen || editLegal) && (
        <LegalModal
          doc={editLegal}
          onClose={() => {
            setAddLegalOpen(false);
            setEditLegal(null);
          }}
          onSaved={() => {
            setAddLegalOpen(false);
            setEditLegal(null);
            refresh();
          }}
        />
      )}

      {(addMobOpen || editMob) && (
        <MobilizationModal
          item={editMob}
          defaultCategory={tab === "legal" ? "mat_bang" : tab}
          users={users}
          onClose={() => {
            setAddMobOpen(false);
            setEditMob(null);
          }}
          onSaved={() => {
            setAddMobOpen(false);
            setEditMob(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function LegalModal({
  doc,
  onClose,
  onSaved,
}: {
  doc: LegalDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<LegalKind>(doc?.kind ?? "giay_phep_xd");
  const [code, setCode] = useState(doc?.code ?? "");
  const [title, setTitle] = useState(doc?.title ?? "");
  const [issuedBy, setIssuedBy] = useState(doc?.issuedBy ?? "");
  const [issuedDate, setIssuedDate] = useState(doc?.issuedDate ?? "");
  const [expiryDate, setExpiryDate] = useState(doc?.expiryDate ?? "");
  const [status, setStatus] = useState<LegalStatus>(doc?.status ?? "valid");
  const [note, setNote] = useState(doc?.note ?? "");
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
        code: code.trim() || null,
        title: title.trim(),
        issuedBy: issuedBy.trim() || null,
        issuedDate: issuedDate || null,
        expiryDate: expiryDate || null,
        status,
        note: note.trim() || null,
      };

      let id = doc?.id;
      if (!id) {
        const res = await fetch("/api/legal-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          setErr(j?.error ?? "Không tạo được hồ sơ");
          return;
        }
        id = j.id;
      } else if (!file) {
        const res = await fetch(`/api/legal-documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          setErr((await res.json().catch(() => null))?.error ?? "Không sửa được hồ sơ");
          return;
        }
      }

      if (file && id) {
        const form = new FormData();
        for (const [k, v] of Object.entries(payload)) if (v != null) form.append(k, String(v));
        form.append("file", file);
        const res = await fetch(`/api/legal-documents/${id}`, { method: "PATCH", body: form });
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
          <h2 className="font-semibold">{doc ? "Sửa hồ sơ pháp lý" : "Thêm hồ sơ pháp lý"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Loại
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LegalKind)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(LEGAL_KIND_LABEL) as LegalKind[]).map((k) => (
              <option key={k} value={k}>
                {LEGAL_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Tên hồ sơ
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Số hồ sơ
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Nơi cấp
            <input
              value={issuedBy}
              onChange={(e) => setIssuedBy(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

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
            onChange={(e) => setStatus(e.target.value as LegalStatus)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(LEGAL_STATUS_LABEL) as LegalStatus[]).map((s) => (
              <option key={s} value={s}>
                {LEGAL_STATUS_LABEL[s]}
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
          {file ? file.name : doc?.originalName ? "Thay file đính kèm" : "Chọn file (PDF/ảnh)"}
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
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

function MobilizationModal({
  item,
  defaultCategory,
  users,
  onClose,
  onSaved,
}: {
  item: MobilizationItem | null;
  defaultCategory: MobCategory;
  users: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<MobCategory>(item?.category ?? defaultCategory);
  const [title, setTitle] = useState(item?.title ?? "");
  const [status, setStatus] = useState<MobStatus>(item?.status ?? "pending");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [assignee, setAssignee] = useState<number | "">(item?.assignee ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        category,
        title: title.trim(),
        status,
        dueDate: dueDate || null,
        assignee: assignee === "" ? null : assignee,
        note: note.trim() || null,
      };
      const url = item ? `/api/mobilization/${item.id}` : "/api/mobilization";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được hạng mục");
        return;
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
          <h2 className="font-semibold">{item ? "Sửa hạng mục" : "Thêm hạng mục"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Nhóm
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MobCategory)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(MOB_CATEGORY_LABEL) as MobCategory[]).map((c) => (
              <option key={c} value={c}>
                {MOB_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Tên hạng mục
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Hạn hoàn thành
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Trạng thái
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as MobStatus)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(MOB_STATUS_LABEL) as MobStatus[]).map((s) => (
                <option key={s} value={s}>
                  {MOB_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Người phụ trách
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Chưa gán —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
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

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
