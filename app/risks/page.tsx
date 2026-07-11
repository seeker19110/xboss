"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Plus, X, ShieldAlert, Pencil, Trash2 } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
// Nhân bản label từ lib/risks.ts — không import trực tiếp vì lib đó kéo theo
// lib/db (chỉ chạy server), giống pattern trang HSE.
type RiskCategory = "schedule" | "cost" | "quality" | "safety" | "material" | "other";
const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  schedule: "Tiến độ",
  cost: "Chi phí",
  quality: "Chất lượng",
  safety: "An toàn",
  material: "Vật tư",
  other: "Khác",
};

type RiskStatus = "open" | "mitigating" | "closed";
const RISK_STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Đang mở",
  mitigating: "Đang giảm thiểu",
  closed: "Đã đóng",
};

type Risk = {
  id: number;
  code: string;
  title: string;
  description: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  score: number;
  mitigation: string | null;
  owner: number | null;
  ownerName: string | null;
  status: RiskStatus;
  createdAt: string;
  closedAt: string | null;
};

type UserOpt = { id: number; name: string };

// Màu theo score = probability × impact: 1–6 xanh, 8–12 vàng, 15–25 đỏ (spec M13).
function scoreClasses(score: number): { badge: string; cell: string } {
  if (score >= 15) return { badge: "bg-rose-900 text-rose-200", cell: "bg-rose-900 text-rose-200" };
  if (score >= 8)
    return { badge: "bg-amber-900 text-amber-200", cell: "bg-amber-900 text-amber-200" };
  return {
    badge: "bg-emerald-900 text-emerald-200",
    cell: "bg-emerald-900 text-emerald-200",
  };
}

const STATUS_BADGE: Record<RiskStatus, string> = {
  open: "bg-rose-900 text-rose-200",
  mitigating: "bg-amber-900 text-amber-200",
  closed: "bg-zinc-800 text-zinc-400",
};

