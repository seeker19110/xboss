"use client";
// Trang admin quản lý trường tuỳ biến (M52 PR2 — custom_field_defs). Đọc/ghi qua
// GET/POST /api/admin/custom-fields và PATCH/DELETE /api/admin/custom-fields/:id
// (lib/custom-fields.ts, chỉ chạy server). Admin thao tác; PM chỉ xem.
// Không cho đổi kiểu khi đã có dữ liệu tham chiếu (API trả 409). Tìm kiếm/lọc theo
// trường tuỳ biến nằm ngoài phạm vi v1 (ghi rõ trên UI).
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X, Pencil, SlidersHorizontal } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

const ENTITY_TYPES: { key: string; label: string }[] = [
  { key: "task", label: "Công việc (task)" },
  { key: "contract", label: "Hợp đồng" },
  { key: "material", label: "Vật tư" },
  { key: "work_package", label: "Nhóm công việc" },
];
const ENTITY_LABEL: Record<string, string> = Object.fromEntries(
  ENTITY_TYPES.map((e) => [e.key, e.label]),
);

const FIELD_TYPES: { key: string; label: string }[] = [
  { key: "text", label: "Văn bản" },
  { key: "number", label: "Số" },
  { key: "date", label: "Ngày" },
  { key: "select", label: "Lựa chọn" },
  { key: "checkbox", label: "Có/Không" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  FIELD_TYPES.map((t) => [t.key, t.label]),
);

type CustomFieldDef = {
  id: number;
  projectId: number | null;
  entityType: string;
  key: string;
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
  sort: number;
  active: boolean;
};
type ProjectOption = { id: number; name: string };

export default function CustomFieldsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [entityType, setEntityType] = useState<string>(ENTITY_TYPES[0].key);
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDef | null>(null);

  const isAdmin = me?.role === "admin";
  const canView = me?.role === "admin" || me?.role === "pm";

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/admin/custom-fields")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDefs(j?.defs ?? []))
      .catch(() => showToast("Không tải được trường tuỳ biến", "error"))
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
      .catch(() => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function toggleActive(row: CustomFieldDef) {
    const res = await fetch(`/api/admin/custom-fields/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !row.active }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    load();
  }

  async function removeItem(row: CustomFieldDef) {
    if (
      !(await appConfirm(`Xoá trường "${row.label}" (${row.key})? Giá trị đã lưu vẫn giữ nguyên.`, {
        danger: true,
      }))
    )
      return;
    const res = await fetch(`/api/admin/custom-fields/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Xoá thất bại", "error");
      return;
    }
    showToast("Đã xoá", "success");
    load();
  }

  if (meLoading) return <PageSkeleton />;

  if (me && !canView) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Trường tuỳ biến" subtitle="Cấu hình trường tuỳ biến cho các đối tượng" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={SlidersHorizontal}
            title="Không có quyền truy cập"
            message="Chỉ Admin và PM mới xem được cấu hình trường tuỳ biến."
          />
        </main>
      </div>
    );
  }

  const rows = defs.filter((d) => d.entityType === entityType);
  const projName = (id: number | null) =>
    id == null ? "Mọi dự án" : (projects.find((p) => p.id === id)?.name ?? `Dự án #${id}`);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Trường tuỳ biến"
        subtitle="Thêm trường dữ liệu tuỳ biến cho công việc, hợp đồng, vật tư, nhóm công việc — không cần sửa code"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-5">
        <p className="text-xs text-zinc-500">
          Lưu ý: tìm kiếm và lọc theo trường tuỳ biến chưa được hỗ trợ ở phiên bản này.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm text-zinc-400 flex items-center gap-2">
            Đối tượng
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              {ENTITY_TYPES.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          {isAdmin && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm trường
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-xl h-12"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="Chưa có trường nào"
            message={`${ENTITY_LABEL[entityType]} chưa có trường tuỳ biến${isAdmin ? ' — bấm "Thêm trường".' : "."}`}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800">
                  <th className="text-left px-4 py-2.5">Khoá</th>
                  <th className="text-left px-4 py-2.5">Nhãn</th>
                  <th className="text-left px-4 py-2.5 w-28">Kiểu</th>
                  <th className="text-left px-4 py-2.5 w-24">Bắt buộc</th>
                  <th className="text-left px-4 py-2.5 w-32">Phạm vi</th>
                  <th className="text-left px-4 py-2.5 w-24">Trạng thái</th>
                  {isAdmin && <th className="text-left px-4 py-2.5 w-28">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rows.map((row) => (
                  <tr key={row.id} className={row.active ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{row.key}</td>
                    <td className="px-4 py-2.5 text-zinc-200">{row.label}</td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {TYPE_LABEL[row.type] ?? row.type}
                      {row.type === "select" && row.options?.length ? (
                        <span className="block text-[10px] text-zinc-500 truncate max-w-[140px]">
                          {row.options.join(", ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{row.required ? "Có" : "—"}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{projName(row.projectId)}</td>
                    <td className="px-4 py-2.5">
                      {isAdmin ? (
                        <button
                          onClick={() => toggleActive(row)}
                          className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                            row.active
                              ? "bg-emerald-950 text-emerald-200"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {row.active ? "Đang bật" : "Đã tắt"}
                        </button>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                            row.active
                              ? "bg-emerald-950 text-emerald-200"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {row.active ? "Đang bật" : "Đã tắt"}
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditing(row)}
                            className="flex items-center gap-1 text-sky-300 hover:text-sky-200 text-xs"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Sửa
                          </button>
                          <button
                            onClick={() => removeItem(row)}
                            className="flex items-center gap-1 text-rose-300 hover:text-rose-200 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Xoá
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {adding && (
        <DefModal
          mode="create"
          entityType={entityType}
          projects={projects}
          nextSort={rows.length ? Math.max(...rows.map((r) => r.sort)) + 1 : 0}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {editing && (
        <DefModal
          mode="edit"
          def={editing}
          entityType={editing.entityType}
          projects={projects}
          nextSort={editing.sort}
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

// ── Modal thêm/sửa định nghĩa trường ───────────────────────────────────────────
function DefModal({
  mode,
  def,
  entityType,
  projects,
  nextSort,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  def?: CustomFieldDef;
  entityType: string;
  projects: ProjectOption[];
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(def?.key ?? "");
  const [label, setLabel] = useState(def?.label ?? "");
  const [type, setType] = useState(def?.type ?? "text");
  const [optionsText, setOptionsText] = useState((def?.options ?? []).join("\n"));
  const [required, setRequired] = useState(def?.required ?? false);
  const [projectId, setProjectId] = useState<string>(
    def?.projectId != null ? String(def.projectId) : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (mode === "create" && !/^[a-z][a-z0-9_]*$/.test(key.trim())) {
      showToast("Khoá phải snake_case (chữ thường/số/gạch dưới, bắt đầu bằng chữ)", "error");
      return;
    }
    if (!label.trim()) {
      showToast("Nhập nhãn hiển thị", "error");
      return;
    }
    const options =
      type === "select"
        ? optionsText
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
    if (type === "select" && (!options || options.length === 0)) {
      showToast("Trường lựa chọn phải có ít nhất 1 giá trị", "error");
      return;
    }

    setSaving(true);
    try {
      const res =
        mode === "create"
          ? await fetch("/api/admin/custom-fields", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                entityType,
                key: key.trim(),
                label: label.trim(),
                type,
                options,
                required,
                sort: nextSort,
                projectId: projectId === "" ? null : Number(projectId),
              }),
            })
          : await fetch(`/api/admin/custom-fields/${def!.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label: label.trim(), type, options, required }),
            });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      showToast(mode === "create" ? "Đã thêm trường" : "Đã cập nhật", "success");
      onSaved();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white";

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {mode === "create" ? "Thêm trường tuỳ biến" : `Sửa trường: ${def?.label}`}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === "create" ? (
          <>
            <label className="text-xs text-zinc-400 block">
              Khoá (snake_case — định danh, không đổi sau khi tạo)
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="vd: ma_nha_thau"
                className={`${inputCls} font-mono`}
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              Phạm vi
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputCls}
              >
                <option value="">Mọi dự án</option>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <p className="text-xs text-zinc-500 font-mono">
            {def?.key} · {def?.projectId == null ? "Mọi dự án" : `Dự án #${def?.projectId}`}
          </p>
        )}

        <label className="text-xs text-zinc-400 block">
          Nhãn hiển thị
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="vd: Mã nhà thầu"
            className={inputCls}
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Kiểu dữ liệu
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {FIELD_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {mode === "edit" && (
          <p className="text-[11px] text-amber-300/80">
            Đổi kiểu sẽ bị chặn nếu đã có bản ghi dùng trường này.
          </p>
        )}

        {type === "select" && (
          <label className="text-xs text-zinc-400 block">
            Danh sách lựa chọn (mỗi dòng một giá trị)
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={4}
              placeholder={"Giá trị A\nGiá trị B"}
              className={inputCls}
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          Bắt buộc nhập
        </label>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : mode === "create" ? "Thêm trường" : "Lưu thay đổi"}
        </button>
      </div>
    </Modal>
  );
}
