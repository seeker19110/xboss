"use client";
import { useEffect, useState } from "react";
import { HardHat, X, Star, Upload, Paperclip, Trash2, Plus, FileText, Wallet } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

function fmtVND(n: number) {
  if (!n) return "0 đ";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

// ===== Kiểu dữ liệu (client) — mirror lib/subcontractors.ts =====

type Discipline = {
  disciplineId: number;
  disciplineCode: string;
  disciplineName: string;
  zone: string | null;
  floorLabels: string[] | null;
  isPrimary: boolean;
};

type SubcontractorListItem = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  disciplines: Discipline[];
  orgChartNote: string | null;
  siteRepName: string | null;
  siteRepPhone: string | null;
  capabilitySummary: string | null;
  avgScore: number | null;
  latestPeriod: string | null;
  outstanding: number;
};

type SubconDoc = {
  id: number;
  supplierId: number;
  title: string;
  docKind: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploaderName: string | null;
  createdAt: string;
};

type Evaluation = {
  id: number;
  supplierId: number;
  period: string;
  safetyScore: number | null;
  qualityScore: number | null;
  scheduleScore: number | null;
  manpowerScore: number | null;
  note: string | null;
  evaluatedByName: string | null;
  createdAt: string;
};

type ContractDebt = {
  id: number;
  code: string;
  title: string;
  value: number;
  addendaTotal: number;
  paid: number;
  status: string;
};

type SubcontractorDetail = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  disciplines: Discipline[];
  profile: {
    projectId: number | null;
    orgChartNote: string | null;
    siteRepName: string | null;
    siteRepPhone: string | null;
    capabilitySummary: string | null;
  } | null;
  documents: SubconDoc[];
  evaluations: Evaluation[];
  evaluationAverage: { latestPeriod: string | null; avgScore: number | null; trend: number | null };
  debt: { contractValue: number; paid: number; outstanding: number; contracts: ContractDebt[] };
};

function scoreColor(score: number | null): string {
  if (score == null) return "text-zinc-500";
  if (score >= 4) return "text-emerald-400";
  if (score >= 3) return "text-amber-400";
  return "text-rose-400";
}

