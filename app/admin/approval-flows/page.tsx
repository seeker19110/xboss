"use client";
// Trang admin cấu hình flow duyệt nhiều cấp (M46 PR4 — engine phê duyệt, xem
// docs/nang-cap/M46-approval-engine.md). Đọc/ghi qua GET/POST /api/admin/approval-flows +
// PATCH/DELETE /api/admin/approval-flows/:id (lib/approvals.ts, chỉ chạy server).
//
// Nhân bản type/label/danh sách vai trò từ lib/approvals.ts + lib/roles.ts — KHÔNG import
// trực tiếp lib/approvals vì lib đó kéo theo lib/db (chỉ chạy server, dùng package `pg`),
// giống pattern trang HSE/Đề xuất (xem comment đầu app/proposals/page.tsx).
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Power, X, Workflow } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { formatVnd } from "@/lib/money";

type ApprovalEntityType = "variation" | "payment_cert" | "proposal" | "task_acceptance";

const APPROVAL_ENTITY_TYPES: ApprovalEntityType[] = [
  "variation",
  "payment_cert",
  "proposal",
  "task_acceptance",
];

const ENTITY_LABEL: Record<ApprovalEntityType, string> = {
  variation: "Phát sinh (VO)",
  payment_cert: "Đợt thanh toán (IPC)",
  proposal: "Đề xuất",
  task_acceptance: "Nghiệm thu task",
};

// Vai trò hợp lệ làm bước duyệt = mọi vai trò trừ bch/viewer (chỉ-xem thuần tuý) —
// cdt được phép làm bước duyệt cuối (xem lib/approvals.ts NON_APPROVER_ROLES).
const STEP_ROLES: Role[] = ROLES.filter((r) => r !== "bch" && r !== "viewer");

type ApprovalStepRow = {
  seq: number;
  role: Role;
  minAmount: number | null;
  slaDays: number | null;
};

type ApprovalFlowAdmin = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  entityType: ApprovalEntityType;
  name: string;
  active: boolean;
  steps: ApprovalStepRow[];
  pendingCount: number;
  totalRequestCount: number;
};

type ProjectOpt = { id: number; name: string };

