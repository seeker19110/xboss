import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Pencil,
  Check,
  X,
  History,
  Link2,
  Camera,
  Trash2,
  Upload,
  MessageSquare,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  ChevronRight,
  ChevronDown,
  Columns,
  Copy,
  RotateCcw,
  CalendarDays,
  FileText,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { Modal, appAlert, appConfirm, appPrompt } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { DELAY_REASON_LABEL } from "@/lib/tien-do/delay";
import { formatDateVN } from "@/lib/nen/date";
import { StatusBadge } from "@/app/components/StatusBadge";
import { DateEditModal } from "./DateEditModal";
import { PhotosModal } from "./modals/PhotosModal";
import { PkgDatesModal } from "./modals/PkgDatesModal";
import { CommentsModal } from "./modals/CommentsModal";
import { HistoryModal } from "./modals/HistoryModal";
import type { Pkg, Cell, GridTask, Grid } from "./types";
import { dungLoTick } from "./tick";
import {
  guiLoTick,
  guiNgayHangLoat,
  guiSuaNhom,
  xoaNgayRiengTaskCon,
  baoLoiSuaNhom,
} from "./tickApi";
import { useTickVung } from "./useTickVung";
import { ThanhVungChon } from "./ThanhVungChon";
import { ODimension } from "./ODimension";

// Ngày rút gọn d/M cho dòng task (đỡ chiếm chỗ trên lưới).
const fmtShortDate = (d: string | null) => {
  if (!d) return "?";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "?" : `${dt.getDate()}/${dt.getMonth() + 1}`;
};

const fmtColDate = (d: string | null) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

// Số ngày thi công (bao gồm 2 đầu).
const diffDays = (s: string | null, e: string | null) => {
  if (!s || !e) return null;
  const d = Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000);
  return d >= 0 ? d + 1 : null;
};