export default function RisksPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "all">("all");
  const [cellFilter, setCellFilter] = useState<{ p: number; i: number } | null>(null);
  const [editing, setEditing] = useState<Risk | "new" | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdminOrPm = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/risks").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, r]) => {
        if (!meData) return;
        setMe(meData);
        setRisks(r?.risks ?? []);
        if (meData.role === "admin" || meData.role === "pm")
          fetch("/api/users")
            .then((r2) => (r2.ok ? r2.json() : null))
            .then((d) => setUsers(d?.users ?? []))
            .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const r = await load();
    setRisks(r?.risks ?? []);
  }

  // Heatmap đếm trên rủi ro chưa đóng — sổ rủi ro "sống", rủi ro đã đóng chỉ xem ở bảng.
  const activeRisks = useMemo(() => risks.filter((r) => r.status !== "closed"), [risks]);

  const filtered = useMemo(
    () =>
      risks.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (cellFilter && (r.probability !== cellFilter.p || r.impact !== cellFilter.i))
          return false;
        return true;
      }),
    [risks, statusFilter, cellFilter],
  );

  async function setStatus(r: Risk, status: RiskStatus) {
    const res = await fetch(`/api/risks/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Đổi trạng thái thất bại", "error");
      return;
    }
    refresh();
  }

  async function deleteRisk(r: Risk) {
    if (!(await appConfirm(`Xoá rủi ro ${r.code} — ${r.title}?`))) return;
    const res = await fetch(`/api/risks/${r.id}`, { method: "DELETE" });
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
        title="Sổ rủi ro"
        subtitle="Ma trận 5×5 — score = xác suất × mức ảnh hưởng"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setEditing("new")}
              aria-label="Ghi nhận rủi ro"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Rủi ro mới</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        {/* Heatmap 5×5: hàng = xác suất (5 trên cùng), cột = mức ảnh hưởng */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 overflow-x-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Ma trận rủi ro (đang mở/giảm thiểu: {activeRisks.length})
          </p>
          <div className="min-w-[320px] max-w-md">
            <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1">
              <div />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="text-center text-[10px] text-zinc-400 pb-1">
                  {i}
                </div>
              ))}
              {[5, 4, 3, 2, 1].map((p) => (
                <Fragment key={p}>
                  <div className="flex items-center justify-end pr-1.5 text-[10px] text-zinc-400">
                    {p}
                  </div>
                  {[1, 2, 3, 4, 5].map((i) => {
                    const count = activeRisks.filter(
                      (r) => r.probability === p && r.impact === i,
                    ).length;
                    const selected = cellFilter?.p === p && cellFilter?.i === i;
                    const c = scoreClasses(p * i);
                    return (
                      <button
                        key={`${p}-${i}`}
                        onClick={() => setCellFilter(selected ? null : { p, i })}
                        aria-label={`Xác suất ${p} × ảnh hưởng ${i}: ${count} rủi ro`}
                        aria-pressed={selected}
                        className={`aspect-square min-h-10 rounded-md text-sm font-bold flex items-center justify-center transition
                          ${count > 0 ? c.cell : "bg-zinc-800/60 text-zinc-600"}
                          ${selected ? "ring-2 ring-white" : "hover:ring-1 hover:ring-zinc-500"}`}
                      >
                        {count > 0 ? count : ""}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-zinc-400">
              <span>← Xác suất (dọc)</span>
              <span>Mức ảnh hưởng (ngang) →</span>
            </div>
          </div>
          {cellFilter && (
            <button
              onClick={() => setCellFilter(null)}
              className="mt-2 text-xs text-sky-400 hover:text-sky-300"
            >
              Bỏ lọc ô P{cellFilter.p} × I{cellFilter.i} ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lọc trạng thái rủi ro">
          {(["all", "open", "mitigating", "closed"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                statusFilter === s
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {s === "all" ? "Tất cả" : RISK_STATUS_LABEL[s]} (
              {s === "all" ? risks.length : risks.filter((r) => r.status === s).length})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Chưa có rủi ro"
            message={
              cellFilter
                ? "Không có rủi ro nào ở ô ma trận đang chọn."
                : canManage
                  ? "Bấm “Rủi ro mới” để ghi nhận."
                  : "Chưa có rủi ro nào được ghi nhận."
            }
          />
        ) : (
          <>
            {/* Bảng (≥sm) */}
            <div className="hidden sm:block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Sổ rủi ro">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                      <th className="text-left p-3">MÃ</th>
                      <th className="text-left p-3">RỦI RO</th>
                      <th className="text-left p-3">NHÓM</th>
                      <th className="text-center p-3">SCORE</th>
                      <th className="text-left p-3">PHỤ TRÁCH</th>
                      <th className="text-left p-3">TRẠNG THÁI</th>
                      <th className="text-left p-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-b border-zinc-800/60 last:border-0">
                        <td className="p-3 font-mono text-xs text-zinc-400">{r.code}</td>
                        <td className="p-3">
                          <p className="max-w-[260px]">{r.title}</p>
                          {r.mitigation && (
                            <p className="text-xs text-zinc-500 truncate max-w-[260px]">
                              Giảm thiểu: {r.mitigation}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-xs text-zinc-300">
                          {RISK_CATEGORY_LABEL[r.category]}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block min-w-10 px-2 py-1 rounded-lg text-sm font-bold ${scoreClasses(r.score).badge}`}
                            title={`Xác suất ${r.probability} × ảnh hưởng ${r.impact}`}
                          >
                            {r.score}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-zinc-300">{r.ownerName ?? "—"}</td>
                        <td className="p-3">
                          {canManage ? (
                            <select
                              value={r.status}
                              onChange={(e) => setStatus(r, e.target.value as RiskStatus)}
                              aria-label={`Trạng thái ${r.code}`}
                              className={`text-xs rounded-full px-2 py-1 border-0 ${STATUS_BADGE[r.status]}`}
                            >
                              {(Object.keys(RISK_STATUS_LABEL) as RiskStatus[]).map((s) => (
                                <option key={s} value={s} className="bg-zinc-900 text-white">
                                  {RISK_STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status]}`}
                            >
                              {RISK_STATUS_LABEL[r.status]}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {canManage && (
                              <button
                                onClick={() => setEditing(r)}
                                aria-label={`Sửa ${r.code}`}
                                className="p-1 text-zinc-500 hover:text-white"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {isAdminOrPm && (
                              <button
                                onClick={() => deleteRisk(r)}
                                aria-label={`Xoá ${r.code}`}
                                className="p-1 text-zinc-500 hover:text-rose-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card view (mobile) */}
            <div className="sm:hidden space-y-2">
              {filtered.map((r) => (
                <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-zinc-500">{r.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status]}`}>
                      {RISK_STATUS_LABEL[r.status]}
                    </span>
                    <span
                      className={`ml-auto min-w-9 text-center px-2 py-0.5 rounded-lg text-sm font-bold ${scoreClasses(r.score).badge}`}
                    >
                      {r.score}
                    </span>
                  </div>
                  <p className="text-sm mt-1.5">{r.title}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {RISK_CATEGORY_LABEL[r.category]} · P{r.probability} × I{r.impact}
                    {r.ownerName && ` · ${r.ownerName}`}
                  </p>
                  {canManage && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setEditing(r)}
                        className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg py-2 font-medium"
                      >
                        Sửa
                      </button>
                      {r.status !== "closed" ? (
                        <button
                          onClick={() => setStatus(r, "closed")}
                          className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg py-2 font-medium text-emerald-400"
                        >
                          Đóng rủi ro
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(r, "open")}
                          className="flex-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg py-2 font-medium"
                        >
                          Mở lại
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {editing && (
        <RiskModal
          risk={editing === "new" ? null : editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RiskModal({
  risk,
  users,
  onClose,
  onSaved,
}: {
  risk: Risk | null;
  users: UserOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(risk?.title ?? "");
  const [description, setDescription] = useState(risk?.description ?? "");
  const [category, setCategory] = useState<RiskCategory>(risk?.category ?? "schedule");
  const [probability, setProbability] = useState(risk?.probability ?? 3);
  const [impact, setImpact] = useState(risk?.impact ?? 3);
  const [mitigation, setMitigation] = useState(risk?.mitigation ?? "");
  const [owner, setOwner] = useState(risk?.owner != null ? String(risk.owner) : "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const score = probability * impact;
  const sc = scoreClasses(score);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch(risk ? `/api/risks/${risk.id}` : "/api/risks", {
        method: risk ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category,
          probability,
          impact,
          mitigation: mitigation.trim() || null,
          owner: owner ? Number(owner) : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không lưu được rủi ro");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  // Chọn 1–5 bằng hàng nút bấm to (không dropdown — spec M13, dễ bấm trên điện thoại).
  function ScaleButtons({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
  }) {
    return (
      <div>
        <p className="text-xs text-zinc-400 mb-1">{label}</p>
        <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={value === v}
              onClick={() => onChange(v)}
              className={`flex-1 min-h-10 rounded-lg text-sm font-bold border transition ${
                value === v
                  ? "bg-zinc-700 border-zinc-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{risk ? `Sửa rủi ro ${risk.code}` : "Rủi ro mới"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên rủi ro
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Chậm bàn giao mặt bằng tầng 15–20"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Nhóm
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as RiskCategory)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(RISK_CATEGORY_LABEL) as RiskCategory[]).map((c) => (
              <option key={c} value={c}>
                {RISK_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <ScaleButtons label="Xác suất xảy ra (1–5)" value={probability} onChange={setProbability} />
        <ScaleButtons label="Mức ảnh hưởng (1–5)" value={impact} onChange={setImpact} />

        <div className={`rounded-xl p-3 text-center ${sc.badge}`} aria-live="polite">
          <p className="text-3xl font-bold">{score}</p>
          <p className="text-xs opacity-80">
            Score = {probability} × {impact}
          </p>
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

        <label className="text-xs text-zinc-400 block">
          Biện pháp giảm thiểu
          <textarea
            value={mitigation}
            onChange={(e) => setMitigation(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {users.length > 0 && (
          <label className="text-xs text-zinc-400 block">
            Người phụ trách
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa giao —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !title.trim()}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : risk ? "Lưu thay đổi" : "Ghi nhận rủi ro"}
        </button>
      </div>
    </Modal>
  );
}