export default function ApprovalFlowsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [flows, setFlows] = useState<ApprovalFlowAdmin[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalFlowAdmin | null>(null);

  const isAdmin = me?.role === "admin";
  const canView = me?.role === "admin" || me?.role === "pm";

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/admin/approval-flows")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setFlows(j?.flows ?? []))
      .catch(() => showToast("Không tải được danh sách flow", "error"))
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

  async function toggleActive(flow: ApprovalFlowAdmin) {
    const res = await fetch(`/api/admin/approval-flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !flow.active }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Đổi trạng thái thất bại", "error");
      return;
    }
    showToast(flow.active ? "Đã tắt flow" : "Đã bật flow", "success");
    load();
  }

  async function removeFlow(flow: ApprovalFlowAdmin) {
    if (!(await appConfirm(`Xoá flow "${flow.name}"?`, { danger: true }))) return;
    const res = await fetch(`/api/admin/approval-flows/${flow.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Xoá thất bại", "error");
      return;
    }
    showToast("Đã xoá flow", "success");
    load();
  }

  if (meLoading) return <PageSkeleton />;

  if (me && !canView) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Cấu hình duyệt" subtitle="Cấu hình flow phê duyệt nhiều cấp" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={Workflow}
            title="Không có quyền truy cập"
            message="Chỉ Admin/PM mới xem được cấu hình flow duyệt."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Cấu hình duyệt"
        subtitle="Flow phê duyệt nhiều cấp theo vai trò, ngưỡng giá trị, SLA"
        bottomActions={
          isAdmin ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm flow"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm flow</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-xl h-40"
              />
            ))}
          </div>
        ) : (
          APPROVAL_ENTITY_TYPES.map((entityType) => {
            const list = flows.filter((f) => f.entityType === entityType);
            return (
              <section key={entityType} className="space-y-3">
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                  {ENTITY_LABEL[entityType]}
                </h2>
                {list.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
                    <EmptyState
                      compact
                      message="Chưa cấu hình — đang duyệt 1 bước qua Admin/PM (mặc định, hành vi cũ)."
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {list.map((flow) => (
                      <FlowCard
                        key={flow.id}
                        flow={flow}
                        isAdmin={isAdmin}
                        onEdit={() => setEditing(flow)}
                        onToggle={() => toggleActive(flow)}
                        onDelete={() => removeFlow(flow)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>

      {addOpen && (
        <FlowFormModal
          mode="create"
          projects={projects}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}

      {editing && (
        <FlowFormModal
          mode="edit"
          flow={editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ── Card hiển thị 1 flow ───────────────────────────────────────────────────────
function FlowCard({
  flow,
  isAdmin,
  onEdit,
  onToggle,
  onDelete,
}: {
  flow: ApprovalFlowAdmin;
  isAdmin: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const canDelete = flow.totalRequestCount === 0;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{flow.name}</p>
          <p className="text-xs text-zinc-400">
            {flow.projectId == null
              ? "Mọi dự án"
              : (flow.projectName ?? `Dự án #${flow.projectId}`)}
          </p>
        </div>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
            flow.active
              ? "bg-emerald-900 text-emerald-200 border border-emerald-800"
              : "bg-zinc-800 text-zinc-400 border border-zinc-700"
          }`}
        >
          {flow.active ? "Bật" : "Tắt"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left py-1 pr-2">STT</th>
              <th className="text-left py-1 pr-2">Vai trò</th>
              <th className="text-left py-1 pr-2">Ngưỡng giá trị</th>
              <th className="text-left py-1">SLA</th>
            </tr>
          </thead>
          <tbody>
            {flow.steps.map((s) => (
              <tr key={s.seq} className="border-b border-zinc-900 last:border-0">
                <td className="py-1 pr-2 text-zinc-300">{s.seq}</td>
                <td className="py-1 pr-2 text-zinc-200">{ROLE_LABELS[s.role] ?? s.role}</td>
                <td className="py-1 pr-2 text-zinc-300">
                  {s.minAmount != null ? `≥ ${formatVnd(s.minAmount)}` : "Luôn áp"}
                </td>
                <td className="py-1 text-zinc-300">
                  {s.slaDays != null ? `${s.slaDays} ngày` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {flow.totalRequestCount > 0 && (
        <p className="text-xs text-zinc-500">
          {flow.pendingCount} đang chờ · {flow.totalRequestCount} tổng
        </p>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <Pencil className="w-3.5 h-3.5" /> Sửa
          </button>
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <Power className="w-3.5 h-3.5" /> {flow.active ? "Tắt" : "Bật"}
          </button>
          <button
            onClick={onDelete}
            disabled={!canDelete}
            title={
              canDelete
                ? undefined
                : "Flow đã có yêu cầu duyệt — không thể xoá, hãy Tắt thay vì Xoá"
            }
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-300 transition ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" /> Xoá
          </button>
        </div>
      )}
    </div>
  );
}

// ── Modal tạo/sửa flow ──────────────────────────────────────────────────────────
type StepDraft = { role: Role; minAmount: string; slaDays: string };

function FlowFormModal({
  mode,
  flow,
  projects,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  flow?: ApprovalFlowAdmin;
  projects: ProjectOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entityType, setEntityType] = useState<ApprovalEntityType>(
    flow?.entityType ?? APPROVAL_ENTITY_TYPES[0],
  );
  const [scope, setScope] = useState<"all" | "project">(
    flow?.projectId != null ? "project" : "all",
  );
  const [projectId, setProjectId] = useState<string>(
    flow?.projectId != null ? String(flow.projectId) : "",
  );
  const [name, setName] = useState(flow?.name ?? "");
  const [steps, setSteps] = useState<StepDraft[]>(
    flow && flow.steps.length > 0
      ? flow.steps.map((s) => ({
          role: s.role,
          minAmount: s.minAmount != null ? String(s.minAmount) : "",
          slaDays: s.slaDays != null ? String(s.slaDays) : "",
        }))
      : [{ role: STEP_ROLES[0], minAmount: "", slaDays: "" }],
  );
  const [saving, setSaving] = useState(false);

  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { role: STEP_ROLES[0], minAmount: "", slaDays: "" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!name.trim()) {
      showToast("Thiếu tên flow", "error");
      return;
    }
    if (steps.length === 0) {
      showToast("Cần ít nhất 1 bước duyệt", "error");
      return;
    }
    if (mode === "create" && scope === "project" && !projectId) {
      showToast("Chọn dự án cụ thể hoặc chuyển sang “Mọi dự án”", "error");
      return;
    }

    const stepsBody = steps.map((s, idx) => ({
      seq: idx + 1,
      role: s.role,
      minAmount: s.minAmount.trim() ? Number(s.minAmount) : null,
      slaDays: s.slaDays.trim() ? Number(s.slaDays) : null,
    }));

    setSaving(true);
    try {
      const res = await (mode === "create"
        ? fetch("/api/admin/approval-flows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: scope === "project" ? Number(projectId) : null,
              entityType,
              name: name.trim(),
              steps: stepsBody,
            }),
          })
        : fetch(`/api/admin/approval-flows/${flow!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), steps: stepsBody }),
          }));
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      showToast(mode === "create" ? "Đã tạo flow" : "Đã lưu thay đổi", "success");
      onSaved();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {mode === "create" ? "Thêm flow" : `Sửa flow: ${flow?.name}`}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === "create" ? (
          <label className="text-xs text-zinc-400 block">
            Loại thực thể
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as ApprovalEntityType)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {APPROVAL_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ENTITY_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-zinc-400">
            Loại thực thể: <span className="text-zinc-200">{ENTITY_LABEL[flow!.entityType]}</span> ·
            Phạm vi:{" "}
            <span className="text-zinc-200">
              {flow!.projectId == null
                ? "Mọi dự án"
                : (flow!.projectName ?? `Dự án #${flow!.projectId}`)}
            </span>{" "}
            <span className="text-zinc-500">(không sửa được sau khi tạo)</span>
          </p>
        )}

        <label className="text-xs text-zinc-400 block">
          Tên flow
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Duyệt VO trên 500 triệu"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {mode === "create" && (
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
        )}

        <div>
          <p className="text-xs text-zinc-400 mb-1.5">Các bước duyệt (theo thứ tự)</p>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div
                key={i}
                className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-2 flex flex-wrap items-center gap-2"
              >
                <span className="text-xs text-zinc-500 w-6 text-center shrink-0">{i + 1}</span>
                <select
                  value={s.role}
                  onChange={(e) => updateStep(i, { role: e.target.value as Role })}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[7rem]"
                >
                  {STEP_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={s.minAmount}
                  onChange={(e) => updateStep(i, { minAmount: e.target.value })}
                  placeholder="Ngưỡng giá trị (đ, tuỳ chọn)"
                  aria-label={`Ngưỡng giá trị bước ${i + 1}`}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs w-40"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={s.slaDays}
                  onChange={(e) => updateStep(i, { slaDays: e.target.value })}
                  placeholder="SLA (ngày, tuỳ chọn)"
                  aria-label={`SLA ngày bước ${i + 1}`}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs w-32"
                />
                <button
                  onClick={() => removeStep(i)}
                  disabled={steps.length <= 1}
                  aria-label={`Xoá bước ${i + 1}`}
                  className="text-zinc-600 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addStep}
            className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm bước
          </button>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : mode === "create" ? "Tạo flow" : "Lưu thay đổi"}
        </button>
      </div>
    </Modal>
  );
}