export default function SubcontractorsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<SubcontractorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";
  const canEvaluate = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  function load() {
    return fetch("/api/subcontractors").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, listRes]) => {
        if (!meData) return;
        setMe(meData);
        setItems(listRes?.items ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const listRes = await load();
    setItems(listRes?.items ?? []);
  }

  if (loading) return <PageSkeleton />;

  const kpiCount = items.length;
  const kpiOutstanding = items.reduce((s, i) => s + i.outstanding, 0);
  const kpiLowScore = items.filter((i) => i.avgScore != null && i.avgScore < 3).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Nhà thầu phụ"
        subtitle="Hồ sơ năng lực, đánh giá hiệu quả định kỳ và công nợ theo nhà thầu phụ"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{kpiCount}</p>
            <p className="text-xs text-zinc-400">Nhà thầu phụ</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${kpiOutstanding > 0 ? "text-amber-400" : ""}`}>
              {fmtVND(kpiOutstanding)}
            </p>
            <p className="text-xs text-zinc-400">Tổng công nợ còn lại</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${kpiLowScore > 0 ? "text-rose-400" : ""}`}>
              {kpiLowScore}
            </p>
            <p className="text-xs text-zinc-400">Điểm đánh giá thấp (&lt;3)</p>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title="Chưa có nhà thầu phụ"
            message="Nhà thầu phụ hiện lên đây khi được gán phụ trách 1 hệ thi công (trang Hệ thi công/M15)."
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Danh sách nhà thầu phụ"
            >
              <table className="w-full text-sm sm:min-w-[760px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">NHÀ THẦU PHỤ</th>
                    <th className="text-left p-3">HỆ PHỤ TRÁCH</th>
                    <th className="text-left p-3">ĐIỂM ĐÁNH GIÁ</th>
                    <th className="text-left p-3">CÔNG NỢ CÒN LẠI</th>
                    <th className="text-left p-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-zinc-800/60 last:border-0">
                      <td className="p-3">
                        <p className="truncate max-w-[220px] font-medium">{it.name}</p>
                        {it.siteRepName && (
                          <p className="text-xs text-zinc-500 truncate max-w-[220px]">
                            Đại diện: {it.siteRepName}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-xs text-zinc-400">
                        {it.disciplines.length === 0
                          ? "—"
                          : it.disciplines
                              .map((d) => `${d.disciplineName}${d.zone ? ` (${d.zone})` : ""}`)
                              .join(", ")}
                      </td>
                      <td className="p-3">
                        {it.avgScore != null ? (
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${scoreColor(it.avgScore)}`}
                          >
                            <Star className="w-3.5 h-3.5" /> {it.avgScore.toFixed(1)}
                            <span className="text-zinc-500 font-normal">({it.latestPeriod})</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">Chưa đánh giá</span>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        <span className={it.outstanding > 0 ? "text-amber-400" : "text-zinc-400"}>
                          {fmtVND(it.outstanding)}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => setOpenId(it.id)}
                          aria-label={`Xem chi tiết ${it.name}`}
                          className="text-sky-400 hover:text-sky-300 text-xs font-medium"
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {openId != null && (
        <SubcontractorDetailModal
          supplierId={openId}
          canManage={canManage}
          canEvaluate={canEvaluate}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// ===== Modal chi tiết 3 tab: Hồ sơ / Đánh giá / Công nợ & Hợp đồng =====

type DetailTab = "profile" | "eval" | "debt";

function SubcontractorDetailModal({
  supplierId,
  canManage,
  canEvaluate,
  onClose,
  onChanged,
}: {
  supplierId: number;
  canManage: boolean;
  canEvaluate: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SubcontractorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("profile");

  function load() {
    return fetch(`/api/subcontractors/${supplierId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDetail(j?.item ?? null));
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  async function refresh() {
    await load();
    onChanged();
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <HardHat className="w-4 h-4 text-zinc-400" /> {detail?.name ?? "Đang tải…"}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !detail ? (
          <Skeleton />
        ) : (
          <>
            <div
              className="flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Nhóm hồ sơ nhà thầu phụ"
            >
              {(
                [
                  { key: "profile", label: "Hồ sơ", icon: FileText },
                  { key: "eval", label: "Đánh giá", icon: Star },
                  { key: "debt", label: "Công nợ & Hợp đồng", icon: Wallet },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                    tab === t.key
                      ? "bg-zinc-700 border-zinc-600 text-white"
                      : "border-zinc-700 text-zinc-400 hover:text-white"
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "profile" && (
              <ProfileTab detail={detail} canManage={canManage} onChanged={refresh} />
            )}
            {tab === "eval" && (
              <EvalTab detail={detail} canEvaluate={canEvaluate} onChanged={refresh} />
            )}
            {tab === "debt" && <DebtTab detail={detail} />}
          </>
        )}
      </div>
    </Modal>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 py-6">
      <div className="h-4 bg-zinc-800 rounded animate-pulse w-2/3" />
      <div className="h-4 bg-zinc-800 rounded animate-pulse w-1/2" />
      <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
    </div>
  );
}

// ===== Tab Hồ sơ =====

function ProfileTab({
  detail,
  canManage,
  onChanged,
}: {
  detail: SubcontractorDetail;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [orgChartNote, setOrgChartNote] = useState(detail.profile?.orgChartNote ?? "");
  const [siteRepName, setSiteRepName] = useState(detail.profile?.siteRepName ?? "");
  const [siteRepPhone, setSiteRepPhone] = useState(detail.profile?.siteRepPhone ?? "");
  const [capabilitySummary, setCapabilitySummary] = useState(
    detail.profile?.capabilitySummary ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/subcontractors/${detail.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgChartNote: orgChartNote.trim() || null,
          siteRepName: siteRepName.trim() || null,
          siteRepPhone: siteRepPhone.trim() || null,
          capabilitySummary: capabilitySummary.trim() || null,
        }),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được hồ sơ");
        return;
      }
      setEditing(false);
      onChanged();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc(id: number) {
    if (!(await appConfirm("Xoá tài liệu này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/subcon-documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Thông tin</p>
          {canManage && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              Sửa
            </button>
          )}
        </div>

        {!editing ? (
          <div className="text-sm space-y-1">
            <p>
              <span className="text-zinc-500">Điện thoại:</span> {detail.phone ?? "—"}
            </p>
            <p>
              <span className="text-zinc-500">Email:</span> {detail.email ?? "—"}
            </p>
            <p>
              <span className="text-zinc-500">Người đại diện công trường:</span>{" "}
              {detail.profile?.siteRepName ?? "—"}
              {detail.profile?.siteRepPhone ? ` (${detail.profile.siteRepPhone})` : ""}
            </p>
            <p>
              <span className="text-zinc-500">Sơ đồ tổ chức:</span>{" "}
              {detail.profile?.orgChartNote ?? "—"}
            </p>
            <p>
              <span className="text-zinc-500">Năng lực:</span>{" "}
              {detail.profile?.capabilitySummary ?? "—"}
            </p>
            <p className="text-xs text-zinc-500 pt-1">
              Hệ phụ trách:{" "}
              {detail.disciplines.length === 0
                ? "—"
                : detail.disciplines
                    .map(
                      (d) =>
                        `${d.disciplineName}${d.zone ? ` · ${d.zone}` : ""}${
                          d.floorLabels?.length ? ` (${d.floorLabels.join(", ")})` : ""
                        }`,
                    )
                    .join("; ")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 block">
              Người đại diện công trường
              <input
                value={siteRepName}
                onChange={(e) => setSiteRepName(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              SĐT người đại diện
              <input
                value={siteRepPhone}
                onChange={(e) => setSiteRepPhone(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              Sơ đồ tổ chức tại công trường
              <textarea
                value={orgChartNote}
                onChange={(e) => setOrgChartNote(e.target.value)}
                rows={2}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              Năng lực (nhân sự/thiết bị/kinh nghiệm)
              <textarea
                value={capabilitySummary}
                onChange={(e) => setCapabilitySummary(e.target.value)}
                rows={3}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            {err && <p className="text-sm text-rose-300">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg text-sm border border-zinc-700 text-zinc-300 hover:text-white"
              >
                Huỷ
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Hồ sơ năng lực đính kèm
          </p>
          {canManage && (
            <button
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm
            </button>
          )}
        </div>
        {detail.documents.length === 0 ? (
          <EmptyState compact icon={FileText} message="Chưa có hồ sơ năng lực đính kèm." />
        ) : (
          <ul className="space-y-1.5">
            {detail.documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
              >
                <a
                  href={`/api/subcon-documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm min-w-0"
                >
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{d.title}</span>
                </a>
                {canManage && (
                  <button
                    onClick={() => deleteDoc(d.id)}
                    aria-label="Xoá hồ sơ"
                    className="text-zinc-400 hover:text-rose-400 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {uploadOpen && (
        <UploadDocModal
          supplierId={detail.id}
          onClose={() => setUploadOpen(false)}
          onSaved={() => {
            setUploadOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function UploadDocModal({
  supplierId,
  onClose,
  onSaved,
}: {
  supplierId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [docKind, setDocKind] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0 && file != null;

  async function submit() {
    if (!file) return;
    setSaving(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("title", title.trim());
      if (docKind.trim()) form.append("docKind", docKind.trim());
      form.append("file", file);
      const res = await fetch(`/api/subcontractors/${supplierId}/documents`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không upload được hồ sơ");
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
    <Modal onClose={onClose} className="max-w-md" zIndex="z-[60]">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm hồ sơ năng lực</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên hồ sơ
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 block">
          Loại hồ sơ (tuỳ chọn, vd Giấy phép KD/Chứng chỉ)
          <input
            value={docKind}
            onChange={(e) => setDocKind(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Upload className="w-4 h-4" />
          {file ? file.name : "Chọn tài liệu (PDF/ảnh)"}
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

// ===== Tab Đánh giá =====

function EvalTab({
  detail,
  canEvaluate,
  onChanged,
}: {
  detail: SubcontractorDetail;
  canEvaluate: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const chartData = detail.evaluations.map((e) => ({
    period: e.period,
    "An toàn": e.safetyScore,
    "Chất lượng": e.qualityScore,
    "Tiến độ": e.scheduleScore,
    "Nhân sự": e.manpowerScore,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Lịch sử đánh giá theo kỳ
        </p>
        {canEvaluate && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm kỳ đánh giá
          </button>
        )}
      </div>

      {detail.evaluations.length === 0 ? (
        <EmptyState compact icon={Star} message="Chưa có kỳ đánh giá nào." />
      ) : (
        <>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                <XAxis dataKey="period" stroke="var(--color-zinc-500)" fontSize={10} />
                <YAxis stroke="var(--color-zinc-500)" fontSize={11} domain={[0, 5]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-zinc-900)",
                    border: "1px solid var(--color-zinc-700)",
                    color: "var(--foreground)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="An toàn"
                  stroke="var(--color-rose-400)"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Chất lượng"
                  stroke="var(--color-sky-400)"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Tiến độ"
                  stroke="var(--color-amber-400)"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Nhân sự"
                  stroke="var(--color-emerald-400)"
                  strokeWidth={2}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm sm:min-w-[560px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-2">KỲ</th>
                    <th className="text-left p-2">AN TOÀN</th>
                    <th className="text-left p-2">CHẤT LƯỢNG</th>
                    <th className="text-left p-2">TIẾN ĐỘ</th>
                    <th className="text-left p-2">NHÂN SỰ</th>
                    <th className="text-left p-2">NGƯỜI ĐÁNH GIÁ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...detail.evaluations].reverse().map((e) => (
                    <tr key={e.id} className="border-b border-zinc-800/60 last:border-0">
                      <td className="p-2 font-medium">{e.period}</td>
                      <td className="p-2">{e.safetyScore ?? "—"}</td>
                      <td className="p-2">{e.qualityScore ?? "—"}</td>
                      <td className="p-2">{e.scheduleScore ?? "—"}</td>
                      <td className="p-2">{e.manpowerScore ?? "—"}</td>
                      <td className="p-2 text-xs text-zinc-400">{e.evaluatedByName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {addOpen && (
        <AddEvaluationModal
          supplierId={detail.id}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function AddEvaluationModal({
  supplierId,
  onClose,
  onSaved,
}: {
  supplierId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [safetyScore, setSafetyScore] = useState("");
  const [qualityScore, setQualityScore] = useState("");
  const [scheduleScore, setScheduleScore] = useState("");
  const [manpowerScore, setManpowerScore] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = period.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(`/api/subcontractors/${supplierId}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: period.trim(),
          safetyScore: safetyScore === "" ? null : Number(safetyScore),
          qualityScore: qualityScore === "" ? null : Number(qualityScore),
          scheduleScore: scheduleScore === "" ? null : Number(scheduleScore),
          manpowerScore: manpowerScore === "" ? null : Number(manpowerScore),
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được đánh giá");
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
    <Modal onClose={onClose} className="max-w-md" zIndex="z-[60]">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm kỳ đánh giá</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Kỳ (vd 2026-Q3 hoặc 2026-07)
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-Q3"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["An toàn", safetyScore, setSafetyScore],
              ["Chất lượng", qualityScore, setQualityScore],
              ["Tiến độ", scheduleScore, setScheduleScore],
              ["Nhân sự", manpowerScore, setManpowerScore],
            ] as const
          ).map(([label, value, setter]) => (
            <label key={label} className="text-xs text-zinc-400 block">
              {label} (1-5)
              <input
                type="number"
                min={1}
                max={5}
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
        </div>

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

// ===== Tab Công nợ & Hợp đồng =====

function DebtTab({ detail }: { detail: SubcontractorDetail }) {
  const { debt } = detail;
  if (debt.contracts.length === 0)
    return (
      <EmptyState
        compact
        icon={Wallet}
        message="Chưa có hợp đồng giao thầu nào gắn nhà thầu phụ này."
      />
    );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
          <p className="text-sm font-semibold">{fmtVND(debt.contractValue)}</p>
          <p className="text-[11px] text-zinc-500">Giá trị HĐ</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
          <p className="text-sm font-semibold">{fmtVND(debt.paid)}</p>
          <p className="text-[11px] text-zinc-500">Đã thanh toán</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
          <p className={`text-sm font-semibold ${debt.outstanding > 0 ? "text-amber-400" : ""}`}>
            {fmtVND(debt.outstanding)}
          </p>
          <p className="text-[11px] text-zinc-500">Còn lại</p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[560px]">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="text-left p-2">SỐ HĐ</th>
                <th className="text-left p-2">TÊN HĐ</th>
                <th className="text-left p-2">GIÁ TRỊ</th>
                <th className="text-left p-2">ĐÃ TT</th>
                <th className="text-left p-2">CÒN LẠI</th>
              </tr>
            </thead>
            <tbody>
              {debt.contracts.map((c) => {
                const value = c.value + c.addendaTotal;
                return (
                  <tr key={c.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-2">
                      <a href="/contracts" className="text-sky-400 hover:text-sky-300 font-medium">
                        {c.code}
                      </a>
                    </td>
                    <td className="p-2 truncate max-w-[200px]">{c.title}</td>
                    <td className="p-2">{fmtVND(value)}</td>
                    <td className="p-2">{fmtVND(c.paid)}</td>
                    <td className="p-2">{fmtVND(value - c.paid)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
