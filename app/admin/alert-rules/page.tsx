"use client";
// Trang admin cấu hình ngưỡng cảnh báo (M47 PR4 — alert_rules, xem
// docs/nang-cap/M47-evm-bi.md mục PR4). Đọc/ghi qua GET/POST /api/admin/alert-rules +
// DELETE /api/admin/alert-rules/:id (lib/alerts.ts, chỉ chạy server).
//
// Nhân bản whitelist metric từ lib/alerts.ts — KHÔNG import trực tiếp lib/alerts vì lib
// đó kéo theo lib/db (chỉ chạy server, dùng package `pg`), giống pattern
// app/admin/approval-flows/page.tsx.
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X, BellRing } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type AlertMetric =
  "due_soon_days" | "due_soon_progress" | "material_over_pct" | "spi_below" | "cpi_below";

const ALERT_METRICS: Record<
  AlertMetric,
  { label: string; operator: "lt" | "gt"; defaultThreshold: number; unit: string }
> = {
  due_soon_days: {
    label: "Số ngày trước hạn để cảnh báo",
    operator: "lt",
    defaultThreshold: 3,
    unit: "ngày",
  },
  due_soon_progress: {
    label: "Tiến độ dưới ngưỡng mới cảnh báo sắp trễ",
    operator: "lt",
    defaultThreshold: 0.7,
    unit: "% (0–1)",
  },
  material_over_pct: {
    label: "Vật tư vượt định mức bao nhiêu % thì cảnh báo",
    operator: "gt",
    defaultThreshold: 0,
    unit: "%",
  },
  spi_below: {
    label: "SPI dưới ngưỡng thì cảnh báo chậm tiến độ",
    operator: "lt",
    defaultThreshold: 1,
    unit: "",
  },
  cpi_below: {
    label: "CPI dưới ngưỡng thì cảnh báo vượt chi",
    operator: "lt",
    defaultThreshold: 1,
    unit: "",
  },
};
const METRIC_KEYS = Object.keys(ALERT_METRICS) as AlertMetric[];

type AlertRuleRow = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  metric: AlertMetric;
  operator: "lt" | "gt";
  threshold: number;
  channel: string;
  active: boolean;
  createdAt: string;
};

type ProjectOpt = { id: number; name: string };

