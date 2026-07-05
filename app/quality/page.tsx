"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  X,
  Search,
  Check,
  ShieldCheck,
  AlertTriangle,
  ClipboardCheck,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, redirectToLogin, type Me } from "@/app/lib/me";
import { todayISO } from "@/lib/date";

// ── Types ──────────────────────────────────────────────────────────────────

type ChecklistItem = {
  label: string;
  type: "pass_fail" | "measure";
  unit?: string;
  designValue?: string;
};
type Checklist = {
  id: number;
  name: string;
  category: "work" | "tc" | "hse";
  disciplineId: number | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  required: boolean;
  items: ChecklistItem[];
  active: boolean;
};
type Discipline = { id: number; code: string; name: string };
type TaskHit = { id: number; code: string; name: string; sheetType: string };

type InspectionResult = { label: string; pass: boolean; measured?: string; note?: string };
type Inspection = {
  id: number;
  checklistId: number;
  checklistName: string;
  taskId: number | null;
  taskCode: string | null;
  workPackageId: number | null;
  packageCode: string | null;
  results: InspectionResult[];
  status: "draft" | "submitted" | "passed" | "failed";
  inspectedByName: string | null;
  approvedByName: string | null;
  inspectedAt: string;
};

type Ncr = {
  id: number;
  code: string;
  taskId: number | null;
  taskCode: string | null;
  description: string;
  assignedTo: number | null;
  assignedToName: string | null;
  dueDate: string | null;
  status: "open" | "fixing" | "recheck" | "closed";
  createdByName: string | null;
  createdAt: string;
  closedAt: string | null;
};
type UserOpt = { id: number; name: string };

const CATEGORY_LABEL: Record<string, string> = { work: "Công việc", tc: "T&C", hse: "HSE" };
const INSPECTION_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Chờ duyệt",
  passed: "Đạt",
  failed: "Không đạt",
};
const NCR_STATUS_LABEL: Record<string, string> = {
  open: "Mở",
  fixing: "Đang khắc phục",
  recheck: "Chờ kiểm lại",
  closed: "Đã đóng",
};

