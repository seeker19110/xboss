"use client";
import { useEffect, useState, useCallback, use, useDeferredValue, useRef } from "react";
import {
  Pencil,
  X,
  RefreshCw,
  WifiOff,
  CloudUpload,
  Printer,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Inbox,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EditableText from "@/app/components/EditableText";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import EmptyState from "@/app/components/EmptyState";
import { Button, Card } from "@/app/components/ui";
import { PageSkeleton } from "@/app/components/Skeleton";
import ChuaGanDuAn from "@/app/components/ChuaGanDuAn";
import { useChuaGanDuAn } from "@/app/lib/duAnKhaKien";
import { ErrorState } from "@/app/components/ErrorState";
import { toSlug } from "@/lib/nen/sheets";
import { useEditMode } from "@/app/components/useEditMode";
import EditModeToggle from "@/app/components/EditModeToggle";
import { ROLE_LABELS } from "@/lib/nen/roles";
import { fetchMe } from "@/app/lib/me";
import { offlineQueue } from "@/app/components/offlineQueue";
import { moManPhucHoiNgoaiTuyen } from "@/app/components/OfflineRecoveryPanel";
import { sortFloorsDesc } from "@/lib/nen/floors";
import { useTrackingData } from "./useTrackingData";
import { CongDuAnTuLink } from "./CongDuAnTuLink";
import { TrackingToolbar } from "./TrackingToolbar";
import { TrackingGrid } from "./TrackingGrid";
import { locNhomTheoTask, nhomTuMoTheoLoc, GIOI_HAN_NHOM_TU_MO } from "./locTask";
import type { Data, UserItem } from "./types";
import { DanhSachKeo, MucKeo, luuThuTu } from "./KeoTha";

// Đọc giá trị lọc ban đầu từ query string (vd mở link chia sẻ đã kèm bộ lọc). Chỉ dùng
// làm giá trị khởi tạo useState — các lần đổi sau do người dùng thao tác trên UI, rồi
// được ghi ngược lại URL qua effect bên dưới.
function initTuUrl(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

// Màn hẹp (điện thoại ngoài công trường): 4 cột sticky chiếm 526px sẽ nuốt hết
// viewport — thu lại chỉ giữ cột tên task sticky để vẫn tick checkbox được.
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export default function TrackingPage({ params }: { params: Promise<{ sheet: string }> }) {
  return (
    <CongDuAnTuLink>
      <TrackingPageNoiDung params={params} />
    </CongDuAnTuLink>
  );
}

function TrackingPageNoiDung({ params }: { params: Promise<{ sheet: string }> }) {
  const { sheet } = use(params);
  const chuaGanDuAn = useChuaGanDuAn();
  const {
    data,
    loading,
    loadError,
    loadErrorMessage,
    load,
    refreshKey,
    syncToast,
    pendingFronts,
    qcBlocked,
    offlinePending,
    online,
    offlineReady,
    enqueue,
    enqueueBatch,
  } = useTrackingData(sheet);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  // Số nhóm khớp bộ lọc task còn bị GẬP vì đã chạm trần GIOI_HAN_NHOM_TU_MO (xem effect lọc
  // task bên dưới) — hiển thị dòng nhắc để người dùng biết còn nhóm chưa tự mở.
  const [nhomChuaTuMo, setNhomChuaTuMo] = useState(0);
  // 4 bộ lọc đồng bộ 2 chiều với URL (?q=&floor=&status=&task=) — đọc lúc mount, ghi lại
  // bằng history.replaceState mỗi khi đổi (xem effect bên dưới), không reload trang.
  const [query, setQuery] = useState(() => initTuUrl("q"));
  const deferredQuery = useDeferredValue(query);
  // ?floor=4F trên URL (từ heatmap Dashboard) → mở sẵn filter tầng — giữ tương thích tên
  // tham số cũ, KHÔNG đổi thành khác dù gộp chung cơ chế đồng bộ URL với 3 filter kia.
  const [floorFilter, setFloorFilter] = useState(() => initTuUrl("floor"));
  const [statusFilter, setStatusFilter] = useState(() => initTuUrl("status"));
  // Lọc cấp TASK trong nhóm (M124 việc 4) — khác statusFilter ở trên (lọc theo p.status).
  const [taskFilter, setTaskFilter] = useState(() => initTuUrl("task"));
  const [canEdit, setCanEdit] = useState(false);
  // Thứ tự nhóm tạm (lạc quan) sau khi kéo thả — chỉ áp khi `nguon` vẫn là đúng bản `data` lúc thả;
  // tải lại xong `data` đổi tham chiếu nên bản tạm tự hết hiệu lực, không cần effect dọn (M135).
  const [thuTuNhomTam, setThuTuNhomTam] = useState<{ nguon: Data; ids: number[] } | null>(null);
  const [canProgress, setCanProgress] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sheetModal, setSheetModal] = useState<{
    name: string;
    code: string;
    slug: string;
    responsible: string;
    managerId: number | null;
  } | null>(null);
  const [sheetUsers, setSheetUsers] = useState<UserItem[]>([]);
  const [sheetErr, setSheetErr] = useState("");
  const [sheetSaving, setSheetSaving] = useState(false);
  const sheetSavingRef = useRef(false);
  const [addPkgModal, setAddPkgModal] = useState<{
    code: string;
    name: string;
    floorLabel: string;
    copyFromId: number | "";
  } | null>(null);
  const [addPkgErr, setAddPkgErr] = useState("");
  const [addPkgSaving, setAddPkgSaving] = useState(false);
  const addPkgSavingRef = useRef(false);
  const [printPanel, setPrintPanel] = useState(false);
  const [printTitle, setPrintTitle] = useState("");
  const [hiddenPrintCols, setHiddenPrintCols] = useState<Set<string>>(new Set());
  const [allSheetCols, setAllSheetCols] = useState<string[]>([]);
  const handleColsLoaded = useCallback((cols: string[]) => {
    setAllSheetCols((prev) => {
      const merged = [...new Set([...prev, ...cols])];
      return merged.length !== prev.length ? merged : prev;
    });
  }, []);
  const isMobile = useIsMobile();
  // canProgress = bất kỳ role nào không phải xem thuần (engineer, subcon, pm, admin)
  const { editMode, toggle: toggleEditMode } = useEditMode(canProgress || canEdit);

  // S07: khi có mạng, xin sẵn khoá vault cho các task đang hiển thị để tick/ảnh lúc mất mạng
  // được lưu mã hoá trên thiết bị (không có khoá → không lưu offline, báo lỗi rõ).
  useEffect(() => {
    if (!data || !(canProgress || canEdit)) return;
    void offlineQueue.chuanBiTracking(data.packages.flatMap((p) => p.tasks));
  }, [data, canProgress, canEdit]);

  // Chọn 1 tầng (dropdown hoặc ?floor= từ link timeline) → tự mở các nhóm thuộc
  // tầng đó thay vì để đóng như mặc định, để không phải bấm mở lại thủ công.
  useEffect(() => {
    if (!floorFilter || !data?.packages) return;
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of data.packages) {
        if (p.floorLabel === floorFilter && !next[p.id]) {
          next[p.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [floorFilter, data]);

  // Chọn lọc task (?task=) → tự mở các nhóm còn task khớp, cùng lý do với effect tầng ở
  // trên: người dùng lọc để TÌM đúng việc, không nên còn phải bấm mở nhóm thủ công nữa.
  // Giới hạn số nhóm tự mở (GIOI_HAN_NHOM_TU_MO) để tránh mount cùng lúc quá nhiều lưới nặng
  // (vd ODNN Zone 1: 28 nhóm × 616 ô tick/nhóm) — xem lý do đầy đủ trong locTask.ts.
  useEffect(() => {
    if (!taskFilter) {
      setNhomChuaTuMo(0);
      return;
    }
    if (!data?.packages) return;
    const { moThem, boQua } = nhomTuMoTheoLoc(data.packages, taskFilter, expanded);
    if (moThem.length > 0) {
      setExpanded((prev) => {
        const next = { ...prev };
        for (const id of moThem) next[id] = true;
        return next;
      });
    }
    setNhomChuaTuMo((prev) => (prev !== boQua ? boQua : prev));
    // Cố ý không phụ thuộc `expanded`: chỉ chạy lại khi taskFilter/data đổi, tránh vòng lặp tự
    // mở lại nhóm người dùng vừa tự gập (đọc expanded ở trên qua closure là đủ, không cần deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskFilter, data]);

  // Ghi 4 bộ lọc vào URL (không reload) — giữ tương thích ?floor= đang được heatmap
  // Dashboard trỏ vào; dùng replaceState để không phình lịch sử trình duyệt mỗi lần gõ.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const dat = (key: string, val: string) => {
      if (val) url.searchParams.set(key, val);
      else url.searchParams.delete(key);
    };
    dat("q", query);
    dat("floor", floorFilter);
    dat("status", statusFilter);
    dat("task", taskFilter);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [query, floorFilter, statusFilter, taskFilter]);

  useEffect(() => {
    fetchMe().then((user) => {
      if (!user) return;
      const role = user.role;
      const editable = role === "admin" || role === "pm";
      setCanEdit(editable);
      setCanProgress(!["bch", "cdt", "viewer"].includes(role ?? ""));
      setIsAdmin(role === "admin");
    });
  }, []);

  // Trước khi in: ghi đè width cột cố định qua JS (!important CSS không override inline style trong Chrome print).
  useEffect(() => {
    const PRINT_WIDTHS: Record<string, string> = {
      "col-boq": "70px",
      "col-stt": "32px",
      "col-name": "190px",
      "col-pct": "26px",
      "col-date": "40px",
      "col-days": "26px",
      "col-dim": "48px",
    };
    const saved = new Map<HTMLElement, string>();
    const before = () => {
      Object.entries(PRINT_WIDTHS).forEach(([cls, w]) => {
        // Chỉ ghi đè col KHÔNG ẩn — col đang ẩn giữ nguyên width:0 từ CSS
        document
          .querySelectorAll<HTMLElement>(`col.${cls}:not(.print-hidden-col)`)
          .forEach((el) => {
            saved.set(el, el.style.width);
            el.style.width = w;
          });
      });
    };
    const after = () => {
      saved.forEach((w, el) => {
        el.style.width = w;
      });
      saved.clear();
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // Đổi tên / mã / đường dẫn của trang tracking (sheet) — slug đổi thì chuyển sang URL mới.
  async function saveSheet() {
    if (!sheetModal || !data?.sheet.id || sheetSavingRef.current) return;
    sheetSavingRef.current = true;
    setSheetSaving(true);
    setSheetErr("");
    try {
      const res = await fetch(`/api/sheets/${data.sheet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sheetModal.name,
          code: sheetModal.code,
          slug: sheetModal.slug,
          responsible: sheetModal.responsible,
          managerId: sheetModal.managerId,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setSheetErr(j?.error ?? "Không lưu được thay đổi — vui lòng thử lại");
        return;
      }
      if (j?.sheet?.slug && j.sheet.slug !== sheet) {
        window.location.href = `/tracking/${j.sheet.slug}`;
        return;
      }
      setSheetModal(null);
      load();
    } catch {
      setSheetErr("Mất kết nối — kiểm tra mạng rồi thử lưu lại. Nội dung đã nhập vẫn được giữ.");
    } finally {
      sheetSavingRef.current = false;
      setSheetSaving(false);
    }
  }

  // Thêm hạng mục (nhóm) mới — tạo trống hoặc sao chép cấu trúc (task + cột checkbox)
  // từ 1 nhóm có sẵn trong cùng trang tracking.
  async function saveAddPkg() {
    if (!addPkgModal || !data?.sheet.id || addPkgSavingRef.current) return;
    const code = addPkgModal.code.trim();
    const name = addPkgModal.name.trim();
    if (!code || !name) {
      setAddPkgErr("Thiếu mã hoặc tên nhóm");
      return;
    }
    addPkgSavingRef.current = true;
    setAddPkgSaving(true);
    setAddPkgErr("");
    const floorLabel = addPkgModal.floorLabel.trim();
    try {
      const res = addPkgModal.copyFromId
        ? await fetch(`/api/workpackages/${addPkgModal.copyFromId}/copy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // floorLabel chỉ gửi khi có nhập — bỏ trống thì giữ nguyên tầng của nhóm gốc
            // (route /copy coi floorLabel=null như chuỗi "null" nếu ép kiểu String()).
            body: JSON.stringify({
              code,
              name,
              afterId: addPkgModal.copyFromId,
              ...(floorLabel ? { floorLabel } : {}),
            }),
          })
        : await fetch(`/api/workpackages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sheetTypeId: data.sheet.id,
              code,
              name,
              floorLabel: floorLabel || null,
            }),
          });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setAddPkgErr(j?.error ?? "Không tạo được nhóm — vui lòng thử lại");
        return;
      }
      setAddPkgModal(null);
      load();
    } catch {
      setAddPkgErr("Mất kết nối — kiểm tra mạng rồi thử lại. Nội dung đã nhập vẫn được giữ.");
    } finally {
      addPkgSavingRef.current = false;
      setAddPkgSaving(false);
    }
  }

  async function deleteSheet() {
    if (!data?.sheet.id) return;
    if (
      !(await appConfirm(
        `Xoá trang "${data.sheet.name}" cùng TOÀN BỘ nhóm, task, checkbox và vật tư của nó? Không hoàn tác được.`,
        { danger: true, confirmLabel: "Xoá trang" },
      ))
    )
      return;
    const res = await fetch(`/api/sheets/${data.sheet.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setSheetErr(j?.error ?? "Không xoá được");
      return;
    }
    window.location.href = "/";
  }

  if (loading) return <PageSkeleton />;
  if (chuaGanDuAn) return <ChuaGanDuAn role={isAdmin ? "admin" : null} />;
  if (loadError && !data)
    return (
      <ErrorState
        message={loadErrorMessage ?? "Không tải được dữ liệu — kiểm tra kết nối mạng"}
        onRetry={load}
      />
    );

  const floors = [
    ...new Set((data?.packages ?? []).map((p) => p.floorLabel).filter((f): f is string => !!f)),
  ].sort(sortFloorsDesc);
  const q = deferredQuery.toLowerCase();
  const tatCaNhom =
    data && thuTuNhomTam?.nguon === data
      ? thuTuNhomTam.ids.flatMap((id) => data.packages.find((p) => p.id === id) ?? [])
      : (data?.packages ?? []);
  const packages = locNhomTheoTask(
    tatCaNhom.filter(
      (p) =>
        (!q ||
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.boqCode ?? "").toLowerCase().includes(q)) &&
        (!floorFilter || p.floorLabel === floorFilter) &&
        (!statusFilter || p.status === statusFilter),
    ),
    taskFilter,
  );
  // Kéo thả nhóm chỉ khi thấy ĐỦ danh sách — đang lọc thì không suy ra được thứ tự toàn phần (FR2).
  const keoNhom =
    canEdit && editMode && !!data?.sheet.id && !q && !floorFilter && !statusFilter && !taskFilter;
  const sapXepNhom = async (ids: number[]) => {
    if (!data) return;
    setThuTuNhomTam({ nguon: data, ids });
    const loi = await luuThuTu("/api/workpackages", { sheetTypeId: data.sheet.id, ids });
    if (loi) {
      setThuTuNhomTam(null);
      appAlert(loi);
    }
    load();
  };
  const theNhom = (p: (typeof packages)[number], pi: number) => (
    <Card key={p.id} pad="none" className="overflow-hidden">
      <TrackingGrid
        pkg={p}
        pkgIdx={pi}
        pkgCount={packages.length}
        expanded={!!expanded[p.id]}
        onToggle={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
        canEdit={canEdit}
        editMode={editMode}
        refreshKey={refreshKey}
        isMobile={isMobile}
        onChanged={load}
        onOfflineTick={enqueue}
        onOfflineTickBatch={enqueueBatch}
        hiddenPrintCols={hiddenPrintCols}
        onColsLoaded={handleColsLoaded}
        sheetCols={allSheetCols}
        pendingFront={!!p.floorLabel && pendingFronts.has(p.floorLabel)}
        qcReason={qcBlocked.get(p.id)}
        taskFilter={taskFilter}
      />
    </Card>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        back
        search={false}
        title={
          <>
            <span className="min-w-0">
              <span className="block truncate">{data?.sheet.name ?? sheet}</span>
              <span className="block truncate text-[11px] leading-none font-normal text-zinc-400">
                {data?.sheet.code ?? ""}
                {data?.sheet.responsible ? ` · ${data.sheet.responsible}` : ""}
              </span>
            </span>
            {canEdit && editMode && data?.sheet.id && (
              <button
                onClick={() => {
                  setSheetErr("");
                  setSheetModal({
                    name: data.sheet.name,
                    code: data.sheet.code,
                    slug: data.sheet.slug ?? sheet,
                    responsible: data.sheet.responsible ?? "",
                    managerId: data.sheet.managerId ?? null,
                  });
                  fetch("/api/users")
                    .then((r) => (r.ok ? r.json() : { users: [] }))
                    .then((j) => setSheetUsers(j.users ?? []));
                }}
                title="Đổi tên / đường dẫn trang"
                aria-label="Đổi tên / đường dẫn trang"
                className="focus-inset min-w-11 min-h-11 shrink-0 flex items-center justify-center rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-900"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        }
      >
        <Button
          size="sm"
          icon={Printer}
          labelOnDesktopOnly
          onClick={() => {
            setPrintTitle(
              (prev) =>
                prev ||
                `${data?.sheet.name ?? ""}${data?.sheet.responsible ? " - " + data.sheet.responsible : ""}`,
            );
            setPrintPanel((p) => !p);
          }}
          title="In PDF / Xuất bảng tracking"
          aria-label="In PDF / Xuất bảng tracking"
        >
          In PDF
        </Button>
        <EditModeToggle
          canEdit={canProgress || canEdit}
          editMode={editMode}
          onToggle={toggleEditMode}
        />
      </AppHeader>

      {/* Modal thêm hạng mục (nhóm) mới — tạo trống hoặc sao chép cấu trúc từ nhóm có sẵn */}
      {addPkgModal && (
        <Modal onClose={() => !addPkgSavingRef.current && setAddPkgModal(null)}>
          <fieldset disabled={addPkgSaving} aria-busy={addPkgSaving} className="p-5 min-w-0">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" /> Thêm hạng mục mới
            </h3>
            <label htmlFor="add-pkg-code" className="block text-xs text-zinc-400 mb-1">
              Mã nhóm
            </label>
            <input
              id="add-pkg-code"
              autoFocus
              value={addPkgModal.code}
              onChange={(e) => setAddPkgModal((m) => m && { ...m, code: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-3 outline-none focus:border-emerald-600 font-mono"
            />
            <label htmlFor="add-pkg-name" className="block text-xs text-zinc-400 mb-1">
              Tên hạng mục
            </label>
            <input
              id="add-pkg-name"
              value={addPkgModal.name}
              onChange={(e) => setAddPkgModal((m) => m && { ...m, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label htmlFor="add-pkg-floor" className="block text-xs text-zinc-400 mb-1">
              Tầng (tuỳ chọn)
            </label>
            <input
              id="add-pkg-floor"
              value={addPkgModal.floorLabel}
              onChange={(e) => setAddPkgModal((m) => m && { ...m, floorLabel: e.target.value })}
              placeholder="vd: 4F"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label htmlFor="add-pkg-copy" className="block text-xs text-zinc-400 mb-1">
              Sao chép cấu trúc từ hạng mục có sẵn (tuỳ chọn)
            </label>
            <select
              id="add-pkg-copy"
              value={addPkgModal.copyFromId}
              onChange={(e) =>
                setAddPkgModal(
                  (m) => m && { ...m, copyFromId: e.target.value ? Number(e.target.value) : "" },
                )
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-1 outline-none focus:border-emerald-600"
            >
              <option value="">— Tạo trống, không sao chép —</option>
              {(data?.packages ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} ({p.tasks.length} task)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 mb-3">
              Chọn 1 hạng mục để sao chép toàn bộ task và cột checkbox của nó (trạng thái/tiến độ
              reset về chưa làm). Mã BOQ không được sao chép — mỗi hạng mục phải tự gán mã riêng.
            </p>
            {addPkgErr && (
              <p role="alert" className="text-sm text-red-400 mb-2">
                {addPkgErr}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setAddPkgModal(null)} className="min-h-11">
                Huỷ
              </Button>
              <Button
                variant="primary"
                onClick={saveAddPkg}
                disabled={!addPkgModal.code.trim() || !addPkgModal.name.trim() || addPkgSaving}
                className="min-h-11"
              >
                {addPkgSaving ? "Đang lưu..." : "Tạo hạng mục"}
              </Button>
            </div>
          </fieldset>
        </Modal>
      )}

      {/* ── Panel in PDF (ẩn khi in thật) ── */}
      {printPanel && (
        <div className="no-print px-4 sm:px-6 py-4 bg-zinc-900 border-b border-zinc-800 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-zinc-400 shrink-0">Tiêu đề bảng in:</span>
            <input
              value={printTitle}
              onChange={(e) => setPrintTitle(e.target.value)}
              className="flex-1 min-w-60 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-emerald-600 font-semibold uppercase"
            />
            <Button
              variant="primary"
              icon={Printer}
              onClick={() => window.print()}
              className="shrink-0"
            >
              In / Lưu PDF
            </Button>
            <Button
              variant="ghost"
              size="icon"
              icon={X}
              onClick={() => setPrintPanel(false)}
              aria-label="Đóng panel in"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 shrink-0">Ẩn cột khi in:</span>
            {(["BOQ", "STT", "Công việc", "%", "Ngày BĐ", "Số ngày", "Ngày KT"] as const).map(
              (col) => {
                const hidden = hiddenPrintCols.has(col);
                return (
                  <button
                    key={col}
                    onClick={() =>
                      setHiddenPrintCols((s) => {
                        const n = new Set(s);
                        hidden ? n.delete(col) : n.add(col);
                        return n;
                      })
                    }
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border transition ${hidden ? "bg-zinc-900 border-zinc-800 text-zinc-400 line-through" : "bg-zinc-800 border-zinc-700 text-zinc-100"}`}
                  >
                    {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {col}
                  </button>
                );
              },
            )}
            {allSheetCols.length > 0 && <span className="text-zinc-700 text-[11px]">|</span>}
            {allSheetCols.map((col) => {
              const hidden = hiddenPrintCols.has(col);
              return (
                <button
                  key={col}
                  onClick={() =>
                    setHiddenPrintCols((s) => {
                      const n = new Set(s);
                      hidden ? n.delete(col) : n.add(col);
                      return n;
                    })
                  }
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border transition ${hidden ? "bg-zinc-900 border-zinc-800 text-zinc-400 line-through" : "bg-zinc-800 border-zinc-700 text-zinc-100"}`}
                >
                  {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {col}
                </button>
              );
            })}
            {hiddenPrintCols.size > 0 && (
              <button
                onClick={() => setHiddenPrintCols(new Set())}
                className="text-xs text-zinc-500 hover:text-emerald-400"
              >
                Bỏ ẩn tất cả
              </button>
            )}
          </div>
          <p className="text-[11px] text-zinc-600">
            Mở rộng các nhóm cần in trước, sau đó bấm &quot;In / Lưu PDF&quot;. Khổ giấy đề xuất: A3
            ngang.
          </p>
        </div>
      )}

      {/* Tiêu đề chỉ hiện khi in */}
      {printTitle && (
        <div className="hidden print:block w-full print-title-band py-3 text-center">
          <span className="text-white font-bold uppercase tracking-wide text-sm">{printTitle}</span>
        </div>
      )}

      <TrackingToolbar
        query={query}
        onQueryChange={setQuery}
        floorFilter={floorFilter}
        onFloorFilterChange={setFloorFilter}
        floors={floors}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        taskFilter={taskFilter}
        onTaskFilterChange={setTaskFilter}
        showAddPkg={!!(canEdit && editMode && data?.sheet.id)}
        onAddPkg={() => {
          setAddPkgErr("");
          setAddPkgModal({ code: "", name: "", floorLabel: "", copyFromId: "" });
        }}
        packagesCount={packages.length}
      />

      <main className="p-4">
        {nhomChuaTuMo > 0 && (
          <p className="text-xs text-zinc-500 mb-2">
            Đang mở {GIOI_HAN_NHOM_TU_MO} nhóm khớp lọc; còn {nhomChuaTuMo} nhóm bạn tự mở khi cần —
            giữ lưới nhẹ trên điện thoại.
          </p>
        )}
        {/* Vùng cuộn ngang chung — tất cả nhóm chia sẻ 1 scrollbar,
            cột căn thẳng nhau khi mở/đóng nhóm */}
        <div className="overflow-x-auto scrollbar-none">
          <div className="space-y-2" style={{ width: "max-content", minWidth: "100%" }}>
            <DanhSachKeo ids={packages.map((p) => p.id)} tat={!keoNhom} onSapXep={sapXepNhom}>
              {packages.map((p, pi) => (
                <MucKeo key={p.id} id={p.id}>
                  {theNhom(p, pi)}
                </MucKeo>
              ))}
            </DanhSachKeo>
            {packages.length === 0 && (
              <Card pad="none">
                <EmptyState
                  icon={Inbox}
                  title="Chưa có dữ liệu trong trang này"
                  message="Hãy import file Excel, hoặc tạo hạng mục mới bằng cách sao chép cấu trúc từ trang khác."
                />
              </Card>
            )}
          </div>
        </div>
      </main>

      {syncToast && (
        <div
          className="app-toast-center fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-900 border border-emerald-700 text-emerald-200 px-4 py-2 rounded-full text-sm shadow-xl"
          style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Dữ liệu vừa được người khác cập nhật —
          đã làm mới
        </div>
      )}

      {(!online || offlinePending > 0) && (
        <div
          role="status"
          aria-live="polite"
          className={`app-toast-center fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm shadow-xl border ${
            online
              ? "bg-sky-900 border-sky-700 text-sky-200"
              : "bg-amber-900 border-amber-700 text-amber-200"
          }`}
          style={{ bottom: "max(4rem, env(safe-area-inset-bottom, 0px) + 3.5rem)" }}
        >
          {!offlineReady && offlinePending === 0 ? (
            <>
              <WifiOff className="w-3.5 h-3.5" /> Thao tác chưa được lưu offline — kết nối mạng để
              lưu thay đổi.
            </>
          ) : online ? (
            <>
              <CloudUpload className="w-3.5 h-3.5 animate-pulse" /> {offlinePending} thay đổi đang
              lưu trên thiết bị, chờ gửi lên máy chủ...
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" /> Mất mạng — thao tác được lưu trên thiết bị
              {offlinePending > 0 ? ` (${offlinePending} chờ gửi)` : ""}, chưa lên máy chủ; tự gửi
              khi có mạng
            </>
          )}
          {offlinePending > 0 && (
            // S08: mở màn phục hồi (xem từng thao tác, gửi lại, xử lý xung đột).
            <button
              type="button"
              onClick={moManPhucHoiNgoaiTuyen}
              aria-haspopup="dialog"
              aria-label="Xem chi tiết thao tác ngoại tuyến"
              className="min-h-10 -my-2 px-2 rounded-lg font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Chi tiết
            </button>
          )}
        </div>
      )}

      {/* Modal đổi tên / đường dẫn trang */}
      {/* Hex cứng trong khối in dưới đây là CHỦ ĐÍCH, không phải vi phạm luật "không hardcode
          hex trong component": trang in luôn cần nền giấy trắng bất kể theme đang chọn, và
          @media print không đọc được biến CSS bị html.<theme> ghi đè nên không dùng .sheet-stable
          ở đây được — xem ghi chú tương tự ở globals.css (khối .sheet-stable). */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          @page { margin: 8mm; size: A3 landscape; }
          /* Cột ẩn: display:none đồng thời trên col VÀ th/td → layout không lệch vì cả hai phía đều bị loại */
          col.print-hidden-col { display: none !important; }
          th.print-hidden-col, td.print-hidden-col { display: none !important; }
          /* Thu nhỏ cột cố định còn lại khi in A3 ngang (beforeprint JS cũng ghi đè inline style) */
          col.col-boq  { width: 70px  !important; }
          col.col-stt  { width: 32px  !important; }
          col.col-name { width: 190px !important; }
          col.col-pct  { width: 26px  !important; }
          col.col-date { width: 40px  !important; }
          col.col-days { width: 26px  !important; }
          col.col-dim  { width: 48px  !important; }
          table { border-collapse: collapse !important; font-size: 8.5pt !important; }
          th, td { border: 1px solid #ccc !important; background: #fff !important; color: #000 !important; padding: 2px 4px !important; }
          thead th { background: #f0f0f0 !important; font-weight: bold !important; }
          input[type="checkbox"] { width: 12px !important; height: 12px !important; }
          .print-pkg-header td { background: #e8e8e8 !important; font-weight: bold !important; }
          .dim-col-label { writing-mode: horizontal-tb !important; transform: none !important; text-align: center !important; word-break: break-all !important; font-size: 7pt !important; }
        }
      `}</style>

      {sheetModal && (
        <Modal onClose={() => !sheetSavingRef.current && setSheetModal(null)}>
          <fieldset disabled={sheetSaving} aria-busy={sheetSaving} className="p-5 min-w-0">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-amber-400" />{" "}
              <EditableText tkey="tracking.settings.title">Cài đặt trang tracking</EditableText>
            </h3>
            <label htmlFor="sheet-name" className="block text-xs text-zinc-400 mb-1">
              Tên trang
            </label>
            <input
              id="sheet-name"
              autoFocus
              value={sheetModal.name}
              onChange={(e) => setSheetModal((m) => m && { ...m, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label htmlFor="sheet-code" className="block text-xs text-zinc-400 mb-1">
              Mã sheet (hiển thị trên Dashboard/Excel)
            </label>
            <input
              id="sheet-code"
              value={sheetModal.code}
              onChange={(e) => setSheetModal((m) => m && { ...m, code: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label htmlFor="sheet-slug" className="block text-xs text-zinc-400 mb-1">
              Đường dẫn
            </label>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm text-zinc-500">/tracking/</span>
              <input
                id="sheet-slug"
                value={sheetModal.slug}
                onChange={(e) => setSheetModal((m) => m && { ...m, slug: e.target.value })}
                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm outline-none focus:border-emerald-600 font-mono"
              />
              <Button
                size="icon"
                onClick={() => setSheetModal((m) => m && { ...m, slug: toSlug(m.name) })}
                aria-label="Sinh lại đường dẫn từ tên"
                title="Sinh lại từ tên"
                className="min-w-11 min-h-11 shrink-0"
              >
                ↻
              </Button>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">
              Chỉ dùng chữ thường a-z, số và gạch nối. Đổi đường dẫn sẽ chuyển trang sang URL mới
              (link cũ hết hiệu lực).
            </p>
            <label htmlFor="sheet-responsible" className="block text-xs text-zinc-400 mb-1">
              Người phụ trách
            </label>
            {sheetUsers.length > 0 && (
              <select
                aria-label="Chọn người phụ trách từ danh sách"
                value={sheetModal.managerId ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const user = sheetUsers.find((u) => u.id === id);
                  setSheetModal(
                    (m) =>
                      m && { ...m, managerId: id, responsible: user ? user.name : m.responsible },
                  );
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-2 outline-none focus:border-emerald-600"
              >
                <option value="">— Chọn từ danh sách người dùng —</option>
                {sheetUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                  </option>
                ))}
              </select>
            )}
            <input
              id="sheet-responsible"
              value={sheetModal.responsible}
              onChange={(e) =>
                setSheetModal((m) => m && { ...m, responsible: e.target.value, managerId: null })
              }
              placeholder="hoặc nhập tên tự do..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm mb-3 outline-none focus:border-emerald-600"
            />
            {sheetErr && (
              <p role="alert" className="text-sm text-red-400 mb-2">
                {sheetErr}
              </p>
            )}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="ghost"
                  onClick={deleteSheet}
                  className="min-h-11 hover:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xoá trang
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button onClick={() => setSheetModal(null)} className="min-h-11">
                  Huỷ
                </Button>
                <Button
                  variant="primary"
                  onClick={saveSheet}
                  disabled={sheetSaving || !sheetModal.name.trim() || !sheetModal.code.trim()}
                  className="min-h-11"
                >
                  {sheetSaving ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            </div>
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