export default function AlertRulesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingMetric, setEditingMetric] = useState<AlertMetric | null>(null);

  const isAdmin = me?.role === "admin";
  const canView = me?.role === "admin" || me?.role === "pm";

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/admin/alert-rules")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRules(j?.rules ?? []))
      .catch(() => showToast("Không tải được danh sách ngưỡng cảnh báo", "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMe()
      .then((u) => setMe(u))
      .finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!me || !canView) return;
    load();
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProjects(j?.projects ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function removeRule(rule: AlertRuleRow) {
    if (
      !(await appConfirm(
        `Xoá ngưỡng riêng của "${ALERT_METRICS[rule.metric].label}"${rule.projectName ? ` (${rule.projectName})` : ""}? Metric sẽ quay lại giá trị mặc định.`,
        { danger: true },
      ))
    )
      return;
    const res = await fetch(`/api/admin/alert-rules/${rule.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Xoá thất bại", "error");
      return;
    }
    showToast("Đã xoá — quay lại ngưỡng mặc định", "success");
    load();
  }

  if (meLoading) return <PageSkeleton />;

  if (me && !canView) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Ngưỡng cảnh báo" subtitle="Cấu hình ngưỡng cảnh báo hệ thống" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={BellRing}
            title="Không có quyền truy cập"
            message="Chỉ Admin/PM mới xem được cấu hình ngưỡng cảnh báo."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Ngưỡng cảnh báo"
        subtitle="Cấu hình ngưỡng cho thông báo hạn/vật tư/SPI/CPI — không cấu hình = giữ hành vi mặc định"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-xl h-24"
              />
            ))}
          </div>
        ) : (
          METRIC_KEYS.map((metric) => {
            const meta = ALERT_METRICS[metric];
            const list = rules.filter((r) => r.metric === metric && r.active);
            const globalRule = list.find((r) => r.projectId == null);
            const effective = globalRule ? globalRule.threshold : meta.defaultThreshold;
            return (
              <section
                key={metric}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold">{meta.label}</p>
                    <p className="text-xs text-zinc-400">
                      Ngưỡng hiệu lực (mọi dự án):{" "}
                      <span className="text-zinc-200 font-medium">
                        {effective}
                        {meta.unit ? ` ${meta.unit}` : ""}
                      </span>
                      {!globalRule && (
                        <span className="text-zinc-500"> (mặc định — chưa cấu hình riêng)</span>
                      )}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setEditingMetric(metric)}
                      className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm/sửa ngưỡng
                    </button>
                  )}
                </div>

                {list.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-zinc-500 border-b border-zinc-800">
                          <th className="text-left py-1 pr-2">Phạm vi</th>
                          <th className="text-left py-1 pr-2">Ngưỡng</th>
                          {isAdmin && <th className="text-left py-1">Thao tác</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.id} className="border-b border-zinc-900 last:border-0">
                            <td className="py-1 pr-2 text-zinc-200">
                              {r.projectId == null
                                ? "Mọi dự án"
                                : (r.projectName ?? `#${r.projectId}`)}
                            </td>
                            <td className="py-1 pr-2 text-zinc-300">
                              {r.threshold}
                              {meta.unit ? ` ${meta.unit}` : ""}
                            </td>
                            {isAdmin && (
                              <td className="py-1">
                                <button
                                  onClick={() => removeRule(r)}
                                  className="flex items-center gap-1 text-rose-300 hover:text-rose-200"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Xoá
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>

      {editingMetric && (
        <RuleFormModal
          metric={editingMetric}
          meta={ALERT_METRICS[editingMetric]}
          existing={rules.filter((r) => r.metric === editingMetric && r.active)}
          projects={projects}
          onClose={() => setEditingMetric(null)}
          onSaved={() => {
            setEditingMetric(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ── Modal thêm/sửa ngưỡng cho 1 metric ──────────────────────────────────────────
function RuleFormModal({
  metric,
  meta,
  existing,
  projects,
  onClose,
  onSaved,
}: {
  metric: AlertMetric;
  meta: { label: string; defaultThreshold: number; unit: string };
  existing: AlertRuleRow[];
  projects: ProjectOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<"all" | "project">("all");
  const [projectId, setProjectId] = useState<string>("");
  const [threshold, setThreshold] = useState<string>(String(meta.defaultThreshold));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (threshold.trim() === "" || !Number.isFinite(Number(threshold))) {
      showToast("Ngưỡng phải là số", "error");
      return;
    }
    if (scope === "project" && !projectId) {
      showToast("Chọn dự án cụ thể hoặc chuyển sang “Mọi dự án”", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/alert-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metric,
          projectId: scope === "project" ? Number(projectId) : null,
          threshold: Number(threshold),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      showToast("Đã lưu ngưỡng cảnh báo", "success");
      onSaved();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{meta.label}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-zinc-500">
          Mặc định: {meta.defaultThreshold}
          {meta.unit ? ` ${meta.unit}` : ""} — lưu ngưỡng mới cho cùng phạm vi sẽ ghi đè ngưỡng cũ.
        </p>

        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Phạm vi áp dụng</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={scope === "all"}
                onChange={() => setScope("all")}
                className="accent-emerald-500"
              />
              Mọi dự án
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={scope === "project"}
                onChange={() => setScope("project")}
                className="accent-emerald-500"
              />
              Dự án cụ thể
            </label>
          </div>
          {scope === "project" && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chọn dự án —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="text-xs text-zinc-400 block">
          Ngưỡng {meta.unit ? `(${meta.unit})` : ""}
          <input
            type="number"
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {existing.length > 0 && (
          <p className="text-xs text-zinc-500">
            Đã có {existing.length} ngưỡng riêng cho metric này — xem/xoá ở bảng phía sau khi đóng.
          </p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu ngưỡng"}
        </button>
      </div>
    </Modal>
  );
}