// Render tên có định dạng: **đậm** và __mảnh__
function renderName(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]*\*\*|__[^_]*__)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("__") && p.endsWith("__"))
          return (
            <span key={i} className="font-light">
              {p.slice(2, -2)}
            </span>
          );
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function TrackingGrid({
  pkg,
  pkgIdx,
  pkgCount,
  expanded,
  onToggle,
  canEdit,
  editMode,
  refreshKey,
  isMobile,
  onChanged,
  onOfflineTick,
  onOfflineTickBatch,
  hiddenPrintCols,
  onColsLoaded,
  sheetCols,
  pendingFront,
  qcReason,
}: {
  pkg: Pkg;
  pkgIdx: number;
  pkgCount: number;
  expanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  editMode: boolean;
  refreshKey: number;
  isMobile: boolean;
  onChanged: () => void;
  onOfflineTick: (dimId: number, installed: boolean) => void;
  onOfflineTickBatch: (dimIds: number[], installed: boolean) => void;
  hiddenPrintCols: Set<string>;
  onColsLoaded: (cols: string[]) => void;
  sheetCols: string[];
  pendingFront: boolean;
  qcReason?: string;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [editName, setEditName] = useState<string | null>(null);
  const [editFloor, setEditFloor] = useState<string | null>(null);
  const [editDays, setEditDays] = useState<string | null>(null);
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [editTask, setEditTask] = useState<{ id: number; value: string } | null>(null);
  const [historyTask, setHistoryTask] = useState<GridTask | null>(null);
  const [photosTask, setPhotosTask] = useState<GridTask | null>(null);
  const [commentsTask, setCommentsTask] = useState<GridTask | null>(null);
  const [datesTarget, setDatesTarget] = useState<{
    ids: number[];
    init: { start: string; end: string };
    // Ngày thực tế (M120) — chỉ hiện để đối chiếu với ngày kế hoạch đang sửa, không sửa
    // được. Bỏ trống khi sửa hàng loạt (mỗi task một bộ ngày thực tế khác nhau).
    actual?: { start: string | null; end: string | null };
  } | null>(null);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const bbntInputRef = useRef<HTMLInputElement>(null);
  const editTaskInputRef = useRef<HTMLInputElement>(null);
  const editPkgInputRef = useRef<HTMLInputElement>(null);

  function wrapSel(
    ref: React.RefObject<HTMLInputElement | null>,
    marker: string,
    getValue: () => string,
    setValue: (v: string) => void,
  ) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const v = getValue();
    const newVal = v.slice(0, s) + marker + v.slice(s, e) + marker + v.slice(e);
    setValue(newVal);
    requestAnimationFrame(() => {
      el.setSelectionRange(s + marker.length, e + marker.length);
      el.focus();
    });
  }

  const load = useCallback(() => {
    fetch(`/api/workpackages/${pkg.id}/dimensions`)
      .then((r) => r.json())
      .then((g: Grid) => {
        setGrid(g);
        if (g?.columns?.length) onColsLoaded(g.columns);
      })
      .catch(() => {
        /* mất mạng — giữ lưới đang hiển thị */
      });
  }, [pkg.id, onColsLoaded]);
  useEffect(() => {
    if (expanded) load();
  }, [load, refreshKey, expanded]);

  // Chọn vùng + hoàn tác (M121). Logic nằm trong hook để file này chỉ còn dựng giao diện.
  const vungChon = useTickVung({ grid, load, onChanged, onOfflineTickBatch });

  // Đóng nhóm hoặc đổi dữ liệu → bỏ vùng chọn: giữ lại sẽ trỏ tới ô đã unmount.
  useEffect(() => {
    if (!expanded) vungChon.boChon();
  }, [expanded, vungChon]);

  // Ctrl+Z / Ctrl+Shift+Z (Cmd trên máy Mac). Bắt ở window nhưng bỏ qua khi đang gõ trong ô
  // nhập liệu — nếu không sẽ cướp mất undo của chính ô nhập đó.
  useEffect(() => {
    if (!expanded || !editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      void (e.shiftKey ? vungChon.lamLai() : vungChon.hoanTac());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, editMode, vungChon]);

  // ── Hàm thao tác nhóm (pkg) ──────────────────────────────────────────────

  async function editPkgBoq() {
    const v = await appPrompt(
      "BOQCODE của nhóm (duy nhất toàn hệ thống, để trống = xoá mã)",
      pkg.boqCode ?? "",
      { mono: true },
    );
    if (v === null) return;
    const res = await fetch(`/api/workpackages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boqCode: v }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    onChanged();
  }

  async function editPkgDrawingLink() {
    const current = pkg.drawingUrl?.startsWith("/api/workpackages/") ? "" : (pkg.drawingUrl ?? "");
    const v = await appPrompt("Link bản vẽ (Google Drive, SharePoint…)", current);
    if (v === null) return;
    const url = v.trim();
    if (url) {
      await fetch(`/api/workpackages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawingUrl: url }),
      });
    } else {
      await fetch(`/api/workpackages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawingUrl: null }),
      });
    }
    onChanged();
  }

  async function uploadDrawingFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/workpackages/${pkg.id}/drawing`, { method: "POST", body: form });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi upload bản vẽ");
      return;
    }
    onChanged();
  }

  async function removeDrawing() {
    if (!(await appConfirm("Xoá bản vẽ của nhóm này?"))) return;
    await fetch(`/api/workpackages/${pkg.id}/drawing`, { method: "DELETE" });
    onChanged();
  }

  async function editBbntLink() {
    const current = pkg.bbntUrl?.startsWith("/api/workpackages/") ? "" : (pkg.bbntUrl ?? "");
    const v = await appPrompt("Link biên bản nghiệm thu (Google Drive, SharePoint…)", current);
    if (v === null) return;
    const url = v.trim();
    await fetch(`/api/workpackages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbntUrl: url || null }),
    });
    onChanged();
  }

  async function uploadBbntFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/workpackages/${pkg.id}/bbnt`, { method: "POST", body: form });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi upload biên bản");
      return;
    }
    onChanged();
  }

  async function removeBbnt() {
    if (!(await appConfirm("Xoá biên bản nghiệm thu của nhóm này?"))) return;
    await fetch(`/api/workpackages/${pkg.id}/bbnt`, { method: "DELETE" });
    onChanged();
  }

  async function savePkgDays(val: string) {
    const n = parseInt(val);
    if (!pkg.startDate || isNaN(n) || n < 1) {
      setEditDays(null);
      return;
    }
    const end = new Date(pkg.startDate);
    end.setDate(end.getDate() + n - 1);
    const endDate = end.toISOString().slice(0, 10);
    const kq = await guiSuaNhom(pkg.id, { endDate });
    if (kq.trangThai !== "ok") return appAlert(baoLoiSuaNhom(kq, "Chưa lưu được số ngày"));
    setEditDays(null);
    onChanged();
  }

  async function savePkgFloor(floor: string) {
    const kq = await guiSuaNhom(pkg.id, { floorLabel: floor.trim() || null });
    if (kq.trangThai !== "ok") return appAlert(baoLoiSuaNhom(kq, "Chưa đổi được tầng"));
    setEditFloor(null);
    onChanged();
  }

  async function savePkgName(name: string) {
    const kq = await guiSuaNhom(pkg.id, { name });
    if (kq.trangThai !== "ok") return appAlert(baoLoiSuaNhom(kq, "Chưa đổi được tên nhóm"));
    setEditName(null);
    onChanged();
  }

  // Trả true khi đã lưu THẬT → modal mới tắt được "Đang lưu..." (audit 2026-09-05).
  async function savePkgDates(start: string, end: string, syncTasks: boolean): Promise<boolean> {
    const kq = await guiSuaNhom(pkg.id, { startDate: start || null, endDate: end || null });
    if (kq.trangThai !== "ok") {
      appAlert(baoLoiSuaNhom(kq, "Chưa lưu được ngày"));
      return false;
    }
    // Xoá ngày riêng của task con để chúng kế thừa ngày nhóm.
    if (syncTasks) {
      const hong = await xoaNgayRiengTaskCon(pkg.tasks.map((t) => t.id));
      if (hong)
        appAlert(
          `Đã lưu ngày nhóm, nhưng ${hong}/${pkg.tasks.length} task con chưa đồng bộ được ngày — thử lại khi có mạng`,
        );
    }
    setShowDatesModal(false);
    load();
    onChanged();
    return true;
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

  // ── Hàm thao tác task ────────────────────────────────────────────────────

  async function toggle(cell: Cell, task: GridTask, label: string) {
    setGrid(
      (g) =>
        g && {
          ...g,
          tasks: g.tasks.map((t) =>
            t.id === task.id
              ? { ...t, cells: { ...t.cells, [label]: { ...cell, installed: !cell.installed } } }
              : t,
          ),
        },
    );
    try {
      const res = await fetch(`/api/dimensions/${cell.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installed: !cell.installed }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // Bị chặn (vd hold point chuyển bước M3) — trả checkbox về trạng thái cũ + báo lý do,
        // khác lỗi mạng (onOfflineTick) vì server đã trả lời rõ ràng là từ chối.
        setGrid(
          (g) =>
            g && {
              ...g,
              tasks: g.tasks.map((t) =>
                t.id === task.id ? { ...t, cells: { ...t.cells, [label]: cell } } : t,
              ),
            },
        );
        showToast(j?.error ?? "Không cập nhật được ô này", "error");
        return;
      }
      // Tick lẻ cũng vào lịch sử để Ctrl+Z hoàn tác được — người dùng không phân biệt "tick 1 ô"
      // với "tick cả vùng", họ chỉ muốn undo thao tác vừa rồi (M121 FR4).
      vungChon.ghiTickLe(cell.id, cell.installed, !cell.installed);
      if (j?.task)
        setGrid(
          (g) =>
            g && {
              ...g,
              tasks: g.tasks.map((t) =>
                t.id === task.id
                  ? { ...t, progressPercent: j.task.progress, status: j.task.status }
                  : t,
              ),
            },
        );
    } catch {
      onOfflineTick(cell.id, !cell.installed);
    }
    onChanged();
  }

  // Tick/bỏ tick cả hàng bằng MỘT request (M121 FR1). Trước đây bắn N request song song, mỗi
  // request là 1 transaction + 1 recomputeTask + 1 recomputePackage riêng — hàng 30 cột là 30
  // lần tính lại % của cùng một task. Route batch gộp recompute 1 lần/task và atomic cả lô.
  async function setAllInRow(task: GridTask, value: boolean) {
    const lo = dungLoTick(Object.values(task.cells));
    if (!lo.ok) {
      showToast(lo.loi, "error");
      return;
    }
    if (!lo.ids.length) return; // hàng chưa có ô nào — không gửi request rỗng
    // Giá trị TRƯỚC của từng ô, lấy NGAY trước khi gửi: sau `load()` dữ liệu đã là giá trị mới,
    // không dựng lại được. Một hàng có thể trộn ô đang tick và chưa tick nên phải lưu từng ô.
    const truoc = Object.values(task.cells).map((c) => c.installed);
    const kq = await guiLoTick(lo.ids, value);
    // Mất mạng → xếp cả lô vào hàng đợi offline, KHÔNG báo lỗi: người dùng công trường vẫn
    // tick tiếp được, lô sẽ tự gửi khi có sóng.
    if (kq.trangThai === "mangLoi") onOfflineTickBatch(lo.ids, value);
    else if (kq.trangThai === "tuChoi") showToast(kq.loi, "error");
    else vungChon.ghiThaoTacLo(lo.ids, truoc, value);
    load();
    onChanged();
  }

  async function saveTaskName(id: number, name: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setEditTask(null);
    load();
  }

  async function editTaskBoq(t: GridTask) {
    const v = await appPrompt(
      "BOQCODE (duy nhất toàn hệ thống, để trống = xoá mã)",
      t.boqCode ?? "",
      { mono: true },
    );
    if (v === null) return;
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boqCode: v }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    load();
  }

  async function editTaskDrawing(t: GridTask) {
    const v = await appPrompt("Link bản vẽ / BBNT (để trống = xoá)", t.drawingUrl ?? "");
    if (v === null) return;
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drawingUrl: v.trim() || null }),
    });
    load();
  }

  async function saveDates(ids: number[], start: string, end: string) {
    const body: Record<string, string> = {};
    if (start) body.startDate = start;
    if (end) body.endDate = end;
    if (!Object.keys(body).length) {
      setDatesTarget(null);
      return;
    }
    // Nhiều task → MỘT request atomic (M121 FR6). Trước đây loop N request: lỗi giữa chừng để
    // lại lô nửa chừng (một số task đã đổi ngày, một số chưa) mà không nói được task nào. Nay
    // cả lô hoặc không lô nào, nên thông điệp cũng nói vậy — bỏ kiểu đếm "thất bại N/M" cũ.
    const kq = await guiNgayHangLoat(ids, body);
    if (kq.trangThai === "tuChoi") appAlert(kq.loi);
    else if (kq.trangThai === "mangLoi")
      appAlert("Mất kết nối — chưa lưu được ngày, thử lại khi có mạng");
    setDatesTarget(null);
    load();
    onChanged();
  }

  async function setDelayReason(t: GridTask, reason: string) {
    let note: string | null = null;
    if (reason === "khac") note = await appPrompt("Ghi chú lý do trễ");
    const res = await fetch(`/api/tasks/${t.id}/delay-reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || null, note }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      appAlert(j.error ?? "Lỗi không xác định");
    }
    load();
  }

  async function approveTask(t: GridTask, approve: boolean) {
    if (
      !(await appConfirm(
        approve ? `Duyệt nghiệm thu "${t.code} — ${t.name}"?` : `Huỷ nghiệm thu "${t.code}"?`,
        approve ? { confirmLabel: "Duyệt" } : { danger: true, confirmLabel: "Huỷ nghiệm thu" },
      ))
    )
      return;
    const res = await fetch(`/api/tasks/${t.id}/approve`, { method: approve ? "POST" : "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      appAlert(j.error ?? "Lỗi không xác định");
      return;
    }
    // M46 PR3: flow nghiệm thu nhiều bước cấu hình được — bước vừa ghi nhận chưa phải bước
    // cuối, task chưa chuyển nghiem_thu (chờ vai trò tiếp theo duyệt qua hộp thư /approvals).
    if (j.pending) appAlert(`Đã ghi nhận bước duyệt — chờ vai trò ${j.nextRole} duyệt tiếp.`);
    load();
    onChanged();
  }

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

  // ── Render ───────────────────────────────────────────────────────────────

  // Khi chưa mở hoặc chưa tải xong lưới, chỉ hiển thị hàng tiêu đề nhóm.
  const showTable = expanded && grid && grid.columns.length > 0;
  const noData = expanded && grid && grid.columns.length === 0;
  const variantColumns = grid ? grid.columns.filter((c) => / \(\d+\)$/.test(c)) : [];
  const hasVariants = variantColumns.length > 0;
  // Khi chưa tải grid dùng sheetCols (từ các nhóm đã mở) để colgroup đồng nhất chiều rộng.
  const visibleColumns = grid ? grid.columns : sheetCols;

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

  // Chiều rộng cột — định nghĩa 1 chỗ, dùng chung cho hàng nhóm lẫn bảng task
  // ce = canEdit && editMode — dùng để gate toàn bộ nút sửa trong lưới
  const ce = canEdit && editMode;
  const hpc = (col: string) => (hiddenPrintCols.has(col) ? " print-hidden-col" : "");
  const showBoq = canEdit; // BOQ chỉ hiển thị cho Admin/PM (luôn hiện, kể cả khi chỉ xem)
  const W_BOQ = showBoq ? 110 : 0;
  const W_CODE = canEdit ? 70 : 58;
  const W_NAME = isMobile ? 150 : 280;
  const W_PCT = 40;
  const W_DATE = 52; // Ngày BĐ / Ngày KT
  const W_DAYS = 36; // Số ngày thi công
  // Cột dimension co theo độ dài nhãn (áp dụng toàn cục mọi sheet): nhãn ngắn kiểu căn hộ
  // "CH 01"/"X1-X6" dùng cột hẹp 44px (vẫn ≥40px vùng chạm) để tầng nhiều căn không phải
  // cuộn ngang quá xa; có nhãn dài kiểu kích thước ống "1300X700" thì giữ 60px đủ 2 dòng.
  const W_DIM = visibleColumns.every((c) => c.length <= 6) ? 44 : 60;
  const W_ACT = 88;
  // Sticky left offset tính tự động từ các hằng số trên
  const LEFT_CODE = W_BOQ;
  const LEFT_NAME = W_BOQ + W_CODE;
  const LEFT_PCT = W_BOQ + W_CODE + W_NAME;
  const stkBoq = isMobile ? "" : "sticky";
  const stkCode = isMobile ? "" : "sticky";
  const stkName = isMobile ? "sticky" : "sticky";
  const stkPct = isMobile ? "" : "sticky";

  return (
    <>
      {/* ── Bảng duy nhất: hàng nhóm + header cột + task rows ── */}
      <table className="text-xs border-collapse table-fixed" style={{ width: "max-content" }}>
        <colgroup>
          {showBoq && (
            <col
              style={{ width: W_BOQ }}
              className={`col-boq${hiddenPrintCols.has("BOQ") ? " print-hidden-col" : ""}`}
            />
          )}
          <col
            style={{ width: W_CODE }}
            className={`col-stt${hiddenPrintCols.has("STT") ? " print-hidden-col" : ""}`}
          />
          <col
            style={{ width: W_NAME }}
            className={`col-name${hiddenPrintCols.has("Công việc") ? " print-hidden-col" : ""}`}
          />
          <col
            style={{ width: W_PCT }}
            className={`col-pct${hiddenPrintCols.has("%") ? " print-hidden-col" : ""}`}
          />
          <col
            style={{ width: W_DATE }}
            className={`col-date${hiddenPrintCols.has("Ngày BĐ") ? " print-hidden-col" : ""}`}
          />
          <col
            style={{ width: W_DAYS }}
            className={`col-days${hiddenPrintCols.has("Số ngày") ? " print-hidden-col" : ""}`}
          />
          <col
            style={{ width: W_DATE }}
            className={`col-date${hiddenPrintCols.has("Ngày KT") ? " print-hidden-col" : ""}`}
          />
          {visibleColumns.map((col) => (
            <col
              key={col}
              style={{ width: W_DIM }}
              className={`col-dim${hiddenPrintCols.has(col) ? " print-hidden-col" : ""}`}
            />
          ))}
          {showTable && (ce || hasVariants) && <col style={{ width: W_ACT }} />}
        </colgroup>
        <thead>
          {/* ── Hàng tiêu đề nhóm ── */}
          <tr className="bg-zinc-900 hover:bg-zinc-800 border-b border-zinc-800 cursor-pointer select-none group">
            {/* Cột BOQ — chỉ Admin/PM */}
            {showBoq && (
              <td
                className={`${stkBoq} z-20 bg-inherit border-r border-zinc-800 px-2 py-3.5 align-middle${hpc("BOQ")}`}
                style={{ left: 0, width: W_BOQ, minWidth: W_BOQ }}
                onClick={onToggle}
              >
                <div className="flex items-center gap-1">
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  )}
                  <span
                    className="font-mono text-xs text-emerald-400 truncate flex-1"
                    title={`BOQCODE: ${pkg.boqCode ?? pkg.code} (mã Excel: ${pkg.code})`}
                  >
                    {pkg.boqCode ?? pkg.code}
                  </span>
                  {ce && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        editPkgBoq();
                      }}
                      title="Sửa BOQCODE"
                      className="text-zinc-700 hover:text-amber-400 shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </td>
            )}

            {/* Cột STT */}
            <td
              className={`${stkCode} z-20 bg-inherit border-r border-zinc-800 px-1 py-3.5 text-center align-middle${hpc("STT")}`}
              style={{ left: LEFT_CODE, width: W_CODE, minWidth: W_CODE }}
              onClick={(e) => {
                if (!(e.target as Element).closest("button,input")) onToggle();
              }}
            >
              {!showBoq &&
                editFloor === null &&
                (expanded ? (
                  <ChevronDown className="w-4 h-4 text-zinc-400 inline mr-1 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-400 inline mr-1 shrink-0" />
                ))}
              {editFloor !== null ? (
                <span
                  className="flex flex-col items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") savePkgFloor(editFloor);
                      if (e.key === "Escape") setEditFloor(null);
                    }}
                    className="bg-zinc-800 border border-emerald-600 rounded px-1 py-0.5 text-xs w-full text-center outline-none font-mono"
                  />
                  <span className="flex gap-1">
                    <button
                      aria-label="Lưu"
                      onClick={() => savePkgFloor(editFloor)}
                      className="text-emerald-400"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      aria-label="Đóng"
                      onClick={() => setEditFloor(null)}
                      className="text-zinc-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                </span>
              ) : (
                <span className="group/floor inline-flex items-center gap-0.5">
                  <span className="text-xs text-zinc-400">{pkg.floorLabel ?? ""}</span>
                  {pendingFront && (
                    <Lock
                      className="w-2.5 h-2.5 text-amber-400 shrink-0"
                      aria-label="Chưa có mặt bằng"
                    >
                      <title>Chưa có mặt bằng — tầng {pkg.floorLabel} chưa được bàn giao</title>
                    </Lock>
                  )}
                  {qcReason && (
                    <ShieldAlert
                      className="w-2.5 h-2.5 text-rose-400 shrink-0"
                      aria-label="Đang chờ nghiệm thu chuyển bước"
                    >
                      <title>{qcReason}</title>
                    </ShieldAlert>
                  )}
                  {ce && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditFloor(pkg.floorLabel ?? "");
                      }}
                      title="Sửa tầng"
                      className="opacity-100 sm:opacity-0 sm:group-hover/floor:opacity-100 text-zinc-600 hover:text-emerald-400"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              )}
            </td>

            {/* Cột Tên nhóm */}
            <td
              className={`${stkName} z-20 bg-inherit border-r border-zinc-800 px-2 py-3.5 align-middle overflow-hidden${hpc("Công việc")}`}
              style={{
                left: isMobile ? 0 : LEFT_NAME,
                width: W_NAME,
                minWidth: W_NAME,
                maxWidth: W_NAME,
              }}
              onClick={(e) => {
                if (!(e.target as Element).closest("button,input,a")) onToggle();
              }}
            >
              {editName !== null ? (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={editPkgInputRef}
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") savePkgName(editName);
                      if (e.key === "Escape") setEditName(null);
                    }}
                    className="bg-zinc-800 border border-emerald-600 rounded px-2 py-1 text-sm flex-1 outline-none"
                  />
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      wrapSel(
                        editPkgInputRef,
                        "**",
                        () => editName,
                        (v) => setEditName(v),
                      );
                    }}
                    title="Bôi đậm (**text**)"
                    className="shrink-0 text-xs font-bold text-zinc-400 hover:text-white px-0.5"
                  >
                    B
                  </button>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      wrapSel(
                        editPkgInputRef,
                        "__",
                        () => editName,
                        (v) => setEditName(v),
                      );
                    }}
                    title="Chữ mảnh (__text__)"
                    className="shrink-0 text-xs font-light text-zinc-400 hover:text-white px-0.5"
                  >
                    T
                  </button>
                  <button
                    aria-label="Lưu"
                    onClick={() => savePkgName(editName)}
                    className="text-emerald-400"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    aria-label="Đóng"
                    onClick={() => setEditName(null)}
                    className="text-zinc-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </span>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-sm font-medium truncate flex-1">
                    {renderName(pkg.name)}
                  </span>
                  {ce && editName === null && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditName(pkg.name);
                      }}
                      title="Sửa tên nhóm"
                      className="text-zinc-700 hover:text-emerald-400 shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </td>

            {/* Cột % */}
            <td
              className={`${stkPct} z-20 bg-inherit border-r border-zinc-800 px-1 py-3.5 text-center align-middle${hpc("%")}`}
              style={{ left: LEFT_PCT, width: W_PCT, minWidth: W_PCT }}
              onClick={onToggle}
            >
              <span className="text-sm font-semibold text-zinc-300">
                {Math.round((pkg.progress ?? 0) * 100)}%
              </span>
            </td>

            {/* ── Ngày BĐ / Số ngày / Ngày KT — 3 ô riêng căn thẳng với cột task bên dưới ── */}
            <td
              className={`border-r border-zinc-800 px-1 py-3.5 text-center align-middle${hpc("Ngày BĐ")}`}
              style={{ width: W_DATE, minWidth: W_DATE }}
              onClick={(e) => {
                if (!(e.target as Element).closest("button,input")) onToggle();
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (ce) setShowDatesModal(true);
                }}
                title={ce ? "Sửa ngày nhóm" : (pkg.startDate ?? "?")}
                className={`flex flex-col items-center w-full ${ce ? "hover:text-emerald-400 cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-[9px] text-zinc-400 leading-none">Bắt đầu</span>
                <span className="text-[13px] text-zinc-400 leading-snug">
                  {fmtShortDate(pkg.startDate)}
                </span>
              </button>
            </td>
            <td
              className={`border-r border-zinc-800 px-1 py-3.5 text-center align-middle${hpc("Số ngày")}`}
              style={{ width: W_DAYS, minWidth: W_DAYS }}
              onClick={(e) => {
                if (!(e.target as Element).closest("button,input")) onToggle();
              }}
            >
              {editDays !== null ? (
                <span
                  className="flex flex-col items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[9px] text-zinc-400 leading-none">Số ngày</span>
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    value={editDays}
                    onChange={(e) => setEditDays(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") savePkgDays(editDays);
                      if (e.key === "Escape") setEditDays(null);
                    }}
                    onBlur={() => savePkgDays(editDays)}
                    className="bg-zinc-800 border border-emerald-600 rounded px-0.5 py-0 text-[11px] w-full text-center outline-none font-mono"
                  />
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (ce) setEditDays(String(diffDays(pkg.startDate, pkg.endDate) ?? ""));
                  }}
                  title={ce ? "Sửa số ngày" : ""}
                  className={`flex flex-col items-center w-full ${ce ? "hover:text-emerald-400 cursor-pointer" : "cursor-default"}`}
                >
                  <span className="text-[9px] text-zinc-400 leading-none">Số ngày</span>
                  <span className="text-[13px] text-zinc-400 leading-snug">
                    {diffDays(pkg.startDate, pkg.endDate) != null ? (
                      `${diffDays(pkg.startDate, pkg.endDate)}n`
                    ) : (
                      <CalendarDays className="w-[14px] h-[14px] text-zinc-700 inline" />
                    )}
                  </span>
                </button>
              )}
            </td>
            <td
              className={`border-r border-zinc-800 px-1 py-3.5 text-center align-middle${hpc("Ngày KT")}`}
              style={{ width: W_DATE, minWidth: W_DATE }}
              onClick={(e) => {
                if (!(e.target as Element).closest("button,input")) onToggle();
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (ce) setShowDatesModal(true);
                }}
                title={ce ? "Sửa ngày nhóm" : (pkg.endDate ?? "?")}
                className={`flex flex-col items-center w-full ${ce ? "hover:text-emerald-400 cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-[9px] text-zinc-400 leading-none">Kết thúc</span>
                <span className="text-[13px] text-zinc-400 leading-snug">
                  {fmtShortDate(pkg.endDate)}
                </span>
              </button>
            </td>

            {/* ── Task count, tiến độ, trạng thái, bản vẽ, bbnt, actions ── */}
            <td
              colSpan={visibleColumns.length + (showTable && (ce || hasVariants) ? 1 : 0) || 1}
              className="px-3 py-3.5 align-middle"
              style={{ minWidth: 420 }}
              onClick={(e) => {
                if (!(e.target as Element).closest("button,a")) onToggle();
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-zinc-400 w-[67px] text-right shrink-0">
                  {pkg.tasks.length} task
                </span>
                <div className="flex items-center gap-2 w-44 shrink-0">
                  <div className="bg-zinc-800 rounded-full h-2 flex-1">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${(pkg.progress ?? 0) * 100}%` }}
                    />
                  </div>
                </div>
                <StatusBadge
                  status={pkg.status}
                  className="text-[13px] w-32 text-center shrink-0"
                />
                {/* Bản vẽ */}
                <span
                  className="flex flex-col items-center shrink-0 border-l border-zinc-800 pl-3 ml-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[9px] text-zinc-400 leading-none mb-0.5">Bản vẽ</span>
                  <span className="flex items-center gap-1">
                    {pkg.drawingUrl ? (
                      <a
                        href={pkg.drawingUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Xem bản vẽ"
                        className="text-sky-400 hover:text-sky-300"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-zinc-700" />
                    )}
                    {ce && (
                      <>
                        <button
                          onClick={() => drawingInputRef.current?.click()}
                          title="Upload PDF bản vẽ"
                          className="text-zinc-600 hover:text-sky-400"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => editPkgDrawingLink()}
                          title="Gán link bản vẽ"
                          className="text-zinc-600 hover:text-sky-400"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        {pkg.drawingUrl ? (
                          <button
                            onClick={() => removeDrawing()}
                            title="Xoá bản vẽ"
                            className="text-zinc-700 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="w-3 h-3 inline-block" />
                        )}
                      </>
                    )}
                  </span>
                </span>
                <input
                  ref={drawingInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      uploadDrawingFile(f);
                      e.target.value = "";
                    }
                  }}
                />
                {/* Biên Bản Nghiệm Thu */}
                <span
                  className="flex flex-col items-center shrink-0 border-l border-zinc-800 pl-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[9px] text-zinc-400 leading-none mb-0.5">Biên bản NT</span>
                  <span className="flex items-center gap-1">
                    {pkg.bbntUrl ? (
                      <a
                        href={pkg.bbntUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Xem biên bản nghiệm thu"
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-zinc-700" />
                    )}
                    {ce && (
                      <>
                        <button
                          onClick={() => bbntInputRef.current?.click()}
                          title="Upload biên bản nghiệm thu"
                          className="text-zinc-600 hover:text-emerald-400"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => editBbntLink()}
                          title="Gán link biên bản"
                          className="text-zinc-600 hover:text-emerald-400"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        {pkg.bbntUrl ? (
                          <button
                            onClick={() => removeBbnt()}
                            title="Xoá biên bản"
                            className="text-zinc-700 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="w-3 h-3 inline-block" />
                        )}
                      </>
                    )}
                  </span>
                </span>
                <input
                  ref={bbntInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      uploadBbntFile(f);
                      e.target.value = "";
                    }
                  }}
                />
                {ce && (
                  <span
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => copyPkg()}
                      title="Sao chép nhóm này"
                      className="p-0.5 text-zinc-600 hover:text-sky-400"
                    >
                      <Copy className="w-[17px] h-[17px]" />
                    </button>
                    <button
                      onClick={() => deletePkg()}
                      title="Xoá nhóm này"
                      className="p-0.5 text-zinc-600 hover:text-red-400"
                    >
                      <Trash2 className="w-[17px] h-[17px]" />
                    </button>
                  </span>
                )}
              </div>
            </td>
          </tr>

          {/* ── Hàng header cột (chỉ khi mở và có dữ liệu) ── */}
          {showTable && (
            <tr className="bg-zinc-950">
              {showBoq && (
                <th
                  className={`${stkBoq} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-400 font-medium${hpc("BOQ")}`}
                  style={{ left: 0 }}
                >
                  BOQ
                </th>
              )}
              <th
                className={`${stkCode} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-400 font-medium${hpc("STT")}`}
                style={{ left: LEFT_CODE }}
              >
                STT
              </th>
              <th
                className={`${stkName} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-400 font-medium${hpc("Công việc")}`}
                style={{ left: isMobile ? 0 : LEFT_NAME }}
              >
                Công việc
              </th>
              <th
                className={`${stkPct} z-20 bg-zinc-950 border-b border-r border-zinc-800 px-2 py-2 text-center align-middle text-zinc-400 font-medium${hpc("%")}`}
                style={{ left: LEFT_PCT }}
              >
                %
              </th>
              <th
                className={`border-b border-r border-zinc-800 px-1 py-2 text-center align-middle text-zinc-400 font-medium text-[10px]${hpc("Ngày BĐ")}`}
                style={{ width: W_DATE }}
              >
                Ngày BĐ
              </th>
              <th
                className={`border-b border-r border-zinc-800 px-1 py-2 text-center align-middle text-zinc-400 font-medium text-[10px]${hpc("Số ngày")}`}
                style={{ width: W_DAYS }}
              >
                Số ngày
              </th>
              <th
                className={`border-b border-r border-zinc-800 px-1 py-2 text-center align-middle text-zinc-400 font-medium text-[10px]${hpc("Ngày KT")}`}
                style={{ width: W_DATE }}
              >
                Ngày KT
              </th>
              {visibleColumns.map((col) => (
                <th
                  key={col}
                  className={`group/col border-b border-zinc-800 p-0 overflow-hidden align-middle${hiddenPrintCols.has(col) ? " print-hidden-col" : ""}`}
                  style={{ width: W_DIM }}
                >
                  <div className="flex flex-col items-center py-2 gap-1">
                    <div
                      className="dim-col-label text-[10px] text-zinc-400 hover:text-emerald-400 cursor-default text-center leading-tight break-words"
                      title={ce ? `${col} — bấm để đổi tên` : col}
                      onClick={() => ce && renameColumn(col)}
                    >
                      {col}
                    </div>
                    {ce && (
                      <button
                        onClick={() => deleteColumn(col)}
                        title={`Xoá cột "${col}"`}
                        className="opacity-100 sm:opacity-0 sm:group-hover/col:opacity-100 text-zinc-700 hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th
                className="border-b border-zinc-800 align-bottom pb-2 text-center"
                style={{ width: W_ACT }}
              >
                <div className="flex flex-col items-center gap-1">
                  {ce && hasVariants && (
                    <button
                      onClick={deleteVariantColumns}
                      title={`Xoá ${variantColumns.length} cột biến thể (2)(3)(4) khỏi DB`}
                      className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-red-300 hover:bg-red-950/40 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  {ce && (
                    <button
                      onClick={() => addColumnAfter(grid.columns[grid.columns.length - 1] ?? null)}
                      title="Thêm cột mới vào cuối"
                      className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-emerald-200 hover:bg-emerald-950 rounded"
                    >
                      <Columns className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </th>
            </tr>
          )}
        </thead>

        {/* Thông báo loading / no data */}
        {expanded && !grid && (
          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-sm text-zinc-500">
                Đang tải lưới...
              </td>
            </tr>
          </tbody>
        )}
        {noData && (
          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-sm text-zinc-500">
                Nhóm này chưa có dữ liệu lưới. {grid.tasks.length} task.
              </td>
            </tr>
          </tbody>
        )}

        {showTable && (
          <tbody>
            {grid.tasks.map((t, ti) => (
              <Fragment key={t.id}>
                <tr className="hover:bg-zinc-800/30 transition-colors">
                  {showBoq && (
                    <td
                      className={`${stkBoq} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 text-center align-middle overflow-hidden${hpc("BOQ")}`}
                      style={{ left: 0 }}
                    >
                      <button
                        onClick={() => ce && editTaskBoq(t)}
                        title={
                          ce ? `${t.boqCode ?? "Chưa gán"} — bấm để sửa` : (t.boqCode ?? "Chưa gán")
                        }
                        className={`font-mono text-[10px] truncate block w-full text-center ${ce ? "text-amber-400 hover:underline cursor-pointer" : "text-amber-400/70 cursor-default"}`}
                      >
                        {t.boqCode ?? "—"}
                      </button>
                      {(t.drawingUrl || ce) &&
                        (t.drawingUrl ? (
                          <span className="flex items-center justify-center gap-0.5 mt-0.5">
                            <a
                              href={t.drawingUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={`Bản vẽ: ${t.drawingUrl}`}
                              className="text-sky-400 hover:text-sky-300"
                            >
                              <Link2 className="w-3 h-3" />
                            </a>
                            {ce && (
                              <button
                                aria-label="Sửa"
                                onClick={() => editTaskDrawing(t)}
                                className="text-zinc-600 hover:text-emerald-400"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        ) : (
                          <button
                            onClick={() => editTaskDrawing(t)}
                            title="Thêm link bản vẽ / BBNT"
                            className="block mx-auto mt-0.5 text-zinc-700 hover:text-sky-400"
                          >
                            <Link2 className="w-3 h-3" />
                          </button>
                        ))}
                    </td>
                  )}
                  <td
                    className={`${stkCode} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 text-center align-middle overflow-hidden${hpc("STT")}`}
                    style={{ left: LEFT_CODE, width: W_CODE, minWidth: W_CODE }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-mono text-zinc-400 text-[10px]">
                        {String(ti + 1).padStart(2, "0")}
                      </span>
                    </div>
                  </td>
                  <td
                    className={`${stkName} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-2 py-1 align-middle overflow-hidden${hpc("Công việc")}`}
                    style={{
                      left: isMobile ? 0 : LEFT_NAME,
                      width: W_NAME,
                      minWidth: W_NAME,
                      maxWidth: W_NAME,
                    }}
                  >
                    {editTask?.id === t.id ? (
                      <span className="flex items-center gap-1">
                        <input
                          ref={editTaskInputRef}
                          autoFocus
                          value={editTask.value}
                          onChange={(e) => setEditTask({ id: t.id, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveTaskName(t.id, editTask.value);
                            if (e.key === "Escape") setEditTask(null);
                          }}
                          className="bg-zinc-800 border border-emerald-600 rounded px-1 py-0.5 text-xs w-full outline-none"
                        />
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            wrapSel(
                              editTaskInputRef,
                              "**",
                              () => editTask.value,
                              (v) => setEditTask((et) => et && { ...et, value: v }),
                            );
                          }}
                          title="Bôi đậm (**text**)"
                          className="shrink-0 text-xs font-bold text-zinc-400 hover:text-white px-0.5"
                        >
                          B
                        </button>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            wrapSel(
                              editTaskInputRef,
                              "__",
                              () => editTask.value,
                              (v) => setEditTask((et) => et && { ...et, value: v }),
                            );
                          }}
                          title="Chữ mảnh (__text__)"
                          className="shrink-0 text-xs font-light text-zinc-400 hover:text-white px-0.5"
                        >
                          T
                        </button>
                        <button
                          aria-label="Lưu"
                          onClick={() => saveTaskName(t.id, editTask.value)}
                          className="text-emerald-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="truncate flex-1" title={t.name}>
                          {renderName(t.name)}
                        </span>
                        {ce && (
                          <button
                            aria-label="Sửa"
                            onClick={() => setEditTask({ id: t.id, value: t.name })}
                            className="shrink-0 text-zinc-600 hover:text-emerald-400"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {editMode && (
                        <button
                          onClick={() => setAllInRow(t, true)}
                          className="text-[10px] text-emerald-500 hover:underline"
                        >
                          Tất cả
                        </button>
                      )}
                      {editMode && (
                        <button
                          onClick={() => setAllInRow(t, false)}
                          className="text-[10px] text-zinc-500 hover:underline"
                        >
                          Bỏ
                        </button>
                      )}
                      <button
                        onClick={() => setHistoryTask(t)}
                        title="Lịch sử tiến độ"
                        className="text-zinc-600 hover:text-emerald-400"
                      >
                        <History className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setPhotosTask(t)}
                        title="Ảnh hiện trường"
                        className={`flex items-center gap-0.5 ${t.photoCount > 0 ? "text-sky-400 hover:text-sky-300" : "text-zinc-600 hover:text-sky-400"}`}
                      >
                        <Camera className="w-3 h-3" />
                        {t.photoCount > 0 && <span className="text-[10px]">{t.photoCount}</span>}
                      </button>
                      <button
                        onClick={() => setCommentsTask(t)}
                        title="Bình luận / trao đổi"
                        className={`flex items-center gap-0.5 ${t.commentCount > 0 ? "text-violet-400 hover:text-violet-300" : "text-zinc-600 hover:text-violet-400"}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {t.commentCount > 0 && (
                          <span className="text-[10px]">{t.commentCount}</span>
                        )}
                      </button>
                      {t.status === "nghiem_thu" ? (
                        <span className="flex items-center gap-1 text-[10px] text-teal-200 bg-teal-950 px-1.5 py-0.5 rounded">
                          ✓ Đã NT
                          {ce && (
                            <button
                              onClick={() => approveTask(t, false)}
                              title="Huỷ nghiệm thu"
                              className="text-teal-500 hover:text-red-400"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </span>
                      ) : (
                        ce &&
                        t.progressPercent >= 1 && (
                          <button
                            onClick={() => approveTask(t, true)}
                            title="Duyệt nghiệm thu (task đã 100%)"
                            className="text-[10px] text-teal-200 border border-teal-800 bg-teal-950 hover:bg-teal-900 px-1.5 py-0.5 rounded"
                          >
                            Nghiệm thu
                          </button>
                        )
                      )}
                      {t.status === "tre" && (
                        <select
                          value={t.delayReason ?? ""}
                          onChange={(e) => setDelayReason(t, e.target.value)}
                          title="Nguyên nhân trễ — giúp PM thống kê và xử lý"
                          className={`text-[10px] rounded px-1 py-0.5 outline-none border max-w-[110px] ${
                            t.delayReason
                              ? "bg-orange-950 border-orange-900 text-orange-200"
                              : "bg-zinc-800 border-zinc-700 text-zinc-300"
                          }`}
                        >
                          <option value="">— Lý do trễ? —</option>
                          {Object.entries(DELAY_REASON_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td
                    className={`${stkPct} z-10 bg-zinc-900 border-b border-r border-zinc-800 px-1 py-1 text-center align-middle overflow-hidden${hpc("%")}`}
                    style={{ left: LEFT_PCT }}
                  >
                    <span
                      className={
                        Math.round(t.progressPercent * 100) === 100
                          ? "text-emerald-400"
                          : "text-zinc-300"
                      }
                    >
                      {Math.round((t.progressPercent ?? 0) * 100)}%
                    </span>
                  </td>
                  {/* ── Ngày BĐ / Số ngày / Ngày KT ── */}
                  {(() => {
                    const effStart = t.startDate ?? pkg.startDate;
                    const effEnd = t.endDate ?? pkg.endDate;
                    const days = diffDays(effStart, effEnd);
                    const inherited = !t.startDate && !!pkg.startDate;
                    const openDates = () =>
                      ce &&
                      setDatesTarget({
                        ids: [t.id],
                        init: { start: t.startDate ?? "", end: t.endDate ?? "" },
                        actual: { start: t.actualStartDate ?? null, end: t.actualEndDate ?? null },
                      });
                    const baseCell = `border-b border-r border-zinc-800 px-1 py-1 text-center align-middle text-[10px] whitespace-nowrap`;
                    const dateCls = `${baseCell} ${inherited ? "text-zinc-600 italic" : "text-zinc-400"} ${ce ? "cursor-pointer hover:bg-zinc-800" : ""}`;
                    return (
                      <>
                        <td
                          className={dateCls + hpc("Ngày BĐ")}
                          style={{ width: W_DATE }}
                          onClick={openDates}
                        >
                          <span className="flex flex-col items-center gap-0">
                            {fmtColDate(effStart)}
                            {t.startDate && ce && (
                              <RotateCcw
                                className="w-2.5 h-2.5 text-zinc-700 hover:text-amber-400 mt-0.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetTaskDates(t);
                                }}
                              />
                            )}
                          </span>
                        </td>
                        <td
                          className={`${baseCell} text-zinc-400${hpc("Số ngày")} ${ce ? "cursor-pointer hover:bg-zinc-800" : ""}`}
                          style={{ width: W_DAYS }}
                          onClick={openDates}
                        >
                          {days ?? ""}
                        </td>
                        <td
                          className={dateCls + hpc("Ngày KT")}
                          style={{ width: W_DATE }}
                          onClick={openDates}
                        >
                          {fmtColDate(effEnd)}
                        </td>
                      </>
                    );
                  })()}
                  {visibleColumns.map((col, ci) => (
                    <ODimension
                      key={col}
                      cell={t.cells[col]}
                      nhanCot={col}
                      tenTask={t.name}
                      editMode={editMode}
                      daChon={vungChon.oTrongVung(ti, ci)}
                      anKhiIn={hiddenPrintCols.has(col)}
                      onToggle={() => {
                        const cell = t.cells[col];
                        if (cell) toggle(cell, t, col);
                      }}
                      onPointerDown={(e) => {
                        // Chỉ bật chọn vùng ở chế độ sửa — lúc chỉ xem thì kéo tay phải để
                        // cuộn trang, không được cướp thao tác cuộn của người dùng.
                        if (!editMode || e.button === 2) return;
                        if (e.shiftKey) vungChon.moRongToi(ti, ci);
                        else vungChon.batDau(ti, ci);
                      }}
                      onPointerEnter={() => editMode && vungChon.keoToi(ti, ci)}
                      onPointerUp={() => vungChon.ketThucKeo()}
                    />
                  ))}
                  {(ce || hasVariants) && (
                    <td className="border-b border-zinc-800/60 text-center align-middle p-1 w-[88px] min-w-[88px]">
                      {ce && (
                        <div className="flex justify-center items-center gap-0.5">
                          <button
                            onClick={() => moveTask(t, "up")}
                            disabled={ti === 0}
                            title="Lên"
                            className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => moveTask(t, "down")}
                            disabled={ti === grid.tasks.length - 1}
                            title="Xuống"
                            className="text-zinc-700 hover:text-zinc-300 disabled:opacity-20"
                          >
                            <ChevronDownIcon className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => copyTask(t)}
                            title="Sao chép task"
                            className="text-zinc-700 hover:text-sky-400"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => deleteTask(t)}
                            title="Xoá task"
                            className="text-zinc-700 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              </Fragment>
            ))}
          </tbody>
        )}
      </table>

      {ce && vungChon.vung && (
        <ThanhVungChon
          soO={vungChon.soODaChon}
          dangGui={vungChon.dangGui}
          coTheHoanTac={vungChon.coTheHoanTac}
          coTheLamLai={vungChon.coTheLamLai}
          onTick={() => void vungChon.tickVung(true)}
          onBoTick={() => void vungChon.tickVung(false)}
          onBoChon={vungChon.boChon}
          onHoanTac={() => void vungChon.hoanTac()}
          onLamLai={() => void vungChon.lamLai()}
        />
      )}

      {historyTask && <HistoryModal task={historyTask} onClose={() => setHistoryTask(null)} />}
      {photosTask && (
        <PhotosModal
          task={photosTask}
          onClose={() => {
            setPhotosTask(null);
            load();
          }}
        />
      )}
      {commentsTask && (
        <CommentsModal
          task={commentsTask}
          canEdit={canEdit}
          onClose={() => {
            setCommentsTask(null);
            load();
          }}
        />
      )}
      {datesTarget && (
        <DateEditModal
          target={datesTarget}
          onSave={saveDates}
          onClose={() => setDatesTarget(null)}
        />
      )}
      {showDatesModal && (
        <PkgDatesModal
          pkg={pkg}
          canEdit={canEdit}
          onSave={savePkgDates}
          onClose={() => setShowDatesModal(false)}
        />
      )}
    </>
  );
}
