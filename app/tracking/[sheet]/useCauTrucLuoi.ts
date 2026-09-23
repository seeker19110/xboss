import { appAlert, appConfirm, appPrompt } from "@/app/components/dialogs";
import type { Grid, GridTask, Pkg } from "./types";

// Các thao tác ĐỔI CẤU TRÚC lưới (di chuyển/sao chép/xoá nhóm, task, cột) — tách khỏi
// `TrackingGrid.tsx` để file lưới chỉ còn dựng giao diện (AC13: giữ dưới mốc 1800 dòng).
// Đặt cạnh nhau vì cùng một khuôn: gọi API, báo lỗi qua `appAlert`, rồi `load()`/`onChanged()`.
export function useCauTrucLuoi(opts: {
  pkg: Pkg;
  grid: Grid | null;
  variantColumns: string[];
  load: () => void;
  onChanged: () => void;
  onToggle: () => void;
  expanded: boolean;
}) {
  const { pkg, grid, variantColumns, load, onChanged, onToggle, expanded } = opts;

  // ── Nhóm (pkg) ─────────────────────────────────────────────────────────

  async function movePkg(direction: "up" | "down") {
    try {
      const res = await fetch(`/api/workpackages/${pkg.id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        appAlert(j.error ?? "Lỗi không xác định");
        return;
      }
    } catch {
      appAlert("Mất kết nối — chưa đổi được thứ tự nhóm, thử lại khi có mạng");
      return;
    }
    onChanged();
  }

  async function copyPkg() {
    const code = await appPrompt("Mã nhóm mới", `${pkg.code}_copy`, { mono: true });
    if (!code?.trim()) return;
    const name = await appPrompt("Tên nhóm mới", `${pkg.name} (bản sao)`);
    if (!name?.trim()) return;
    const res = await fetch(`/api/workpackages/${pkg.id}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), name: name.trim(), afterId: pkg.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    onChanged();
  }

  async function deletePkg() {
    if (
      !(await appConfirm(
        `Xoá nhóm "${pkg.code} — ${pkg.name}"?\n\nToàn bộ ${pkg.tasks.length} task và dữ liệu liên quan sẽ bị xoá vĩnh viễn.`,
        { danger: true, confirmLabel: "Xoá nhóm" },
      ))
    )
      return;
    const res = await fetch(`/api/workpackages/${pkg.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    onChanged();
  }

  // ── Cột (dimension) ────────────────────────────────────────────────────

  async function renameColumn(oldLabel: string) {
    const newLabel = await appPrompt("Đổi tên cột (áp dụng toàn sheet)", oldLabel);
    if (!newLabel || newLabel === oldLabel) return;
    await fetch("/api/dimensions/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId: pkg.id, oldLabel, newLabel }),
    });
    load();
    onChanged();
  }

  async function moveColumn(label: string, direction: "left" | "right") {
    try {
      const res = await fetch(`/api/workpackages/${pkg.id}/dimensions/column/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, direction }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        appAlert(j.error ?? "Lỗi không xác định");
        return;
      }
    } catch {
      appAlert("Mất kết nối — chưa đổi được thứ tự cột, thử lại khi có mạng");
      return;
    }
    load();
    onChanged();
  }

  async function addColumnAfter(afterLabel: string | null) {
    const label = await appPrompt(
      afterLabel ? `Tên cột mới (chèn sau "${afterLabel}")` : "Tên cột mới (thêm vào cuối)",
    );
    if (!label?.trim()) return;
    const res = await fetch(`/api/workpackages/${pkg.id}/dimensions/column`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), afterLabel: afterLabel ?? undefined }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    load();
    onChanged();
  }

  async function deleteColumn(label: string) {
    if (
      !(await appConfirm(
        `Xoá cột "${label}" khỏi TẤT CẢ nhóm trong trang này?\n\nToàn bộ trạng thái tick của cột này ở mọi nhóm sẽ bị xoá vĩnh viễn.`,
        { danger: true, confirmLabel: "Xoá cột toàn trang" },
      ))
    )
      return;
    const res = await fetch(
      `/api/workpackages/${pkg.id}/dimensions/column?label=${encodeURIComponent(label)}&allGroups=true`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    load();
    onChanged();
  }

  async function deleteVariantColumns() {
    if (!grid || variantColumns.length === 0) return;
    if (
      !(await appConfirm(
        `Xoá ${variantColumns.length} cột biến thể (${variantColumns
          .slice(0, 3)
          .map((c) => c.match(/ \((\d+)\)$/)?.[1])
          .join(", ")}...)?` +
          "\n\nThao tác này xoá toàn bộ dữ liệu checkbox trong các cột đó và không thể hoàn tác.",
      ))
    )
      return;
    for (const col of variantColumns) {
      await fetch(
        `/api/workpackages/${pkg.id}/dimensions/column?label=${encodeURIComponent(col)}&allGroups=true`,
        { method: "DELETE" },
      );
    }
    load();
    onChanged();
  }

  // ── Task ───────────────────────────────────────────────────────────────

  async function deleteTask(t: GridTask) {
    if (
      !(await appConfirm(
        `Xoá task "${t.code} — ${t.name}"?\n\nToàn bộ ảnh, bình luận, lịch sử liên quan sẽ bị xoá vĩnh viễn.`,
        { danger: true, confirmLabel: "Xoá task" },
      ))
    )
      return;
    const res = await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    load();
    onChanged();
  }

  async function copyTask(t: GridTask) {
    const code = await appPrompt("Mã task mới", `${t.code}_copy`, { mono: true });
    if (!code?.trim()) return;
    const name = await appPrompt("Tên task mới", `${t.name} (bản sao)`);
    if (!name?.trim()) return;
    const res = await fetch(`/api/tasks/${t.id}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), name: name.trim(), afterId: t.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    load();
    onChanged();
  }

  async function insertBlankTask(afterId: number | null) {
    const code = await appPrompt("Mã task mới (vd A1,10):");
    if (!code?.trim()) return;
    const name = await appPrompt("Tên task:");
    if (!name?.trim()) return;
    const boqCode = await appPrompt("Mã BOQ (bỏ trống nếu không có):");
    let res: Response;
    try {
      res = await fetch(`/api/workpackages/${pkg.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          boqCode: boqCode?.trim() || undefined,
          afterId: afterId ?? undefined,
        }),
      });
    } catch {
      appAlert("Mất kết nối — chưa thêm được task, thử lại khi có mạng");
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    if (afterId == null && !expanded) onToggle();
    load();
    onChanged();
  }

  async function moveTask(t: GridTask, direction: "up" | "down") {
    await fetch(`/api/tasks/${t.id}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    load();
  }

  async function resetTaskDates(t: GridTask) {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: null, endDate: null }),
    });
    load();
    onChanged();
  }

  return {
    movePkg,
    copyPkg,
    deletePkg,
    renameColumn,
    moveColumn,
    addColumnAfter,
    deleteColumn,
    deleteVariantColumns,
    deleteTask,
    copyTask,
    insertBlankTask,
    moveTask,
    resetTaskDates,
  };
}
