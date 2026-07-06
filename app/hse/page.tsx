"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, ShieldAlert, Camera, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";

type HseKind = "inspection" | "toolbox" | "incident" | "near_miss" | "permit";
const HSE_KIND_LABEL: Record<HseKind, string> = {
  inspection: "Kiểm tra định kỳ",
  toolbox: "Toolbox talk",
  incident: "Sự cố",
  near_miss: "Cận nguy",
  permit: "Giấy phép làm việc",
};

type HseSeverity = "low" | "medium" | "high";
const HSE_SEVERITY_LABEL: Record<HseSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

type HsePermitType = "hot_work" | "height" | "confined" | "electrical";
const HSE_PERMIT_TYPE_LABEL: Record<HsePermitType, string> = {
  hot_work: "Hàn/cắt nóng",
  height: "Làm việc trên cao",
  confined: "Không gian hạn chế",
  electrical: "Điện",
};

const SEVERITY_BADGE: Record<HseSeverity, string> = {
  low: "bg-zinc-800 text-zinc-300",
  medium: "bg-amber-900/40 text-amber-300",
  high: "bg-rose-900/40 text-rose-300",
};

type HseRecord = {
  id: number;
  kind: HseKind;
  recordDate: string;
  floorLabel: string | null;
  area: string | null;
  description: string;
  severity: HseSeverity | null;
  permitType: HsePermitType | null;
  permitFrom: string | null;
  permitTo: string | null;
  actionRequired: string | null;
  actionAssignee: number | null;
  actionAssigneeName: string | null;
  actionDue: string | null;
  actionStatus: "none" | "open" | "closed";
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function HsePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [records, setRecords] = useState<HseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HseKind>("incident");
  const [addOpen, setAddOpen] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const canCreate = me != null && me.role !== "cdt" && me.role !== "viewer" && me.role !== "bch";

  function load() {
    return fetch("/api/hse").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, r]) => {
        if (!meData) return;
        setMe(meData);
        setRecords(r?.records ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const r = await load();
    setRecords(r?.records ?? []);
  }

  const filtered = useMemo(() => records.filter((r) => r.kind === tab), [records, tab]);

  const stats = useMemo(() => {
    const incidents = records.filter((r) => r.kind === "incident");
    const lastIncident = incidents[0]?.recordDate ?? null;
    const daysSince = lastIncident
      ? Math.max(0, Math.round((Date.parse(todayISO()) - Date.parse(lastIncident)) / 86400_000))
      : null;
    const openActions = records.filter((r) => r.actionStatus === "open");
    const overdueActions = openActions.filter(
      (r) => r.actionDue != null && r.actionDue < todayISO(),
    );
    const today = todayISO();
    const nowT = Date.now();
    const activePermits = records.filter(
      (r) =>
        r.kind === "permit" &&
        r.permitFrom &&
        r.permitTo &&
        Date.parse(r.permitFrom) <= nowT &&
        nowT <= Date.parse(r.permitTo),
    );
    return {
      daysSince,
      openActions: openActions.length,
      overdueActions: overdueActions.length,
      activePermits: activePermits.length,
      today,
    };
  }, [records]);

  async function closeAction(id: number) {
    const res = await fetch(`/api/hse/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closeAction: true }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Đóng action thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="HSE / An toàn"
        subtitle="Kiểm tra, toolbox talk, sự cố/cận nguy, giấy phép làm việc đặc biệt"
        bottomActions={
          <div className="flex items-center gap-2">
            {canManage && (
              <a
                href={`/api/hse/report?month=${todayISO().slice(0, 7)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition shrink-0"
              >
                <Download className="w-4 h-4" />{" "}
                <span className="hidden sm:inline">Báo cáo tháng</span>
              </a>
            )}
            {canCreate && (
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Ghi nhận HSE"
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
              >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ghi nhận</span>
              </button>
            )}
          </div>
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{stats.daysSince ?? "—"}</p>
            <p className="text-xs text-zinc-400">Ngày không sự cố</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.openActions}</p>
            <p className="text-xs text-zinc-400">Action đang mở</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${stats.overdueActions > 0 ? "text-rose-400" : ""}`}>
              {stats.overdueActions}
            </p>
            <p className="text-xs text-zinc-400">Action quá hạn</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-sky-400">{stats.activePermits}</p>
            <p className="text-xs text-zinc-400">Giấy phép hiệu lực</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Loại ghi nhận HSE">
          {(Object.keys(HSE_KIND_LABEL) as HseKind[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                tab === k
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {HSE_KIND_LABEL[k]} ({records.filter((r) => r.kind === k).length})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Chưa có ghi nhận"
            message="Bấm “Ghi nhận” để thêm mới."
          />
        ) : tab === "permit" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((r) => {
              const nowT = Date.now();
              const active =
                r.permitFrom &&
                r.permitTo &&
                Date.parse(r.permitFrom) <= nowT &&
                nowT <= Date.parse(r.permitTo);
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3 ${active ? "border-emerald-700 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">
                      {r.permitType ? HSE_PERMIT_TYPE_LABEL[r.permitType] : "—"}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${active ? "bg-emerald-900/40 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}
                    >
                      {active ? "Đang hiệu lực" : "Hết hiệu lực"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">{r.description}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {r.floorLabel ?? "—"} ·{" "}
                    {r.permitFrom ? new Date(r.permitFrom).toLocaleString("vi-VN") : "—"} →{" "}
                    {r.permitTo ? new Date(r.permitTo).toLocaleString("vi-VN") : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Danh sách ghi nhận HSE"
            >
              <table className="w-full text-sm sm:min-w-[640px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">NGÀY</th>
                    <th className="text-left p-3">MÔ TẢ</th>
                    {(tab === "incident" || tab === "near_miss") && (
                      <th className="text-left p-3">MỨC ĐỘ</th>
                    )}
                    <th className="text-left p-3">ACTION</th>
                    <th className="text-left p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const overdue =
                      r.actionStatus === "open" && r.actionDue != null && r.actionDue < todayISO();
                    return (
                      <tr key={r.id} className="border-b border-zinc-800/60 last:border-0">
                        <td className="p-3 text-xs text-zinc-400">{formatDateVN(r.recordDate)}</td>
                        <td className="p-3">
                          <p className="truncate max-w-[280px]">{r.description}</p>
                          {r.floorLabel && (
                            <p className="text-xs text-zinc-500">Tầng {r.floorLabel}</p>
                          )}
                        </td>
                        {(tab === "incident" || tab === "near_miss") && (
                          <td className="p-3">
                            {r.severity && (
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_BADGE[r.severity]}`}
                              >
                                {HSE_SEVERITY_LABEL[r.severity]}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="p-3 text-xs">
                          {r.actionRequired ? (
                            <span className={overdue ? "text-rose-400" : "text-zinc-400"}>
                              {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                              {r.actionStatus === "closed"
                                ? "Đã xử lý"
                                : `Hạn ${formatDateVN(r.actionDue)}`}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3">
                          {canManage && r.actionStatus === "open" && (
                            <button
                              onClick={() => closeAction(r.id)}
                              aria-label="Đóng action"
                              className="text-emerald-400 hover:text-emerald-300"
                              title="Đóng action"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
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

      {addOpen && (
        <AddHseModal
          defaultKind={tab}
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

function AddHseModal({
  defaultKind,
  onClose,
  onCreated,
}: {
  defaultKind: HseKind;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<HseKind>(defaultKind);
  const [recordDate, setRecordDate] = useState(todayISO());
  const [floorLabel, setFloorLabel] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<HseSeverity>("low");
  const [permitType, setPermitType] = useState<HsePermitType>("hot_work");
  const [permitFrom, setPermitFrom] = useState("");
  const [permitTo, setPermitTo] = useState("");
  const [actionRequired, setActionRequired] = useState("");
  const [actionDue, setActionDue] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const needsSeverity = kind === "incident" || kind === "near_miss";
  const isPermit = kind === "permit";
  const canSubmit = description.trim() && recordDate && (!isPermit || (permitFrom && permitTo));

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/hse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          recordDate,
          floorLabel: floorLabel.trim() || null,
          description: description.trim(),
          severity: needsSeverity ? severity : null,
          permitType: isPermit ? permitType : null,
          permitFrom: isPermit && permitFrom ? new Date(permitFrom).toISOString() : null,
          permitTo: isPermit && permitTo ? new Date(permitTo).toISOString() : null,
          actionRequired: actionRequired.trim() || null,
          actionDue: actionRequired.trim() ? actionDue || null : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không ghi nhận được");
        return;
      }
      if (photo && j?.id) {
        const form = new FormData();
        form.append("file", photo);
        await fetch(`/api/hse/${j.id}/photos`, { method: "POST", body: form });
      }
      onCreated();
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
          <h2 className="font-semibold">Ghi nhận HSE</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Loại
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as HseKind)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(HSE_KIND_LABEL) as HseKind[]).map((k) => (
              <option key={k} value={k}>
                {HSE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày
            <input
              type="date"
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Tầng/khu vực
            <input
              value={floorLabel}
              onChange={(e) => setFloorLabel(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Mô tả
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {needsSeverity && (
          <label className="text-xs text-zinc-400 block">
            Mức độ
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as HseSeverity)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(HSE_SEVERITY_LABEL) as HseSeverity[]).map((s) => (
                <option key={s} value={s}>
                  {HSE_SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}

        {isPermit && (
          <>
            <label className="text-xs text-zinc-400 block">
              Loại giấy phép
              <select
                value={permitType}
                onChange={(e) => setPermitType(e.target.value as HsePermitType)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                {(Object.keys(HSE_PERMIT_TYPE_LABEL) as HsePermitType[]).map((p) => (
                  <option key={p} value={p}>
                    {HSE_PERMIT_TYPE_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">
                Hiệu lực từ
                <input
                  type="datetime-local"
                  value={permitFrom}
                  onChange={(e) => setPermitFrom(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-zinc-400">
                Hiệu lực đến
                <input
                  type="datetime-local"
                  value={permitTo}
                  onChange={(e) => setPermitTo(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </>
        )}

        <label className="text-xs text-zinc-400 block">
          Hành động khắc phục (nếu có)
          <input
            value={actionRequired}
            onChange={(e) => setActionRequired(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        {actionRequired.trim() && (
          <label className="text-xs text-zinc-400 block">
            Hạn khắc phục
            <input
              type="date"
              value={actionDue}
              onChange={(e) => setActionDue(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        )}

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Camera className="w-4 h-4" />
          {photo ? photo.name : "Chụp / chọn ảnh"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Ghi nhận"}
        </button>
      </div>
    </Modal>
  );
}