function badgeClass(kind: "ok" | "warn" | "bad" | "neutral") {
  if (kind === "ok") return "bg-emerald-950/60 text-emerald-300 border-emerald-800";
  if (kind === "warn") return "bg-amber-950/60 text-amber-300 border-amber-800";
  if (kind === "bad") return "bg-rose-950/60 text-rose-300 border-rose-800";
  return "bg-zinc-800 text-zinc-300 border-zinc-700";
}
function inspectionBadgeKind(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "passed") return "ok";
  if (status === "failed") return "bad";
  if (status === "submitted") return "warn";
  return "neutral";
}
function ncrBadgeKind(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "closed") return "ok";
  if (status === "open") return "bad";
  return "warn";
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function QualityPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<"checklists" | "inspections" | "ncrs">("inspections");
  const [loading, setLoading] = useState(true);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [ncrs, setNcrs] = useState<Ncr[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [checklistModal, setChecklistModal] = useState(false);
  const [inspectionModal, setInspectionModal] = useState(false);
  const [ncrModal, setNcrModal] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "pm";

  async function loadAll() {
    const [meRes, clRes, discRes, inspRes, ncrRes] = await Promise.all([
      fetchMe(),
      fetch("/api/qc/checklists"),
      fetch("/api/disciplines"),
      fetch("/api/qc/inspections"),
      fetch("/api/ncrs"),
    ]);
    if (!meRes) {
      redirectToLogin();
      return;
    }
    setMe(meRes);
    setChecklists(clRes.ok ? ((await clRes.json())?.checklists ?? []) : []);
    setDisciplines(discRes.ok ? ((await discRes.json())?.disciplines ?? []) : []);
    setInspections(inspRes.ok ? ((await inspRes.json())?.inspections ?? []) : []);
    setNcrs(ncrRes.ok ? ((await ncrRes.json())?.ncrs ?? []) : []);
    if (meRes.role === "admin" || meRes.role === "pm") {
      const ur = await fetch("/api/users");
      setUsers(ur.ok ? ((await ur.json())?.users ?? []) : []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Chất lượng" subtitle="Checklist · Kiểm tra · NCR" />

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4">
        <div
          className="flex gap-1 border-b border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
        >
          {(
            [
              ["inspections", "Kiểm tra"],
              ["checklists", "Checklist mẫu"],
              ["ncrs", "NCR"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition shrink-0 ${
                tab === key
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "checklists" && (
          <ChecklistsTab
            checklists={checklists}
            disciplines={disciplines}
            canManage={canManage}
            onAdd={() => setChecklistModal(true)}
            onChanged={loadAll}
          />
        )}
        {tab === "inspections" && (
          <InspectionsTab
            inspections={inspections}
            checklists={checklists}
            canApprove={canManage}
            onAdd={() => setInspectionModal(true)}
            onChanged={loadAll}
          />
        )}
        {tab === "ncrs" && (
          <NcrsTab
            ncrs={ncrs}
            users={users}
            canClose={canManage}
            onAdd={() => setNcrModal(true)}
            onChanged={loadAll}
          />
        )}
      </main>

      {checklistModal && (
        <ChecklistFormModal
          disciplines={disciplines}
          onClose={() => setChecklistModal(false)}
          onSaved={() => {
            setChecklistModal(false);
            loadAll();
          }}
        />
      )}
      {inspectionModal && (
        <InspectionFormModal
          checklists={checklists}
          onClose={() => setInspectionModal(false)}
          onSaved={() => {
            setInspectionModal(false);
            loadAll();
          }}
        />
      )}
      {ncrModal && (
        <NcrFormModal
          users={users}
          onClose={() => setNcrModal(false)}
          onSaved={() => {
            setNcrModal(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

// ── Tab: Checklist mẫu ───────────────────────────────────────────────────────

function ChecklistsTab({
  checklists,
  disciplines,
  canManage,
  onAdd,
  onChanged,
}: {
  checklists: Checklist[];
  disciplines: Discipline[];
  canManage: boolean;
  onAdd: () => void;
  onChanged: () => void;
}) {
  async function remove(c: Checklist) {
    if (!(await appConfirm(`Xoá checklist "${c.name}"?`, { danger: true, confirmLabel: "Xoá" })))
      return;
    const res = await fetch(`/api/qc/checklists/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      appAlert(j?.error ?? "Xoá thất bại");
      return;
    }
    onChanged();
  }

  async function toggleRequired(c: Checklist) {
    await fetch(`/api/qc/checklists/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ required: !c.required }),
    });
    onChanged();
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <button
          onClick={onAdd}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded-lg text-sm font-semibold transition"
        >
          <Plus className="w-4 h-4" /> Thêm checklist
        </button>
      )}
      {checklists.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Chưa có mẫu checklist nào"
          message={canManage ? 'Bấm "Thêm checklist" để tạo mẫu đầu tiên.' : "Chưa có dữ liệu."}
        />
      ) : (
        <div className="space-y-2">
          {checklists.map((c) => (
            <div
              key={c.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                  {c.name}
                  <span
                    className={`text-[10px] border rounded-full px-2 py-0.5 ${badgeClass("neutral")}`}
                  >
                    {CATEGORY_LABEL[c.category]}
                  </span>
                  {c.disciplineName && (
                    <span className="text-[10px] text-zinc-400">{c.disciplineName}</span>
                  )}
                  {c.required && (
                    <span
                      className={`text-[10px] border rounded-full px-2 py-0.5 ${badgeClass("warn")}`}
                    >
                      Bắt buộc nghiệm thu
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">{c.items.length} hạng mục</p>
              </div>
              {canManage && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleRequired(c)}
                    className="text-[11px] border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-2 py-1 rounded-lg transition"
                  >
                    {c.required ? "Bỏ bắt buộc" : "Đặt bắt buộc"}
                  </button>
                  <button
                    onClick={() => remove(c)}
                    aria-label={`Xoá checklist ${c.name}`}
                    className="text-zinc-600 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        Danh mục hệ: {disciplines.map((d) => d.name).join(", ") || "—"}
      </p>
    </div>
  );
}

function ChecklistFormModal({
  disciplines,
  onClose,
  onSaved,
}: {
  disciplines: Discipline[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"work" | "tc" | "hse">("work");
  const [disciplineId, setDisciplineId] = useState<string>("");
  const [required, setRequired] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>([{ label: "", type: "pass_fail" }]);
  const [saving, setSaving] = useState(false);

  function updateItem(i: number, patch: Partial<ChecklistItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function save() {
    if (!name.trim()) {
      showToast("Thiếu tên checklist", "error");
      return;
    }
    const cleanItems = items.filter((it) => it.label.trim());
    if (cleanItems.length === 0) {
      showToast("Cần ít nhất 1 hạng mục", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/qc/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          disciplineId: disciplineId ? Number(disciplineId) : null,
          required,
          items: cleanItems,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      onSaved();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">Thêm checklist</h2>
        <button onClick={onClose} aria-label="Đóng" className="text-zinc-500 hover:text-zinc-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto">
        <label className="block">
          <span className="text-xs text-zinc-400">Tên checklist</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
          />
        </label>
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="text-xs text-zinc-400">Loại</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as "work" | "tc" | "hse")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="work">Công việc</option>
              <option value="tc">T&C</option>
              <option value="hse">HSE</option>
            </select>
          </label>
          <label className="block flex-1">
            <span className="text-xs text-zinc-400">Hệ (tuỳ chọn)</span>
            <select
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">— Mọi hệ —</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-xs text-zinc-300">
            Bắt buộc: task chỉ nghiệm thu được khi có inspection Đạt theo mẫu này
          </span>
        </label>

        <div>
          <span className="text-xs text-zinc-400">Hạng mục kiểm tra</span>
          <div className="space-y-2 mt-1">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={it.label}
                  onChange={(e) => updateItem(i, { label: e.target.value })}
                  placeholder="Tên hạng mục"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                />
                <select
                  value={it.type}
                  onChange={(e) => updateItem(i, { type: e.target.value as ChecklistItem["type"] })}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                >
                  <option value="pass_fail">Đạt/Không</option>
                  <option value="measure">Đo số</option>
                </select>
                <button
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Xoá hạng mục"
                  className="text-zinc-600 hover:text-rose-400 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setItems((prev) => [...prev, { label: "", type: "pass_fail" }])}
            className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-300 mt-2 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm hạng mục
          </button>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2">
          Huỷ
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition"
        >
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ── Tab: Kiểm tra ────────────────────────────────────────────────────────────

function InspectionsTab({
  inspections,
  checklists,
  canApprove,
  onAdd,
  onChanged,
}: {
  inspections: Inspection[];
  checklists: Checklist[];
  canApprove: boolean;
  onAdd: () => void;
  onChanged: () => void;
}) {
  async function decide(i: Inspection, status: "passed" | "failed") {
    const res = await fetch(`/api/qc/inspections/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Không duyệt được", "error");
      return;
    }
    onChanged();
  }

  async function submit(i: Inspection) {
    const res = await fetch(`/api/qc/inspections/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "submitted" }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Không gửi được", "error");
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-3">
      <button
        onClick={onAdd}
        disabled={checklists.length === 0}
        className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-semibold transition"
      >
        <Plus className="w-4 h-4" /> Kiểm tra mới
      </button>
      {checklists.length === 0 && (
        <p className="text-[11px] text-amber-400">Cần tạo checklist mẫu trước khi kiểm tra.</p>
      )}
      {inspections.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Chưa có lần kiểm tra nào"
          message='Bấm "Kiểm tra mới" để bắt đầu.'
        />
      ) : (
        <div className="space-y-2">
          {inspections.map((i) => (
            <div key={i.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{i.checklistName}</p>
                  <p className="text-[11px] text-zinc-400">
                    {i.taskCode ?? i.packageCode ?? "—"} · người kiểm: {i.inspectedByName ?? "—"}
                    {i.approvedByName ? ` · duyệt bởi ${i.approvedByName}` : ""}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 shrink-0 ${badgeClass(inspectionBadgeKind(i.status))}`}
                >
                  {INSPECTION_STATUS_LABEL[i.status]}
                </span>
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                {i.status === "draft" && (
                  <button
                    onClick={() => submit(i)}
                    className="text-[11px] border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-2 py-1 rounded-lg transition"
                  >
                    Gửi duyệt
                  </button>
                )}
                {i.status === "submitted" && canApprove && (
                  <>
                    <button
                      onClick={() => decide(i, "passed")}
                      className="flex items-center gap-1 text-[11px] bg-emerald-800/60 hover:bg-emerald-700/60 text-emerald-200 px-2 py-1 rounded-lg transition"
                    >
                      <Check className="w-3 h-3" /> Đạt
                    </button>
                    <button
                      onClick={() => decide(i, "failed")}
                      className="flex items-center gap-1 text-[11px] bg-rose-800/60 hover:bg-rose-700/60 text-rose-200 px-2 py-1 rounded-lg transition"
                    >
                      <AlertTriangle className="w-3 h-3" /> Không đạt
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InspectionFormModal({
  checklists,
  onClose,
  onSaved,
}: {
  checklists: Checklist[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [checklistId, setChecklistId] = useState<string>(String(checklists[0]?.id ?? ""));
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TaskHit[]>([]);
  const [task, setTask] = useState<TaskHit | null>(null);
  const [results, setResults] = useState<InspectionResult[]>([]);
  const [saving, setSaving] = useState(false);

  const checklist = checklists.find((c) => String(c.id) === checklistId);

  useEffect(() => {
    setResults(
      (checklist?.items ?? []).map((it) => ({ label: it.label, pass: true, measured: "" })),
    );
  }, [checklistId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setHits((j?.hits ?? []).filter((h: { kind: string }) => h.kind === "task")))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function save(status: "draft" | "submitted") {
    if (!checklistId) {
      showToast("Chọn checklist", "error");
      return;
    }
    if (!task) {
      showToast("Chọn task cần kiểm tra", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/qc/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklistId: Number(checklistId),
          taskId: task.id,
          results,
          status,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      onSaved();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">Kiểm tra mới</h2>
        <button onClick={onClose} aria-label="Đóng" className="text-zinc-500 hover:text-zinc-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto">
        <label className="block">
          <span className="text-xs text-zinc-400">Checklist</span>
          <select
            value={checklistId}
            onChange={(e) => setChecklistId(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none"
          >
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-xs text-zinc-400">Task</span>
          {task ? (
            <div className="mt-1 flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
              <span className="text-xs">
                {task.code} — {task.name}
              </span>
              <button onClick={() => setTask(null)} aria-label="Bỏ chọn task">
                <X className="w-3.5 h-3.5 text-zinc-500 hover:text-rose-400" />
              </button>
            </div>
          ) : (
            <div className="relative mt-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm task theo mã/tên..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none"
              />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        setTask(h);
                        setQ("");
                        setHits([]);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 transition"
                    >
                      {h.code} — {h.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {checklist && checklist.items.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-zinc-400">Hạng mục</span>
            {checklist.items.map((it, i) => (
              <div key={i} className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-2.5">
                <p className="text-xs font-medium mb-1.5">{it.label}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() =>
                      setResults((prev) =>
                        prev.map((r, ri) => (ri === i ? { ...r, pass: true } : r)),
                      )
                    }
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                      results[i]?.pass
                        ? "bg-emerald-800/60 border-emerald-700 text-emerald-200"
                        : "border-zinc-700 text-zinc-400"
                    }`}
                  >
                    Đạt
                  </button>
                  <button
                    onClick={() =>
                      setResults((prev) =>
                        prev.map((r, ri) => (ri === i ? { ...r, pass: false } : r)),
                      )
                    }
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                      results[i] && !results[i].pass
                        ? "bg-rose-800/60 border-rose-700 text-rose-200"
                        : "border-zinc-700 text-zinc-400"
                    }`}
                  >
                    Không đạt
                  </button>
                  {it.type === "measure" && (
                    <input
                      value={results[i]?.measured ?? ""}
                      onChange={(e) =>
                        setResults((prev) =>
                          prev.map((r, ri) => (ri === i ? { ...r, measured: e.target.value } : r)),
                        )
                      }
                      placeholder={`Đo${it.unit ? ` (${it.unit})` : ""}`}
                      className="flex-1 min-w-[100px] bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs focus:outline-none"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2">
          Huỷ
        </button>
        <button
          onClick={() => save("draft")}
          disabled={saving}
          className="text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-300 disabled:opacity-50 px-3 py-2 rounded-lg transition"
        >
          Lưu nháp
        </button>
        <button
          onClick={() => save("submitted")}
          disabled={saving}
          className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition"
        >
          {saving ? "Đang lưu..." : "Gửi duyệt"}
        </button>
      </div>
    </Modal>
  );
}

// ── Tab: NCR ─────────────────────────────────────────────────────────────────

function NcrsTab({
  ncrs,
  users,
  canClose,
  onAdd,
  onChanged,
}: {
  ncrs: Ncr[];
  users: UserOpt[];
  canClose: boolean;
  onAdd: () => void;
  onChanged: () => void;
}) {
  const today = todayISO();

  async function setStatus(n: Ncr, status: Ncr["status"]) {
    const res = await fetch(`/api/ncrs/${n.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Không đổi được trạng thái", "error");
      return;
    }
    onChanged();
  }

  const sorted = [...ncrs].sort((a, b) => {
    const aOver = a.status !== "closed" && a.dueDate && a.dueDate < today;
    const bOver = b.status !== "closed" && b.dueDate && b.dueDate < today;
    if (aOver !== bOver) return aOver ? -1 : 1;
    return 0;
  });

  return (
    <div className="space-y-3">
      <button
        onClick={onAdd}
        className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded-lg text-sm font-semibold transition"
      >
        <Plus className="w-4 h-4" /> NCR mới
      </button>
      {sorted.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Chưa có NCR nào"
          message='Bấm "NCR mới" để ghi nhận điểm không phù hợp.'
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => {
            const overdue = n.status !== "closed" && !!n.dueDate && n.dueDate < today;
            return (
              <div
                key={n.id}
                className={`bg-zinc-900 border rounded-xl p-3 ${overdue ? "border-rose-800" : "border-zinc-800"}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-2">
                      {n.code}
                      {overdue && (
                        <span className="flex items-center gap-1 text-[10px] text-rose-400">
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Quá hạn
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-300 mt-0.5">{n.description}</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {n.taskCode ? `${n.taskCode} · ` : ""}
                      Gán: {n.assignedToName ?? "—"} · Hạn: {n.dueDate ?? "—"}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 shrink-0 ${badgeClass(ncrBadgeKind(n.status))}`}
                  >
                    {NCR_STATUS_LABEL[n.status]}
                  </span>
                </div>
                {n.status !== "closed" && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {n.status === "open" && (
                      <button
                        onClick={() => setStatus(n, "fixing")}
                        className="text-[11px] border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-2 py-1 rounded-lg transition"
                      >
                        Bắt đầu khắc phục
                      </button>
                    )}
                    {n.status === "fixing" && (
                      <button
                        onClick={() => setStatus(n, "recheck")}
                        className="text-[11px] border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-2 py-1 rounded-lg transition"
                      >
                        Đã khắc phục — chờ kiểm lại
                      </button>
                    )}
                    {canClose && (
                      <button
                        onClick={() => setStatus(n, "closed")}
                        className="flex items-center gap-1 text-[11px] bg-emerald-800/60 hover:bg-emerald-700/60 text-emerald-200 px-2 py-1 rounded-lg transition"
                      >
                        <Check className="w-3 h-3" /> Đóng NCR
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NcrFormModal({
  users,
  onClose,
  onSaved,
}: {
  users: UserOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TaskHit[]>([]);
  const [task, setTask] = useState<TaskHit | null>(null);
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setHits((j?.hits ?? []).filter((h: { kind: string }) => h.kind === "task")))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function save() {
    if (!description.trim()) {
      showToast("Thiếu mô tả", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ncrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          taskId: task?.id ?? null,
          assignedTo: assignedTo ? Number(assignedTo) : null,
          dueDate: dueDate || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      onSaved();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">NCR mới</h2>
        <button onClick={onClose} aria-label="Đóng" className="text-zinc-500 hover:text-zinc-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-zinc-400">Mô tả điểm không phù hợp</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
          />
        </label>

        <div>
          <span className="text-xs text-zinc-400">Task liên quan (tuỳ chọn)</span>
          {task ? (
            <div className="mt-1 flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
              <span className="text-xs">
                {task.code} — {task.name}
              </span>
              <button onClick={() => setTask(null)} aria-label="Bỏ chọn task">
                <X className="w-3.5 h-3.5 text-zinc-500 hover:text-rose-400" />
              </button>
            </div>
          ) : (
            <div className="relative mt-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm task theo mã/tên..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs focus:outline-none"
              />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        setTask(h);
                        setQ("");
                        setHits([]);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 transition"
                    >
                      {h.code} — {h.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="text-xs text-zinc-400">Gán cho</span>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">— Chưa gán —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1">
            <span className="text-xs text-zinc-400">Hạn khắc phục</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2">
          Huỷ
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition"
        >
          {saving ? "Đang lưu..." : "Tạo NCR"}
        </button>
      </div>
    </Modal>
  );
}
